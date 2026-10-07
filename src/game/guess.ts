import { isCjkText, isContentWord, tokenize } from './chunk';
import type { DistractorPassage } from './distractors';
import { mulberry32, shuffle, type Rng } from './random';

/**
 * Two guessing games on scripture, both about redundancy: the part of a
 * message you can predict from what came before.
 *
 * `letters` is Claude Shannon's guessing game. Each word appears with its
 * beginning showing and its ending hidden: the last letter of a short word, the
 * last two of a longer one. The player picks the hidden letters one at a time
 * from a few that could fit there, and every try is counted. Most endings come
 * on the first try, because the start of the word and the words before it
 * already say what they must be; Shannon used this game to show that English is
 * about half redundant. A Chinese word hides its last one or two characters.
 *
 * `words` is next-word prediction, the game a language model plays. Each
 * sentence opens with a few words handed over as context; every word after
 * them is picked from a few choices before it appears.
 *
 * In both, only what came before is on the page. Tokens come from the Sequence
 * tokenizer, so the words and their punctuation rejoin into the passage
 * exactly, and nothing a choice shows carries punctuation that would give the
 * answer away.
 */

export type GuessKind = 'letters' | 'words';

/** Choices offered for each word or hidden letter. */
export const GUESS_CHOICES = 4;

/** One thing to guess: a whole word, or one hidden letter of a word. */
export interface GuessUnit {
  answer: string;
  /** The choices, shuffled, `answer` among them once. */
  options: string[];
}

export interface GuessStep {
  /** Index of this word's token in `GuessGame.tokens`. */
  tokenIndex: number;
  /** The word, without the punctuation around it. */
  word: string;
  /** The start of the word on show while it is guessed ('' in `words`). */
  shown: string;
  /** Guessed in order: the word itself, or each hidden letter. */
  units: GuessUnit[];
}

export interface GuessGame {
  kind: GuessKind;
  /** Every token of the passage, punctuation attached, in order. */
  tokens: string[];
  /** One step per guessed word, in reading order. */
  steps: GuessStep[];
  /** Token indices handed over as context, never guessed (each sentence's opening words). */
  given: number[];
  /** How tokens rejoin into the passage: '' for Chinese, ' ' otherwise. */
  separator: '' | ' ';
}

export interface GuessTally {
  /** Things guessed: words in `words`, hidden letters in `letters`. */
  units: number;
  /** All tries, right and wrong. */
  guesses: number;
  /** Units right on the first try. */
  firstTry: number;
}

const LEADING = /^[^\p{L}\p{N}]+/u;
const TRAILING = /[^\p{L}\p{N}]+$/u;
const SENTENCE_END = /[.!?;:。！？；：]/u;
const LETTER = /^\p{L}$/u;
/** Decoys come from the answer's own script: a, b, c for an English letter, 字 for a Chinese one. */
const SCRIPTS = [/^[a-z]$/i, /^\p{Script=Han}$/u, /^\p{Script=Hangul}$/u];
const scriptOf = (ch: string): number => SCRIPTS.findIndex((script) => script.test(ch));

/** A token split into the word and the punctuation around it. */
export function splitToken(token: string): { lead: string; word: string; trail: string } {
  const lead = token.match(LEADING)?.[0] ?? '';
  const rest = token.slice(lead.length);
  const trail = rest.match(TRAILING)?.[0] ?? '';
  return { lead, word: rest.slice(0, rest.length - trail.length), trail };
}

const chars = (word: string): string[] => Array.from(word);

/**
 * How many letters at the end of a word are hidden in the `letters` game: none
 * for a one-letter word (nothing would be left to read), the last one for a
 * short word, the last two for a long one. A Chinese word counts characters.
 */
export function hiddenCount(word: string): number {
  const letters = chars(word);
  const n = letters.length;
  const longFrom = isCjkText(word) ? 4 : 5;
  if (n <= 1) return 0;
  // Only letters are hidden: "don't" hides its t, never the apostrophe.
  let run = 0;
  while (run < n && /\p{L}/u.test(letters[n - 1 - run])) run++;
  return Math.min(n >= longFrom ? 2 : 1, run, n - 1);
}

/** Opening words of a sentence handed over as context in the `words` game. */
export function contextCount(sentenceWords: number): number {
  if (sentenceWords <= 1) return sentenceWords;
  return Math.min(3, Math.max(1, Math.round(sentenceWords * 0.25)));
}

const keyOf = (word: string): string => word.toLocaleLowerCase();
const capitalised = (word: string): boolean => /^\p{Lu}/u.test(word);

interface Candidate {
  word: string;
  key: string;
  content: boolean;
  capital: boolean;
  length: number;
}

function vocabulary(texts: string[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const text of texts) {
    for (const token of tokenize(text)) {
      const { word } = splitToken(token);
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push({
        word,
        key: keyOf(word),
        content: isContentWord(word),
        capital: capitalised(word),
        length: chars(word).length,
      });
    }
  }
  return out;
}

