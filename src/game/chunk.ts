/**
 * Turn scripture into ordered chunks (tiles) and into recall sections.
 *
 * Core invariant, upheld everywhere and re-checked by tests: joining the pieces
 * reproduces the source text EXACTLY. English uses spaces; Chinese uses
 * Intl.Segmenter word boundaries and rejoins without inserting spaces.
 *
 * Tiles are CONTENT-word based: each tile carries exactly one content word plus
 * any little function words (虚词 — articles, prepositions, pronouns, conjunctions,
 * the copula…) that lean on it. A lone "the" / "of" / "him" is never its own tile,
 * because that reads as meaningless/confusing.
 */

export function isCjkText(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function chineseTokens(text: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale: string,
        options: { granularity: 'word' },
      ) => {
        segment(input: string): Iterable<{ segment: string }>;
      };
    }
  ).Segmenter;
  const raw =
    typeof Segmenter === 'function'
      ? Array.from(
          new Segmenter('zh', { granularity: 'word' }).segment(text),
          ({ segment }) => segment,
        )
      : Array.from(text);
  const tokens: string[] = [];
  let prefix = '';

  for (const segment of raw) {
    if (/^[\p{L}\p{N}]+$/u.test(segment)) {
      tokens.push(prefix + segment);
      prefix = '';
      continue;
    }
    if (tokens.length > 0) {
      tokens[tokens.length - 1] += segment;
    } else {
      prefix += segment;
    }
  }
  if (prefix) tokens.push(prefix);
  return tokens.filter(Boolean);
}

export function tokenize(text: string): string[] {
  return isCjkText(text) ? chineseTokens(text) : text.split(' ');
}

export function joinChunks(chunks: string[]): string {
  return chunks.join(chunks.some(isCjkText) ? '' : ' ');
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

/** Common Chinese particles, connectors, pronouns, and structural words. */
export const CHINESE_FUNCTION_WORDS = new Set<string>([
  '的', '了', '着', '著', '过', '過', '地', '得',
  '和', '与', '與', '及', '或', '而', '但', '却', '卻', '也', '又', '还', '還',
  '在', '从', '從', '向', '对', '對', '于', '於', '为', '為', '被', '把', '将', '將',
  '是', '有', '无', '無', '不', '没有', '沒有',
  '我', '你', '他', '她', '它', '我们', '我們', '你们', '你們', '他们', '他們',
  '她们', '她們', '它们', '它們', '这', '這', '那', '这些', '這些', '那些',
  '我的', '你的', '他的', '她的', '它的', '我们的', '我們的', '你们的', '你們的',
  '他们的', '他們的', '她们的', '她們的', '它们的', '它們的',
  '其', '自己', '谁', '誰', '什么', '什麼', '哪', '一个', '一個',
]);

/** A token is "content" unless its bare word is a function word. */
export function isContentWord(token: string): boolean {
  const bare = token
    .replace(/[^\p{L}\p{N}'’-]/gu, '')
    .replace(/^['’-]+|['’-]+$/g, '')
    .toLowerCase();
  return (
    bare.length > 0 &&
    !FUNCTION_WORDS.has(bare) &&
    !CHINESE_FUNCTION_WORDS.has(bare)
  );
}

function groupChineseChunks(
  chunks: string[],
  granularity: 'words' | 'short' | 'phrase',
): string[] {
  const groupSize = granularity === 'phrase' ? 3 : granularity === 'short' ? 2 : 1;
  if (groupSize === 1 || chunks.length <= 2) return chunks;
  const grouped: string[] = [];
  for (let index = 0; index < chunks.length; index += groupSize) {
    grouped.push(chunks.slice(index, index + groupSize).join(''));
  }
  return grouped.length === 1 ? chunks : grouped;
}

/**
 * Chunk one unit of text into tiles. Every tile ends on a content word, so
 * leading 虚词 attach forward to it; any trailing 虚词 attach to the last tile.
 */
export function autoChunk(
  text: string,
  granularity: 'words' | 'short' | 'phrase' = 'words',
): string[] {
  const tokens = tokenize(text);
  if (tokens.length <= 1) return tokens;

  const chunks: string[] = [];
  let cur: string[] = [];
  const separator = isCjkText(text) ? '' : ' ';
  for (const tok of tokens) {
    cur.push(tok);
    if (isContentWord(tok)) {
      chunks.push(cur.join(separator));
      cur = [];
    }
  }
  if (cur.length) {
    // trailing function words with no following content word
    if (chunks.length) {
      chunks[chunks.length - 1] += separator + cur.join(separator);
    } else {
      chunks.push(cur.join(separator));
    }
  }
  return isCjkText(text)
    ? groupChineseChunks(chunks, granularity)
    : chunks;
}

/** Split text into sentences (contiguous token groups). Rejoins to the source. */
export function splitSentences(text: string): string[] {
  if (isCjkText(text)) {
    return (
      text.match(/[^。！？!?]+[。！？!?]+[”’"」』】）)]*|[^。！？!?]+$/gu) ??
      [text]
    );
  }
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
  return joinChunks(chunks) === text;
}
