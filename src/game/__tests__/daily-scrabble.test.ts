import { describe, expect, it } from 'vitest';
import {
  buildDailyScrabble,
  DAILY_SCRABBLE_MAX_TARGETS,
} from '../daily-scrabble';

describe('Daily Scrabble puzzle builder', () => {
  it('selects a small set of meaningful words and skips function words', () => {
    const puzzle = buildDailyScrabble(
      'For God so loved the world that he gave his one and only Son.',
      'john-3-16',
    );
    const targets = puzzle.targets.map((target) => target.word.toLowerCase());

    expect(targets).toHaveLength(DAILY_SCRABBLE_MAX_TARGETS);
    expect(targets).toEqual(['god', 'world', 'gave', 'only', 'son']);
    expect(targets).not.toContain('for');
    expect(targets).not.toContain('the');
    expect(targets).not.toContain('he');
    expect(targets).not.toContain('his');
  });

  it('keeps a short verse playable', () => {
    const puzzle = buildDailyScrabble('Jesus wept.', 'john-11-35');

    expect(puzzle.targets.map((target) => target.word)).toEqual(['Jesus', 'wept']);
    expect(puzzle.targets.map((target) => target.tokenIndex)).toEqual([0, 1]);
  });

  it('repairs a missing display space after punctuation from the passage API', () => {
    const puzzle = buildDailyScrabble(
      'Worthy is the Holy One,to receive glory.',
      'punctuation',
    );

    expect(puzzle.tokens).toEqual([
      'Worthy',
      'is',
      'the',
      'Holy',
      'One,',
      'to',
      'receive',
      'glory.',
    ]);
  });

  it('builds deterministic shuffled letter banks that reconstruct each word', () => {
    const first = buildDailyScrabble(
      'Trust in the Lord with all your heart.',
      'proverbs-3-5',
    );
    const second = buildDailyScrabble(
      'Trust in the Lord with all your heart.',
      'proverbs-3-5',
    );

    expect(first).toEqual(second);
    for (const target of first.targets) {
      expect(
        target.letters
          .map((letter) => letter.char)
          .sort()
          .join(''),
      ).toBe([...target.answer].sort().join(''));
      expect(target.answer.length).toBeLessThanOrEqual(10);
    }
  });

  it('spreads five blanks across a long verse instead of taking only the first words', () => {
    const puzzle = buildDailyScrabble(
      'Blessed people patiently remember wisdom while faithful families quietly practice mercy and kindness forever.',
      'spread',
    );
    const indexes = puzzle.targets.map((target) => target.tokenIndex);

    expect(indexes).toHaveLength(5);
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(13);
  });
});
