#!/usr/bin/env python3
"""Build the approved Lucas Academy WEB scripture collection."""

from __future__ import annotations

import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path


SOURCE_URL = "https://ebible.org/Scriptures/eng-web_vpl.zip"
# Chinese Union Version (和合本, Simplified) — public domain. Same VPL format /
# book codes as the WEB source, so we can look verses up by the same keys.
CUV_SOURCE_URL = "https://ebible.org/Scriptures/cmn-cu89s_vpl.zip"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "verses.json"

BOOK_NAMES = {
    "GEN": "Genesis",
    "JOS": "Joshua",
    "PSA": "Psalm",
    "PRO": "Proverbs",
    "ECC": "Ecclesiastes",
    "ISA": "Isaiah",
    "JOE": "Joel",
    "HOS": "Hosea",
    "MAT": "Matthew",
    "LUK": "Luke",
    "JOH": "John",
    "ROM": "Romans",
    "1CO": "1 Corinthians",
    "2CO": "2 Corinthians",
    "GAL": "Galatians",
    "EPH": "Ephesians",
    "PHI": "Philippians",
    "HEB": "Hebrews",
    "1PE": "1 Peter",
    "1JO": "1 John",
}

# Chinese book names (和合本).
BOOK_NAMES_ZH = {
    "GEN": "创世记",
    "JOS": "约书亚记",
    "PSA": "诗篇",
    "PRO": "箴言",
    "ECC": "传道书",
    "ISA": "以赛亚书",
    "JOE": "约珥书",
    "HOS": "何西阿书",
    "MAT": "马太福音",
    "LUK": "路加福音",
    "JOH": "约翰福音",
    "ROM": "罗马书",
    "1CO": "哥林多前书",
    "2CO": "哥林多后书",
    "GAL": "加拉太书",
    "EPH": "以弗所书",
    "PHI": "腓立比书",
    "HEB": "希伯来书",
    "1PE": "彼得前书",
    "1JO": "约翰一书",
}

