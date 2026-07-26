# Bible Sequence — Lucas Academy

**Remember the Word. Restore the Verse.**

A calm, focused scripture-memory **test**. You get a short, length-scaled timer to
memorize a passage; when it ends the passage hides and you rebuild it in order by
tapping shuffled word/phrase tiles — with believable distractor words drawn from
*other* passages mixed into the bank. Levels ramp from a one-verse warm-up —
Level 0, “Jesus wept.” (John 11:35) — through Level 1 up to the twelve-verse
mastery challenge of Ephesians 4:1–12 (Level 20, rebuilt a verse at a time,
~3 min to memorize).

Each level draws from its own **bank** of curated scripture segments, so a replay of
a level can serve a different verse of similar difficulty. It plays as one run: every
game starts at Level 0 and continues until you finish or run out of hearts, then a
final screen shows your score (percentage of hearts kept) and PASS / FAIL.

The home screen also has a **Daily Verse** tab. The first request for each
America/Los_Angeles calendar day asks YouVersion for that day's selection and
turns it into a length-matched memory challenge. Players can keep the public-domain
**WEB** or switch both Journey and Daily Verse to **NIV**, **NIrV**, or
**NASB 2020**. Licensed text is requested only when it is needed and is cached
server-side by translation plus YouVersion passage ID.

The interaction loop is inspired by the focus and progression of Human Benchmark’s
Sequence Memory test, but the look, feel, and content are entirely our own.

Production home: **https://bible.lucasacademy.org**.

---

## Quick start

```bash
npm install
npm run dev      # Vite dev server (default http://localhost:5173)
npm run dev:worker # build + local Worker, including the protected Bible API proxy
```

Other commands:

```bash
npm run build    # type-check (tsc -b) + production build to dist/
npm run package:itch # relative-path build + upload-ready itch ZIP
npm run preview  # serve the production build locally
npm test         # run the Vitest game-logic suite once
npm run test:watch
```

Deploy the production build as an assets-only Cloudflare Worker:

```bash
npm run build
npx wrangler deploy
```

The custom domain is declared in `wrangler.jsonc`; Cloudflare manages its DNS
record and TLS certificate automatically.

Package the self-contained itch.io HTML5 build with:

```bash
npm run package:itch
```

This creates `lucas-academy-bible-itch.zip`. Its `index.html` is at the ZIP root
and its asset URLs are relative, so itch.io can extract and run it in an iframe.
The itch build has no paid assets, external runtime dependencies, or backend;
its Daily Verse tab is omitted because itch cannot provide the protected
same-origin API.

Requirements: Node 18+ (developed on Node 20). The main game runs in the browser
and progress is saved to `localStorage`. A small same-origin Cloudflare Worker
endpoint powers Daily Verse; there is no login, advertising, or user database.

### YouVersion configuration

The YouVersion App Key is server-only. Configure production with:

```bash
npx wrangler secret put YVP_APP_KEY
```

For local Worker testing, put `YVP_APP_KEY=...` in `.dev.vars`; that file is
gitignored. Never expose the key through Vite variables or commit it to the
repository.

Daily Verse uses YouVersion's `verse_of_the_days` endpoint. Runtime passage text
uses YouVersion Bible IDs WEB `206`, NIV `111`, NIrV `110`, and NASB 2020 `2692`.
The API-returned title, abbreviation, copyright notice, and YouVersion link are
displayed with every licensed passage.

`DAILY_VERSE_KV` caches the daily selection separately from scripture text. The
selection is shared across translations for that Pacific calendar date; passage
text and translation metadata are cached by Bible ID and passage ID. The app key
never reaches browser JavaScript.

---

## Scripture data — `data/verses.json`

The public-domain WEB Journey baseline comes from `data/verses.json`. Rebuild it
and its level banks with:

```bash
python3 scripts/build_scripture_json.py
python3 scripts/build_level_banks.py
```

