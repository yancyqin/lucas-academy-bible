import { autoChunk, groupChunks, splitSentences, tokenize } from './chunk';
import {
  pickDistractors,
  type DistractorPassage,
} from './distractors';
import {
  memorizeSeconds,
  type HintLevel,
  type LevelFile,
  type Question,
} from './levels';
import { mulberry32, shuffle, type Rng } from './random';
import { translationInfo } from '../data/scripture';

export interface ScriptureAttribution {
  abbreviation: string;
  title: string;
  copyright: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

/** A single clickable tile. IDs are unique even when text repeats. */
export interface Tile {
  id: string;
  text: string;
  isDistractor: boolean;
}

/** One recall section — the whole question, a verse, or a sentence. */
export interface RecallSection {
  index: number;
  total: number;
  /** Human label like "Verse 3 of 12" / "Part 2 of 4" (empty when single). */
  label: string;
  correct: string[];
  bank: Tile[];
}

export interface BuiltLevel {
  level: number;
  passageId: string;
  reference: string;
  fragment: boolean;
  fullText: string;
  verses: { verse: number; text: string }[];
  hearts: number;
  hintLevel: HintLevel;
  sectioned: boolean;
  sections: RecallSection[];
  /** Seconds to memorize before recall (scaled to length + difficulty). */
  memorizeSeconds: number;
  /** The bank question that was drawn for this build. */
  questionId: string;
  /** Required publisher/source notice for licensed translations. */
  attribution?: ScriptureAttribution;
}

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
  for (let attempt = 0; attempt < 24 && isPreSolved(bank, correct); attempt++) {
    bank = shuffle(all, rng);
  }
  if (isPreSolved(bank, correct)) bank = bank.slice().reverse();
  return bank;
}

/** The text units that become recall sections, per the level's sectionBy. */
function sectionUnits(
  question: Question,
  sectionBy: LevelFile['policy']['sectionBy'],
): { label: (i: number, n: number) => string; texts: string[] } {
  if (sectionBy === 'verse' && question.verses.length > 1) {
    return {
      label: (i, n) => `Verse ${i + 1} of ${n}`,
      texts: question.verses.map((v) => v.text),
    };
  }
  if (sectionBy === 'sentence') {
    const sentences = splitSentences(question.text);
    if (sentences.length > 1) {
      return {
        label: (i, n) => `Part ${i + 1} of ${n}`,
        texts: sentences,
      };
    }
  }
  return { label: () => '', texts: [question.text] };
}

function configuredAttribution(): ScriptureAttribution | undefined {
  const copyright = translationInfo.copyright;
  if (typeof copyright !== 'string' || !copyright) return undefined;
  const abbreviation =
    typeof translationInfo.abbreviation === 'string'
      ? translationInfo.abbreviation
      : translationInfo.id;
  const sourceUrl =
    typeof translationInfo.youVersionDeepLink === 'string'
      ? translationInfo.youVersionDeepLink
      : undefined;

  return {
    abbreviation,
    title: translationInfo.name,
    copyright,
    sourceLabel: sourceUrl ? 'YouVersion' : undefined,
    sourceUrl,
  };
}

export interface BuildOptions {
  /** Seed for deterministic layout + question choice. Defaults to level number. */
  seed?: number;
  /** Force a specific question (by index) instead of drawing from the bank. */
  questionIndex?: number;
  /** Replace the chosen question text with a runtime-loaded translation. */
  questionOverride?: Question;
  /** Same-translation sources for distractor chunks. */
  distractorPassages?: DistractorPassage[];
  /** Publisher/source notice attached to a runtime-loaded translation. */
  attribution?: ScriptureAttribution;
}

/**
 * Assemble a fully-built, ready-to-play level from a level file: draw a
 * question from the bank, section + chunk it, build shuffled tile banks with
 * distractors from OTHER passages. Pure and deterministic given `seed`.
 */
export function buildLevel(file: LevelFile, opts: BuildOptions = {}): BuiltLevel {
  const rng = mulberry32(opts.seed ?? file.level);
  const bank = file.questions;
  if (bank.length === 0) throw new Error(`Level ${file.level} has no questions`);

  const qIndex =
    opts.questionIndex !== undefined
      ? ((opts.questionIndex % bank.length) + bank.length) % bank.length
      : Math.floor(rng() * bank.length);
  const question = opts.questionOverride ?? bank[qIndex];

  const { label, texts } = sectionUnits(question, file.policy.sectionBy);

  const sections: RecallSection[] = texts.map((unitText, si) => {
    const correct = groupChunks(
      autoChunk(unitText, file.policy.granularity),
      file.policy.tileGroup ?? 1,
    );
    const distractors = pickDistractors({
      excludeId: question.passageId,
      correctChunks: correct,
      count: file.policy.distractorsPerSection,
      rng,
      passages: opts.distractorPassages,
    });
    const tiles = buildBank(file.level, si, correct, distractors, rng);
    return {
      index: si,
      total: texts.length,
      label: texts.length > 1 ? label(si, texts.length) : '',
      correct,
      bank: tiles,
    };
  });

  return {
    level: file.level,
    passageId: question.passageId,
    reference: question.reference,
    fragment: question.fragment,
    fullText: question.text,
    verses: question.verses,
    hearts: file.policy.hearts,
    hintLevel: file.policy.hintLevel,
    sectioned: sections.length > 1,
    sections,
    memorizeSeconds: memorizeSeconds(file.policy, tokenize(question.text).length),
    questionId: question.id,
    attribution: opts.attribution ?? configuredAttribution(),
  };
}
