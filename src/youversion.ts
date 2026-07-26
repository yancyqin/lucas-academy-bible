import {
  buildLevel,
  type BuiltLevel,
  type ScriptureAttribution,
} from './game/build';
import { requirePassage } from './data/scripture';
import type { LevelFile, Question } from './game/levels';
import { mulberry32 } from './game/random';
import {
  TRANSLATIONS,
  type TranslationKey,
} from './translation-config';

export interface YouVersionTranslation {
  key: TranslationKey;
  label: string;
  id: number;
  abbreviation: string;
  title: string;
  copyright: string;
  promotionalContent: string;
  youVersionDeepLink: string;
}

export interface YouVersionPassage {
  passageId: string;
  reference: string;
  text: string;
  cache: 'HIT' | 'MISS';
  translation: YouVersionTranslation;
}

const BOOK_CODES: Record<string, string> = {
  Genesis: 'GEN',
  Joshua: 'JOS',
  Psalm: 'PSA',
  Proverbs: 'PRO',
  Ecclesiastes: 'ECC',
  Isaiah: 'ISA',
  Joel: 'JOL',
  Hosea: 'HOS',
  Matthew: 'MAT',
  Luke: 'LUK',
  John: 'JHN',
  Romans: 'ROM',
  '1 Corinthians': '1CO',
  '2 Corinthians': '2CO',
  Galatians: 'GAL',
  Ephesians: 'EPH',
  Philippians: 'PHP',
  Hebrews: 'HEB',
  '1 Peter': '1PE',
  '1 John': '1JN',
};

function responseMessage(data: unknown, fallback: string): string {
  return data && typeof data === 'object' && 'message' in data
    ? String((data as { message: unknown }).message)
    : fallback;
}

function isPassage(value: unknown): value is YouVersionPassage {
  if (!value || typeof value !== 'object') return false;
  const passage = value as Partial<YouVersionPassage>;
  return (
    typeof passage.passageId === 'string' &&
    typeof passage.reference === 'string' &&
    typeof passage.text === 'string' &&
    !!passage.translation &&
    typeof passage.translation.key === 'string' &&
    typeof passage.translation.label === 'string' &&
    typeof passage.translation.copyright === 'string'
  );
}