The first step rebuilds the approved passage list from WEB plus Chinese CUV; the
second regenerates the difficulty-matched question banks. NIV, NIrV, and NASB
2020 are never written into the repository. The Worker requests the selected
translation for the chosen question at play time and obtains distractors from a
different passage in that same translation.

- **The WEB baseline is public domain.** It is the default, works offline, and is
  the reproducible source for references, progression, and Chinese pairings.
- **A Chinese translation** is included alongside: the **Chinese Union Version
  (和合本, Simplified — CUV), also public domain**, fetched from the same source. Each
  passage carries `bookZh` + `textZh`, and each verse a `textZh`. The Chinese verse
  and reference are shown under the English on the memorize / recall / complete /
  certificate cards (English narration only — there is no Chinese audio). It is a
  persisted **toggle** (中文): the welcome screen shows Sound + 中文 options above
  Begin, and both are also in the in-game brand bar. See `metadata.translationZh`.
- The text is treated as **read-only**. The app never rewrites, modernizes,
  paraphrases, corrects, or silently normalizes scripture — punctuation and
  capitalization are preserved exactly (including curly quotes `“ ” ‘ ’` and the
  em dash `—`).
- Duplicated / overlapping passages in the source are **intentional** and left as-is.
- The app reads the top-level `passages` array. Each passage has:
  - `id` — stable identifier, e.g. `passage-001`
  - `reference` — e.g. `John 11:35`
  - `verses` — array of `{ verse, text }`
  - `text` — the full passage; for multi-verse passages this equals the verse
    texts joined by a single space.

Neither `data/verses.json` nor `scripts/build_scripture_json.py` is modified by this app.

---

## The levels — per-level question banks

Each level is a JSON file in [`src/game/levels/`](src/game/levels) —
`level-00.json` … `level-20.json` — holding the level’s **policy** plus a **bank** of
questions. **Level 0** is a single fixed warm-up verse (“Jesus wept.”); levels 1–20
each draw from a bank of similar-difficulty segments. The files are the source of truth and are meant to be read and hand-edited
(a test validates every question against `verses.json`, so a bad edit fails loudly).
Open any file to check the verses chosen for that level.

Regenerate the banks from `verses.json` with:

```bash
python3 scripts/build_level_banks.py   # OVERWRITES src/game/levels/level-*.json
```

The generator slices every passage into candidate segments — clause fragments,
single verses, 2–6-verse runs, and whole passages — and assigns each to the level
whose word-count window fits. That’s how long passages fill the hard levels while
their shorter fragments (e.g. a single clause of a verse, labelled `John 3:16a`) feed
the easy ones. Level 0 is pinned to “Jesus wept.” (and it’s excluded from Level 1).

Each level file’s `policy` declares:

| field | meaning |
| --- | --- |
| `hearts` | always **3**; a right-word/wrong-order tap costs ½, an out-of-verse word costs 1 |
| `hintLevel` | `slots` (numbered answer slots) · `count` (“x of y placed”) · `none` |
| `granularity` | legacy field (retained for data shape; chunking is now content-word based) |
| `sectionBy` | rebuild in one go (`none`), per sentence, or per `verse` |
| `distractorsPerSection` | decoy tiles added to each section’s bank |
| `memorizeSecondsPerWord` / `memorizeMin` / `memorizeMax` | timer scaling |

The difficulty curve (every level has **3 hearts** — difficulty comes from tile
size, distractors, hints, sectioning, timer, and length): the early band ramps
gently in small word-count steps with big phrase tiles and few decoys (levels
1–~10); the middle switches to shorter phrases then single words with count → no
hints; the late levels use single-word tiles, sentence/verse sections, and the
most distractors, ending on the longest-passage mastery challenge. A wrong tap
that is a **word from the verse** (just out of order) costs only **half a heart**;
a tap on a **word that isn't in the verse** costs a whole one.

**Adaptive by design.** `levels.ts` auto-loads every `level-*.json` (via
`import.meta.glob`) and sorts by the `level` field — there's no import list to
maintain. To add, remove, or re-tune levels you mostly edit the generator's table
(or the JSON) and rerun; the app adapts (MIN/MAX/TOTAL all derive from the files).

