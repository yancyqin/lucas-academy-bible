import type { ChunkSpec } from './chunk';

/**
 * Curated configuration for the 20 levels.
 *
 * Difficulty curve (per the product spec):
 *   Levels  1–5 : large phrase chunks, 0→2 distractors, 3 hearts, slot hints.
 *   Levels  6–10: shorter 1–3 word phrases, 2–4 distractors, 2 hearts, count hint.
 *   Levels 11–15: single words / short phrases, 4–5 distractors, 1 heart, no hints.
 *   Levels 16–20: single words, 6–9 distractors, 1 heart, no hints; all sectioned.
 *
 * `distractorsPerSection` is the number of distractor tiles added to EACH
 * section's tile bank. For non-sectioned levels the passage is a single
 * section, so it is the whole-level count. Sectioning keeps long passages
 * usable: a huge passage is rebuilt one verse at a time instead of dumping
 * hundreds of tiles on screen.
 *
 * For the phrase (`sizes`) levels the group sizes are hand-curated to break at
 * natural clause/punctuation boundaries. `chunkText` throws if the sizes don't
 * sum to the token count, and a test re-validates every level against
 * data/verses.json, so a bad edit fails loudly.
 */

export type HintLevel = 'slots' | 'count' | 'none';

export interface LevelConfig {
  level: number;
  passageId: string;
  reference: string; // documentation/readability only; source of truth is verses.json
  hearts: number;
  hintLevel: HintLevel;
  distractorsPerSection: number;
  /** When true, each verse becomes its own recall section. */
  sectioned: boolean;
  /**
   * Chunking spec. For non-sectioned levels it applies to passage.text.
   * For sectioned levels it applies to each verse (we use single words there).
   */
  spec: ChunkSpec;
}

export const LEVELS: LevelConfig[] = [
  // ---- Levels 1–5 : gentle onboarding, big phrase chunks, 3 hearts ----
  {
    level: 1,
    passageId: 'passage-001',
    reference: 'John 11:35',
    hearts: 3,
    hintLevel: 'slots',
    distractorsPerSection: 0, // spec: zero distractors on Level 1
    sectioned: false,
    spec: { mode: 'sizes', sizes: [1, 1] }, // "Jesus" | "wept."
  },
  {
    level: 2,
    passageId: 'passage-010',
    reference: 'Genesis 1:1',
    hearts: 3,
    hintLevel: 'slots',
    distractorsPerSection: 1,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [3, 2, 2, 3] },
  },
  {
    level: 3,
    passageId: 'passage-002',
    reference: 'Psalm 119:105',
    hearts: 3,
    hintLevel: 'slots',
    distractorsPerSection: 1,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [3, 5, 3, 3] },
  },
  {
    level: 4,
    passageId: 'passage-009',
    reference: 'Matthew 7:7',
    hearts: 3,
    hintLevel: 'slots',
    distractorsPerSection: 2,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [7, 5, 4, 4] },
  },
  {
    level: 5,
    passageId: 'passage-029',
    reference: 'Proverbs 4:23',
    hearts: 3,
    hintLevel: 'slots',
    distractorsPerSection: 2,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [3, 3, 4, 3, 2] },
  },

  // ---- Levels 6–10 : shorter phrases, 2 hearts, count hint ----
  {
    level: 6,
    passageId: 'passage-081',
    reference: 'Matthew 5:14',
    hearts: 2,
    hintLevel: 'count',
    distractorsPerSection: 2,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [2, 2, 3, 2, 2, 2, 3] },
  },
  {
    level: 7,
    passageId: 'passage-015',
    reference: 'Joshua 1:9',
    hearts: 2,
    hintLevel: 'count',
    distractorsPerSection: 3,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [2, 2, 2, 2, 3, 3, 2, 2, 3, 3] },
  },
  {
    level: 8,
    passageId: 'passage-003',
    reference: '1 John 1:9',
    hearts: 2,
    hintLevel: 'count',
    distractorsPerSection: 3,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [3, 2, 3, 2, 3, 2, 4, 2, 1] },
  },
  {
    level: 9,
    passageId: 'passage-026',
    reference: '1 Corinthians 13:13',
    hearts: 2,
    hintLevel: 'count',
    distractorsPerSection: 3,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [2, 2, 2, 2, 2, 2, 2] },
  },
  {
    level: 10,
    passageId: 'passage-030',
    reference: 'John 3:16',
    hearts: 2,
    hintLevel: 'count',
    distractorsPerSection: 4,
    sectioned: false,
    spec: { mode: 'sizes', sizes: [2, 2, 2, 3, 2, 2, 2, 3, 3, 2, 2] },
  },

  // ---- Levels 11–15 : single words, 1 heart, no hints ----
  {
    level: 11,
    passageId: 'passage-018',
    reference: 'Galatians 5:22-23',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 4,
    sectioned: false,
    spec: { mode: 'words' },
  },
  {
    level: 12,
    passageId: 'passage-040',
    reference: 'Luke 11:11-13',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 4,
    sectioned: true,
    spec: { mode: 'words' },
  },
  {
    level: 13,
    passageId: 'passage-069',
    reference: 'Romans 8:31-32',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 5,
    sectioned: true,
    spec: { mode: 'words' },
  },
  {
    level: 14,
    passageId: 'passage-052',
    reference: '2 Corinthians 5:16-17',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 5,
    sectioned: true,
    spec: { mode: 'words' },
  },
  {
    level: 15,
    passageId: 'passage-077',
    reference: 'Philippians 4:4-7',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 5,
    sectioned: true,
    spec: { mode: 'words' },
  },

  // ---- Levels 16–20 : single words, 1 heart, more distractors, sectioned ----
  {
    level: 16,
    passageId: 'passage-060',
    reference: 'John 3:14-16',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 6,
    sectioned: true,
    spec: { mode: 'words' },
  },
  {
    level: 17,
    passageId: 'passage-036',
    reference: 'Hebrews 4:14-16',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 6,
    sectioned: true,
    spec: { mode: 'words' },
  },
  {
    level: 18,
    passageId: 'passage-042',
    reference: 'Matthew 6:9-13',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 7,
    sectioned: true,
    spec: { mode: 'words' },
  },
  {
    level: 19,
    passageId: 'passage-028',
    reference: 'John 12:20-26',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 8,
    sectioned: true,
    spec: { mode: 'words' },
  },
  {
    level: 20,
    passageId: 'passage-072',
    reference: 'Ephesians 4:1-12',
    hearts: 1,
    hintLevel: 'none',
    distractorsPerSection: 9,
    sectioned: true,
    spec: { mode: 'words' },
  },
];

export const TOTAL_LEVELS = LEVELS.length;

export function getLevelConfig(level: number): LevelConfig | undefined {
  return LEVELS.find((l) => l.level === level);
}
