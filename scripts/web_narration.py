#!/usr/bin/env python3
"""Incremental WEB Classic narration in the existing authorized Louise voice.

Private references and WAV masters stay outside the repository. Only checked
or explicitly owner-reviewed takes are packaged as website MP3 assets.
"""
from __future__ import annotations

import argparse
import difflib
import fcntl
import html
import json
import re
import subprocess
import sys
import tempfile
import time
import wave
from collections import Counter
from pathlib import Path

from fangfang_narration import MEDIA, file_digest, line_id, now, read_json, wav_info
from narration_assets import CACHE, CATALOG, HOST, ROOT, digest, inspect, write_json

DEFAULT_OUT = Path.home() / "Downloads/lucas-bible-narration-web"
REGISTRY = ROOT / "data/narration-web-louise.json"
PREFIX = "audio/web-louise"
LABELS = {"missing": "未配音", "stale": "需要重新配音", "invalid": "文件异常",
          "generated": "已生成，待核对", "needs_review": "核对有疑点",
          "checked": "机器核对通过，待人工试听", "reviewed": "人工试听通过",
          "published": "已上线"}


def verses() -> list[dict]:
    source = read_json(ROOT / "data/verses.json")
    translation = source["metadata"]["translation"]
    if translation["id"] != "WEB" or translation["license"] != "Public Domain":
        raise ValueError("Expected the bundled public-domain WEB Classic source")
    by_title = {book["title"]: book["id"] for book in CATALOG}
    unique = {}
    for passage in source["passages"]:
        book = by_title[passage["bookZh"]]
        for verse in passage["verses"]:
            reference = f"{book}.{passage['chapter']}.{verse['verse']}"
            row = {"id": reference, "book": book, "chapter": passage["chapter"],
                   "verse": verse["verse"], "text": verse["text"],
                   "reference": f"{passage['book']} {passage['chapter']}:{verse['verse']}"}
            if reference in unique and unique[reference]["text"] != row["text"]:
                raise ValueError(f"Conflicting source texts: {reference}")
            unique[reference] = row
    return list(unique.values())


def configuration(profile: Path | None = None) -> dict:
    profile = profile or MEDIA / "profiles/louise/en/profile.json"
    contents = read_json(profile)
    if contents["name"] != "louise" or contents["reference_language"] != "en":
        raise ValueError("Expected the existing Louise English profile")
    model = MEDIA / "models/Fun-CosyVoice3-0.5B"
    return {"voice": "louise", "language": "en", "speed": 0.85,
            "model": "Fun-CosyVoice3-0.5B", "mode": "zero-shot", "device": "cpu",
            "profileSha256": file_digest(profile),
            "referenceSha256": file_digest(profile.parent / contents["reference_audio"]),
            "modelFiles": {name: file_digest(model / name) for name in
                           ("cosyvoice3.yaml", "llm.pt", "flow.pt", "hift.pt")},
            "upstreamCommit": subprocess.check_output(
                ["git", "-C", str(MEDIA / "vendor/CosyVoice"), "rev-parse", "HEAD"], text=True).strip(),
            "sampleRate": 32000, "bitrate": "48k", "format": "mp3", "channels": 1}


def prepare(out: Path) -> None:
    if (out / "settings.json").exists():
        raise ValueError("Already prepared; use status or generate")
    out.mkdir(parents=True, exist_ok=True)
    config = configuration()
    config_id = digest(json.dumps(config, sort_keys=True).encode())[:16]
    write_json(out / "settings.json", {"config": config, "configId": config_id, "createdAt": now()})
    report(out, collect(out))


def activate_profile(out: Path, profile: Path) -> None:
    settings = read_json(out / "settings.json")
    config = configuration(profile)
    config_id = digest(json.dumps(config, sort_keys=True).encode())[:16]
    configs = settings.get("configs", {settings["configId"]: settings["config"]})
    configs[config_id] = config
    settings.update(config=config, configId=config_id, configs=configs, activeProfile=str(profile.resolve()))
    write_json(out / "settings.json", settings)
    report(out, collect(out))


