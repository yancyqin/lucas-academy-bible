import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chapterVerses,
  clampRequest,
  fetchBibleBooks,
  findBook,
  type BibleBook,
} from '../../books';

const john: BibleBook = {
  id: 'JHN',
  title: 'John',
  canon: 'new_testament',
  chapters: [51, 25, 36],
};

const psalms: BibleBook = {
  id: 'PSA',
  title: '诗篇',
  canon: 'old_testament',
  // CUV merges a couple of verses away in Psalm 8 — 7 and 8 have no text.
  chapters: [6, 12, 9],
  gaps: { 3: [7, 8] },
};

const books = [psalms, john];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('book catalogue', () => {
  it('offers only the verses an edition actually has', () => {
    expect(chapterVerses(john, 2)).toHaveLength(25);
    expect(chapterVerses(psalms, 3)).toEqual([1, 2, 3, 4, 5, 6, 9]);
    expect(chapterVerses(john, 99)).toEqual([]);
  });

  it('finds a book by its USFM id', () => {
    expect(findBook(books, 'JHN')).toBe(john);
    expect(findBook(books, 'REV')).toBeUndefined();
  });
});

describe('clamping a selection to an edition', () => {
  it('leaves a valid selection alone', () => {
    expect(clampRequest(books, { book: 'JHN', chapter: 3, verse: 16 })).toEqual({
      book: 'JHN',
      chapter: 3,
      verse: 16,
    });
  });

  it('starts over when this edition lacks the book chosen', () => {
    expect(clampRequest(books, { book: 'SIR', chapter: 51, verse: 30 })).toEqual({
      book: 'PSA',
      chapter: 1,
      verse: 1,
    });
  });

  it('leaves the request alone when there is no catalogue to clamp against', () => {
    const request = { book: 'JHN', chapter: 3, verse: 16 };
    expect(clampRequest([], request)).toEqual(request);
  });

  it('pulls the chapter and verse back inside the book', () => {
    expect(clampRequest(books, { book: 'JHN', chapter: 40, verse: 200 })).toEqual({
      book: 'JHN',
      chapter: 3,
      verse: 36,
    });
  });

  it('moves off a verse number this edition merged away', () => {
    expect(clampRequest(books, { book: 'PSA', chapter: 3, verse: 7 })).toEqual({
      book: 'PSA',
      chapter: 3,
      verse: 6,
    });
  });

  it('trims a range to the chapter and to the longest span offered', () => {
    expect(
      clampRequest(books, { book: 'JHN', chapter: 2, verse: 24, endVerse: 40 }),
    ).toEqual({ book: 'JHN', chapter: 2, verse: 24, endVerse: 25 });
    expect(
      clampRequest(books, { book: 'JHN', chapter: 1, verse: 1, endVerse: 30 }),
    ).toEqual({ book: 'JHN', chapter: 1, verse: 1, endVerse: 8 });
  });

  it('drops a range that no longer reaches past its first verse', () => {
    expect(
      clampRequest(books, { book: 'JHN', chapter: 2, verse: 25, endVerse: 26 }),
    ).toEqual({ book: 'JHN', chapter: 2, verse: 25 });
  });
});

describe('loading the catalogue', () => {
  it('asks the Worker once per edition and reuses the answer', async () => {
    const api = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe('/api/books?translation=KLB');
      return Response.json({ translation: { key: 'KLB', label: 'KLB' }, books });
    });
    vi.stubGlobal('fetch', api);

    const first = await fetchBibleBooks('KLB');
    const second = await fetchBibleBooks('KLB');

    expect(first.books).toHaveLength(2);
    expect(second).toBe(first);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('surfaces the Worker’s own message when the list cannot load', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: 'books_unavailable', message: 'The book list could not be loaded.' },
        { status: 502 },
      ),
    );

    await expect(fetchBibleBooks('CCB')).rejects.toThrow(
      'The book list could not be loaded.',
    );
  });

  it('rejects an incomplete catalogue rather than showing empty pickers', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ books: [] }));

    await expect(fetchBibleBooks('CCBT')).rejects.toThrow(
      'The list of books was incomplete.',
    );
  });
});
