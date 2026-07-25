/**
 * Chunking: turn a piece of scripture into ordered "chunks" (tiles).
 *
 * Invariant we always uphold and test: joining the chunks in order with a
 * single space reproduces the source text EXACTLY. We never alter
 * capitalization or punctuation; punctuation stays attached to its word.
 *
 * Two modes:
 *  - 'words'  : every space-separated token is its own chunk (single words).
 *  - 'sizes'  : group consecutive tokens using an explicit list of group
 *               sizes (curated phrase chunks). The sizes must sum to the token
 *               count, otherwise we throw (caught by the validation tests).
 */

export type ChunkSpec = { mode: 'words' } | { mode: 'sizes'; sizes: number[] };

/** Split scripture into single-space-separated tokens. */
export function tokenize(text: string): string[] {
  return text.split(' ');
}

/**
 * Produce ordered chunk strings for one unit of text (a whole passage or a
 * single verse) according to the spec.
 */
export function chunkText(text: string, spec: ChunkSpec): string[] {
  const tokens = tokenize(text);

  if (spec.mode === 'words') {
    return tokens;
  }

  // mode === 'sizes'
  const total = spec.sizes.reduce((a, b) => a + b, 0);
  if (total !== tokens.length) {
    throw new Error(
      `chunk sizes sum to ${total} but text has ${tokens.length} tokens: "${text}"`,
    );
  }
  const chunks: string[] = [];
  let cursor = 0;
  for (const size of spec.sizes) {
    if (size <= 0) throw new Error(`chunk size must be positive, got ${size}`);
    chunks.push(tokens.slice(cursor, cursor + size).join(' '));
    cursor += size;
  }
  return chunks;
}

/** True when joining the chunks with single spaces reproduces `text` exactly. */
export function chunksReproduce(text: string, chunks: string[]): boolean {
  return chunks.join(' ') === text;
}