def collect(out: Path) -> dict:
    settings = read_json(out / "settings.json")
    if not settings:
        raise ValueError("Run prepare first")
    bindings = read_json(out / "take-sources.json", {})
    checks = read_json(out / "checks.json", {})
    reviews = read_json(out / "owner-reviews.json", {})
    packaged = read_json(out / "packaged.json", {})
    previous = {r["id"]: r for r in read_json(REGISTRY, {}).get("verses", [])}
    configs = settings.get("configs", {settings["configId"]: settings["config"]})
    rows = []
    for verse in verses():
        ref = verse["id"]
        binding = bindings.get(ref, {})
        row = {**verse, "textSha256": digest(verse["text"].encode()), "voice": "louise",
               "configId": binding.get("configId", settings["configId"]), "status": "missing", "published": False}
        path = out / "takes" / f"{line_id(ref)}.wav"
        if path.exists():
            if binding.get("textSha256") != row["textSha256"] or row["configId"] not in configs:
                row["status"] = "stale"
            else:
                row.update({k: binding[k] for k in ("synthesisTextSha256", "preprocessing")})
                if "synthesisChunks" in binding:
                    row["synthesisChunks"] = binding["synthesisChunks"]
                try:
                    row.update(wav_info(path), status="generated")
                    if "generationSeed" in binding:
                        row["generationSeed"] = binding["generationSeed"]
                    check = checks.get(ref, {})
                    if all(check.get(k) == row[k] for k in ("wavSha256", "textSha256", "configId")):
                        row.update(check=check, status="needs_review" if check["issues"] else "checked")
                    review = reviews.get(ref, {})
                    if all(review.get(k) == row[k] for k in ("wavSha256", "textSha256", "configId")):
                        row.update(humanReview=review, status="reviewed")
                except (ValueError, wave.Error, EOFError) as error:
                    row.update(status="invalid", error=str(error))
        clip = packaged.get(ref, {})
        if (row["status"] in ("checked", "reviewed") and
                all(clip.get(k) == row[k] for k in ("wavSha256", "textSha256", "configId"))):
            path = ROOT / "public" / clip["key"]
            if path.exists() and file_digest(path) == clip["sha256"]:
                row.update({k: clip[k] for k in ("key", "url", "sha256", "bytes")})
                prior = previous.get(ref, {})
                if prior.get("published") and all(prior.get(k) == row.get(k) for k in
                        ("wavSha256", "textSha256", "configId", "sha256")):
                    row.update(status="published", published=True)
        rows.append(row)
    return {"schema": "lucas-bible-narration-status/1", "translation": "WEB", "voice": "louise",
            "updatedAt": now(), "source": "data/verses.json (WEB Classic, 2020 stable text)",
            "config": settings["config"], "configId": settings["configId"], "configs": configs,
            "qaPolicy": "web-exact-words/1", "counts": dict(Counter(r["status"] for r in rows)), "verses": rows}


