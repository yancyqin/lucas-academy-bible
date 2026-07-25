import type { Granularity } from './levels';

/**
 * Turn scripture into ordered chunks (tiles) and into recall sections.
 *
 * Core invariant, upheld everywhere and re-checked by tests: joining the pieces
 * back with a single space reproduces the source text EXACTLY. We only ever
 * group contiguous whitespace-separated tokens — we never alter capitalization
 * or punctuation, and there are no punctuation-only tiles.
 */

export function tokenize(text: string): string[] {
  return text.split(' ');
}

const CLAUSE_END = /[,;:.!?”’")]$/;
const SENTENCE_END = /[.!?][”’")]?$/;

const MAX_WORDS: Record<Granularity, number> = {
  words: 1,
  short: 2,
  phrase: 4,
};

/** Group contiguous tokens, breaking at clause punctuation or a max width. */
function group(tokens: string[], maxWords: number): string[] {
  if (maxWords <= 1) return tokens.slice();
  const chunks: string[] = [];
  let cur: string[] = [];
  for (const tok of tokens) {
    cur.push(tok);
    if (cur.length >= maxWords || CLAUSE_END.test(tok)) {
      chunks.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur.join(' '));
  return chunks;
}

/**
 * Chunk one unit of text into tiles at the given granularity.
 * Guarantees at least two tiles when there are at least two words.
 */
export function autoChunk(text: string, granularity: Granularity): string[] {
  const tokens = tokenize(text);
  if (tokens.length <= 1) return tokens;

  let chunks = group(tokens, MAX_WORDS[granularity]);

  // Never hand back a single tile for a multi-word verse — split in half.
  if (chunks.length < 2) {
    const mid = Math.ceil(tokens.length / 2);
    chunks = [tokens.slice(0, mid).join(' '), tokens.slice(mid).join(' ')];
  }
  return chunks;
}

/** Split text into sentences (contiguous token groups). Rejoins to the source. */
export function splitSentences(text: string): string[] {
  const tokens = tokenize(text);
  const sentences: string[] = [];
  let cur: string[] = [];
  for (const tok of tokens) {
    cur.push(tok);
    if (SENTENCE_END.test(tok)) {
      sentences.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur.join(' '));
  return sentences.length ? sentences : [text];
}

/** True when joining the chunks with single spaces reproduces `text` exactly. */
export function chunksReproduce(text: string, chunks: string[]): boolean {
  return chunks.join(' ') === text;
}
