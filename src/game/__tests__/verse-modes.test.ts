import { describe, expect, it } from 'vitest';
import { joinChunks, tokenize } from '../chunk';
import {
  buildPickedVerse,
  isVerseDifficulty,
  VERSE_DIFFICULTIES,
  VERSE_MODES,
  type PickedPassage,
} from '../verse-modes';

const john316: PickedPassage = {
  passageId: 'JHN.3.16',
  reference: 'John 3:16',
  text:
    'For God so loved the world, that he gave his only born Son, that whoever ' +
    'believes in him should not perish, but have eternal life.',
};

const psalm23: PickedPassage = {
  passageId: 'PSA.23.1-2',
  reference: 'Psalm 23:1-2',
  text:
    'Yahweh is my shepherd; I shall lack nothing. He makes me lie down in ' +
    'green pastures. He leads me beside still waters.',
};

const chineseVerse: PickedPassage = {
  passageId: 'JHN.11.35',
  reference: '约翰福音 11:35',
  text: '耶稣哭了。',
};

describe('picked-verse difficulties', () => {
  it('recognizes only the four modes', () => {
    expect(VERSE_DIFFICULTIES).toEqual(['easy', 'normal', 'hard', 'practice']);
    for (const key of VERSE_DIFFICULTIES) expect(isVerseDifficulty(key)).toBe(true);
    for (const key of ['', 'medium', 'HARD', null, 7]) {
      expect(isVerseDifficulty(key)).toBe(false);
    }
  });

  it('gets harder in the ways the player is promised', () => {
    const { easy, normal, hard } = VERSE_MODES;
    // Help never increases along the curve.
    expect([easy.policy.hintLevel, normal.policy.hintLevel, hard.policy.hintLevel])
      .toEqual(['slots', 'slots', 'none']);
    expect([
      easy.policy.distractorsPerSection,
      normal.policy.distractorsPerSection,
      hard.policy.distractorsPerSection,
    ]).toEqual([0, 0, 6]);
    expect(easy.policy.hearts).toBeGreaterThan(normal.policy.hearts);
    expect(easy.policy.memorizeSecondsPerWord).toBeGreaterThan(
      normal.policy.memorizeSecondsPerWord,
    );
    expect(normal.policy.memorizeSecondsPerWord).toBeGreaterThan(
      hard.policy.memorizeSecondsPerWord,
    );
    // Only Easy merges chunks into big phrase tiles.
    expect(easy.policy.tileGroup).toBeGreaterThan(1);
    expect(normal.policy.tileGroup).toBeUndefined();
    expect(hard.policy.tileGroup).toBeUndefined();
  });

  it('gives Easy far fewer tiles to order than Normal or Hard', () => {
    const tiles = (difficulty: 'easy' | 'normal' | 'hard') =>
      buildPickedVerse(john316, difficulty, 4).sections.reduce(
        (total, section) => total + section.correct.length,
        0,
      );

    // English tiles are content-word groups whatever the granularity, so
    // without tileGroup every difficulty would hand over the same wall of them.
    expect(tiles('normal')).toBe(tiles('hard'));
    expect(tiles('easy')).toBeLessThan(tiles('normal') / 2);
    expect(tiles('easy')).toBeLessThanOrEqual(6);
  });

  it('only practice removes the clocks, and it is the most forgiving', () => {
    expect(VERSE_DIFFICULTIES.filter((key) => VERSE_MODES[key].untimed)).toEqual([
      'practice',
    ]);
    expect(VERSE_MODES.practice.policy.hearts).toBeGreaterThan(
      VERSE_MODES.normal.policy.hearts,
    );
  });
});

