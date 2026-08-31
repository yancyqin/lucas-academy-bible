import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';

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

function stubApi() {
  const api = vi.fn(async (input: unknown) => {
    const url = String(input);
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
    expect(String(api.mock.calls[0][0])).toBe('/api/books?translation=WEB');
    expect(
      screen.getByRole('button', { name: /Play John 3:16 on Normal/ }),
    ).toBeInTheDocument();
  });

  it('plays the verse a ?passage= link names, using the YouVersion id verbatim', async () => {
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

    const passageCall = api.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.startsWith('/api/passage'));
    expect(passageCall).toBe('/api/passage?translation=WEB&passage=JHN.3.16');
  });

  it('opens a linked verse on the picker tab when the passage cannot load', async () => {
    window.history.replaceState({}, '', '/?passage=JHN.3.16');
    vi.stubGlobal('fetch', async (input: unknown) => {
      if (String(input).startsWith('/api/books')) return Response.json(catalogue);
      return Response.json(
        { error: 'passage_unavailable', message: 'That passage could not be loaded.' },
        { status: 502 },
      );
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
      await screen.findByText('That passage could not be loaded.'),
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