# (original request, normalized reference, source book code, chapter,
#  first verse, last verse, match note)
PASSAGE_REQUESTS = [
    ("Jesus wept", "John 11:35", "JOH", 11, 35, 35, "Matched from the supplied phrase."),
    ("你的话是我脚前的灯....", "Psalm 119:105", "PSA", 119, 105, 105, "Matched from the supplied Chinese phrase."),
    ("约翰一书1章9节", "1 John 1:9", "1JO", 1, 9, 9, None),
    ("John 8:31-32", "John 8:31-32", "JOH", 8, 31, 32, None),
    ("腓立比书2:15", "Philippians 2:15", "PHI", 2, 15, 15, None),
    ("彼得前书2：10", "1 Peter 2:10", "1PE", 2, 10, 10, None),
    ("以弗所书2:8", "Ephesians 2:8", "EPH", 2, 8, 8, None),
    ("以弗所书2:10", "Ephesians 2:10", "EPH", 2, 10, 10, None),
    ("Matthew 7:7", "Matthew 7:7", "MAT", 7, 7, 7, None),
    ("创世纪1:1", "Genesis 1:1", "GEN", 1, 1, 1, None),
    ("人要离开父母，夫妻二人成为一体", "Genesis 2:24", "GEN", 2, 24, 24, "Matched to the original statement in Genesis."),
    ("各按其时成为美好", "Ecclesiastes 3:11", "ECC", 3, 11, 11, "Matched from the supplied Chinese phrase."),
    ("诸天诉说神的荣耀", "Psalm 19:1", "PSA", 19, 1, 1, "Matched from the supplied Chinese phrase."),
    ("人算什么你既然在乎他", "Psalm 8:4", "PSA", 8, 4, 4, "Matched from the supplied Chinese phrase."),
    ("Joshua 出名的那个 do not afraid", "Joshua 1:9", "JOS", 1, 9, 9, "Matched to Joshua's well-known command to be strong and not afraid."),
    ("what merely mortal can do to me from plasm", "Psalm 56:4", "PSA", 56, 4, 4, "Matched to the NIV wording 'what can mere mortals do to me'."),
    ("加拉太书2：20", "Galatians 2:20", "GAL", 2, 20, 20, None),
    ("加拉太书圣灵的果子", "Galatians 5:22-23", "GAL", 5, 22, 23, "Matched to the fruit of the Spirit passage."),
    ("加拉太书 新造的人", "Galatians 6:15", "GAL", 6, 15, 15, "Matched to Galatians' reference to a new creation."),
    ("哥林多后书5：17", "2 Corinthians 5:17", "2CO", 5, 17, 17, None),
    ("哥林多后书3: 17", "2 Corinthians 3:17", "2CO", 3, 17, 17, None),
    ("哥林多后书3：18", "2 Corinthians 3:18", "2CO", 3, 18, 18, None),
    ("约珥书 关于圣灵的", "Joel 2:28-29", "JOE", 2, 28, 29, "Matched to the promise that God will pour out his Spirit."),
    ("哥林多前书 11：11", "1 Corinthians 11:11", "1CO", 11, 11, 11, None),
    ("哥林多前书 12：12", "1 Corinthians 12:12", "1CO", 12, 12, 12, None),
    ("哥林多前书 13：13", "1 Corinthians 13:13", "1CO", 13, 13, 13, None),
    ("约 8:31-34", "John 8:31-34", "JOH", 8, 31, 34, None),
    ("约 12:20-26", "John 12:20-26", "JOH", 12, 20, 26, None),
    ("箴 4:23", "Proverbs 4:23", "PRO", 4, 23, 23, None),
    ("约 3:16", "John 3:16", "JOH", 3, 16, 16, None),
    ("罗 5:5-8", "Romans 5:5-8", "ROM", 5, 5, 8, None),
    ("弗1:3-6", "Ephesians 1:3-6", "EPH", 1, 3, 6, None),
    ("弗1:7-9", "Ephesians 1:7-9", "EPH", 1, 7, 9, None),
    ("弗1:10-12", "Ephesians 1:10-12", "EPH", 1, 10, 12, None),
    ("弗1:13-14", "Ephesians 1:13-14", "EPH", 1, 13, 14, None),
    ("来 4:14-16", "Hebrews 4:14-16", "HEB", 4, 14, 16, None),
    ("压伤的芦苇我不折断...", "Isaiah 42:3", "ISA", 42, 3, 3, "Matched to Isaiah's bruised reed prophecy."),
    ("赛 50:6", "Isaiah 50:6", "ISA", 50, 6, 6, None),
    ("希伯来书 神的道比一切两刃的剑更快。", "Hebrews 4:12", "HEB", 4, 12, 12, "Matched to the living and active word of God."),
    ("路 11:11-13", "Luke 11:11-13", "LUK", 11, 11, 13, None),
    ("罗 5:5-6", "Romans 5:5-6", "ROM", 5, 5, 6, None),
    ("太 6:9-13", "Matthew 6:9-13", "MAT", 6, 9, 13, None),
    ("来 12:2", "Hebrews 12:2", "HEB", 12, 2, 2, None),
    ("来 3:14", "Hebrews 3:14", "HEB", 3, 14, 14, None),
    ("罗 4:23-25", "Romans 4:23-25", "ROM", 4, 23, 25, None),
    ("罗 5:1-8", "Romans 5:1-8", "ROM", 5, 1, 8, None),
    ("罗 6:1-4;", "Romans 6:1-4", "ROM", 6, 1, 4, None),
    ("弗 2:1-2", "Ephesians 2:1-2", "EPH", 2, 1, 2, None),
    ("约 3:5-6", "John 3:5-6", "JOH", 3, 5, 6, None),
    ("一粒麦子不落在地里", "John 12:24", "JOH", 12, 24, 24, "Matched to Jesus' grain of wheat saying."),
    ("约 3:7-8", "John 3:7-8", "JOH", 3, 7, 8, None),
    ("林后 5:16-17", "2 Corinthians 5:16-17", "2CO", 5, 16, 17, None),
    ("约 3:3", "John 3:3", "JOH", 3, 3, 3, None),
    ("罗 4:2-3", "Romans 4:2-3", "ROM", 4, 2, 3, None),
    ("创 15:6", "Genesis 15:6", "GEN", 15, 6, 6, None),
    ("罗 6:4", "Romans 6:4", "ROM", 6, 4, 4, None),
    ("罗 6:5", "Romans 6:5", "ROM", 6, 5, 5, None),
    ("岂不晓得他丰富的恩赐是领你们悔改", "Romans 2:4", "ROM", 2, 4, 4, "Matched to God's goodness leading to repentance."),
    ("罗马书3:25", "Romans 3:25", "ROM", 3, 25, 25, None),
    ("约 3:14-16", "John 3:14-16", "JOH", 3, 14, 16, None),
    ("罗 6:14", "Romans 6:14", "ROM", 6, 14, 14, None),
    ("罗 7:18", "Romans 7:18", "ROM", 7, 18, 18, None),
    ("罗 7:23-24", "Romans 7:23-24", "ROM", 7, 23, 24, None),
    ("罗 7:25", "Romans 7:25", "ROM", 7, 25, 25, None),
    ("罗8：1", "Romans 8:1", "ROM", 8, 1, 1, None),
    ("罗 8:2", "Romans 8:2", "ROM", 8, 2, 2, None),
    ("罗 8:27-28", "Romans 8:27-28", "ROM", 8, 27, 28, None),
    ("罗 8:29-30", "Romans 8:29-30", "ROM", 8, 29, 30, None),
    ("罗 8:31-32", "Romans 8:31-32", "ROM", 8, 31, 32, None),
    ("罗 8:33-34", "Romans 8:33-34", "ROM", 8, 33, 34, None),
    ("腓 1:9-11", "Philippians 1:9-11", "PHI", 1, 9, 11, None),
    ("弗 4:1-12", "Ephesians 4:1-12", "EPH", 4, 1, 12, None),
    ("腓 2:3", "Philippians 2:3", "PHI", 2, 3, 3, None),
    ("赛 42:2-4", "Isaiah 42:2-4", "ISA", 42, 2, 4, None),
    ("加 5:16", "Galatians 5:16", "GAL", 5, 16, 16, None),
    ("腓 4:4-5", "Philippians 4:4-5", "PHI", 4, 4, 5, None),
    ("腓 4:4-7", "Philippians 4:4-7", "PHI", 4, 4, 7, None),
    ("弗 5:16", "Ephesians 5:16", "EPH", 5, 16, 16, None),
    ("弗 5:15-18", "Ephesians 5:15-18", "EPH", 5, 15, 18, None),
    ("彼前 5:1-4", "1 Peter 5:1-4", "1PE", 5, 1, 4, None),
    ("太 5:14", "Matthew 5:14", "MAT", 5, 14, 14, None),
    ("林前2:12-14", "1 Corinthians 2:12-14", "1CO", 2, 12, 14, None),
    ("彼前2:2-3", "1 Peter 2:2-3", "1PE", 2, 2, 3, None),
    ("太5:13", "Matthew 5:13", "MAT", 5, 13, 13, None),
    ("路16:8", "Luke 16:8", "LUK", 16, 8, 8, None),
    ("路16:9", "Luke 16:9", "LUK", 16, 9, 9, None),
    ("罗12:1-2", "Romans 12:1-2", "ROM", 12, 1, 2, None),
    ("加5:1", "Galatians 5:1", "GAL", 5, 1, 1, None),
    ("何6:6", "Hosea 6:6", "HOS", 6, 6, 6, None),
    ("腓 2:4-11 基督的心", "Philippians 2:4-11", "PHI", 2, 4, 11, "Christ's humility and exaltation."),
    ("plasm 23", "Psalm 23:1-6", "PSA", 23, 1, 6, "Normalized the supplied 'plasm' typo to Psalm."),
    ("以赛亚书55: 8-9", "Isaiah 55:8-9", "ISA", 55, 8, 9, None),
    ("诗篇 103:11", "Psalm 103:11", "PSA", 103, 11, 11, None),
]


