#!/usr/bin/env python3
"""Build per-book public-domain CUV assets for the Daily Verse Worker.

Writes one `<BOOK>.json` per book plus an `index.json` catalogue (book order,
Chinese titles, and per-chapter verse counts) that backs the Pick a Verse
book/chapter/verse picker for CUV — the one edition the app serves locally
instead of through YouVersion.

    python3 scripts/build_cuv_assets.py              # download + rebuild everything
    python3 scripts/build_cuv_assets.py --index-only # rebuild index.json in place
"""

from __future__ import annotations

import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path


SOURCE_URL = "https://ebible.org/Scriptures/cmn-cu89s_vpl.zip"
SOURCE_MEMBER = "cmn-cu89s_vpl.txt"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "cuv"
LINE_PATTERN = re.compile(r"([1-3]?[A-Z]{2,3}) (\d+):(\d+) (.*)")

VPL_TO_USFM = {
    "SOL": "SNG",
    "EZE": "EZK",
    "JOE": "JOL",
    "MAR": "MRK",
    "JOH": "JHN",
    "PHI": "PHP",
    "JAM": "JAS",
    "1JO": "1JN",
    "2JO": "2JN",
    "3JO": "3JN",
}

# BOOK_NAMES is in canonical order; everything from MAT on is the New Testament.
FIRST_NT_BOOK = "MAT"

BOOK_NAMES = {
    "GEN": "创世记", "EXO": "出埃及记", "LEV": "利未记", "NUM": "民数记",
    "DEU": "申命记", "JOS": "约书亚记", "JDG": "士师记", "RUT": "路得记",
    "1SA": "撒母耳记上", "2SA": "撒母耳记下", "1KI": "列王纪上", "2KI": "列王纪下",
    "1CH": "历代志上", "2CH": "历代志下", "EZR": "以斯拉记", "NEH": "尼希米记",
    "EST": "以斯帖记", "JOB": "约伯记", "PSA": "诗篇", "PRO": "箴言",
    "ECC": "传道书", "SNG": "雅歌", "ISA": "以赛亚书", "JER": "耶利米书",
    "LAM": "耶利米哀歌", "EZK": "以西结书", "DAN": "但以理书", "HOS": "何西阿书",
    "JOL": "约珥书", "AMO": "阿摩司书", "OBA": "俄巴底亚书", "JON": "约拿书",
    "MIC": "弥迦书", "NAH": "那鸿书", "HAB": "哈巴谷书", "ZEP": "西番雅书",
    "HAG": "哈该书", "ZEC": "撒迦利亚书", "MAL": "玛拉基书", "MAT": "马太福音",
    "MRK": "马可福音", "LUK": "路加福音", "JHN": "约翰福音", "ACT": "使徒行传",
    "ROM": "罗马书", "1CO": "哥林多前书", "2CO": "哥林多后书", "GAL": "加拉太书",
    "EPH": "以弗所书", "PHP": "腓立比书", "COL": "歌罗西书", "1TH": "帖撒罗尼迦前书",
    "2TH": "帖撒罗尼迦后书", "1TI": "提摩太前书", "2TI": "提摩太后书", "TIT": "提多书",
    "PHM": "腓利门书", "HEB": "希伯来书", "JAS": "雅各书", "1PE": "彼得前书",
    "2PE": "彼得后书", "1JN": "约翰一书", "2JN": "约翰二书", "3JN": "约翰三书",
    "JUD": "犹大书", "REV": "启示录",
}


def download() -> str:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "lucas-academy-bible CUV asset builder"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        archive = response.read()
    with zipfile.ZipFile(io.BytesIO(archive)) as source_zip:
        return source_zip.read(SOURCE_MEMBER).decode("utf-8")


def build_index(verse_numbers: dict[str, dict[str, list[int]]]) -> dict:
    """Catalogue of the books we actually wrote, in canonical order.

    `chapters` holds the HIGHEST verse number per chapter (chapter 1 first).
    A handful of CUV chapters skip a verse number where the Chinese text merges
    verses, and the local reader has no text under the skipped number — those
    are listed in `gaps` so the picker never offers a verse that cannot load.
    """
    canon = "old_testament"
    books = []
    for book in BOOK_NAMES:
        if book == FIRST_NT_BOOK:
            canon = "new_testament"
        chapters = verse_numbers.get(book)
        if not chapters:
            continue
        highest = []
        gaps = {}
        for number in range(1, len(chapters) + 1):
            present = sorted(chapters[str(number)])
            highest.append(present[-1])
            missing = sorted(set(range(1, present[-1] + 1)) - set(present))
            if missing:
                gaps[str(number)] = missing
        entry = {
            "id": book,
            "title": BOOK_NAMES[book],
            "canon": canon,
            "chapters": highest,
        }
        if gaps:
            entry["gaps"] = gaps
        books.append(entry)
    return {"books": books}


def write_index(verse_numbers: dict[str, dict[str, list[int]]]) -> None:
    index = build_index(verse_numbers)
    (OUTPUT_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote CUV index for {len(index['books'])} books to {OUTPUT_DIR}")


def index_only() -> None:
    """Rebuild index.json from the book assets already on disk."""
    verse_numbers: dict[str, dict[str, list[int]]] = {}
    for path in sorted(OUTPUT_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        verse_numbers[path.stem] = {
            chapter: [int(verse) for verse in verses]
            for chapter, verses in data["chapters"].items()
        }
    write_index(verse_numbers)


def main() -> None:
    books: dict[str, dict[str, dict[str, str]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    for line in download().splitlines():
        match = LINE_PATTERN.fullmatch(line)
        if not match:
            continue
        vpl_book, chapter, verse, text = match.groups()
        book = VPL_TO_USFM.get(vpl_book, vpl_book)
        books[book][chapter][verse] = text

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUTPUT_DIR.glob("*.json"):
        stale.unlink()
    for book, chapters in books.items():
        payload = {
            "book": BOOK_NAMES.get(book, book),
            "chapters": chapters,
        }
        (OUTPUT_DIR / f"{book}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    print(f"Wrote {len(books)} CUV book assets to {OUTPUT_DIR}")

    write_index(
        {
            book: {
                chapter: [int(verse) for verse in verses]
                for chapter, verses in chapters.items()
            }
            for book, chapters in books.items()
        }
    )


if __name__ == "__main__":
    if "--index-only" in sys.argv:
        index_only()
    else:
        main()
