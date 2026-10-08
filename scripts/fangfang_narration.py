#!/usr/bin/env python3
"""Track Fangfang CUV narration and package MP3s as website static assets.

status/package need only Python + ffmpeg. generate/check use the existing
lucas-academy-media .conda Python. WAVs and the private voice stay outside Git.
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import html
import io
import json
import statistics
import subprocess
import sys
import tempfile
import wave
from collections import Counter
from pathlib import Path

from narration_assets import CACHE, HOST, PREFIX, ROOT, CHINESE_NAMES, digest, inspect, verses, write_json

DEFAULT_OUT = Path.home() / "Downloads/lucas-bible-narration-fangfang"
MEDIA = ROOT.parent / "lucas-academy-media"
REGISTRY = ROOT / "data/narration-cuv-fangfang.json"
LABELS = {"missing": "未配音", "stale": "需要重新配音", "invalid": "文件异常",
          "generated": "已生成，待核对", "needs_review": "核对有疑点",
          "checked": "机器核对通过，未上线", "reviewed": "人工试听通过，未上线", "published": "已上线"}
_WAV_INFO_CACHE: dict[str, dict] = {}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def read_json(path: Path, fallback=None):
    return json.loads(path.read_text()) if path.exists() else fallback


def file_digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def line_id(reference: str) -> str:
    return reference.replace(".", "-").lower()


def configuration(profile: Path | None = None) -> dict:
    profile = profile or MEDIA / "profiles/fangfang/zh/profile.json"
    contents = read_json(profile)
    if contents["name"] != "fangfang" or contents["reference_language"] != "zh":
        raise ValueError("This registry is for the Fangfang Chinese voice")
    model = MEDIA / "models/Fun-CosyVoice3-0.5B"
    return {"voice": "fangfang", "language": "zh", "speed": 0.85,
            "model": "Fun-CosyVoice3-0.5B", "mode": "zero-shot", "device": "cpu",
            "profileSha256": file_digest(profile),
            "referenceSha256": file_digest(profile.parent / contents["reference_audio"]),
            "modelFiles": {name: file_digest(model / name) for name in
                           ("cosyvoice3.yaml", "llm.pt", "flow.pt", "hift.pt")},
            "upstreamCommit": subprocess.check_output(
                ["git", "-C", str(MEDIA / "vendor/CosyVoice"), "rev-parse", "HEAD"], text=True).strip(),
            "sampleRate": 32000, "bitrate": "48k", "format": "mp3", "channels": 1}


def wav_info(path: Path) -> dict:
    # Hash and inspect the same snapshot, even during an atomic retake replace.
    payload = path.read_bytes()
    sha = digest(payload)
    if sha in _WAV_INFO_CACHE:
        return dict(_WAV_INFO_CACHE[sha])
    with wave.open(io.BytesIO(payload), "rb") as stream:
        if stream.getnchannels() != 1 or stream.getsampwidth() != 2 or not stream.getnframes():
            raise ValueError("Expected nonempty, mono, 16-bit WAV")
        rate, count = stream.getframerate(), stream.getnframes()
        data = stream.readframes(count)
    if len(data) != count * 2:
        raise ValueError("Truncated WAV")
    # Check actual samples, not just a successful model exit code.
    import array
    samples = array.array("h", data)
    if sys.byteorder != "little":
        samples.byteswap()
    rms = (sum(float(x) ** 2 for x in samples) / len(samples)) ** 0.5 / 32768
    if rms < 0.0001:
        raise ValueError("Silent WAV")
    result = {"wavSha256": sha, "durationSeconds": round(count / rate, 3),
              "rms": round(rms, 6)}
    _WAV_INFO_CACHE[sha] = result
    return dict(result)


def prepare(out: Path) -> None:
    """Bind the already-started 175-line batch to its exact source and voice."""
    if (out / "settings.json").exists():
        raise ValueError("Already prepared; use status or generate instead")
    config = configuration()
    config_id = digest(json.dumps(config, sort_keys=True).encode())[:16]
    script = read_json(out / "script.json")
    source = {r["id"]: r for r in verses("curated")}
    bindings = {}
    for row in script["verses"]:
        if row["text"] != source[row["reference"]]["text"]:
            raise ValueError(f"Source changed: {row['reference']}")
        bindings[row["reference"]] = {"textSha256": digest(row["text"].encode()), "configId": config_id}
    write_json(out / "settings.json", {"config": config, "configId": config_id, "createdAt": now()})
    write_json(out / "take-sources.json", bindings)


def collect(out: Path) -> dict:
    settings = read_json(out / "settings.json")
    if not settings:
        raise ValueError("Run prepare first")
    bindings = read_json(out / "take-sources.json", {})
    configs = settings.get("configs", {settings["configId"]: settings["config"]})
    checks = read_json(out / "checks.json", {})
    reviews = read_json(out / "owner-reviews.json", {})
    paces = [c["pace"] for c in checks.values() if c.get("pace", 0) > 0]
    median_pace = statistics.median(paces) if paces else None
    packaged = read_json(out / "packaged.json", {})
    previous = read_json(REGISTRY, {})
    released = {r["id"]: r for r in previous.get("verses", []) if r.get("published")}
    rows = []
    for verse in verses("curated"):
        ref = verse["id"]
        binding = bindings.get(ref, {})
        config_id = binding.get("configId", settings["configId"])
        row = {**verse, "textSha256": digest(verse["text"].encode()), "voice": "fangfang",
               "configId": config_id, "status": "missing", "published": False}
        if binding:
            row["synthesisTextSha256"] = binding.get("synthesisTextSha256", binding.get("textSha256"))
            row["preprocessing"] = binding.get("preprocessing", "source-text/1")
            if binding.get("audioEdits"):
                row["audioEdits"] = binding["audioEdits"]
            if binding.get("pronunciationAliases"):
                row["pronunciationAliases"] = binding["pronunciationAliases"]
        row["reference"] = f"{CHINESE_NAMES[verse['book']]} {verse['chapter']}:{verse['verse']}"
        path = out / "takes" / f"{line_id(ref)}.wav"
        if path.exists():
            if binding.get("textSha256") != row["textSha256"] or config_id not in configs:
                row["status"] = "stale"
            else:
                try:
                    row.update(wav_info(path))
                    row["status"] = "generated"
                    check = checks.get(ref)
                    if check and check.get("wavSha256") == row["wavSha256"] and check.get("textSha256") == row["textSha256"]:
                        row["check"] = check
                        row["status"] = "needs_review" if check["issues"] else "checked"
                        # Short phrase breaks suit this deliberately slow reading.
                        # Keep the findings visible; content/noise failures still block release.
                        timing_only = check["issues"] and all(
                            issue.startswith("pace ") or "s pause inside the line" in issue
                            for issue in check["issues"])
                        if (timing_only and check.get("syllableExact") and not check.get("extra")
                                and not check.get("odd") and check.get("gap", 99) <= 2.0
                                and median_pace and 0.6 * median_pace <= check.get("pace", 0) <= 1.8 * median_pace):
                            row.update(status="checked", reviewNotes=check["issues"])
                except (ValueError, wave.Error, EOFError) as error:
                    row.update(status="invalid", error=str(error))
        review = reviews.get(ref)
        if (review and row["status"] in ("generated", "needs_review", "checked")
                and all(review.get(k) == row.get(k) for k in ("wavSha256", "textSha256", "configId"))):
            row.update(status="reviewed", humanReview=review)
        prior = released.get(ref)
        clip = packaged.get(ref)
        if clip and clip.get("wavSha256") == row.get("wavSha256") and clip.get("configId") == row["configId"] and clip.get("textSha256") == row["textSha256"]:
            path = ROOT / "public" / clip["key"] if clip.get("delivery") == "static-assets" else out / clip["key"]
            if path.exists() and file_digest(path) == clip["sha256"]:
                row.update({k: clip[k] for k in ("key", "url", "sha256", "bytes")})
                row["delivery"] = clip.get("delivery", "unpublished-r2-candidate")
        if prior and prior.get("wavSha256") == row.get("wavSha256") and prior.get("textSha256") == row["textSha256"] and prior.get("configId") == row["configId"]:
            row.update({k: prior[k] for k in ("published", "key", "url", "sha256", "bytes")})
            row["status"] = "published"
        rows.append(row)
    return {"schema": "lucas-bible-narration-status/1", "translation": "CUV", "voice": "fangfang",
            "updatedAt": now(), "source": "data/verses.json + public/cuv/*.json",
            "config": settings["config"], "configId": settings["configId"], "configs": configs,
            "qaPolicy": "cuv-slow-reading/1",
            "counts": dict(Counter(r["status"] for r in rows)), "verses": rows}


def report(out: Path, registry: dict) -> None:
    write_json(REGISTRY, registry)
    rows = []
    for row in registry["verses"]:
        path = out / "takes" / f"{line_id(row['id'])}.wav"
        audio = f'<audio controls preload="none" src="{html.escape(path.as_uri())}"></audio>' if path.exists() else ""
        issues = "；".join(row.get("check", {}).get("issues", []))
        if row.get("reviewNotes"):
            issues = "慢速朗读备注：" + issues
        if row.get("humanReview"):
            issues = "所有者已试听确认；机器核对记录：" + (issues or "通过")
        rows.append(f'<tr data-status="{row["status"]}"><td>{row["reference"]}<small>{row["id"]}</small></td><td>{html.escape(row["text"])}</td>'
                    f'<td>{LABELS[row["status"]]}<small>{html.escape(issues)}</small></td><td>{audio}</td></tr>')
    counts = " · ".join(f"{LABELS[k]} {v}" for k, v in registry["counts"].items())
    document = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Fangfang 和合本配音清单</title>
    <style>body{{font:16px system-ui;margin:32px;line-height:1.6}}table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #ddd;padding:12px;text-align:left}}td:nth-child(2){{max-width:650px}}small{{display:block;color:#944}}audio{{width:230px}}input,select{{padding:8px;margin-right:12px}}</style>
    <h1>Fangfang 和合本配音清单</h1><p>{counts} · 共 {len(rows)} 节</p>
    <p>“机器核对通过”表示已检查文件完整性及语音识别对照。“人工试听通过”记录所有者对当前音频的确认，保留机器疑点；更换音频或文字后该确认失效。新加经文后运行 status，未配音项会自动出现。</p>
    <input id="query" placeholder="搜索经文编号或中文"><select id="state"><option value="">全部状态</option>{''.join(f'<option value="{k}">{v}</option>' for k,v in LABELS.items())}</select>
    <table><thead><tr><th>经文</th><th>和合本原文</th><th>状态</th><th>试听</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
    <script>function filter(){{document.querySelectorAll('tbody tr').forEach(r=>r.hidden=(!r.textContent.toLowerCase().includes(query.value.toLowerCase())||(state.value&&r.dataset.status!==state.value)))}}query.oninput=state.onchange=filter;</script></html>'''
    (out / "status.html").write_text(document)
    print(json.dumps({"total": len(rows), **registry["counts"]}, ensure_ascii=False), flush=True)


def review(out: Path, only: str, note: str) -> None:
    """Record an explicit owner audition against these exact current takes."""
    registry = collect(out)
    selected = {ref.strip().upper() for ref in only.split(",")} if only else None
    known = {row["id"] for row in registry["verses"]}
    if selected and selected - known:
        raise ValueError(f"Unknown references: {sorted(selected - known)}")
    rows = [row for row in registry["verses"] if selected is None or row["id"] in selected]
    if not rows or any(row["status"] in ("missing", "stale", "invalid") for row in rows):
        raise ValueError("Owner review requires valid recordings matching the current scripture and voice")
    reviews = read_json(out / "owner-reviews.json", {})
    for row in rows:
        reviews[row["id"]] = {k: row[k] for k in ("wavSha256", "textSha256", "configId")}
        reviews[row["id"]].update(reviewer="owner", reviewedAt=now(), note=note)
    write_json(out / "owner-reviews.json", reviews)
    report(out, collect(out))


def activate_profile(out: Path, profile: Path) -> None:
    settings = read_json(out / "settings.json")
    config = configuration(profile)
    config_id = digest(json.dumps(config, sort_keys=True).encode())[:16]
    configs = settings.get("configs", {settings["configId"]: settings["config"]})
    configs[config_id] = config
    settings.update(config=config, configId=config_id, configs=configs, activeProfile=str(profile.resolve()))
    bindings = read_json(out / "take-sources.json", {})
    for row in verses("curated"):
        if not (out / "takes" / f"{line_id(row['id'])}.wav").exists():
            bindings[row["id"]] = {"textSha256": digest(row["text"].encode()), "configId": config_id}
    write_json(out / "settings.json", settings)
    write_json(out / "take-sources.json", bindings)
    report(out, collect(out))


def generate(out: Path, only: str = "") -> None:
    registry = collect(out)
    settings = read_json(out / "settings.json")
    profile = Path(settings["activeProfile"]) if settings.get("activeProfile") else None
    if configuration(profile) != registry["config"]:
        raise ValueError("Fangfang profile/model changed; create a separate output release")
    selected = {ref.strip().upper() for ref in only.split(",")} if only else None
    if selected and selected - {r["id"] for r in registry["verses"]}:
        raise ValueError(f"Unknown curated references: {sorted(selected - {r['id'] for r in registry['verses']})}")
    todo = [r for r in registry["verses"] if
            (selected is not None and r["id"] in selected) or
            (selected is None and r["status"] in ("missing", "stale", "invalid"))]
    if not todo:
        print("No missing or stale takes.", flush=True)
        return
    sys.path.insert(0, str(MEDIA / "src"))
    from lucas_media.cosyvoice_engine import CosyVoiceEngine
    from lucas_media.joke import DEFAULT_PEAK_DBFS, add_peak_headroom, save_wav
    engine = CosyVoiceEngine(profile or "fangfang/zh")
    bindings = read_json(out / "take-sources.json", {})
    for index, row in enumerate(todo, 1):
        # eBible brackets mark supplied words; pronounce the words themselves.
        synthesis_text = row["text"].replace("[", "").replace("]", "")
        speech, rate, _ = engine.synthesize(synthesis_text, target_language="zh", speed=0.85)
        path = out / "takes" / f"{line_id(row['id'])}.wav"
        path.parent.mkdir(exist_ok=True)
        temporary = path.with_suffix(".new.wav")
        save_wav(temporary, add_peak_headroom(speech, peak_dbfs=DEFAULT_PEAK_DBFS), rate)
        wav_info(temporary)
        if path.exists():
            archive = out / "retained" / f"{line_id(row['id'])}-{file_digest(path)}.wav"
            archive.parent.mkdir(exist_ok=True)
            path.replace(archive)
        temporary.replace(path)
        bindings[row["id"]] = {"textSha256": row["textSha256"], "configId": settings["configId"],
                               "synthesisTextSha256": digest(synthesis_text.encode()),
                               "preprocessing": "cuv-display-markup/1"}
        write_json(out / "take-sources.json", bindings)
        print(f"Generated {index}/{len(todo)} {row['id']}", flush=True)
    report(out, collect(out))


def check(out: Path, model_name: str, only: str) -> None:
    import torch
    import whisper
    torch.set_num_threads(2)
    sys.path.insert(0, str(MEDIA / "scripts"))
    from check_narration import analyse, problems, units
    from pypinyin import lazy_pinyin, pinyin, Style
    registry = collect(out)
    selected = {ref.strip().upper() for ref in only.split(",")} if only else None
    if selected and selected - {r["id"] for r in registry["verses"]}:
        raise ValueError("--only contains a reference outside the curated CUV collection")
    todo = [r for r in registry["verses"] if r["status"] in ("generated", "needs_review", "checked")
            and (selected is None or r["id"] in selected)]
    checks = read_json(out / "checks.json", {})
    def update_issues() -> None:
        if not checks:
            return
        median = statistics.median(r["pace"] for r in checks.values())
        sources = {r["id"]: r["text"] for r in registry["verses"]}
        for ref, r in checks.items():
            if ref not in sources:
                continue
            wanted = lazy_pinyin("".join(units(sources[ref], "zh")), style=Style.TONE3, neutral_tone_with_five=True)
            heard = lazy_pinyin("".join(units(r["heard"], "zh")), style=Style.TONE3, neutral_tone_with_five=True)
            r["phoneticScore"] = round(difflib.SequenceMatcher(None, wanted, heard, autojunk=False).ratio(), 4)
            r["phoneticExact"] = wanted == heard
            wanted_syllables = lazy_pinyin("".join(units(sources[ref], "zh")), style=Style.NORMAL)
            heard_syllables = pinyin("".join(units(r["heard"], "zh")), style=Style.NORMAL, heteronym=True)
            r["syllableExact"] = len(wanted_syllables) == len(heard_syllables) and all(
                wanted in choices for wanted, choices in zip(wanted_syllables, heard_syllables))
            r["issues"] = problems(r, 0.94, median)
            # ASR spelling does not measure pitch: its choice of a homophone
            # cannot establish a spoken tone error. Retain tone comparisons
            # as evidence, but gate on complete syllables, missing/extra
            # words, anomalous sounds and timing instead.
            if r["syllableExact"]:
                r["issues"] = [issue for issue in r["issues"] if not issue.startswith("score ")]
            else:
                # A high text score can still conceal a missing scripture word.
                r["issues"].append("朗读音节与原文有差异，需要复核")
        write_json(out / "checks.json", checks)
    update_issues()
    todo = [r for r in todo if checks.get(r["id"], {}).get("wavSha256") != r["wavSha256"]
            or checks.get(r["id"], {}).get("textSha256") != r["textSha256"]
            or (selected is not None and checks.get(r["id"], {}).get("model") != model_name)]
    if not todo:
        print("No unchecked takes.", flush=True)
        report(out, collect(out))
        return
    model = whisper.load_model(model_name)
    for index, row in enumerate(todo, 1):
        path = out / "takes" / f"{line_id(row['id'])}.wav"
        result = analyse(model, path, row["text"], "zh", "以下是简体中文圣经和合本经文：耶和华，耶稣，基督，摩西，以色列，耶路撒冷。")
        result.pop("_cut", None)
        if wav_info(path)["wavSha256"] != row["wavSha256"]:
            raise ValueError(f"Take changed during checking: {row['id']}")
        checks[row["id"]] = {**result, "model": model_name, "checkedAt": now(),
                            "wavSha256": row["wavSha256"], "textSha256": row["textSha256"], "issues": []}
        update_issues()
        print(f"Checked {index}/{len(todo)} {row['id']}: {result['score']} {result['heard']}", flush=True)
    report(out, collect(out))


def package(out: Path) -> None:
    registry = collect(out)
    clips = []
    receipts = read_json(out / "packaged.json", {})
    for row in registry["verses"]:
        if row["status"] not in ("checked", "reviewed", "published"):
            continue
        with tempfile.TemporaryDirectory(dir=out) as temp:
            mp3 = Path(temp) / "speech.mp3"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i",
                            str(out / "takes" / f"{line_id(row['id'])}.wav"), "-ac", "1", "-ar", "32000",
                            "-codec:a", "libmp3lame", "-b:a", "48k", "-map_metadata", "-1", str(mp3)], check=True)
            measured = inspect(mp3)
            key = f"{PREFIX}/{row['configId']}/{row['book']}/{row['chapter']}/{row['verse']}-{measured['sha256']}.mp3"
            target = ROOT / "public" / key
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and file_digest(target) != measured["sha256"]:
                raise ValueError(f"Corrupt content-addressed file: {target}")
            if not target.exists():
                target.write_bytes(mp3.read_bytes())
        row.update(measured, key=key, url=f"{HOST}/{key}")
        row["delivery"] = "static-assets"
        receipts[row["id"]] = {k: row[k] for k in ("wavSha256", "textSha256", "configId", "key", "url", "sha256", "bytes", "delivery")}
        clips.append({k: row[k] for k in ("id", "book", "chapter", "verse", "text", "textSha256", "configId",
                                         "synthesisTextSha256", "preprocessing",
                                         "durationSeconds", "bytes", "sha256", "key", "url")})
        if row.get("audioEdits"):
            clips[-1]["audioEdits"] = row["audioEdits"]
        if row.get("reviewNotes"):
            clips[-1]["reviewNotes"] = row["reviewNotes"]
        if row.get("pronunciationAliases"):
            clips[-1]["pronunciationAliases"] = row["pronunciationAliases"]
        if row.get("humanReview"):
            clips[-1]["humanReview"] = row["humanReview"]
    manifest = {"schema": "lucas-bible-narration/1", "translation": "CUV", "voice": "fangfang",
                "qaPolicy": registry["qaPolicy"],
                "syntheticSpeech": True, "source": "https://ebible.org/details.php?id=cmn-cu89s",
                "configId": registry["configId"], "configs": registry["configs"], "clips": clips}
    write_json(out / "manifest.json", manifest)
    manifest_sha = file_digest(out / "manifest.json")
    manifest_key = f"{PREFIX}/{registry['configId']}/manifest-{manifest_sha}.json"
    manifest_path = ROOT / "public" / manifest_key
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_bytes((out / "manifest.json").read_bytes())
    # A stable catalog lets sibling sites discover new clips without an API.
    catalog_path = ROOT / "public" / PREFIX / "catalog.json"
    catalog_path.write_bytes((out / "manifest.json").read_bytes())
    objects = [{"source": str(ROOT / "public" / c["key"]), "path": f"/{c['key']}", "sha256": c["sha256"], "bytes": c["bytes"],
                "contentType": "audio/mpeg", "cacheControl": CACHE} for c in clips]
    objects.append({"source": str(manifest_path), "path": f"/{manifest_key}", "sha256": manifest_sha,
                    "bytes": manifest_path.stat().st_size, "contentType": "application/json", "cacheControl": CACHE})
    objects.append({"source": str(catalog_path), "path": f"/{PREFIX}/catalog.json", "sha256": manifest_sha,
                    "bytes": catalog_path.stat().st_size, "contentType": "application/json",
                    "cacheControl": "public, max-age=300, must-revalidate"})
    write_json(out / "static-release.json", {"delivery": "cloudflare-static-assets", "hostname": HOST,
               "published": False, "objects": objects})
    write_json(out / "packaged.json", receipts)
    # Enable clips included in the same deployment; this is not a claim that
    # the branch or its files have already been published to production.
    write_json(ROOT / "data/narration-cuv-fangfang-release.json", {
        "schema": manifest["schema"], "translation": "CUV", "voice": "fangfang",
        "enabled": True, "catalog": f"/{PREFIX}/catalog.json",
        "clips": [{"id": c["id"], "text": c["text"], "url": f"/{c['key']}"} for c in clips]})
    report(out, registry)
    print(json.dumps({"readyClips": len(clips), "audioSeconds": round(sum(c["durationSeconds"] for c in clips), 3),
                      "audioBytes": sum(c["bytes"] for c in clips), "manifestUrl": f"{HOST}/{manifest_key}"}), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "status", "review", "activate-profile", "generate", "check", "package"])
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--model", default="small", choices=["small", "medium"])
    parser.add_argument("--only", default="", help="Comma-separated USFM references, e.g. JHN.3.16")
    parser.add_argument("--profile", type=Path, help="Private Fangfang profile for activate-profile")
    parser.add_argument("--note", help="Owner's explicit audition confirmation, required for review")
    args = parser.parse_args()
    out = args.output.expanduser().resolve()
    if out == ROOT or ROOT in out.parents:
        raise ValueError("Keep audio outside the repository")
    if args.command == "prepare":
        prepare(out)
    elif args.command == "generate":
        generate(out, args.only)
    elif args.command == "review":
        if not args.note or not args.note.strip():
            parser.error("review needs --note with the owner's explicit audition confirmation")
        review(out, args.only, args.note.strip())
    elif args.command == "activate-profile":
        if not args.profile:
            parser.error("activate-profile needs --profile")
        activate_profile(out, args.profile)
    elif args.command == "check":
        check(out, args.model, args.only)
    elif args.command == "package":
        package(out)
    if args.command in ("prepare", "status"):
        report(out, collect(out))


if __name__ == "__main__":
    main()
