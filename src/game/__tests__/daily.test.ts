import { describe, expect, it } from 'vitest';
import {
  buildDailyVerse,
  currentPacificDate,
  dailyLevelFile,
  type DailyVerse,
} from '../../daily';
import { tokenize } from '../chunk';

const verse: DailyVerse = {
  date: '2026-07-25',
  dayOfYear: 206,
  passageId: 'JHN.3.16',
  reference: 'John 3:16',
  text: 'For God so loved the world that he gave his one and only Son.',
  cache: 'MISS',
  translation: {
    key: 'NIV',
    label: 'NIV',
    id: 111,
    abbreviation: 'NIV',
    title: 'New International Version',
    copyright: 'Required NIV copyright.',
    promotionalContent: '',
    youVersionDeepLink: 'https://www.bible.com/versions/111',
  },
};

describe('daily verse challenge', () => {
  it('uses the Pacific date at the UTC date boundary', () => {
    expect(currentPacificDate(new Date('2026-01-01T07:30:00Z'))).toBe('2025-12-31');
    expect(currentPacificDate(new Date('2026-01-01T08:30:00Z'))).toBe('2026-01-01');
  });

  it('chooses a real level policy based on passage length', () => {
    const file = dailyLevelFile(tokenize(verse.text).length);
    expect(file.questions.length).toBeGreaterThan(0);
    expect(file.level).toBeGreaterThanOrEqual(0);
  });

  it('builds a solvable challenge with required NIV attribution', () => {
    const built = buildDailyVerse(verse, 42);
    expect(built.fullText).toBe(verse.text);
    expect(built.reference).toBe('John 3:16');
    expect(built.sections.flatMap((section) => section.correct).join(' ')).toBe(verse.text);
    expect(built.attribution).toEqual({
      abbreviation: 'NIV',
      title: 'New International Version',
      copyright: 'Required NIV copyright.',
      sourceLabel: 'YouVersion',
      sourceUrl: 'https://www.bible.com/versions/111',
    });
  });
});
