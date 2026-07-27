#!/usr/bin/env python3
"""Generate the per-level question banks for Bible Sequence.

Reads data/verses.json (READ-ONLY) and slices every passage into candidate
"questions" — clause fragments, single verses, 2- and 3-verse runs, and whole
passages — then assigns each candidate to the level whose word-count range fits.
The result is one reviewable JSON file per level in src/game/levels/, each
holding the level's difficulty policy plus its bank of questions (with the exact
configured translation pulled straight from verses.json, so nothing is invented
or altered).

Re-run this to regenerate the banks:  python3 scripts/build_level_banks.py
(It OVERWRITES the level-*.json files — hand-edits to those files are replaced.)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSES = ROOT / "data" / "verses.json"
OUT_DIR = ROOT / "src" / "game" / "levels"

CLAUSE_END = re.compile(r"[,;:.!?”’]$")
SENTENCE_END = re.compile(r"[.!?][”’\"]?$")

# 虚词 (must match FUNCTION_WORDS in src/game/chunk.ts). A question needs at least
# two CONTENT words so it never chunks down to a single or function-only tile.
FUNCTION_WORDS = {
    "a", "an", "the",
    "and", "or", "but", "nor", "for", "as", "so", "yet", "than", "if",
    "of", "to", "in", "on", "at", "by", "from", "with", "into", "unto", "onto",
    "upon", "out", "up", "off", "over", "under", "about", "through",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs",
    "who", "whom", "whose", "which", "this", "that", "these", "those",
    "is", "are", "was", "were", "be", "am", "been", "being",
    "not", "no", "o", "oh",
}

_STRIP = re.compile(r"[^0-9A-Za-z'’-]")


def content_word_count(text: str) -> int:
    n = 0
    for tok in text.split(" "):
        bare = _STRIP.sub("", tok).strip("'’-").lower()
        if bare and bare not in FUNCTION_WORDS:
            n += 1
    return n

# Per-level design. `words` is the target word-count window for questions.
# granularity: how tiles are cut  (words | short | phrase)
# sectionBy:   how a question is broken into recall sections (none | sentence | verse)
# Hearts are ALWAYS 3 now (a wrong-order tap costs half a heart, an out-of-verse
# distractor a whole one — enforced in the app). Difficulty comes from tile size,
# distractor count, hints, sectioning, timer, and verse length. The early band is
# deliberately fine-grained (small word-count steps, big phrase tiles, few decoys)
# so levels 1–10 ramp gently. To reshape the game you mostly edit THIS table (and
# rerun) — the app loads whatever level-*.json files exist and adapts.
LEVELS = [
    # lvl hearts hint      gran      section     distract  wordLo wordHi  spw  tmin tmax
    (0,  3, "slots", "words",  "none",     0,   2,   6,   3.5,  8,  14),
    (1,  3, "slots", "phrase", "none",     0,   2,   4,   3.2,  8,  16),
    (2,  3, "slots", "phrase", "none",     0,   3,   5,   3.1,  8,  16),
    (3,  3, "slots", "phrase", "none",     0,   4,   7,   3.0,  9,  18),
    (4,  3, "slots", "phrase", "none",     1,   6,   9,   2.9, 10,  20),
    (5,  3, "slots", "phrase", "none",     1,   8,  11,   2.8, 10,  22),
    (6,  3, "slots", "phrase", "none",     1,  10,  13,   2.6, 12,  24),
    (7,  3, "count", "phrase", "none",     2,  12,  15,   2.5, 12,  26),
    (8,  3, "count", "phrase", "none",     2,  14,  17,   2.4, 12,  28),
    (9,  3, "count", "short",  "none",     2,  16,  19,   2.3, 14,  30),
    (10, 3, "count", "short",  "none",     3,  18,  22,   2.2, 14,  32),
    (11, 3, "count", "short",  "none",     3,  21,  25,   2.0, 16,  34),
    (12, 3, "none",  "short",  "sentence", 3,  24,  29,   1.9, 16,  38),
    (13, 3, "none",  "words",  "sentence", 4,  28,  35,   1.8, 18,  44),
    (14, 3, "none",  "words",  "sentence", 4,  33,  43,   1.7, 20,  50),
    (15, 3, "none",  "words",  "sentence", 5,  41,  53,   1.6, 22,  58),
    (16, 3, "none",  "words",  "sentence", 5,  50,  66,   1.5, 24,  68),
    (17, 3, "none",  "words",  "verse",    6,  60,  80,   1.5, 26,  82),
    (18, 3, "none",  "words",  "verse",    6,  74,  96,   1.4, 30,  96),
    (19, 3, "none",  "words",  "verse",    7,  88, 116,   1.4, 34, 116),
    (20, 3, "none",  "words",  "verse",    9, 105, 999,   1.3, 46, 175),
]

# Level 0 is a single fixed warm-up verse: "Jesus wept." (John 11:35).
PIN_LEVEL_0 = "passage-001"
# Whole passages explicitly guaranteed a place in their matching word band.
# Add here only when the post-generation audit shows that the normal diversified
# cap omitted a user-requested passage.
FEATURED_WHOLE_REFERENCES = {
    "Psalm 103:11",
}
BASE_CAP_PER_LEVEL = 9
EXPANDED_THROUGH_LEVEL = 12
EXTRA_QUESTIONS_PER_EARLY_LEVEL = 6
UPPER_LEVEL_START = 13
EXTRA_QUESTIONS_PER_UPPER_LEVEL = 6
MIN_PER_LEVEL = 4
EXTRA_CONTINUATION_STARTS = {
    "and", "as", "at", "because", "but", "by", "even", "for", "from", "if",
    "in", "into", "of", "on", "or", "so", "than", "that", "then", "therefore",
    "though", "through", "to", "unless", "until", "upon", "when", "where",
    "which", "while", "who", "whom", "whose", "with", "yet",
}


def words(text: str) -> int:
    return len(text.split(" "))


def clause_fragments(text: str) -> list[str]:
    frags: list[str] = []
    cur: list[str] = []
    for tok in text.split(" "):
        cur.append(tok)
        if CLAUSE_END.search(tok):
            frags.append(" ".join(cur))
            cur = []
    if cur:
        frags.append(" ".join(cur))
    return frags


def _clause_boundaries(tokens: list[str]) -> list[int]:
    """Token indices where a clause ends (i.e. good places to cut a verse)."""
    return [i + 1 for i, tok in enumerate(tokens) if CLAUSE_END.search(tok)]


def merged_fragments(text: str, parts: int) -> list[str]:
    """Split a verse into `parts` LONGER fragments at clause boundaries closest to
    an even word division (half-verses, third-verses). Contiguous, so the pieces
    rejoin to the source. Returns [] when the verse can't be cut that many ways."""
    tokens = text.split(" ")
    bounds = [b for b in _clause_boundaries(tokens) if 0 < b < len(tokens)]
    if len(bounds) < parts - 1:
        return []
    cuts: list[int] = []
    used: set[int] = set()
    for k in range(1, parts):
        target = round(len(tokens) * k / parts)
        choice = min((b for b in bounds if b not in used), key=lambda b: abs(b - target))
        used.add(choice)
        cuts.append(choice)
    cuts = sorted(set(cuts))
    pieces: list[str] = []
    prev = 0
    for c in cuts + [len(tokens)]:
        if c > prev:
            pieces.append(" ".join(tokens[prev:c]))
            prev = c
    return pieces if len(pieces) == parts else []


