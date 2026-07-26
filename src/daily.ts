import { buildLevel, type BuiltLevel, type ScriptureAttribution } from './game/build';
import { LEVELS, type LevelFile, type Question } from './game/levels';
import { tokenize } from './game/chunk';
import {
  isTranslationKey,
  type TranslationKey,
} from './translation-config';
import type { YouVersionPassage, YouVersionTranslation } from './youversion';

export interface DailyVerse {
  date: string;
  dayOfYear: number;
  passageId: string;
  reference: string;
  text: string;
  cache: 'HIT' | 'MISS';
  translation: YouVersionTranslation;
}

export function currentPacificDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isDailyVerse(value: unknown): value is DailyVerse {
  if (!value || typeof value !== 'object') return false;
  const verse = value as Partial<DailyVerse>;
  return (
    typeof verse.date === 'string' &&
    typeof verse.passageId === 'string' &&
    typeof verse.reference === 'string' &&
    typeof verse.text === 'string' &&
    !!verse.translation &&
    isTranslationKey(verse.translation.key) &&
    typeof verse.translation.label === 'string' &&
    typeof verse.translation.abbreviation === 'string' &&
    typeof verse.translation.copyright === 'string'
  );
}

export async function fetchDailyVerse(
  translation: TranslationKey,
  signal?: AbortSignal,
): Promise<DailyVerse> {
  const params = new URLSearchParams({ translation });
  const response = await fetch(`/api/daily-verse?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : 'Today’s verse could not be loaded.';
    throw new Error(message);
  }
  if (!isDailyVerse(data)) throw new Error('Today’s verse response was incomplete.');
  return data;
}

function medianWords(file: LevelFile): number {
  const counts = file.questions
    .map((question) => tokenize(question.text).length)
    .sort((a, b) => a - b);
  return counts[Math.floor(counts.length / 2)] ?? 0;
}

/** Match the daily passage to the existing level whose normal questions are
 * closest in length, so chunk size, hints, timer, and distractors stay on the
 * same progression curve as the main game. */
export function dailyLevelFile(wordCount: number): LevelFile {
  return LEVELS.reduce((best, candidate) => {
    const candidateDistance = Math.abs(medianWords(candidate) - wordCount);
    const bestDistance = Math.abs(medianWords(best) - wordCount);
    return candidateDistance < bestDistance ? candidate : best;
  }, LEVELS[0]);
}

export function buildDailyVerse(
  verse: DailyVerse,
  seed: number,
  distractor?: YouVersionPassage,
): BuiltLevel {
  const file = dailyLevelFile(tokenize(verse.text).length);
  const passageParts = verse.passageId.split('.');
  const versePart = passageParts[passageParts.length - 1] ?? '';
  const verseNumber = Number(versePart.match(/^\d+/)?.[0] ?? 0);
  const question: Question = {
    id: `daily-${verse.date}`,
    passageId: `youversion-${verse.passageId}`,
    reference: verse.reference,
    fragment: false,
    verses: [{ verse: verseNumber, text: verse.text }],
    text: verse.text,
  };
  const attribution: ScriptureAttribution = {
    abbreviation: verse.translation.abbreviation,
    title: verse.translation.title,
    copyright: verse.translation.copyright,
    sourceLabel: 'YouVersion',
    sourceUrl: verse.translation.youVersionDeepLink,
  };

  return {
    ...buildLevel(
      { ...file, questions: [question] },
      {
        seed,
        questionIndex: 0,
        distractorPassages: distractor
          ? [{ id: `youversion-${distractor.passageId}`, text: distractor.text }]
          : [],
      },
    ),
    attribution,
  };
}
