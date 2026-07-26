/**
 * Level definitions are fully data-driven: one JSON file per level in
 * `src/game/levels/` (`level-00.json`, `level-01.json`, …), each carrying the
 * level's difficulty policy plus a BANK of curated questions (real scripture
 * segments from the configured translation). Regenerate with
 * `python3 scripts/build_level_banks.py`.
 *
 * The app ADAPTS to whatever files exist: every `level-*.json` is auto-loaded and
 * sorted by its `level` field, and MIN/MAX/TOTAL derive from that set. To add,
 * remove, or re-tune levels you mostly just change the JSON (or the generator
 * table) and the code follows — no import list to maintain here.
 *
 * At play time a question is drawn from the level's bank (see build.ts), so each
 * play can present a different verse of similar difficulty.
 */

const levelModules = import.meta.glob('./levels/*.json', { eager: true }) as Record<
  string,
  unknown
>;

export type Granularity = 'words' | 'short' | 'phrase';
export type SectionBy = 'none' | 'sentence' | 'verse';
export type HintLevel = 'slots' | 'count' | 'none';

export interface LevelPolicy {
  hearts: number;
  hintLevel: HintLevel;
  granularity: Granularity;
  sectionBy: SectionBy;
  distractorsPerSection: number;
  /** Memorize-timer tuning (seconds). */
  memorizeSecondsPerWord: number;
  memorizeMin: number;
  memorizeMax: number;
}

export interface Question {
  id: string;
  reference: string;
  /** Source passage id in verses.json (distractors are drawn from OTHERS). */
  passageId: string;
  /** True when this is a clause fragment (reference carries an a/b/c suffix). */
  fragment: boolean;
  verses: { verse: number; text: string }[];
  text: string;
}

export interface LevelFile {
  level: number;
  policy: LevelPolicy;
  questions: Question[];
}

export const LEVELS: LevelFile[] = Object.values(levelModules)
  .map((m) => ((m as { default?: unknown }).default ?? m) as LevelFile)
  .sort((a, b) => a.level - b.level);

/** Number of levels (Level 0 is a warm-up, so this is one more than the top #). */
export const TOTAL_LEVELS = LEVELS.length;

/** Lowest and highest LEVEL NUMBERS (0..20) — not the same as the count. */
export const MIN_LEVEL = Math.min(...LEVELS.map((l) => l.level));
export const MAX_LEVEL = Math.max(...LEVELS.map((l) => l.level));

export function getLevelFile(level: number): LevelFile | undefined {
  return LEVELS.find((l) => l.level === level);
}

/** Compute the memorize countdown (seconds) for a question at a level. */
export function memorizeSeconds(policy: LevelPolicy, wordCount: number): number {
  const raw = Math.round(wordCount * policy.memorizeSecondsPerWord);
  return Math.max(policy.memorizeMin, Math.min(policy.memorizeMax, raw));
}