export async function fetchBiblePassage(
  translation: TranslationKey,
  passageId: string,
  signal?: AbortSignal,
): Promise<YouVersionPassage> {
  const params = new URLSearchParams({ translation, passage: passageId });
  const response = await fetch(`/api/passage?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      responseMessage(data, 'That Bible passage could not be loaded.'),
    );
  }
  if (!isPassage(data)) {
    throw new Error('The Bible passage response was incomplete.');
  }
  return data;
}

function passageIdForQuestion(
  question: Question,
  onlyVerse?: number,
): string {
  const source = requirePassage(question.passageId);
  const code = BOOK_CODES[source.book];
  if (!code) throw new Error(`No YouVersion book code for ${source.book}`);
  const numbers =
    onlyVerse === undefined
      ? question.verses.map((verse) => verse.verse)
      : [onlyVerse];
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);
  const verses = first === last ? String(first) : `${first}-${last}`;
  return `${code}.${source.chapter}.${verses}`;
}

function splitClauses(text: string): string[] {
  return (
    text
      .match(/[^,;:.!?]+[,;:.!?]+(?:["”’']+)?|[^,;:.!?]+$/g)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? [text.trim()]
  );
}

/**
 * Level-bank fragments carry an a/b/c suffix. Translations do not always have
 * the same number of clauses, so preserve the fragment's relative position in
 * its source verse and choose the corresponding API-returned clause.
 */
function translatedFragment(question: Question, translatedText: string): string {
  const source = requirePassage(question.passageId);
  const verseNumber = question.verses[0]?.verse;
  const sourceVerse =
    source.verses.find((verse) => verse.verse === verseNumber)?.text ??
    source.text;
  const sourceClauses = splitClauses(sourceVerse);
  const translatedClauses = splitClauses(translatedText);
  const sourceNeedle = question.text.replace(/\s+/g, ' ').trim();
  let sourceIndex = sourceClauses.findIndex(
    (clause) => clause.replace(/\s+/g, ' ').trim() === sourceNeedle,
  );

  if (sourceIndex < 0) {
    const suffix = question.reference.match(/([a-z])$/i)?.[1]?.toLowerCase();
    sourceIndex = suffix ? suffix.charCodeAt(0) - 97 : 0;
  }

  const ratio =
    sourceClauses.length <= 1
      ? 0
      : Math.max(0, sourceIndex) / (sourceClauses.length - 1);
  const translatedIndex = Math.min(
    translatedClauses.length - 1,
    Math.round(ratio * Math.max(0, translatedClauses.length - 1)),
  );
  return translatedClauses[translatedIndex] ?? translatedText.trim();
}

function attributionFor(
  translation: YouVersionTranslation,
): ScriptureAttribution {
  return {
    abbreviation: translation.abbreviation,
    title: translation.title,
    copyright: translation.copyright,
    sourceLabel: 'YouVersion',
    sourceUrl: translation.youVersionDeepLink,
  };
}

async function translatedQuestion(
  file: LevelFile,
  question: Question,
  translation: TranslationKey,
  signal?: AbortSignal,
): Promise<{ question: Question; attribution: ScriptureAttribution }> {
  if (
    file.policy.sectionBy === 'verse' &&
    question.verses.length > 1 &&
    !question.fragment
  ) {
    const passages = await Promise.all(
      question.verses.map((verse) =>
        fetchBiblePassage(
          translation,
          passageIdForQuestion(question, verse.verse),
          signal,
        ),
      ),
    );
    const text = passages.map((passage) => passage.text).join(' ');
    const firstReference = passages[0]?.reference ?? question.reference;
    const lastVerse = question.verses[question.verses.length - 1]?.verse;
    const reference =
      lastVerse === undefined
        ? firstReference
        : firstReference.replace(/:\d+$/, (match) => `${match}-${lastVerse}`);
    return {
      question: {
        ...question,
        reference,
        verses: question.verses.map((verse, index) => ({
          verse: verse.verse,
          text: passages[index]?.text ?? verse.text,
        })),
        text,
      },
      attribution: attributionFor(passages[0].translation),
    };
  }

  const passage = await fetchBiblePassage(
    translation,
    passageIdForQuestion(question),
    signal,
  );
  const text = question.fragment
    ? translatedFragment(question, passage.text)
    : passage.text;
  return {
    question: {
      ...question,
      reference: passage.reference,
      verses: question.verses.map((verse, index) => ({
        verse: verse.verse,
        text: index === 0 ? text : '',
      })),
      text,
    },
    attribution: attributionFor(passage.translation),
  };
}

export async function prepareJourneyLevel(
  file: LevelFile,
  translation: TranslationKey,
  seed: number,
  signal?: AbortSignal,
): Promise<BuiltLevel> {
  if (!TRANSLATIONS[translation].requiresApi) {
    return buildLevel(file, { seed });
  }
  if (file.questions.length === 0) {
    throw new Error(`Level ${file.level} has no questions`);
  }

  const rng = mulberry32(seed);
  const questionIndex = Math.floor(rng() * file.questions.length);
  const sourceQuestion = file.questions[questionIndex];
  const translated = await translatedQuestion(
    file,
    sourceQuestion,
    translation,
    signal,
  );

  let distractorPassages:
    | { id: string; text: string }[]
    | undefined;
  if (file.policy.distractorsPerSection > 0) {
    let distractorQuestion =
      file.questions[(questionIndex + 1) % file.questions.length];
    for (let offset = 2; offset <= file.questions.length; offset += 1) {
      if (distractorQuestion.passageId !== sourceQuestion.passageId) break;
      distractorQuestion =
        file.questions[(questionIndex + offset) % file.questions.length];
    }
    const distractor = await fetchBiblePassage(
      translation,
      passageIdForQuestion(distractorQuestion),
      signal,
    );
    distractorPassages = [
      { id: distractorQuestion.passageId, text: distractor.text },
    ];
  }

  return buildLevel(file, {
    seed,
    questionIndex,
    questionOverride: translated.question,
    distractorPassages,
    attribution: translated.attribution,
  });
}
