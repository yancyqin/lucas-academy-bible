import type { TranslationKey } from './translation-config';
import { MAX_VERSE_SPAN, type VerseRequest } from './verse-request';

/**
 * The book/chapter/verse catalogue behind the Pick a Verse picker, served by
 * the Worker's `/api/books` (YouVersion's book list, compacted and cached).
 *
 * Every edition brings its OWN catalogue: the titles are localized by the
 * publisher (创世记 / 창세기 / Genesis) and the chapter and verse counts really
 * do differ between translations, so the picker can never offer a reference
 * the chosen edition does not have.
 */
export type BibleCanon = 'old_testament' | 'new_testament' | 'deuterocanon';

export interface BibleBook {
  /** USFM book id, e.g. "JHN". */
  id: string;
  /** Book name in the edition's own language. */
  title: string;
  canon: BibleCanon;
  /** Highest verse number in each chapter, chapter 1 first. */
  chapters: number[];
  /**
   * Verse numbers that do not exist in this edition, by chapter — only sent
   * where a missing number would fail to load (the local CUV assets).
   */
  gaps?: Record<string, number[]>;
}

export interface BibleBooks {
  translation: { key: string; label: string };
  books: BibleBook[];
}

function isBooks(value: unknown): value is BibleBooks {
  if (!value || typeof value !== 'object') return false;
  const catalogue = value as Partial<BibleBooks>;
  return (
    Array.isArray(catalogue.books) &&
    catalogue.books.length > 0 &&
    catalogue.books.every(
      (book) =>
        typeof book?.id === 'string' &&
        typeof book?.title === 'string' &&
        Array.isArray(book?.chapters) &&
        book.chapters.length > 0,
    )
  );
}

const cache = new Map<TranslationKey, BibleBooks>();

export async function fetchBibleBooks(
  translation: TranslationKey,
  signal?: AbortSignal,
): Promise<BibleBooks> {
  const cached = cache.get(translation);
  if (cached) return cached;

  const params = new URLSearchParams({ translation });
  const response = await fetch(`/api/books?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : 'The list of books could not be loaded.',
    );
  }
  if (!isBooks(data)) throw new Error('The list of books was incomplete.');
  cache.set(translation, data);
  return data;
}

export function findBook(
  books: BibleBook[],
  bookId: string,
): BibleBook | undefined {
  return books.find((book) => book.id === bookId);
}

/** Verse numbers this edition actually has in a chapter (1-based chapter). */
export function chapterVerses(book: BibleBook, chapter: number): number[] {
  const highest = book.chapters[chapter - 1] ?? 0;
  const missing = new Set(book.gaps?.[String(chapter)] ?? []);
  const verses: number[] = [];
  for (let verse = 1; verse <= highest; verse += 1) {
    if (!missing.has(verse)) verses.push(verse);
  }
  return verses;
}

function nearestVerse(verses: number[], wanted: number): number {
  if (verses.length === 0) return 1;
  return verses.reduce((best, verse) =>
    Math.abs(verse - wanted) < Math.abs(best - wanted) ? verse : best,
  );
}

/**
 * Pull a selection back inside what this edition actually has. Editions differ
 * in chapter and verse counts (and the deep link may name anything at all), so
 * every selection passes through here before it can be played.
 */
export function clampRequest(
  books: BibleBook[],
  request: VerseRequest,
): VerseRequest {
  const book = findBook(books, request.book);
  // An edition without that book at all (switching away from a Bible with the
  // deuterocanon, say) starts over rather than landing somewhere unrelated.
  if (!book) {
    const first = books[0];
    return { book: first.id, chapter: 1, verse: chapterVerses(first, 1)[0] ?? 1 };
  }

  const chapter = Math.min(
    Math.max(1, Math.floor(request.chapter)),
    book.chapters.length,
  );
  const available = chapterVerses(book, chapter);
  const verse = nearestVerse(available, Math.max(1, Math.floor(request.verse)));

  if (request.endVerse === undefined) return { book: book.id, chapter, verse };

  const span = available.filter(
    (candidate) =>
      candidate > verse &&
      candidate <= Math.floor(request.endVerse as number) &&
      candidate - verse < MAX_VERSE_SPAN,
  );
  const endVerse = span[span.length - 1];
  return endVerse === undefined
    ? { book: book.id, chapter, verse }
    : { book: book.id, chapter, verse, endVerse };
}

export const CANON_LABELS: Record<BibleCanon, string> = {
  old_testament: 'Old Testament',
  new_testament: 'New Testament',
  deuterocanon: 'Deuterocanon',
};