def verse_run_ref(p: dict, a: int, b: int) -> str:
    book, chap = p["book"], p["chapter"]
    return f"{book} {chap}:{a}" if a == b else f"{book} {chap}:{a}-{b}"


def candidates_for(p: dict) -> list[dict]:
    """All candidate questions derivable from one passage."""
    out: list[dict] = []
    verses = p["verses"]

    def add(ref, vs, text, fragment):
        # Skip anything that wouldn't make at least two meaningful tiles.
        if content_word_count(text) < 2:
            return
        out.append(
            {
                "passageId": p["id"],
                "reference": ref,
                "verses": [{"verse": v["verse"], "text": v["text"]} for v in vs],
                "text": text,
                "fragment": fragment,
                "words": words(text),
                "book": p["book"],
            }
        )

    # whole passage
    add(p["reference"], verses, p["text"], False)

    # verse runs of length 1..6 (only when multi-verse) — longer runs feed the
    # harder levels where distinct long passages are scarce.
    if len(verses) > 1:
        for size in (1, 2, 3, 4, 5, 6):
            if size > len(verses):
                continue
            for i in range(0, len(verses) - size + 1):
                run = verses[i : i + size]
                a, b = run[0]["verse"], run[-1]["verse"]
                text = " ".join(v["text"] for v in run)
                add(verse_run_ref(p, a, b), run, text, False)

    # Fragments of each single verse — both small clauses AND longer half/third
    # pieces — so easy levels have plenty of gentle, natural chunks. Each fragment
    # is labelled with an a/b/c… suffix and carries its whole source verse.
    for v in verses:
        frag_sets = [clause_fragments(v["text"]), merged_fragments(v["text"], 2), merged_fragments(v["text"], 3)]
        seen_frag: set[str] = set()
        for frags in frag_sets:
            if len(frags) <= 1:
                continue  # a one-piece split == the whole verse
            for idx, frag in enumerate(frags):
                if frag in seen_frag:
                    continue
                seen_frag.add(frag)
                letter = chr(ord("a") + idx)
                ref = f"{p['book']} {p['chapter']}:{v['verse']}{letter}"
                add(ref, [{"verse": v["verse"], "text": frag}], frag, True)

    return out