**Chunking guarantees** (upheld at build time and re-checked by tests):

- Tiles are only ever contiguous groups of the source tokens, so joining them back
  with single spaces reproduces the passage text exactly.
- **Content-word tiles:** each tile carries exactly one content word plus the little
  function words (虚词 — `the`, `of`, `to`, `him`, `is`, …) that lean on it, so a lone
  “the”/“this” is **never** its own confusing card. E.g. John 3:16 →
  `For God` · `so loved` · `the world,` · `that he gave` … The 虚词 list lives in
  `src/game/chunk.ts` (`FUNCTION_WORDS`) and is mirrored in `build_level_banks.py`,
  which only keeps questions with ≥2 content words. Distractors must carry a content
  word too.
- Punctuation stays attached to its word; there are never punctuation-only tiles.
- Repeated words become **separate tile instances with unique IDs** (e.g. Ephesians 4:5
  “one Lord, one faith, one baptism,”).

**Sectioning.** Long passages aren’t dumped on screen as hundreds of tiles. They’re
memorized whole, then rebuilt one section (verse or sentence) at a time with a
“Verse X of Y” / “Part X of Y” indicator; a mistake spends from the level’s heart
count, and finishing every section completes the level.

**The memorize timer.** Time is `words × memorizeSecondsPerWord`, clamped to the
level’s min/max — generous early (~3s/word), tight later (~1.3s/word). At zero the
passage hides and recall begins; you can also hit **Start recall** early.

**The challenge (recall) timer.** Rebuilding is itself timed: you get **2× the
memorize time**. If the clock runs out before you finish, you enter overtime and
**bleed ¼ heart every 1.5s** until you finish or run out of hearts (which ends the
run). Hearts use a smooth game-style silhouette with discrete ¼ / ½ / ¾ / full
fills, and the lost hearts lower your final score.

**Distractors** ([`src/game/distractors.ts`](src/game/distractors.ts)) are real
contiguous word-windows taken **only from other passages** — never invented. They’re
chosen to match the length of the correct tiles and are filtered so a distractor is
never identical to a correct chunk in the same section (keeping every round solvable
and unambiguous). Tiles are shuffled with a seedable Fisher–Yates shuffle, and the
builder avoids handing you a round that’s already in order.

---

## Audio & narration

No audio files are shipped; everything is generated with browser-native APIs
(see [`src/audio/`](src/audio)).

- **Interaction sounds — Web Audio API** ([`sound.ts`](src/audio/sound.ts)): a soft
  start cue, a gentle click, ascending pentatonic notes for consecutive correct
  picks, a soft low note for a wrong pick (never a harsh buzzer), a warm chord on
  level completion, and a restrained fanfare after all 20 levels.
  - The `AudioContext` is created only after a user gesture (autoplay-safe).
  - Missing / blocked audio degrades to silent no-ops.
- **Scripture narration — SpeechSynthesis API** ([`speech.ts`](src/audio/speech.ts)):
  the passage is read aloud with a preferred natural English voice, **slowly** — it is
  spoken clause-by-clause with a pause between clauses at a reduced rate. (Gap-pacing is
  what actually slows it down; browsers, notably iOS Safari, clamp a very low `rate`.)
  There’s always a Listen/Stop control.
  - Auto-narration on the memorize screen happens **only when sound is enabled** and
    speech is supported — never when muted.
  - If `speechSynthesis` is unavailable the Listen button hides and the game plays
    normally without it.
- The sound preference is persisted, and **sound is never the only channel** —
  correct/wrong, hearts, section changes, and completion are all conveyed visually
  and announced to screen readers as well.

### Browser limitations to know

- **Voice quality & availability vary by browser/OS.** Voices load asynchronously
  (`voiceschanged`); on some platforms the first utterance may use a default voice
  until the list populates. Some browsers expose no English voice at all — narration
  simply becomes unavailable and the game is fully playable without it.
- Chrome/Safari may **suspend audio** until the first tap; the engine resumes the
  context on the first interaction.