def report(out: Path, registry: dict) -> None:
    write_json(REGISTRY, registry)
    rows = []
    for row in registry["verses"]:
        path = out / "takes" / f"{line_id(row['id'])}.wav"
        audio = f'<audio controls preload="none" src="{html.escape(path.as_uri())}"></audio>' if path.exists() else ""
        issues = "; ".join(row.get("check", {}).get("issues", []))
        rows.append(f'<tr data-status="{row["status"]}"><td>{html.escape(row["reference"])}<small>{row["id"]}</small></td>'
                    f'<td>{html.escape(row["text"])}</td><td>{LABELS[row["status"]]}<small>{html.escape(issues)}</small></td><td>{audio}</td></tr>')
    counts = " · ".join(f"{LABELS[k]} {v}" for k, v in registry["counts"].items())
    document = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Louise WEB 配音清单</title>
    <style>body{{font:16px system-ui;margin:32px;line-height:1.6}}table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #ddd;padding:12px;text-align:left}}td:nth-child(2){{max-width:650px}}small{{display:block;color:#944}}audio{{width:230px}}input,select{{padding:8px;margin-right:12px}}</style>
    <h1>Louise WEB 配音清单</h1><p>{counts} · 共 {len(rows)} 节</p>
    <p>机器核对通过不等于人工试听批准。新增经文后运行 status，未配音项会自动出现；更换文字或录音后，旧检查及试听确认失效。</p>
    <input id="query" placeholder="搜索编号或经文"><select id="state"><option value="">全部状态</option>{''.join(f'<option value="{k}">{v}</option>' for k,v in LABELS.items())}</select>
    <table><thead><tr><th>经文</th><th>WEB 原文</th><th>状态</th><th>试听</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
    <script>function filter(){{document.querySelectorAll('tbody tr').forEach(r=>r.hidden=(!r.textContent.toLowerCase().includes(query.value.toLowerCase())||(state.value&&r.dataset.status!==state.value)))}}query.oninput=state.onchange=filter;</script></html>'''
    (out / "status.html").write_text(document)
    print(json.dumps({"total": len(rows), **registry["counts"]}, ensure_ascii=False), flush=True)


def selection(rows: list[dict], only: str) -> list[dict]:
    selected = {ref.strip().upper() for ref in only.split(",") if ref.strip()}
    if selected - {r["id"] for r in rows}:
        raise ValueError(f"Unknown references: {sorted(selected - {r['id'] for r in rows})}")
    return [r for r in rows if r["id"] in selected] if selected else rows


def synthesis_chunks(text: str, clause_pacing: bool = False, emphasize: str = "") -> list[str]:
    text = text.replace("[", "").replace("]", "")
    selected = {word.strip().lower() for word in emphasize.split(",") if word.strip()}
    if selected:
        text = re.sub(r"\b[A-Za-z]+\b", lambda m: m[0].upper() if m[0].lower() in selected else m[0], text)
    if not clause_pacing:
        return [text]
    # Give continuation clauses a clear sentence onset without changing words.
    chunks = []
    for clause in text.split(","):
        part = clause.strip().rstrip(".;:").strip()
        if part:
            chunks.append(part[0].upper() + part[1:] + ".")
    return chunks


def generate(out: Path, only: str, seed: int | None = None, clause_pacing: bool = False, emphasize: str = "") -> None:
    registry = collect(out)
    settings = read_json(out / "settings.json")
    profile = Path(settings["activeProfile"]) if settings.get("activeProfile") else None
    if configuration(profile) != registry["config"]:
        raise ValueError("Louise profile/model changed; prepare a separate output release")
    todo = selection(registry["verses"], only)
    if not only:
        todo = [r for r in todo if r["status"] in ("missing", "stale", "invalid")]
    if not todo:
        print("No missing or stale takes.", flush=True)
        return
    sys.path.insert(0, str(MEDIA / "src"))
    from lucas_media.cosyvoice_engine import CosyVoiceEngine
    from lucas_media.joke import DEFAULT_PEAK_DBFS, add_peak_headroom, save_wav
    engine = CosyVoiceEngine(profile or "louise/en")
    for index, row in enumerate(todo, 1):
        start = time.monotonic()
        if seed is not None:
            import random
            import numpy as np
            import torch
            take_seed = seed + index - 1
            random.seed(take_seed)
            np.random.seed(take_seed)
            torch.manual_seed(take_seed)
        chunks = synthesis_chunks(row["text"], clause_pacing, emphasize)
        waves = []
        rate = None
        for text in chunks:
            speech, sample_rate, _ = engine.synthesize(text, target_language="en", speed=0.85)
            if rate is not None and rate != sample_rate:
                raise ValueError("Inconsistent synthesis sample rates")
            rate = sample_rate
            if waves:
                import torch
                waves.append(torch.zeros((speech.shape[0], int(rate * 0.25)), dtype=speech.dtype))
            waves.append(speech)
        import torch
        speech = torch.cat(waves, dim=1)
        path = out / "takes" / f"{line_id(row['id'])}.wav"
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".new.wav")
        save_wav(temporary, add_peak_headroom(speech, peak_dbfs=DEFAULT_PEAK_DBFS), rate)
        info = wav_info(temporary)
        if path.exists():
            archive = out / "retained" / f"{line_id(row['id'])}-{file_digest(path)}.wav"
            archive.parent.mkdir(exist_ok=True)
            path.replace(archive)
        temporary.replace(path)
        # Independent batches can share the output without losing bindings.
        with (out / ".bindings.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            bindings = read_json(out / "take-sources.json", {})
            preprocessing = "web-clause-pacing/1" if clause_pacing else "web-display-markup/1"
            if emphasize:
                preprocessing = "web-clause-pacing-and-emphasis/1" if clause_pacing else "web-word-emphasis/1"
            bindings[row["id"]] = {"textSha256": row["textSha256"], "configId": registry["configId"],
                                   "synthesisTextSha256": digest(" ".join(chunks).encode()),
                                   "preprocessing": preprocessing}
            if clause_pacing or emphasize:
                bindings[row["id"]]["synthesisChunks"] = chunks
            if seed is not None:
                bindings[row["id"]]["generationSeed"] = take_seed
            write_json(out / "take-sources.json", bindings)
        print(f"Generated {index}/{len(todo)} {row['id']}: {info['durationSeconds']}s, {time.monotonic()-start:.1f}s elapsed", flush=True)
        if (out / ".pause-generators").exists():
            print("Paused after saving the current take.", flush=True)
            break
    report(out, collect(out))


def audit_words(result: dict, text: str) -> dict:
    def words(value: str) -> list[str]:
        # ASR can separate these compound spellings without changing a sound.
        compounds = {"bondservant": ["bond", "servant"], "bondservants": ["bond", "servants"],
                     "uncircumcision": ["un", "circumcision"], "lovingkindness": ["loving", "kindness"]}
        tokens = re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)*", value.lower().replace("’", "'"))
        return [part for token in tokens for part in compounds.get(token, [token])]
    want, got = words(text), words(result["heard"])
    matcher = difflib.SequenceMatcher(None, want, got, autojunk=False)
    differences = [{"operation": op, "expected": want[a:b], "heard": got[c:d]}
                   for op, a, b, c, d in matcher.get_opcodes() if op != "equal"]
    issues = ["Recognized words differ from the source"] if differences else []
    if result["extra"]:
        issues.append(f"Extra words: {result['extra']}")
    if result["odd"]:
        issues.append(f"Unrecognized sound at {result['odd']}s")
    if result["gap"] > 2:
        issues.append(f"Internal pause: {result['gap']}s")
    return {**result, "score": round(matcher.ratio(), 3), "wordExact": not differences,
            "differences": differences, "issues": issues,
            "comparison": "apostrophes-and-compound-spelling/1"}


def check(out: Path, model_name: str, only: str, watch: bool = False, fallback_model: str = "") -> None:
    import torch
    import whisper
    torch.set_num_threads(2)
    sys.path.insert(0, str(MEDIA / "scripts"))
    from check_narration import analyse
    models = {}
    def analyse_take(name: str, path: Path, text: str) -> dict:
        if name not in models:
            models[name] = whisper.load_model(name)
        result = analyse(models[name], path, text, "en", "World English Bible. Yahweh. Jesus Christ.")
        result.pop("_cut", None)
        return {**audit_words(result, text), "model": name}
    while True:
        registry = collect(out)
        checks = read_json(out / "checks.json", {})
        for row in registry["verses"]:
            check = checks.get(row["id"])
            if check and check.get("textSha256") == row["textSha256"]:
                checks[row["id"]] = audit_words(check, row["text"])
        write_json(out / "checks.json", checks)
        rows = selection(registry["verses"], only)
        todo = [r for r in rows if r["status"] in ("generated", "needs_review", "checked") and
                (any(checks.get(r["id"], {}).get(k) != r[k] for k in ("wavSha256", "textSha256", "configId"))
                 or (only and checks.get(r["id"], {}).get("model") != model_name)
                 or (fallback_model and r["status"] == "needs_review" and
                     checks.get(r["id"], {}).get("secondaryModel") != fallback_model))]
        if todo:
            for index, row in enumerate(todo, 1):
                path = out / "takes" / f"{line_id(row['id'])}.wav"
                result = analyse_take(model_name, path, row["text"])
                if result["issues"] and fallback_model:
                    second = analyse_take(fallback_model, path, row["text"])
                    attempts = [result, second]
                    # Preserve both transcripts; a successful comparison must
                    # match every word and pass the sound checks.
                    result = min(attempts, key=lambda r: (len(r["issues"]), -r["score"]))
                    result = {**result, "secondaryModel": fallback_model, "asrAttempts": attempts}
                if wav_info(path)["wavSha256"] != row["wavSha256"]:
                    raise ValueError(f"Take changed while checking: {row['id']}")
                checks[row["id"]] = {**result, "checkedAt": now(),
                                    **{k: row[k] for k in ("wavSha256", "textSha256", "configId")}}
                write_json(out / "checks.json", checks)
                print(f"Checked {index}/{len(todo)} {row['id']}: {'PASS' if not result['issues'] else 'REVIEW'} {result['heard']}", flush=True)
        report(out, collect(out))
        if not watch or not any(r["status"] in ("missing", "stale", "invalid", "generated") for r in collect(out)["verses"]):
            break
        time.sleep(5)


def review(out: Path, only: str, note: str) -> None:
    rows = selection(collect(out)["verses"], only)
    if not rows or any(r["status"] in ("missing", "stale", "invalid") for r in rows):
        raise ValueError("Owner review requires valid current takes")
    reviews = read_json(out / "owner-reviews.json", {})
    for row in rows:
        reviews[row["id"]] = {**{k: row[k] for k in ("wavSha256", "textSha256", "configId")},
                              "reviewer": "owner", "reviewedAt": now(), "note": note}
    write_json(out / "owner-reviews.json", reviews)
    report(out, collect(out))


def package(out: Path) -> None:
    registry = collect(out)
    clips, objects = [], []
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
                raise ValueError(f"Corrupt immutable file: {target}")
            if not target.exists():
                target.write_bytes(mp3.read_bytes())
        clip = {**row, **measured, "key": key, "url": f"{HOST}/{key}"}
        for field in ("check", "status", "published", "rms"):
            clip.pop(field, None)
        clips.append(clip)
        receipts[row["id"]] = {k: clip[k] for k in ("wavSha256", "textSha256", "configId", "key", "url", "sha256", "bytes")}
        objects.append({"source": str(target), "path": f"/{key}", **measured,
                        "contentType": "audio/mpeg", "cacheControl": CACHE})
    manifest = {"schema": "lucas-bible-narration/1", "translation": "WEB", "voice": "louise",
                "edition": "World English Bible Classic, 2020 stable text", "syntheticSpeech": True,
                "source": "https://ebible.org/details.php?id=eng-web", "license": "Public Domain",
                "qaPolicy": registry["qaPolicy"], "configId": registry["configId"],
                "configs": registry["configs"], "clips": clips}
    write_json(out / "manifest.json", manifest)
    payload = (out / "manifest.json").read_bytes()
    for key, cache in [(f"{PREFIX}/{registry['configId']}/manifest-{digest(payload)}.json", CACHE),
                       (f"{PREFIX}/catalog.json", "public, max-age=300, must-revalidate")]:
        path = ROOT / "public" / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        objects.append({"source": str(path), "path": f"/{key}", "sha256": digest(payload),
                        "bytes": len(payload), "contentType": "application/json", "cacheControl": cache})
    write_json(out / "static-release.json", {"delivery": "cloudflare-static-assets", "hostname": HOST,
               "published": False, "objects": objects})
    write_json(out / "packaged.json", receipts)
    write_json(ROOT / "data/narration-web-louise-release.json", {
        "schema": manifest["schema"], "translation": "WEB", "voice": "louise",
        "enabled": bool(clips), "catalog": f"/{PREFIX}/catalog.json",
        "clips": [{"id": c["id"], "text": c["text"], "url": f"/{c['key']}"} for c in clips]})
    report(out, collect(out))
    print(f"Packaged {len(clips)} checked/reviewed clips; {len(registry['verses'])-len(clips)} pending.", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "status", "generate", "check", "review", "package", "use-profile"))
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--only", default="")
    parser.add_argument("--model", default="small")
    parser.add_argument("--fallback-model", default="", help="Recheck ASR doubts with a second model")
    parser.add_argument("--note", default="")
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--seed", type=int, help="Use a distinct, recorded sampling seed for retakes")
    parser.add_argument("--clause-pacing", action="store_true", help="Record comma-separated clauses with the same source words")
    parser.add_argument("--emphasize", default="", help="Capitalize comma-separated words for clearer pronunciation, without changing source words")
    parser.add_argument("--watch", action="store_true", help="Check new takes as they are generated")
    args = parser.parse_args()
    out = args.out.expanduser().resolve()
    if args.command == "prepare": prepare(out)
    elif args.command == "status": report(out, collect(out))
    elif args.command == "generate": generate(out, args.only, args.seed, args.clause_pacing, args.emphasize)
    elif args.command == "check": check(out, args.model, args.only, args.watch, args.fallback_model)
    elif args.command == "package": package(out)
    elif args.command == "use-profile":
        if not args.profile: parser.error("use-profile requires --profile")
        activate_profile(out, args.profile.expanduser().resolve())
    elif args.command == "review":
        if not args.note: parser.error("review requires the owner's explicit confirmation in --note")
        review(out, args.only, args.note)


if __name__ == "__main__":
    main()
