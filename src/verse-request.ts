import {
  DEFAULT_VERSE_DIFFICULTY,
  isVerseDifficulty,
  type VerseDifficulty,
} from './game/verse-modes';
import {
  bibleIdTranslation,
  isTranslationKey,
  type TranslationKey,
} from './translation-config';

/**
 * A verse the player picked, addressed exactly the way YouVersion addresses it.
 *
 * The whole point is that ONE identifier travels everywhere unchanged: the
 * picker builds it, the share link carries it (`?passage=JHN.3.16`), and the
 * Worker hands it straight to YouVersion's passages endpoint. Anything already
 * holding a YouVersion passage id can deep-link into a game without a lookup
 * table, and anything reading our link can go back to YouVersion the same way.
 */
export interface VerseRequest {
  /** USFM book id, e.g. "JHN", "1CO", "PSA". */
  book: string;
  chapter: number;
  /** First verse (inclusive). */
  verse: number;
  /** Last verse of a range (inclusive). Omitted for a single verse. */
  endVerse?: number;
}

/** Longest range the picker offers — enough for Psalm 23 without a wall of tiles. */
export const MAX_VERSE_SPAN = 8;

// USFM book ids are always exactly three characters, and a numbered book leads
// with its digit (1SA, 2KI) — matching the Worker's own guard.
const PASSAGE_ID_PATTERN = /^([A-Z0-9]{3})\.(\d+)\.(\d+)(?:-(\d+))?$/;

/** YouVersion passage id: "JHN.3.16", or "PSA.23.1-3" for a range. */
export function formatPassageId(request: VerseRequest): string {
  const { book, chapter, verse, endVerse } = request;
  const span =
    endVerse !== undefined && endVerse > verse ? `${verse}-${endVerse}` : `${verse}`;
  return `${book}.${chapter}.${span}`;
}

export function parsePassageId(value: string): VerseRequest | null {
  const match = PASSAGE_ID_PATTERN.exec(value.trim().toUpperCase());
  if (!match) return null;
  const [, book, chapterText, verseText, endText] = match;
  const chapter = Number(chapterText);
  const verse = Number(verseText);
  const endVerse = endText === undefined ? undefined : Number(endText);
  if (chapter < 1 || verse < 1) return null;
  if (endVerse !== undefined && endVerse < verse) return null;
  return {
    book,
    chapter,
    verse,
    ...(endVerse !== undefined && endVerse > verse ? { endVerse } : {}),
  };
}

/** Verse numbers covered by a request, in order. */
export function verseNumbers(request: VerseRequest): number[] {
  const last = Math.max(request.verse, request.endVerse ?? request.verse);
  const numbers: number[] = [];
  for (let verse = request.verse; verse <= last; verse += 1) numbers.push(verse);
  return numbers;
}

export interface VerseLink {
  request: VerseRequest;
  translation?: TranslationKey;
  difficulty: VerseDifficulty;
}

/**
 * Read a deep link. `passage` is required and carries the YouVersion passage
 * id; the edition may be given either as our translation key
 * (`translation=NIV`) or as YouVersion's own numeric Bible id (`version=111`),
 * which is what a bible.com URL contains.
 */
export function readVerseLink(search: string): VerseLink | null {
  const params = new URLSearchParams(search);
  const passage = params.get('passage');
  if (!passage) return null;
  const request = parsePassageId(passage);
  if (!request) return null;

  // The picker cannot select a longer span, so a hand-edited link does not get
  // one either: Psalm 119 in one round would be 176 verses against a 45-second
  // memorize cap.
  const capped: VerseRequest =
    request.endVerse === undefined
      ? request
      : {
          ...request,
          endVerse: Math.min(
            request.endVerse,
            request.verse + MAX_VERSE_SPAN - 1,
          ),
        };

  const key = params.get('translation');
  const version = params.get('version');
  const translation = isTranslationKey(key)
    ? key
    : bibleIdTranslation(Number(version));

  const difficulty = params.get('difficulty');
  return {
    request: capped,
    ...(translation ? { translation } : {}),
    difficulty: isVerseDifficulty(difficulty)
      ? difficulty
      : DEFAULT_VERSE_DIFFICULTY,
  };
}

/** The query string for a share link — the inverse of `readVerseLink`. */
export function verseLinkParams(link: VerseLink): string {
  const params = new URLSearchParams({ passage: formatPassageId(link.request) });
  if (link.translation) params.set('translation', link.translation);
  if (link.difficulty !== DEFAULT_VERSE_DIFFICULTY) {
    params.set('difficulty', link.difficulty);
  }
  return params.toString();
}

/** Absolute share link for the current selection. */
export function verseLinkUrl(link: VerseLink, base: string): string {
  const url = new URL(base);
  url.search = verseLinkParams(link);
  url.hash = '';
  return url.toString();
}