- Speech may not start until a user gesture, and some in-app / headless browser
  frames don’t implement `speechSynthesis`.

---

## Accessibility & responsiveness

- Semantic `<button>` tiles; full keyboard operation with a visible focus ring.
- Screen-reader labels on tiles; polite/assertive live regions announce correct and
  wrong picks, hearts remaining, verse changes, and level completion.
- Colour is never the sole signal (icons + text + announcements accompany it), aiming
  for WCAG AA contrast on the parchment/navy palette.
- `prefers-reduced-motion` is respected (animations collapse to near-instant).
- Works desktop → tablet → phone: ≥44×44px targets, tiles wrap, the answer area stays
  visible while choosing, independent scroll for long banks, safe-area insets, and no
  horizontal page scroll. Feedback text uses reserved height to avoid layout shift.

---

## Progress & persistence

**It's one arcade-style run.** Every Journey starts at **Level 0** and goes verse by
verse; there's no level map, resume, or per-level jump. "Begin journey" and
"Play again" start a fresh run at Level 0. Clearing a level advances to the next;
**running out of hearts ends the run**. Sound, Chinese visibility, and the
selected English translation are persisted in `localStorage`
(`src/game/progress.ts`, validated so corrupt data can never crash the app).

**Certificate.** The run ends on a certificate (by Lucas Academy, dated) for the
**highest level you fully passed**. The **failed level is excluded** from both the
certificate level and the score — fail at Level 7 and the certificate is for Level 6,
scored over Levels 0–6 only. The score is the **percentage of hearts kept** across the
cleared levels (`heartPercent` in `scoring.ts`; a flawless run is 100%). A full run
adds a "Full journey complete" mark; failing the very first level shows a "try again"
screen instead of a certificate. The certificate shows the date + time and a cursive
"Lucas Academy" signature, and can be **downloaded as a PNG** — drawn on a canvas with
no external libraries (`src/game/certificate.ts`). Between levels, a quick screen shows 1–3 stars for that
level (3 = flawless). The whole UI runs full-screen and scales up on large displays.

---

## Project layout

```
data/verses.json            # public-domain WEB + CUV baseline
scripts/build_scripture_json.py
scripts/build_level_banks.py  # regenerates the per-level question banks
worker/index.js             # protected YouVersion proxy + KV caching
src/
  translation-config.ts    # supported player-facing translation choices
  youversion.ts            # runtime passage loading + translated Journey builder
  daily.ts                 # Daily Verse loading + length-matched challenge
  data/scripture.ts         # typed loader for verses.json
  game/
    levels/level-01..20.json # per-level policy + question bank (editable, validated)
    levels.ts               # loads the 20 bank files + timer scaling
    chunk.ts                # scripture → tiles + sentence split (round-trip guaranteed)
    distractors.ts          # decoys drawn from other passages
    random.ts               # seedable RNG + Fisher–Yates shuffle
    build.ts                # draw a bank question → sections + shuffled tile banks
    recall.ts               # pure recall state machine (hearts, undo, sections)
    scoring.ts              # star rating
    progress.ts             # localStorage load/save/validate
    __tests__/              # Vitest logic tests
  audio/sound.ts            # Web Audio interaction sounds
  audio/speech.ts           # SpeechSynthesis narration (slow, gap-paced)
  components/               # Welcome, StudyPhase (memorize timer), Recall, Complete, …
  App.tsx                   # game-flow state machine
```

---

## Tests

`npm test` runs the Vitest suite covering the important game logic, including: every
bank question references a real passage and exactly matches the configured source; Level 1
leads with John 11:35 and reconstructs exactly “Jesus wept.”; every question in every
level chunks back to its source; distractors come only from other passages; duplicate
words get unique IDs; the shuffle doesn’t mutate its input; the memorize timer scales
with length within bounds; every question in every level is completable; progress
unlocks only after completion and survives a reload; invalid localStorage is handled
safely; wrong picks reduce hearts; long passages advance through their sections; and
sound-disabled mode never auto-narrates.
