import { requirePassage } from '../data/scripture';
import { chunkText } from './chunk';
import { pickDistractors } from './distractors';
import type { HintLevel, LevelConfig } from './levels';
import { mulberry32, shuffle, type Rng } from './random';

/** A single clickable tile. IDs are unique even when text repeats. */
export interface Tile {
  id: string;
  text: string;
  isDistractor: boolean;
}

/** One recall section — the whole passage, or a single verse when sectioned. */
export interface RecallSection {
  index: number;
  total: number;
  /** Human label like "Verse 3 of 12" (empty for single-section levels). */
  label: string;
  /** Verse number this section maps to, when sectioned. */
  verse?: number;
  /** Ordered correct chunk texts. */
  correct: string[];
  /** Shuffled bank of correct + distractor tiles. */
  bank: Tile[];
}

export interface BuiltLevel {
  level: number;
  passageId: string;
  reference: string;
  fullText: string;
  verses: { verse: number; text: string }[];
  hearts: number;
  hintLevel: HintLevel;
  sectioned: boolean;
  sections: RecallSection[];
}

/** True when the correct tiles already sit in target order (trivial round). */
function isPreSolved(bank: Tile[], correct: string[]): boolean {
  const correctTexts = bank.filter((t) => !t.isDistractor).map((t) => t.text);
  return (
    correctTexts.length === correct.length &&
    correctTexts.every((t, i) => t === correct[i])
  );
}

function buildBank(
  level: number,
  sectionIndex: number,
  correct: string[],
  distractors: string[],
  rng: Rng,
): Tile[] {
  const correctTiles: Tile[] = correct.map((text, ci) => ({
    id: `L${level}-s${sectionIndex}-c${ci}`,
    text,
    isDistractor: false,
  }));
  const distractorTiles: Tile[] = distractors.map((text, di) => ({
    id: `L${level}-s${sectionIndex}-d${di}`,
    text,
    isDistractor: true,
  }));

  const all = [...correctTiles, ...distractorTiles];
  let bank = shuffle(all, rng);
  // Avoid handing the player an already-ordered round.
  for (let attempt = 0; attempt < 24 && isPreSolved(bank, correct); attempt++) {
    bank = shuffle(all, rng);
  }
  if (isPreSolved(bank, correct)) bank = bank.slice().reverse();
  return bank;
}

export interface BuildOptions {
  /** Seed for deterministic layout. Defaults to the level number. */
  seed?: number;
}

/**
 * Assemble a fully-built, ready-to-play level: sections, correct chunks, and
 * shuffled tile banks. Pure and deterministic given `seed`.
 */
export function buildLevel(config: LevelConfig, opts: BuildOptions = {}): BuiltLevel {
  const passage = requirePassage(config.passageId);
  const rng = mulberry32(opts.seed ?? config.level);

  const units: { verse: number; text: string }[] = config.sectioned
    ? passage.verses.map((v) => ({ verse: v.verse, text: v.text }))
    : [{ verse: passage.verses[0]?.verse ?? 0, text: passage.text }];

  const sections: RecallSection[] = units.map((unit, si) => {
    const correct = chunkText(unit.text, config.spec);
    const distractors = pickDistractors({
      excludeId: config.passageId,
      correctChunks: correct,
      count: config.distractorsPerSection,
      rng,
    });
    const bank = buildBank(config.level, si, correct, distractors, rng);
    return {
      index: si,
      total: units.length,
      label: config.sectioned ? `Verse ${si + 1} of ${units.length}` : '',
      verse: config.sectioned ? unit.verse : undefined,
      correct,
      bank,
    };
  });

  return {
    level: config.level,
    passageId: config.passageId,
    reference: passage.reference,
    fullText: passage.text,
    verses: passage.verses.map((v) => ({ verse: v.verse, text: v.text })),
    hearts: config.hearts,
    hintLevel: config.hintLevel,
    sectioned: config.sectioned,
    sections,
  };
}
