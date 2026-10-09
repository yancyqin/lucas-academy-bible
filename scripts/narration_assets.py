"""Standard-library helpers for CUV narration; no models or network access."""
from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOST = "https://bible.lucasacademy.org"
PREFIX = "audio/cuv-fangfang"
CACHE = "public, max-age=31536000, immutable, no-transform"
CATALOG = json.loads((ROOT / "public/cuv/index.json").read_text())["books"]
CHINESE_NAMES = {book["id"]: book["title"] for book in CATALOG}


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     prefix=path.name + ".", suffix=".tmp", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def verses(scope: str = "curated") -> list[dict]:
    if scope != "curated":
        raise ValueError("Fangfang narration tracks the curated CUV collection")
    by_title = {book["title"]: book["id"] for book in CATALOG}
    selected = set()
    source = json.loads((ROOT / "data/verses.json").read_text())
    for passage in source["passages"]:
        code = by_title[passage["bookZh"]]
        selected.update(f"{code}.{passage['chapter']}.{verse['verse']}" for verse in passage["verses"])
    rows = []
    for book in CATALOG:
        code = book["id"]
        source = json.loads((ROOT / "public/cuv" / f"{code}.json").read_text())
        for chapter, contents in sorted(source["chapters"].items(), key=lambda item: int(item[0])):
            for number, text in sorted(contents.items(), key=lambda item: int(item[0])):
                reference = f"{code}.{chapter}.{number}"
                if reference in selected:
                    rows.append({"id": reference, "book": code, "chapter": int(chapter),
                                 "verse": int(number), "text": text})
    if selected != {row["id"] for row in rows}:
        raise ValueError("A selected verse is missing from the local CUV source")
    return rows


def inspect(path: Path) -> dict:
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_name,sample_rate,channels,bit_rate", "-of", "json", str(path)]))
    duration = float(probe["format"]["duration"])
    streams = probe["streams"]
    if (len(streams) != 1 or duration <= 0 or streams[0]["codec_name"] != "mp3"
            or streams[0]["channels"] != 1 or streams[0]["sample_rate"] != "32000"
            or streams[0]["bit_rate"] != "48000"):
        raise ValueError(f"Expected mono 32 kHz / 48 kbps MP3: {path}")
    return {"durationSeconds": round(duration, 3), "bytes": path.stat().st_size,
            "sha256": digest(path.read_bytes())}
