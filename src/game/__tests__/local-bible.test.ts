import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLocalBooks,
  fetchLocalPassage,
  isLocalTranslation,
  LOCAL_BOOK_CACHE_FOR_TESTS,
} from '../../local-bible';
import { fetchBibleBooks } from '../../books';
import { attributionFor, fetchBiblePassage } from '../../youversion';

const cuvIndex = {
  translation: 'CUV',
  books: [
    { id: 'JHN', title: '约翰福音', canon: 'new_testament', chapters: [51, 25, 36] },
  ],
};
const cuvJohn = {
  book: '约翰福音',
  chapters: { '3': { '16': '神爱世人，', '17': '因为　神差他的儿子降世，' }, '11': { '35': '耶稣哭了。' } },
};
const webJohn = {
  book: 'John',
  chapters: { '3': { '16': 'For God so loved the world,', '17': 'For God didn’t send his Son' } },
};

function stubFiles(files: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url in files) return Response.json(files[url]);
    return new Response('', { status: 404 });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  LOCAL_BOOK_CACHE_FOR_TESTS.clear();
});

describe('bundled editions', () => {
  it('knows which editions ship with the app', () => {
    expect(isLocalTranslation('WEB')).toBe(true);
    expect(isLocalTranslation('CUV')).toBe(true);
    expect(isLocalTranslation('NIV')).toBe(false);
    expect(isLocalTranslation('KLB')).toBe(false);
  });

  it('reads the catalogue from the bundled index, never from /api', async () => {
    const calls = stubFiles({ '/cuv/index.json': cuvIndex });
    const books = await fetchLocalBooks('CUV');
    expect(books.translation).toEqual({ key: 'CUV', label: 'CUV' });
    expect(books.books[0].title).toBe('约翰福音');
    expect(calls).toEqual(['/cuv/index.json']);
  });

  it('joins Chinese verses without spaces and English verses with one', async () => {
    stubFiles({ '/cuv/JHN.json': cuvJohn, '/web/JHN.json': webJohn });
    const zh = await fetchLocalPassage('CUV', 'JHN.3.16-17');
    expect(zh.text).toBe('神爱世人，因为　神差他的儿子降世，');
    expect(zh.reference).toBe('约翰福音 3:16-17');
    expect(zh.translation.copyright).toBe('Public Domain');
    const en = await fetchLocalPassage('WEB', 'JHN.3.16-17');
    expect(en.text).toBe('For God so loved the world, For God didn’t send his Son');
    expect(en.reference).toBe('John 3:16-17');
  });

  it('loads a book file once and serves later verses from memory', async () => {
    const calls = stubFiles({ '/cuv/JHN.json': cuvJohn });
    await fetchLocalPassage('CUV', 'JHN.3.16');
    await fetchLocalPassage('CUV', 'JHN.11.35');
    expect(calls).toEqual(['/cuv/JHN.json']);
  });

  it('rejects a verse the edition does not have, and a malformed id', async () => {
    stubFiles({ '/cuv/JHN.json': cuvJohn });
    await expect(fetchLocalPassage('CUV', 'JHN.3.99')).rejects.toThrow(
      '约翰福音 3:99 is not in this edition.',
    );
    await expect(fetchLocalPassage('CUV', 'john 3 16')).rejects.toThrow(
      'That passage reference is not valid.',
    );
  });

  it('does not cache a failed book load', async () => {
    const calls = stubFiles({});
    await expect(fetchLocalPassage('WEB', 'JHN.3.16')).rejects.toThrow(
      'That Bible passage could not be loaded.',
    );
    await expect(fetchLocalPassage('WEB', 'JHN.3.16')).rejects.toThrow();
    expect(calls).toEqual(['/web/JHN.json', '/web/JHN.json']);
  });

  it('is what the shared loaders use for WEB and CUV', async () => {
    const calls = stubFiles({ '/web/index.json': { translation: 'WEB', books: cuvIndex.books }, '/web/JHN.json': webJohn });
    const books = await fetchBibleBooks('WEB');
    expect(books.translation.key).toBe('WEB');
    // John 3:17 is outside the curated selection, so it is read from the book file.
    const passage = await fetchBiblePassage('WEB', 'JHN.3.17');
    expect(passage.text).toBe('For God didn’t send his Son');
    expect(attributionFor(passage.translation).sourceLabel).toBe('eBible.org');
    expect(calls).toContain('/web/JHN.json');
    expect(calls.every((url) => !url.startsWith('/api/'))).toBe(true);
  });
});
