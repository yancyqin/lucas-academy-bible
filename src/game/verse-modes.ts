import { buildLevel, type BuiltLevel, type ScriptureAttribution } from './build';
import type { DistractorPassage } from './distractors';
import type { LevelFile, LevelPolicy, Question } from './levels';

/**
 * Difficulty for a verse the player picked themselves (the Pick a Verse tab).
 *
 * The Challenge ladder derives its difficulty from the level number; a picked
 * verse has no level, so the player chooses the policy directly.
 *
 * The lever that actually decides how hard a round feels is HOW MANY TILES there
 * are, and `tileGroup` is the only knob that moves that in English (`granularity`
 * resizes Chinese tiles only — English tiles are always content-word groups).
 * So Easy hands over a few whole phrases, Normal the ordinary word tiles with
 * slots still showing, and Hard the same tiles with no help at all.
 *
 * Practice is Normal with the pressure removed: no memorize countdown, no recall
 * clock, no overtime heart drain, and extra hearts.
 */
export type VerseDifficulty = 'easy' | 'normal' | 'hard' | 'practice';

export interface VerseMode {
  key: VerseDifficulty;
  label: string;
  /** One-line description shown under the picker. */
  blurb: string;
  /** Timers off (StudyPhase/RecallPhase `practiceMode`). */
  untimed: boolean;
  policy: LevelPolicy;
}

/** Normal and Practice differ only in the clock, so they share one policy. */
const NORMAL_POLICY: LevelPolicy = {
  hearts: 3,
  hintLevel: 'slots',
  granularity: 'phrase',
  sectionBy: 'sentence',
  distractorsPerSection: 0,
  memorizeSecondsPerWord: 3,
  memorizeMin: 10,
  memorizeMax: 45,
};

export const VERSE_MODES: Record<VerseDifficulty, VerseMode> = {
  easy: {
    key: 'easy',
    label: 'Easy',
    blurb: 'A few big phrase tiles, slots to fill, no decoys.',
    untimed: false,
    policy: {
      hearts: 5,
      hintLevel: 'slots',
      granularity: 'words',
      // Three content-word chunks per tile: John 3:16 becomes about five
      // phrases to order instead of fourteen words.
      tileGroup: 3,
      sectionBy: 'sentence',
      distractorsPerSection: 0,
      memorizeSecondsPerWord: 4,
      memorizeMin: 12,
      memorizeMax: 60,
    },
  },
  normal: {
    key: 'normal',
    label: 'Normal',
    blurb: 'Word tiles, slots to fill, no decoys.',
    untimed: false,
    policy: NORMAL_POLICY,
  },
  hard: {
    key: 'hard',
    label: 'Hard',
    blurb: 'No hints, six decoys, a tight clock.',
    untimed: false,
    policy: {
      hearts: 3,
      hintLevel: 'none',
      granularity: 'words',
      sectionBy: 'sentence',
      distractorsPerSection: 6,
      memorizeSecondsPerWord: 1.5,
      memorizeMin: 18,
      memorizeMax: 120,
    },
  },
  practice: {
    key: 'practice',
    label: 'Practice',
    blurb: 'No timer, five hearts — learn at your pace.',
    untimed: true,
    policy: { ...NORMAL_POLICY, hearts: 5 },
  },
};

export const VERSE_DIFFICULTIES: VerseDifficulty[] = [
  'easy',
  'normal',
  'hard',
  'practice',
];

export const DEFAULT_VERSE_DIFFICULTY: VerseDifficulty = 'normal';

export function isVerseDifficulty(value: unknown): value is VerseDifficulty {
  return typeof value === 'string' && value in VERSE_MODES;
}

/** A picked verse is not part of the ladder — level 0 only prefixes tile ids. */
const PICKED_VERSE_LEVEL = 0;

/** The passage as the app loaded it, ready to become a game. */
export interface PickedPassage {
  /** YouVersion passage id, e.g. "JHN.3.16" or "PSA.23.1-3". */
  passageId: string;
  /** Reference in the edition's own language, e.g. "约翰福音 3:16". */
  reference: string;
  text: string;
  attribution?: ScriptureAttribution;
}

export function verseLevelFile(difficulty: VerseDifficulty): LevelFile {
  return {
    level: PICKED_VERSE_LEVEL,
    policy: VERSE_MODES[difficulty].policy,
    questions: [],
  };
}

/**
 * Turn any loaded passage into a playable level at the chosen difficulty.
 * Pure and deterministic given `seed`; `distractors` supplies same-translation
 * decoy text (omit it to fall back to the bundled WEB collection).
 */
export function buildPickedVerse(
  passage: PickedPassage,
  difficulty: VerseDifficulty,
  seed: number,
  distractors?: DistractorPassage[],
): BuiltLevel {
  const verseNumber = firstVerseNumber(passage.passageId);
  const question: Question = {
    id: `picked-${passage.passageId}`,
    passageId: `youversion-${passage.passageId}`,
    reference: passage.reference,
    fragment: false,
    verses: [{ verse: verseNumber, text: passage.text }],
    text: passage.text,
  };

  return buildLevel(
    { ...verseLevelFile(difficulty), questions: [question] },
    {
      seed,
      questionIndex: 0,
      distractorPassages: distractors,
      attribution: passage.attribution,
    },
  );
}

/** "PSA.23.1-3" → 1. Used for the verse number shown beside the text. */
function firstVerseNumber(passageId: string): number {
  const last = passageId.split('.').pop() ?? '';
  return Number(last.match(/^\d+/)?.[0] ?? 0);
}
