import { describe, expect, it } from 'vitest';
import { isContentWord } from '../chunk';
import {
  buildGuessGame,
  contextCount,
  GUESS_CHOICES,
  hiddenCount,
  splitToken,
  tallyGuesses,
  type GuessGame,
} from '../guess';
import type { DistractorPassage } from '../distractors';
import { localDistractorPool } from '../../youversion';

const WEB_JHN_3_16 =
  'For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.';
const CUV_JHN_3_16 = '神爱世人，甚至将他的独生子赐给他们，叫一切信他的，不至灭亡，反得永生。';
const WEB_PSA_23_1_2 =
  'Yahweh is my shepherd: I shall lack nothing. He makes me lie down in green pastures. He leads me beside still waters.';

const englishPool = localDistractorPool({ book: 'JHN', chapter: 3 }, false);
const chinesePool = localDistractorPool({ book: 'JHN', chapter: 3 }, true);

const bare = /^[\p{L}\p{N}](?:.*[\p{L}\p{N}])?$/u;
const wordOf = (game: GuessGame, tokenIndex: number) => splitToken(game.tokens[tokenIndex]).word;

describe('Guess the Letters (Shannon)', () => {
  it('hides the last letter of a short word and the last two of a long one', () => {
    expect(hiddenCount('so')).toBe(1);
    expect(hiddenCount('God')).toBe(1);
    expect(hiddenCount('gave')).toBe(1);
    expect(hiddenCount('loved')).toBe(2);
    expect(hiddenCount('eternal')).toBe(2);
    // Nothing to read in a one-letter word, nothing to guess in a number.
    expect(hiddenCount('a')).toBe(0);
    expect(hiddenCount('I')).toBe(0);
    expect(hiddenCount('10')).toBe(0);
    // Only letters are hidden, never the apostrophe.
    expect(hiddenCount('don’t')).toBe(1);
    expect(hiddenCount('Lord’s')).toBe(1);
    // A Chinese word counts characters.
    expect(hiddenCount('神')).toBe(0);
    expect(hiddenCount('世人')).toBe(1);
    expect(hiddenCount('独生子')).toBe(1);
    expect(hiddenCount('神爱世人')).toBe(2);
  });

  it('shows the start of every word and asks for the rest, in reading order', () => {
    const game = buildGuessGame(WEB_JHN_3_16, 7, englishPool, 'letters');
    expect(game.kind).toBe('letters');
    expect(game.tokens.join(game.separator)).toBe(WEB_JHN_3_16);
    expect(game.given).toEqual([]);
    expect(game.steps.map((s) => `${s.shown}[${s.units.map((u) => u.answer).join('')}]`).slice(0, 6)).toEqual([
      'Fo[r]',
      'Go[d]',
      's[o]',
      'lov[ed]',
      'th[e]',
      'wor[ld]',
    ]);
    game.steps.forEach((step, i) => {
      if (i > 0) expect(step.tokenIndex).toBeGreaterThan(game.steps[i - 1].tokenIndex);
      expect(step.word).toBe(wordOf(game, step.tokenIndex));
      expect(step.shown + step.units.map((u) => u.answer).join('')).toBe(step.word);
      expect(step.units).toHaveLength(hiddenCount(step.word));
    });
  });

  it('offers each hidden English letter among four letters, in its own case', () => {
    const game = buildGuessGame(WEB_PSA_23_1_2, 7, englishPool, 'letters');
    for (const step of game.steps) {
      for (const unit of step.units) {
        expect(unit.options).toHaveLength(GUESS_CHOICES);
        expect(unit.options.filter((o) => o === unit.answer)).toHaveLength(1);
        expect(new Set(unit.options.map((o) => o.toLowerCase())).size).toBe(GUESS_CHOICES);
        for (const option of unit.options) expect(option).toMatch(/^[a-z]$/);
      }
    }
    // "I" is a whole word already; nothing is hidden in it.
    expect(game.steps.map((s) => s.word)).not.toContain('I');

    const lord = buildGuessGame('The LORD is my shepherd.', 1, [], 'letters');
    const [unit] = lord.steps.find((s) => s.word === 'LORD')!.units;
    expect(unit.answer).toBe('D');
    for (const option of unit.options) expect(option).toMatch(/^[A-Z]$/);
  });

  it('draws letter decoys first from words that start the same way', () => {
    // Beside God's d, words starting "go" have n (gone), o (good), s (gospel), e (goes).
    const pool: DistractorPassage[] = [{ id: 'x', text: 'Go, gone, good gospel goes.' }];
    const game = buildGuessGame('God is.', 3, pool, 'letters');
    const [unit] = game.steps.find((s) => s.word === 'God')!.units;
    expect(unit.options).toContain('d');
    for (const option of unit.options.filter((o) => o !== 'd')) {
      expect(['n', 'o', 's', 'e']).toContain(option);
    }
  });

  it('has a hidden Chinese character picked from characters that could fit there', () => {
    const game = buildGuessGame(CUV_JHN_3_16, 7, chinesePool, 'letters');
    expect(game.tokens.join(game.separator)).toBe(CUV_JHN_3_16);
    expect(game.steps.length).toBeGreaterThan(0);
    for (const step of game.steps) {
      expect(step.word).toBe(wordOf(game, step.tokenIndex));
      for (const unit of step.units) {
        expect(unit.options).toHaveLength(GUESS_CHOICES);
        expect(unit.options.filter((o) => o === unit.answer)).toHaveLength(1);
        expect(new Set(unit.options).size).toBe(GUESS_CHOICES);
        for (const option of unit.options) expect(option).toMatch(/^\p{Script=Han}$/u);
      }
    }
  });

  it('reshuffles the Chinese choices for a new seed, and repeats them for the same one', () => {
    const a = buildGuessGame(CUV_JHN_3_16, 42, chinesePool, 'letters');
    expect(buildGuessGame(CUV_JHN_3_16, 42, chinesePool, 'letters')).toEqual(a);
    expect(buildGuessGame(CUV_JHN_3_16, 43, chinesePool, 'letters')).not.toEqual(a);
  });
});