def main() -> None:
    data = json.loads(VERSES.read_text(encoding="utf-8"))
    passages = data["passages"]

    # Build a deduped candidate pool keyed by exact text.
    pool: dict[str, dict] = {}
    for p in passages:
        for c in candidates_for(p):
            # First writer wins; prefer a non-fragment / shorter reference on ties.
            existing = pool.get(c["text"])
            if existing is None or (existing["fragment"] and not c["fragment"]):
                pool[c["text"]] = c
    candidates = list(pool.values())

    def diversified(pool_list: list[dict], already: list[dict], cap: int) -> list[dict]:
        """Round-robin across source books, whole verses before fragments,
        shorter first. Deterministic. Skips texts already picked for this level."""
        have = {c["text"] for c in already}
        cand = [c for c in pool_list if c["text"] not in have]
        cand.sort(key=lambda c: (c["fragment"], c["book"], c["words"], c["reference"]))
        by_book: dict[str, list[dict]] = {}
        for c in cand:
            by_book.setdefault(c["book"], []).append(c)
        order = sorted(by_book.keys())
        picks = list(already)
        while len(picks) < cap and any(by_book[b] for b in order):
            for b in order:
                if len(picks) >= cap:
                    break
                if by_book[b]:
                    picks.append(by_book[b].pop(0))
        return picks

    def extra_quality_key(candidate: dict) -> tuple:
        """Prefer complete, self-contained additions over dangling clauses."""
        text = candidate["text"].strip()
        unquoted = text.lstrip("\"'“‘")
        first_match = re.match(r"[A-Za-z’'-]+", unquoted)
        first_word = first_match.group(0).lower() if first_match else ""
        speech_intro = bool(
            re.search(r"\b(?:answered|asked|cried|said|says),?$", text, re.I)
        )
        complete_sentence = bool(SENTENCE_END.search(text))
        starts_lowercase = bool(unquoted[:1].islower())
        psalm_superscription = bool(
            re.match(r"(?:A Psalm|For the Chief Musician)\b", unquoted)
        )
        unbalanced_double_quote = (
            candidate["fragment"] and text.count("“") != text.count("”")
        )
        dangling_whole_verse = (
            not candidate["fragment"] and starts_lowercase and not complete_sentence
        )
        return (
            dangling_whole_verse,
            candidate["fragment"],
            psalm_superscription,
            unbalanced_double_quote,
            not complete_sentence,
            speech_intro,
            starts_lowercase,
            first_word in EXTRA_CONTINUATION_STARTS,
            -candidate["words"],
            candidate["reference"],
        )

    def diversified_extras(
        pool_list: list[dict], already: list[dict], cap: int
    ) -> list[dict]:
        """Add the strongest unused candidates, with at most two extras per book."""
        have = {candidate["text"] for candidate in already}
        candidates_by_quality = sorted(
            (candidate for candidate in pool_list if candidate["text"] not in have),
            key=extra_quality_key,
        )
        picks = list(already)
        extras_by_book: dict[str, int] = {}
        deferred: list[dict] = []
        for candidate in candidates_by_quality:
            if len(picks) >= cap:
                break
            book = candidate["book"]
            if extras_by_book.get(book, 0) >= 2:
                deferred.append(candidate)
                continue
            picks.append(candidate)
            extras_by_book[book] = extras_by_book.get(book, 0) + 1
        for candidate in deferred:
            if len(picks) >= cap:
                break
            picks.append(candidate)
        return picks

    def diversified_upper_extras(
        pool_list: list[dict], already: list[dict], cap: int
    ) -> list[dict]:
        """Add at most one upper-level question from each new source passage."""
        already_texts = {candidate["text"] for candidate in already}
        used_passage_ids = {candidate["passageId"] for candidate in already}
        candidates_by_quality = sorted(
            (
                candidate
                for candidate in pool_list
                if candidate["text"] not in already_texts
                and candidate["passageId"] not in used_passage_ids
            ),
            key=extra_quality_key,
        )
        picks = list(already)
        extras_by_book: dict[str, int] = {}
        for candidate in candidates_by_quality:
            if len(picks) >= cap:
                break
            passage_id = candidate["passageId"]
            book = candidate["book"]
            if passage_id in used_passage_ids or extras_by_book.get(book, 0) >= 2:
                continue
            picks.append(candidate)
            used_passage_ids.add(passage_id)
            extras_by_book[book] = extras_by_book.get(book, 0) + 1
        return picks

    used: set[str] = set()
    level_picks: dict[int, list[dict]] = {}

    # Pass 1 — assign uniquely across levels (variety between adjacent levels).
    for (lvl, _h, _hint, _g, _s, _d, lo, hi, _spw, _tmin, _tmax) in LEVELS:
        if lvl == 0:
            # A single fixed warm-up verse — a bank of exactly one question.
            pinned = next(
                (c for c in candidates if c["passageId"] == PIN_LEVEL_0 and not c["fragment"]),
                None,
            )
            picks = [pinned] if pinned else []
            for c in picks:
                used.add(c["text"])
            level_picks[lvl] = picks
            continue
        in_range = [c for c in candidates if c["text"] not in used and lo <= c["words"] <= hi]
        featured = sorted(
            (
                c
                for c in in_range
                if not c["fragment"] and c["reference"] in FEATURED_WHOLE_REFERENCES
            ),
            key=lambda c: c["reference"],
        )
        if len(featured) > BASE_CAP_PER_LEVEL:
            raise ValueError(
                f"Level {lvl} has {len(featured)} featured passages but a base cap "
                f"of {BASE_CAP_PER_LEVEL}"
            )
        picks = diversified(in_range, featured, BASE_CAP_PER_LEVEL)
        for c in picks:
            used.add(c["text"])
        level_picks[lvl] = picks

    # Pass 2 — expand Levels 1–12 only after every level has received its original
    # nine-question bank. This preserves the existing selections and adds unused
    # candidates instead of taking questions away from adjacent levels.
    expanded_cap = BASE_CAP_PER_LEVEL + EXTRA_QUESTIONS_PER_EARLY_LEVEL
    for (lvl, _h, _hint, _g, _s, _d, lo, hi, _spw, _tmin, _tmax) in LEVELS:
        if lvl < 1 or lvl > EXPANDED_THROUGH_LEVEL:
            continue
        in_range = [
            c for c in candidates
            if c["text"] not in used and lo <= c["words"] <= hi
        ]
        picks = diversified_extras(in_range, level_picks[lvl], expanded_cap)
        for c in picks:
            used.add(c["text"])
        level_picks[lvl] = picks

    # Pass 3 — expand the upper levels from longest to shortest. Working
    # backwards protects the scarce Level 20 candidates; unlike the early band,
    # these additions may stop below the cap when no unused passage fits.
    upper_cap = BASE_CAP_PER_LEVEL + EXTRA_QUESTIONS_PER_UPPER_LEVEL
    for (lvl, _h, _hint, _g, _s, _d, lo, hi, _spw, _tmin, _tmax) in reversed(
        LEVELS
    ):
        if lvl < UPPER_LEVEL_START:
            continue
        in_range = [
            c for c in candidates
            if c["text"] not in used and lo <= c["words"] <= hi
        ]
        picks = diversified_upper_extras(in_range, level_picks[lvl], upper_cap)
        for c in picks:
            used.add(c["text"])
        level_picks[lvl] = picks

    # Pass 4 — top up any level below the minimum, allowing reuse (the very long
    # passages are scarce, so upper levels may share a few).
    for (lvl, _h, _hint, _g, _s, _d, lo, hi, _spw, _tmin, _tmax) in LEVELS:
        if lvl == 0 or len(level_picks[lvl]) >= MIN_PER_LEVEL:
            continue
        in_range = [c for c in candidates if lo <= c["words"] <= hi]
        level_picks[lvl] = diversified(
            in_range, level_picks[lvl], BASE_CAP_PER_LEVEL
        )

    # Remove stale level files so shrinking the LEVELS table can't leave orphans
    # (the app globs whatever is present).
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("level-*.json"):
        old.unlink()

    summary = []
    for (lvl, hearts, hint, gran, section, distract, lo, hi, spw, tmin, tmax) in LEVELS:
        picks = level_picks[lvl]
        questions = []
        for i, c in enumerate(picks):
            questions.append(
                {
                    "id": f"L{lvl:02d}-q{i:02d}",
                    "reference": c["reference"],
                    "passageId": c["passageId"],
                    "fragment": c["fragment"],
                    "verses": c["verses"],
                    "text": c["text"],
                }
            )

        level_obj = {
            "level": lvl,
            "policy": {
                "hearts": hearts,
                "hintLevel": hint,
                "granularity": gran,
                "sectionBy": section,
                "distractorsPerSection": distract,
                "memorizeSecondsPerWord": spw,
                "memorizeMin": tmin,
                "memorizeMax": tmax,
            },
            "questions": questions,
        }
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        (OUT_DIR / f"level-{lvl:02d}.json").write_text(
            json.dumps(level_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        summary.append((lvl, len(questions), lo, hi))

    print("Level  #Q  wordRange")
    for lvl, n, lo, hi in summary:
        flag = "  <-- LOW" if n < 4 else ""
        print(f"  {lvl:2d}   {n:2d}   {lo}-{hi}{flag}")
    print(f"\nWrote {len(LEVELS)} level bank files to {OUT_DIR}")


if __name__ == "__main__":
    main()
