#!/usr/bin/env python3
"""Build per-book public-domain CUV assets for the Daily Verse Worker."""

from __future__ import annotations

import io
import json
import re
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


if __name__ == "__main__":
    main()
