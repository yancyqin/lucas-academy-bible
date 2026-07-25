# Bible Sequence — Lucas Academy

**Remember the Word. Restore the Verse.**

A calm, focused scripture-memorization game. You study a complete Bible passage,
then rebuild it in order by tapping shuffled word/phrase tiles — with believable
distractor words drawn from *other* passages mixed into the bank. Twenty curated
levels ramp from “Jesus wept.” (John 11:35) to the twelve-verse mastery challenge
of Ephesians 4:1–12.

The interaction loop is inspired by the focus and progression of Human Benchmark’s
Sequence Memory test, but the look, feel, and content are entirely our own.

Production home: **https://bible.lucasacademy.org**.

---

## Quick start

```bash
npm install
npm run dev      # Vite dev server (default http://localhost:5173)
```

Other commands:

```bash
npm run build    # type-check (tsc -b) + production build to dist/
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

Requirements: Node 18+ (developed on Node 20). The app is **frontend-only** — no
backend, database, auth, ads, or analytics. Everything runs in the browser and
progress is saved to `localStorage`.

---

## Scripture data — `data/verses.json`

All scripture comes from `data/verses.json`, built by `scripts/build_scripture_json.py`
from the **World English Bible (WEB) Classic** edition.

- **The WEB is public domain.** No license or attribution is required, and the text
  may be used freely. See `metadata.translation` in the JSON.
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

## The 20-level configuration

Levels are curated in [`src/game/levels.ts`](src/game/levels.ts) — not derived from a
naïve string split. Each `LevelConfig` declares:

| field | meaning |
| --- | --- |
| `passageId` | which passage from `verses.json` |
| `hearts` | mistakes allowed before a retry |
| `hintLevel` | `slots` (numbered answer slots) · `count` (“x of y placed”) · `none` |
| `distractorsPerSection` | decoy tiles added to each section’s bank |
| `sectioned` | rebuild one verse at a time (for long passages) |
| `spec` | chunking: `{ mode: 'words' }` or `{ mode: 'sizes', sizes: [...] }` |

The level order and difficulty curve:

| # | Reference | Hearts | Tiles | Distractors | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | John 11:35 | 3 | 2 phrases | 0 | “Jesus” · “wept.” |
| 2–5 | Genesis 1:1 · Psalm 119:105 · Matthew 7:7 · Proverbs 4:23 | 3 | large phrases | 1–2 | numbered slot hints |
| 6–10 | Matthew 5:14 · Joshua 1:9 · 1 John 1:9 · 1 Cor 13:13 · John 3:16 | 2 | 1–3 word phrases | 2–4 | count hint |
| 11–15 | Galatians 5:22–23 · Luke 11:11–13 · Romans 8:31–32 · 2 Cor 5:16–17 · Philippians 4:4–7 | 1 | single words | 4–5 | no hints |
| 16–20 | John 3:14–16 · Hebrews 4:14–16 · Matthew 6:9–13 · John 12:20–26 · Ephesians 4:1–12 | 1 | single words | 6–9 / section | sectioned; L20 = mastery |

**Chunking guarantees** (enforced at build time and re-checked by tests):

- Every correct chunk is an exact substring of the scripture.
- Joining the chunks in order with a single space reproduces the passage text exactly.
- Punctuation stays attached to its word; there are never punctuation-only tiles.
- Repeated words become **separate tile instances with unique IDs** (e.g. Ephesians 4:5
  “one Lord, one faith, one baptism,”).

**Sectioning.** Long passages aren’t dumped on screen as hundreds of tiles. They’re
studied whole, then rebuilt one verse at a time with a “Verse X of Y” indicator;
a mistake spends from the level’s heart count, and finishing every verse completes
the level.

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
  the passage can be read aloud with a preferred natural English voice. There’s always
  a Listen/Stop control.
  - Auto-narration on the study screen happens **only when sound is enabled** and
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

Saved to `localStorage` (`src/game/progress.ts`): highest unlocked level, completed
levels, best stars and fewest attempts per level, current level, sound preference, and
whether the intro has been seen. A level unlocks the next **only after completion**;
completed levels stay replayable. Corrupt or hostile stored data can never crash the
app — it’s validated and safely reset to defaults.

Stars (1–3) reward the winning attempt: 3 for a flawless first try, 2 for a few
mistakes with no retries, 1 otherwise.

---

## Project layout

```
data/verses.json            # scripture source (read-only, WEB Classic, public domain)
scripts/build_scripture_json.py
src/
  data/scripture.ts         # typed loader for verses.json
  game/
    levels.ts               # the 20 curated levels
    chunk.ts                # scripture → chunks (round-trip guaranteed)
    distractors.ts          # decoys drawn from other passages
    random.ts               # seedable RNG + Fisher–Yates shuffle
    build.ts                # assemble a playable level (sections + shuffled banks)
    recall.ts               # pure recall state machine (hearts, undo, sections)
    scoring.ts              # star rating
    progress.ts             # localStorage load/save/validate
    __tests__/              # Vitest logic tests
  audio/sound.ts            # Web Audio interaction sounds
  audio/speech.ts           # SpeechSynthesis narration
  components/               # Welcome, LevelIntro, Study, Recall, Complete, Final, …
  App.tsx                   # game-flow state machine
```

---

## Tests

`npm test` runs the Vitest suite covering the important game logic, including: all 20
passage IDs exist; Level 1 is John 11:35 and reconstructs exactly “Jesus wept.”; every
level’s chunks reproduce their source scripture; distractors come only from other
passages; duplicate words get unique IDs; the shuffle doesn’t mutate its input;
progress unlocks only after completion and survives a reload; invalid localStorage is
handled safely; wrong picks reduce hearts; long passages advance through their sections;
and sound-disabled mode never auto-narrates.
