#!/usr/bin/env python3
"""Build the per-book public-domain Bible assets the app reads locally.

Two editions, both public domain, both from eBible.org verse-per-line files:

    public/web/   World English Bible (eng-web)              English
    public/cuv/   Chinese Union Version, Simplified (cmn-cu89s)  中文

Each directory holds one `<BOOK>.json` per book of the 66-book canon plus an
`index.json` catalogue (book order, localized titles, highest verse number per
chapter, and any verse numbers the edition skips). The app's Pick a Verse
picker and passage reader load these directly — on the web site, and inside
the offline App Store build — so no request ever leaves the device for these
two editions. The Worker reads the same CUV files for Daily Verse.

    python3 scripts/build_bible_assets.py                 # download + rebuild both
    python3 scripts/build_bible_assets.py --edition web   # one edition
    python3 scripts/build_bible_assets.py --index-only    # rebuild index.json files only

The text is written exactly as eBible.org publishes it (including the Psalm
headings WEB carries inside verse 1) — the app never edits scripture.
"""

from __future__ import annotations

import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LINE_PATTERN = re.compile(r"([1-4]?[A-Z]{2,3}) (\d+):(\d+) (.*)")

# eBible's VPL book codes that differ from the USFM ids YouVersion (and the
# app's `?passage=` links) use.
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

# Canonical order; everything from MAT on is the New Testament. Books outside
# this table (eBible's deuterocanon: TOB, JDT, SIR, 1MA, PSX…) are dropped so
# every edition offers the same 66 books.
FIRST_NT_BOOK = "MAT"

CANON_ORDER = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
    "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
    "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
    "OBA", "JON", "MIC", "NAH", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT",
    "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP",
    "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE",
    "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
]

ENGLISH_NAMES = {
    "GEN": "Genesis", "EXO": "Exodus", "LEV": "Leviticus", "NUM": "Numbers",
    "DEU": "Deuteronomy", "JOS": "Joshua", "JDG": "Judges", "RUT": "Ruth",
    "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
    "1CH": "1 Chronicles", "2CH": "2 Chronicles", "EZR": "Ezra", "NEH": "Nehemiah",
    "EST": "Esther", "JOB": "Job", "PSA": "Psalms", "PRO": "Proverbs",
    "ECC": "Ecclesiastes", "SNG": "Song of Songs", "ISA": "Isaiah", "JER": "Jeremiah",
    "LAM": "Lamentations", "EZK": "Ezekiel", "DAN": "Daniel", "HOS": "Hosea",
    "JOL": "Joel", "AMO": "Amos", "OBA": "Obadiah", "JON": "Jonah",
    "MIC": "Micah", "NAH": "Nahum", "HAB": "Habakkuk", "ZEP": "Zephaniah",
    "HAG": "Haggai", "ZEC": "Zechariah", "MAL": "Malachi", "MAT": "Matthew",
    "MRK": "Mark", "LUK": "Luke", "JHN": "John", "ACT": "Acts",
    "ROM": "Romans", "1CO": "1 Corinthians", "2CO": "2 Corinthians", "GAL": "Galatians",
    "EPH": "Ephesians", "PHP": "Philippians", "COL": "Colossians", "1TH": "1 Thessalonians",
    "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy", "TIT": "Titus",
    "PHM": "Philemon", "HEB": "Hebrews", "JAS": "James", "1PE": "1 Peter",
    "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John", "3JN": "3 John",
    "JUD": "Jude", "REV": "Revelation",
}

