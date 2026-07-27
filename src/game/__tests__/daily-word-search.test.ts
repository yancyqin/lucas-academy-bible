import { describe, expect, it } from 'vitest';
import { buildDailyScrabble } from '../daily-scrabble';
import {
  buildDailyWordSearch,
  DAILY_WORD_SEARCH_GRID_LIMITS,
  lineBetween,
} from '../daily-word-search';

describe('Daily Word Search puzzle builder', () => {
  it('places the same meaningful words into a phone-sized square grid', () => {
    const text = 'For God so loved the world that he gave his one and only Son.';
    const scrabble = buildDailyScrabble(text, 'john-3-16');
    const search = buildDailyWordSearch(text, 'john-3-16');

    expect(search.targets.map((target) => target.word)).toEqual(
      scrabble.targets.map((target) => target.word),
    );
    expect(search.size).toBeGreaterThanOrEqual(
      DAILY_WORD_SEARCH_GRID_LIMITS.minimum,
    );
    expect(search.size).toBeLessThanOrEqual(
      DAILY_WORD_SEARCH_GRID_LIMITS.maximum,
    );
    expect(search.grid).toHaveLength(search.size);
    expect(search.grid.every((row) => row.length === search.size)).toBe(true);
  });

  it('stores every target on a selectable straight path', () => {
    const puzzle = buildDailyWordSearch(
      'Worthy are you, our Lord and God, the Holy One, to receive glory and honor.',
      'revelation-4-11',
    );

    for (const target of puzzle.targets) {
      expect(target.path).toHaveLength(target.answer.length);
      expect(
        target.path
          .map(({ row, col }) => puzzle.grid[row][col])
          .join(''),
      ).toBe(target.answer.join(''));
      expect(
        lineBetween(target.path[0], target.path[target.path.length - 1]),
      ).toEqual(target.path);
    }
  });

  it('is deterministic for the same date, passage, and translation', () => {
    const text = 'Trust in the Lord with all your heart.';

    expect(buildDailyWordSearch(text, 'daily-key')).toEqual(
      buildDailyWordSearch(text, 'daily-key'),
    );
  });

  it('balances directions and can reroll positions without changing target words', () => {
    const text =
      'Worthy are you, our Lord and God, the Holy One, to receive glory, honor, power, and praise.';
    const first = buildDailyWordSearch(text, 'layout-0');
    const refreshed = buildDailyWordSearch(text, 'layout-1');
    const directionFamilies = new Set(
      first.targets.map((target) => {
        const start = target.path[0];
        const end = target.path[target.path.length - 1];
        const rowDirection = Math.sign(end.row - start.row);
        const colDirection = Math.sign(end.col - start.col);
        if (rowDirection === 0) return 'horizontal';
        if (colDirection === 0) return 'vertical';
        return 'diagonal';
      }),
    );

    expect(directionFamilies).toEqual(
      new Set(['horizontal', 'vertical', 'diagonal']),
    );
    expect(refreshed.targets.map((target) => target.word)).toEqual(
      first.targets.map((target) => target.word),
    );
    expect(refreshed.grid).not.toEqual(first.grid);
  });

  it('supports selecting a hidden word in either direction', () => {
    const forward = lineBetween(
      { row: 1, col: 1 },
      { row: 4, col: 4 },
    );
    const backward = lineBetween(
      { row: 4, col: 4 },
      { row: 1, col: 1 },
    );

    expect(backward).toEqual([...forward].reverse());
    expect(
      lineBetween({ row: 0, col: 0 }, { row: 2, col: 1 }),
    ).toEqual([]);
  });

  it('builds a Chinese-character grid from a Chinese daily verse', () => {
    const text = '上帝爱世人，甚至赐下他的独生子。';
    const puzzle = buildDailyWordSearch(
      text,
      'ccb-john-3-16',
    );

    expect(puzzle.targets.length).toBeGreaterThanOrEqual(2);
    expect(
      puzzle.grid.flat().every((character) => /\p{Script=Han}/u.test(character)),
    ).toBe(true);
    for (const target of puzzle.targets) {
      expect(
        target.path
          .map(({ row, col }) => puzzle.grid[row][col])
          .join(''),
      ).toBe(target.answer.join(''));
    }
  });

  it('does not mix simplified fillers into a traditional Chinese board', () => {
    const text = '我們的主，我們的上帝，你配得榮耀、尊貴和權能。';
    const puzzle = buildDailyWordSearch(text, 'ccbt-revelation-4-11');
    const verseCharacters = new Set(
      Array.from(text).filter((character) => /\p{Script=Han}/u.test(character)),
    );

    expect(
      puzzle.grid.flat().every((character) => verseCharacters.has(character)),
    ).toBe(true);
  });
});