describe('building a game from a picked verse', () => {
  it('rebuilds the passage exactly, at every difficulty', () => {
    for (const difficulty of VERSE_DIFFICULTIES) {
      const built = buildPickedVerse(john316, difficulty, 42);
      const rebuilt = built.sections.map((section) =>
        joinChunks(section.correct),
      );
      expect(joinChunks(rebuilt)).toBe(john316.text);
      expect(built.reference).toBe('John 3:16');
      expect(built.hearts).toBe(VERSE_MODES[difficulty].policy.hearts);
      expect(built.hintLevel).toBe(VERSE_MODES[difficulty].policy.hintLevel);
    }
  });

  it('adds the decoy tiles the difficulty calls for', () => {
    for (const difficulty of VERSE_DIFFICULTIES) {
      const built = buildPickedVerse(john316, difficulty, 7);
      const expected = VERSE_MODES[difficulty].policy.distractorsPerSection;
      for (const section of built.sections) {
        const decoys = section.bank.filter((tile) => tile.isDistractor);
        expect(decoys).toHaveLength(expected);
        // A decoy that equals a needed tile would make the answer ambiguous.
        for (const decoy of decoys) {
          expect(section.correct).not.toContain(decoy.text);
        }
      }
    }
  });

  it('splits a multi-sentence passage into sections', () => {
    const built = buildPickedVerse(psalm23, 'normal', 3);
    expect(built.sections.length).toBeGreaterThan(1);
    expect(built.sectioned).toBe(true);
    expect(
      joinChunks(built.sections.map((section) => joinChunks(section.correct))),
    ).toBe(psalm23.text);
    expect(built.sections[0].label).toBe('Part 1 of 3');
  });

  it('scales the memorize timer to the length of the passage', () => {
    const words = tokenize(john316.text).length;
    const easy = buildPickedVerse(john316, 'easy', 1);
    const hard = buildPickedVerse(john316, 'hard', 1);
    expect(easy.memorizeSeconds).toBeGreaterThan(hard.memorizeSeconds);
    expect(hard.memorizeSeconds).toBeGreaterThanOrEqual(
      VERSE_MODES.hard.policy.memorizeMin,
    );
    expect(easy.memorizeSeconds).toBeLessThanOrEqual(
      Math.max(
        VERSE_MODES.easy.policy.memorizeMin,
        Math.round(words * VERSE_MODES.easy.policy.memorizeSecondsPerWord),
      ),
    );
  });

  it('keeps Chinese tiles joined without spaces', () => {
    const built = buildPickedVerse(chineseVerse, 'easy', 5);
    expect(joinChunks(built.sections[0].correct)).toBe('耶稣哭了。');
    expect(built.verses).toEqual([{ verse: 35, text: '耶稣哭了。' }]);
  });

  it('is deterministic for a seed, and varies across seeds', () => {
    const a = buildPickedVerse(john316, 'hard', 99);
    const b = buildPickedVerse(john316, 'hard', 99);
    const c = buildPickedVerse(john316, 'hard', 100);
    const order = (level: typeof a) =>
      level.sections.map((s) => s.bank.map((t) => t.text).join('|')).join('//');
    expect(order(a)).toBe(order(b));
    expect(order(a)).not.toBe(order(c));
  });

  it('carries the edition notice through to the footer', () => {
    const built = buildPickedVerse(
      {
        ...john316,
        attribution: {
          abbreviation: 'NIV',
          title: 'New International Version',
          copyright: 'Required NIV copyright.',
        },
      },
      'normal',
      1,
    );
    expect(built.attribution?.copyright).toBe('Required NIV copyright.');
  });

  it('uses the supplied same-edition pool for decoys', () => {
    const built = buildPickedVerse(chineseVerse, 'hard', 11, [
      { id: 'other', text: '你们要先求他的国和他的义，这些东西都要加给你们了。' },
    ]);
    const decoys = built.sections
      .flatMap((section) => section.bank)
      .filter((tile) => tile.isDistractor);
    expect(decoys.length).toBeGreaterThan(0);
    for (const decoy of decoys) {
      expect('你们要先求他的国和他的义，这些东西都要加给你们了。').toContain(
        decoy.text,
      );
    }
  });
});
