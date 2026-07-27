import { isContentWord } from './chunk';

const MAX_TARGETS = 5;
const MIN_WORD_LETTERS = 3;
const MAX_WORD_LETTERS = 10;

/** Extra helper words that are useful in a sentence but poor spelling targets. */
const SCRABBLE_FUNCTION_WORDS = new Set([
  'all',
  'also',
  'any',
  'both',
  'can',
  'could',
  'did',
  'do',
  'does',
  'each',
  'either',
  'every',
  'had',
  'has',
  'have',
  'having',
  'here',
  'may',
  'might',
  'more',
  'most',
  'much',
  'must',
  'neither',
  'other',
  'same',
  'shall',
  'should',
  'some',
  'there',
  'then',
  'very',
  'will',
  'would',
]);

export interface ScrabbleLetter {
  id: string;
  char: string;
}

export interface ScrabbleTarget {
  id: string;
  tokenIndex: number;
  word: string;
  answer: string[];
  letters: ScrabbleLetter[];
}

export interface DailyScrabblePuzzle {
  tokens: string[];
  targets: ScrabbleTarget[];
}

interface Candidate {
  tokenIndex: number;
  word: string;
  normalized: string;
}

function wordFromToken(token: string): string {
  return Array.from(token)
    .filter((character) => /\p{L}/u.test(character))
    .join('');
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number): () => number {
  let state = seed || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledLetters(word: string, targetId: string, seed: number): ScrabbleLetter[] {
  const letters = Array.from(word).map((char, index) => ({
    id: `${targetId}-letter-${index}`,
    char: char.toLocaleUpperCase('en-US'),
  }));
  const random = randomFrom(seed);

  for (let index = letters.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [letters[index], letters[swapIndex]] = [letters[swapIndex], letters[index]];
  }

  const answer = word.toLocaleUpperCase('en-US');
  if (
    letters.length > 1 &&
    letters.some((letter) => letter.char !== letters[0].char) &&
    letters.map((letter) => letter.char).join('') === answer
  ) {
    letters.push(letters.shift() as ScrabbleLetter);
  }

  return letters;
}

function evenlySpaced(candidates: Candidate[], count: number): Candidate[] {
  if (candidates.length <= count) return candidates;
  if (count === 1) return [candidates[Math.floor(candidates.length / 2)]];

  const selected: Candidate[] = [];
  const used = new Set<number>();
  for (let slot = 0; slot < count; slot += 1) {
    const ideal = Math.round((slot * (candidates.length - 1)) / (count - 1));
    let offset = 0;
    while (offset < candidates.length) {
      const before = ideal - offset;
      const after = ideal + offset;
      const candidateIndex =
        before >= 0 && !used.has(before)
          ? before
          : after < candidates.length && !used.has(after)
            ? after
            : -1;
      if (candidateIndex >= 0) {
        used.add(candidateIndex);
        selected.push(candidates[candidateIndex]);
        break;
      }
      offset += 1;
    }
  }

  return selected.sort((a, b) => a.tokenIndex - b.tokenIndex);
}

function candidatesFor(tokens: string[], minimum: number, maximum: number): Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  tokens.forEach((token, tokenIndex) => {
    const word = wordFromToken(token);
    const normalized = word.toLocaleLowerCase('en-US');
    if (
      word.length < minimum ||
      word.length > maximum ||
      !isContentWord(token) ||
      SCRABBLE_FUNCTION_WORDS.has(normalized) ||
      seen.has(normalized)
    ) {
      return;
    }
    seen.add(normalized);
    candidates.push({ tokenIndex, word, normalized });
  });

  return candidates;
}

/** Build a deterministic, phone-sized spelling puzzle from a Daily Verse. */
export function buildDailyScrabble(text: string, puzzleKey = text): DailyScrabblePuzzle {
  // Some API passages omit a space after punctuation (for example "One,to").
  // Repair that display-only boundary before creating words and blanks.
  const tokens = text
    .trim()
    .replace(/([,;:!?])(?=\p{L})/gu, '$1 ')
    .split(/\s+/)
    .filter(Boolean);
  let candidates = candidatesFor(tokens, MIN_WORD_LETTERS, MAX_WORD_LETTERS);

  // Very short passages still deserve a puzzle; relax length only when needed.
  if (candidates.length < 2) {
    candidates = candidatesFor(tokens, 2, MAX_WORD_LETTERS);
  }

  const selected = evenlySpaced(candidates, Math.min(MAX_TARGETS, candidates.length));
  const baseSeed = hashString(`${puzzleKey}:${text}`);
  const targets = selected.map((candidate, index) => {
    const id = `scrabble-word-${candidate.tokenIndex}`;
    return {
      id,
      tokenIndex: candidate.tokenIndex,
      word: candidate.word,
      answer: Array.from(candidate.word).map((character) =>
        character.toLocaleUpperCase('en-US'),
      ),
      letters: shuffledLetters(
        candidate.word,
        id,
        baseSeed ^ Math.imul(index + 1, 0x45d9f3b),
      ),
    };
  });

  return { tokens, targets };
}

export const DAILY_SCRABBLE_MAX_TARGETS = MAX_TARGETS;