describe('Guess the Next Word (next-word prediction)', () => {
  it('hands over a few opening words of each sentence as context', () => {
    expect(contextCount(0)).toBe(0);
    expect(contextCount(1)).toBe(1);
    expect(contextCount(2)).toBe(1);
    expect(contextCount(4)).toBe(1);
    expect(contextCount(8)).toBe(2);
    expect(contextCount(10)).toBe(3);
    expect(contextCount(26)).toBe(3);

    const psalm = buildGuessGame(WEB_PSA_23_1_2, 7, englishPool, 'words');
    expect(psalm.given.map((i) => wordOf(psalm, i))).toEqual(['Yahweh', 'I', 'He', 'makes', 'He', 'leads']);
    const john = buildGuessGame(WEB_JHN_3_16, 7, englishPool, 'words');
    expect(john.given.map((i) => wordOf(john, i))).toEqual(['For', 'God', 'so']);
  });

  it('asks every other word once, in reading order, with the answer among the choices exactly once', () => {
    for (const [text, pool] of [
      [WEB_JHN_3_16, englishPool],
      [CUV_JHN_3_16, chinesePool],
      [WEB_PSA_23_1_2, englishPool],
    ] as const) {
      const game = buildGuessGame(text, 11, pool, 'words');
      expect(game.tokens.join(game.separator)).toBe(text);
      const words = game.tokens.map((_, i) => i).filter((i) => wordOf(game, i));
      const asked = game.steps.map((s) => s.tokenIndex);
      // Every word is either handed over or asked, never both.
      expect([...game.given, ...asked].sort((a, b) => a - b)).toEqual(words);
      game.steps.forEach((step, i) => {
        if (i > 0) expect(step.tokenIndex).toBeGreaterThan(game.steps[i - 1].tokenIndex);
        expect(step.shown).toBe('');
        expect(step.units).toHaveLength(1);
        const [{ answer, options }] = step.units;
        expect(answer).toBe(wordOf(game, step.tokenIndex));
        expect(options).toHaveLength(GUESS_CHOICES);
        expect(options.filter((o) => o === answer)).toHaveLength(1);
        // No other spelling of the same word, so the answer is never ambiguous.
        const keys = options.map((o) => o.toLocaleLowerCase());
        expect(new Set(keys).size).toBe(keys.length);
      });
    }
  });

  it('shows bare words, so punctuation never gives the answer away', () => {
    const game = buildGuessGame(WEB_JHN_3_16, 3, englishPool, 'words');
    for (const step of game.steps) {
      for (const option of step.units[0].options) expect(option).toMatch(bare);
    }
    expect(game.steps.map((s) => s.word)).toContain('world');
  });

  it('gives a little word little-word decoys and a capitalised word capitalised decoys', () => {
    const game = buildGuessGame(WEB_JHN_3_16, 5, englishPool, 'words');
    const optionsOf = (word: string) => game.steps.find((s) => s.word === word)?.units[0].options ?? [];
    expect(optionsOf('the').every((o) => !isContentWord(o))).toBe(true);
    expect(optionsOf('Son').every((o) => /^\p{Lu}/u.test(o))).toBe(true);
    expect(optionsOf('loved').every((o) => isContentWord(o))).toBe(true);
    expect(optionsOf('loved')).toHaveLength(GUESS_CHOICES);
  });

  it('gives a Chinese word decoys with the same number of characters', () => {
    const game = buildGuessGame(CUV_JHN_3_16, 9, chinesePool, 'words');
    for (const step of game.steps) {
      const length = Array.from(step.word).length;
      for (const option of step.units[0].options) expect(Array.from(option)).toHaveLength(length);
    }
  });

  it('is the same game for the same seed, and a new seed reshuffles it', () => {
    const a = buildGuessGame(WEB_JHN_3_16, 42, englishPool, 'words');
    expect(buildGuessGame(WEB_JHN_3_16, 42, englishPool, 'words')).toEqual(a);
    expect(buildGuessGame(WEB_JHN_3_16, 43, englishPool, 'words')).not.toEqual(a);
  });

  it('still plays when there is no decoy pool', () => {
    const words = buildGuessGame('Jesus wept.', 1);
    expect(words.kind).toBe('words');
    expect(words.given).toEqual([0]);
    expect(words.steps.map((s) => s.word)).toEqual(['wept']);
    // The passage's own other word is the only decoy there is.
    expect([...words.steps[0].units[0].options].sort()).toEqual(['Jesus', 'wept']);

    const letters = buildGuessGame('Jesus wept.', 1, [], 'letters');
    expect(letters.steps.map((s) => [s.shown, s.units.map((u) => u.answer).join('')])).toEqual([
      ['Jes', 'us'],
      ['wep', 't'],
    ]);
  });
});

describe('guessing helpers', () => {
  it('splits punctuation off a token', () => {
    expect(splitToken('“For')).toEqual({ lead: '“', word: 'For', trail: '' });
    expect(splitToken('world,')).toEqual({ lead: '', word: 'world', trail: ',' });
    expect(splitToken('世人，')).toEqual({ lead: '', word: '世人', trail: '，' });
    expect(splitToken('—')).toEqual({ lead: '—', word: '', trail: '' });
  });

  it('adds up the tries', () => {
    expect(tallyGuesses([1, 1, 3, 2])).toEqual({ units: 4, guesses: 7, firstTry: 2 });
    expect(tallyGuesses([])).toEqual({ units: 0, guesses: 0, firstTry: 0 });
  });
});
