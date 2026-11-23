/**
 * The two public-domain editions the app carries with it — WEB (English) and
 * CUV (中文) — are read straight from bundled per-book files under
 * `public/web/` and `public/cuv/` (built by scripts/build_bible_assets.py).
 * No request leaves the device for them, on the web site or in the offline
 * App Store build. Licensed editions still go through the Worker.
 *
 * The shapes returned here match the Worker's `/api/books` and
 * `/api/passage` responses exactly, so the rest of the app cannot tell where
 * a passage came from.
 */

import type { BibleBooks } from './books';
import { TRANSLATIONS, type TranslationKey } from './translation-config';
import type { YouVersionPassage, YouVersionTranslation } from './youversion';

export type LocalTranslationKey = 'WEB' | 'CUV';

interface LocalEdition {
  directory: string;
  /** Verses in a range are joined with this (Chinese runs on, English spaces). */
  joiner: string;
  translation: YouVersionTranslation;
}

const LOCAL_EDITIONS: Record<LocalTranslationKey, LocalEdition> = {
  WEB: {
    directory: 'web',
    joiner: ' ',
    translation: {
      key: 'WEB',
      label: TRANSLATIONS.WEB.label,
      id: TRANSLATIONS.WEB.bibleId,
      abbreviation: 'WEB',
      source: 'bundled',
      title: 'World English Bible Classic',
      copyright: 'Public Domain',
      promotionalContent: '',
      youVersionDeepLink: 'https://ebible.org/details.php?id=eng-web',
    },
  },
  CUV: {
    directory: 'cuv',
    joiner: '',
    translation: {
      key: 'CUV',
      label: TRANSLATIONS.CUV.label,
      id: TRANSLATIONS.CUV.bibleId,
      abbreviation: 'CUV',
      source: 'bundled',
      title: 'Chinese Union Version (Simplified)',
      copyright: 'Public Domain',
      promotionalContent: '',
      youVersionDeepLink: 'https://ebible.org/details.php?id=cmn-cu89s',
    },
  },
};

export function isLocalTranslation(
  translation: TranslationKey,
): translation is LocalTranslationKey {
  return translation in LOCAL_EDITIONS;
}

/** Where the bundled files live, honouring the build's base path. */
function assetUrl(directory: string, file: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${directory}/${file}`;
}

async function loadJson(
  url: string,
  unavailable: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(unavailable);
  return response.json().catch(() => {
    throw new Error(unavailable);
  });
}

const PASSAGE_UNAVAILABLE = 'That Bible passage could not be loaded.';
const BOOKS_UNAVAILABLE = 'The list of books could not be loaded.';

interface LocalBookFile {
  book: string;
  chapters: Record<string, Record<string, string>>;
}

function isBookFile(value: unknown): value is LocalBookFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<LocalBookFile>;
  return typeof file.book === 'string' && !!file.chapters && typeof file.chapters === 'object';
}

const bookCache = new Map<string, Promise<LocalBookFile>>();

function loadBook(
  translation: LocalTranslationKey,
  book: string,
  signal?: AbortSignal,
): Promise<LocalBookFile> {
  const key = `${translation}:${book}`;
  const cached = bookCache.get(key);
  if (cached) return cached;
  const pending = loadJson(
    assetUrl(LOCAL_EDITIONS[translation].directory, `${book}.json`),
    PASSAGE_UNAVAILABLE,
    signal,
  ).then((data) => {
    if (!isBookFile(data)) throw new Error(PASSAGE_UNAVAILABLE);
    return data;
  });
  // A failed or aborted load must not poison the cache.
  pending.catch(() => bookCache.delete(key));
  bookCache.set(key, pending);
  return pending;
}

export async function fetchLocalBooks(
  translation: LocalTranslationKey,
  signal?: AbortSignal,
): Promise<BibleBooks> {
  const edition = LOCAL_EDITIONS[translation];
  const index = (await loadJson(
    assetUrl(edition.directory, 'index.json'),
    BOOKS_UNAVAILABLE,
    signal,
  )) as { books?: BibleBooks['books'] };
  if (!Array.isArray(index?.books) || index.books.length === 0) {
    throw new Error(BOOKS_UNAVAILABLE);
  }
  return {
    translation: { key: edition.translation.key, label: edition.translation.label },
    books: index.books,
  };
}

const PASSAGE_ID = /^([A-Z0-9]{3})\.(\d+)\.(\d+)(?:-(\d+))?$/;

export async function fetchLocalPassage(
  translation: LocalTranslationKey,
  passageId: string,
  signal?: AbortSignal,
): Promise<YouVersionPassage> {
  const match = PASSAGE_ID.exec(passageId);
  if (!match) throw new Error('That passage reference is not valid.');
  const [, book, chapterText, firstText, lastText] = match;
  const first = Number(firstText);
  const last = Number(lastText ?? firstText);
  const edition = LOCAL_EDITIONS[translation];
  const file = await loadBook(translation, book, signal);
  const chapter = file.chapters[chapterText];
  const verses: string[] = [];
  for (let verse = first; verse <= last; verse += 1) {
    const text = chapter?.[String(verse)];
    if (typeof text !== 'string' || !text) {
      throw new Error(`${file.book} ${chapterText}:${verse} is not in this edition.`);
    }
    verses.push(text);
  }
  const range = first === last ? String(first) : `${first}-${last}`;
  return {
    passageId,
    reference: `${file.book} ${chapterText}:${range}`,
    text: verses.join(edition.joiner).trim(),
    cache: 'HIT',
    translation: edition.translation,
  };
}

export const LOCAL_BOOK_CACHE_FOR_TESTS = bookCache;