/** Word decoys most like the answer first; never another spelling of it. */
function wordDecoys(answer: string, pool: Candidate[], count: number, chinese: boolean, rng: Rng): string[] {
  const key = keyOf(answer);
  const content = isContentWord(answer);
  const capital = capitalised(answer);
  const length = chars(answer).length;
  const usable = shuffle(pool.filter((c) => c.key !== key), rng);
  const tiers: ((c: Candidate) => boolean)[] = [
    (c) => c.content === content && (chinese ? c.length === length : c.capital === capital),
    (c) => c.content === content,
    () => true,
  ];
  const chosen: string[] = [];
  const chosenKeys = new Set<string>();
  for (const fits of tiers) {
    for (const c of usable) {
      if (chosen.length >= count) return chosen;
      if (chosenKeys.has(c.key) || !fits(c)) continue;
      chosen.push(c.word);
      chosenKeys.add(c.key);
    }
  }
  return chosen;
}

/**
 * Decoys for the hidden letter at `position` of a word: first the letters other
 * words starting the same way have there ("Go" → o, l, s beside God's d; 世 → 界,
 * 代), then what words of the same length have there, then any letter. They
 * take the answer's case, so the case never gives it away.
 */
function letterDecoys(word: string, position: number, pool: Candidate[], count: number, rng: Rng): string[] {
  const letters = chars(word);
  const answer = letters[position];
  const prefix = keyOf(letters.slice(0, position).join(''));
  const upper = answer !== answer.toLocaleLowerCase();
  const script = scriptOf(answer);
  const at = (c: Candidate) => chars(c.key)[position];
  const tiers: string[][] = [
    pool.filter((c) => c.length > position && c.key.startsWith(prefix)).map(at),
    pool.filter((c) => c.length === letters.length).map(at),
    pool.flatMap((c) => chars(c.key)),
  ];
  const chosen: string[] = [];
  const seen = new Set([keyOf(answer)]);
  for (const tier of tiers) {
    for (const ch of shuffle(tier, rng)) {
      if (chosen.length >= count) return chosen;
      if (!ch || seen.has(ch) || !LETTER.test(ch) || (script >= 0 && scriptOf(ch) !== script)) continue;
      chosen.push(upper ? ch.toLocaleUpperCase() : ch);
      seen.add(ch);
    }
  }
  return chosen;
}

/** Token indices of each sentence's words, in order. */
function sentences(tokens: string[]): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  tokens.forEach((token, index) => {
    const { word, trail } = splitToken(token);
    if (word) current.push(index);
    if (SENTENCE_END.test(trail) && current.length > 0) {
      out.push(current);
      current = [];
    }
  });
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Build one game for a passage. Deterministic for a given `seed`, so a replay
 * with a new seed reshuffles the choices without fetching anything.
 */
export function buildGuessGame(
  text: string,
  seed: number,
  pool: DistractorPassage[] = [],
  kind: GuessKind = 'words',
  choices: number = GUESS_CHOICES,
): GuessGame {
  const chinese = isCjkText(text);
  const tokens = tokenize(text).filter((token) => token.length > 0);
  const rng = mulberry32(seed);
  const candidates = vocabulary([text, ...pool.map((p) => p.text)]);
  const decoys = Math.max(0, choices - 1);
  const steps: GuessStep[] = [];
  const given: number[] = [];

  if (kind === 'words') {
    for (const sentence of sentences(tokens)) {
      given.push(...sentence.slice(0, contextCount(sentence.length)));
    }
    const handed = new Set(given);
    tokens.forEach((token, tokenIndex) => {
      const { word } = splitToken(token);
      if (!word || handed.has(tokenIndex)) return;
      const options = shuffle([word, ...wordDecoys(word, candidates, decoys, chinese, rng)], rng);
      steps.push({ tokenIndex, word, shown: '', units: [{ answer: word, options }] });
    });
  } else {
    tokens.forEach((token, tokenIndex) => {
      const { word } = splitToken(token);
      const letters = chars(word);
      const hidden = hiddenCount(word);
      if (hidden === 0) return;
      const start = letters.length - hidden;
      const units: GuessUnit[] = letters.slice(start).map((answer, i) => ({
        answer,
        options: shuffle([answer, ...letterDecoys(word, start + i, candidates, decoys, rng)], rng),
      }));
      steps.push({ tokenIndex, word, shown: letters.slice(0, start).join(''), units });
    });
  }

  return {
    kind,
    tokens,
    steps,
    given,
    separator: chinese ? '' : ' ',
  };
}

/** Totals for the end screen, from the number of tries each unit took. */
export function tallyGuesses(tries: number[]): GuessTally {
  return {
    units: tries.length,
    guesses: tries.reduce((sum, n) => sum + n, 0),
    firstTry: tries.filter((n) => n === 1).length,
  };
}
