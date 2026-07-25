/**
 * Turn scripture into ordered chunks (tiles) and into recall sections.
 *
 * Core invariant, upheld everywhere and re-checked by tests: joining the pieces
 * back with a single space reproduces the source text EXACTLY. We only ever
 * group contiguous whitespace-separated tokens — we never alter capitalization
 * or punctuation, and there are no punctuation-only tiles.
 *
 * Tiles are CONTENT-word based: each tile carries exactly one content word plus
 * any little function words (虚词 — articles, prepositions, pronouns, conjunctions,
 * the copula…) that lean on it. A lone "the" / "of" / "him" is never its own tile,
 * because that reads as meaningless/confusing.
 */

export function tokenize(text: string): string[] {
  return text.split(' ');
}

const SENTENCE_END = /[.!?][”’")]?$/;

/** 虚词 that should never stand alone as a tile — they attach to a content word. */
export const FUNCTION_WORDS = new Set<string>([
  // articles
  'a', 'an', 'the',
  // conjunctions / connectors
  'and', 'or', 'but', 'nor', 'for', 'as', 'so', 'yet', 'than', 'if',
  // prepositions
  'of', 'to', 'in', 'on', 'at', 'by', 'from', 'with', 'into', 'unto', 'onto',
  'upon', 'out', 'up', 'off', 'over', 'under', 'about', 'through',
  // pronouns / determiners
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  'who', 'whom', 'whose', 'which', 'this', 'that', 'these', 'those',
  // copula
  'is', 'are', 'was', 'were', 'be', 'am', 'been', 'being',
  // particles
  'not', 'no', 'o', 'oh',
]);

/** A token is "content" unless its bare word is a function word. */
export function isContentWord(token: string): boolean {
  const bare = token
    .replace(/[^\p{L}\p{N}'’-]/gu, '')
    .replace(/^['’-]+|['’-]+$/g, '')
    .toLowerCase();
  return bare.length > 0 && !FUNCTION_WORDS.has(bare);
}

/**
 * Chunk one unit of text into tiles. Every tile ends on a content word, so
 * leading 虚词 attach forward to it; any trailing 虚词 attach to the last tile.
 */
export function autoChunk(text: string): string[] {
  const tokens = tokenize(text);
  if (tokens.length <= 1) return tokens;

  const chunks: string[] = [];
  let cur: string[] = [];
  for (const tok of tokens) {
    cur.push(tok);
    if (isContentWord(tok)) {
      chunks.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) {
    // trailing function words with no following content word
    if (chunks.length) chunks[chunks.length - 1] += ' ' + cur.join(' ');
    else chunks.push(cur.join(' '));
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
