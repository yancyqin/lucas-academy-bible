import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { LOCAL_BOOK_CACHE_FOR_TESTS } from '../../local-bible';

const catalogue = {
  translation: { key: 'WEB', label: 'WEB' },
  books: [
    { id: 'PSA', title: 'Psalms', canon: 'old_testament', chapters: [6, 12, 8] },
    { id: 'JHN', title: 'John', canon: 'new_testament', chapters: [51, 25, 36] },
  ],
};

const john316 = {
  passageId: 'JHN.3.16',
  reference: 'John 3:16',
  text: 'For God so loved the world, that he gave his only born Son.',
  cache: 'HIT',
  translation: {
    key: 'WEB',
    label: 'WEB',
    id: 206,
    abbreviation: 'WEB',
    title: 'World English Bible',
    copyright: 'PUBLIC DOMAIN',
    promotionalContent: '',
    youVersionDeepLink: 'https://www.bible.com/versions/206',
  },
};

// WEB ships with the app: the picker's catalogue and the passage text come
// from the bundled per-book files, never from /api/*.
const webIndex = { translation: 'WEB', books: catalogue.books };
const johnFile = {
  book: 'John',
  chapters: { '3': { '16': john316.text } },
};

function stubApi() {
  const api = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === '/web/index.json') return Response.json(webIndex);
    if (url === '/web/JHN.json') return Response.json(johnFile);
    if (url.startsWith('/api/books')) return Response.json(catalogue);
    if (url.startsWith('/api/passage')) return Response.json(john316);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', api);
  return api;
}

describe('Pick a Verse tab', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    // Bundled book files are cached for the session; each test stubs its own.
    LOCAL_BOOK_CACHE_FOR_TESTS.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sits before Challenge in the tab strip', () => {
    render(<App />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Pick a Verse',
      'Challenge',
      'Daily Verse',
      'Daily Scrabble',
      'Word Search',
    ]);
  });

  it('loads the edition’s books when the tab is opened', async () => {
    const api = stubApi();
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Pick a Verse' }));

    expect(await screen.findByLabelText('Book')).toBeInTheDocument();
    expect(String(api.mock.calls[0][0])).toBe('/web/index.json');
    expect(api.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
      expect.stringContaining('/api/'),
    );
    expect(
      screen.getByRole('button', { name: /Play John 3:16 on Normal/ }),
    ).toBeInTheDocument();
  });

  it('plays a curated WEB link from its bundled Classic text', async () => {
    window.history.replaceState(
      {},
      '',
      '/?passage=JHN.3.16&translation=WEB&difficulty=easy',
    );
    const api = stubApi();
    render(<App />);

    expect(
      await screen.findByRole('region', { name: 'Memorize John 3:16' }),
    ).toBeInTheDocument();
    // Easy is timed, so the eyebrow carries the difficulty rather than a level.
    expect(screen.getByText('Easy · Memorize')).toBeInTheDocument();

    const urls = api.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.startsWith('/api/'))).toBe(false);
  });

  it('opens a linked verse on the picker tab when the passage cannot load', async () => {
    window.history.replaceState({}, '', '/?passage=JHN.3.1');
    vi.stubGlobal('fetch', async (input: unknown) => {
      if (String(input) === '/web/index.json') return Response.json(webIndex);
      // The bundled book file is missing — a broken build, but still no crash.
      return new Response('', { status: 404 });
    });
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Welcome' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: 'Pick a Verse' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      await screen.findByText('That Bible passage could not be loaded.'),
    ).toBeInTheDocument();
  });

  it('plays on when only the decoy request fails', async () => {
    // Hard in a licensed edition needs a second passage for its decoys.
    window.history.replaceState(
      {},
      '',
      '/?passage=JHN.3.16&translation=NIRV&difficulty=hard',
    );
    vi.stubGlobal('fetch', async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('/api/books')) return Response.json(catalogue);
      if (url.includes('passage=JHN.3.16')) {
        return Response.json({ ...john316, translation: { ...john316.translation, key: 'NIRV' } });
      }
      // The decoy source, and only the decoy source, is unavailable.
      return Response.json(
        { error: 'passage_unavailable', message: 'That passage could not be loaded.' },
        { status: 502 },
      );
    });
    render(<App />);

    // The verse itself came through, so the round runs — decoy-free.
    expect(
      await screen.findByRole('region', { name: 'Memorize John 3:16' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hard · Memorize')).toBeInTheDocument();
  });

  it('opens a guessing game from a link, and keeps it chosen back on the picker', async () => {
    window.history.replaceState({}, '', '/?passage=JHN.3.16&translation=WEB&game=letters');
    stubApi();
    render(<App />);

    expect(
      await screen.findByRole('region', { name: 'Guess the Letters: John 3:16' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bible Sequence — go to start screen' }));
    expect(await screen.findByRole('radio', { name: /Guess Letters/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Guess the letters in John 3:16' }),
    ).toBeInTheDocument();
  });

  it('honours the edition a link names without saving it over the player’s choice', async () => {
    window.history.replaceState({}, '', '/?passage=JHN.3.16&version=110');
    stubApi();
    render(<App />);

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem('lucas-bible-sequence:v1')).toBeNull();
  });
});