CHINESE_NAMES = {
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


@dataclass(frozen=True)
class Edition:
    key: str
    directory: str
    source_url: str
    source_member: str
    names: dict[str, str]

    @property
    def output_dir(self) -> Path:
        return ROOT / "public" / self.directory


EDITIONS = {
    "web": Edition(
        key="WEB",
        directory="web",
        source_url="https://ebible.org/Scriptures/eng-web_vpl.zip",
        source_member="eng-web_vpl.txt",
        names=ENGLISH_NAMES,
    ),
    "cuv": Edition(
        key="CUV",
        directory="cuv",
        source_url="https://ebible.org/Scriptures/cmn-cu89s_vpl.zip",
        source_member="cmn-cu89s_vpl.txt",
        names=CHINESE_NAMES,
    ),
}


def download(edition: Edition) -> str:
    request = urllib.request.Request(
        edition.source_url,
        headers={"User-Agent": "lucas-academy-bible Bible asset builder"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        archive = response.read()
    with zipfile.ZipFile(io.BytesIO(archive)) as source_zip:
        return source_zip.read(edition.source_member).decode("utf-8")


VerseNumbers = dict[str, dict[str, list[int]]]


def build_index(edition: Edition, verse_numbers: VerseNumbers) -> dict:
    """Catalogue of the books written, in canonical order.

    `chapters` holds the HIGHEST verse number per chapter (chapter 1 first).
    Where an edition skips a verse number (CUV merges a few verses), the local
    reader has no text under the skipped number — those go in `gaps` so the
    picker never offers a verse that cannot load.
    """
    canon = "old_testament"
    books = []
    for book in CANON_ORDER:
        if book == FIRST_NT_BOOK:
            canon = "new_testament"
        chapters = verse_numbers.get(book)
        if not chapters:
            continue
        highest = []
        gaps = {}
        for number in range(1, len(chapters) + 1):
            present = sorted(chapters.get(str(number), []))
            if not present:
                raise SystemExit(f"{edition.key} {book} is missing chapter {number}")
            highest.append(present[-1])
            missing = sorted(set(range(1, present[-1] + 1)) - set(present))
            if missing:
                gaps[str(number)] = missing
        entry = {
            "id": book,
            "title": edition.names[book],
            "canon": canon,
            "chapters": highest,
        }
        if gaps:
            entry["gaps"] = gaps
        books.append(entry)
    return {"translation": edition.key, "books": books}


def write_index(edition: Edition, verse_numbers: VerseNumbers) -> None:
    index = build_index(edition, verse_numbers)
    (edition.output_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {edition.key} index for {len(index['books'])} books to {edition.output_dir}")


def index_only(edition: Edition) -> None:
    """Rebuild index.json from the book assets already on disk."""
    verse_numbers: VerseNumbers = {}
    for path in sorted(edition.output_dir.glob("*.json")):
        if path.name == "index.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        verse_numbers[path.stem] = {
            chapter: [int(verse) for verse in verses]
            for chapter, verses in data["chapters"].items()
        }
    write_index(edition, verse_numbers)


def build(edition: Edition) -> None:
    books: dict[str, dict[str, dict[str, str]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    for line in download(edition).splitlines():
        match = LINE_PATTERN.fullmatch(line)
        if not match:
            continue
        vpl_book, chapter, verse, text = match.groups()
        book = VPL_TO_USFM.get(vpl_book, vpl_book)
        if book not in edition.names:
            continue  # deuterocanon and extras — not part of the 66-book canon
        text = text.strip()
        if text:
            books[book][chapter][verse] = text

    edition.output_dir.mkdir(parents=True, exist_ok=True)
    for stale in edition.output_dir.glob("*.json"):
        stale.unlink()
    for book, chapters in books.items():
        payload = {"book": edition.names[book], "chapters": chapters}
        (edition.output_dir / f"{book}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
    print(f"Wrote {len(books)} {edition.key} book assets to {edition.output_dir}")

    write_index(
        edition,
        {
            book: {
                chapter: [int(verse) for verse in verses]
                for chapter, verses in chapters.items()
            }
            for book, chapters in books.items()
        },
    )


def main(argv: list[str]) -> None:
    selected = list(EDITIONS)
    if "--edition" in argv:
        wanted = argv[argv.index("--edition") + 1].lower()
        if wanted not in EDITIONS:
            raise SystemExit(f"Unknown edition {wanted!r}; choose from {', '.join(EDITIONS)}")
        selected = [wanted]
    for name in selected:
        edition = EDITIONS[name]
        if "--index-only" in argv:
            index_only(edition)
        else:
            build(edition)


if __name__ == "__main__":
    main(sys.argv[1:])