LINE_PATTERN = re.compile(r"([1-3]?[A-Z]{2,3}) (\d+):(\d+) (.*)")


def fetch_vpl(url: str, member: str) -> dict[tuple[str, int, int], str]:
    """Download a verse-per-line archive and index it by (book, chapter, verse)."""
    request = urllib.request.Request(
        url, headers={"User-Agent": "lucas-academy-bible scripture data builder"}
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        archive = response.read()

    with zipfile.ZipFile(io.BytesIO(archive)) as source_zip:
        source_text = source_zip.read(member).decode("utf-8")

    verses: dict[tuple[str, int, int], str] = {}
    for line in source_text.splitlines():
        match = LINE_PATTERN.fullmatch(line)
        if match:
            book_code, chapter, verse, text = match.groups()
            verses[(book_code, int(chapter), int(verse))] = text
    return verses


def build_collection() -> dict[str, object]:
    source_verses = fetch_vpl(SOURCE_URL, "eng-web_vpl.txt")
    cuv_verses = fetch_vpl(CUV_SOURCE_URL, "cmn-cu89s_vpl.txt")
    passages = []

    for index, request in enumerate(PASSAGE_REQUESTS, start=1):
        requested_as, reference, book_code, chapter, first, last, match_note = request
        passage_verses = []
        for verse_number in range(first, last + 1):
            key = (book_code, chapter, verse_number)
            if key not in source_verses:
                raise ValueError(f"Missing source verse: {book_code} {chapter}:{verse_number}")
            passage_verses.append(
                {
                    "verse": verse_number,
                    "text": source_verses[key],
                    # Chinese Union Version (和合本). Empty string if a verse is
                    # missing in the CUV versification — never blocks the build.
                    "textZh": cuv_verses.get(key, ""),
                }
            )

        passage = {
            "id": f"passage-{index:03d}",
            "order": index,
            "requestedAs": requested_as,
            "reference": reference,
            "book": BOOK_NAMES[book_code],
            "bookZh": BOOK_NAMES_ZH.get(book_code, ""),
            "chapter": chapter,
            "verseStart": first,
            "verseEnd": last,
            "matchedFromDescription": match_note is not None,
            "verses": passage_verses,
            "text": " ".join(item["text"] for item in passage_verses),
            "textZh": "".join(item["textZh"] for item in passage_verses),
        }
        if match_note is not None:
            passage["matchNote"] = match_note
        passages.append(passage)

    return {
        "metadata": {
            "title": "Lucas Academy Bible Scripture Collection",
            "repositoryName": "lucas-academy-bible",
            "siteUrl": "https://bible.lucasacademy.org",
            "createdDate": "2026-07-24",
            "entryCount": len(passages),
            "duplicatesPreserved": True,
            "translation": {
                "id": "WEB",
                "name": "World English Bible Classic",
                "edition": "2020 stable text",
                "language": "English",
                "license": "Public Domain",
                "licenseUrl": "https://ebible.org/details.php?id=eng-web",
                "sourceUrl": SOURCE_URL,
            },
            "translationZh": {
                "id": "CUV",
                "name": "Chinese Union Version (和合本, Simplified)",
                "language": "Chinese",
                "license": "Public Domain",
                "licenseUrl": "https://ebible.org/details.php?id=cmn-cu89s",
                "sourceUrl": CUV_SOURCE_URL,
            },
        },
        "passages": passages,
    }


def main() -> None:
    collection = build_collection()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(collection, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(collection['passages'])} passages to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
