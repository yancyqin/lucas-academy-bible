import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundledWebPassage } from '../bundled-web';
import { attributionFor, fetchBiblePassage } from '../../youversion';
import { LOCAL_BOOK_CACHE_FOR_TESTS } from '../../local-bible';

afterEach(() => {
  vi.unstubAllGlobals();
  LOCAL_BOOK_CACHE_FOR_TESTS.clear();
});

describe('bundled WEB selections', () => {
  it('keeps the original Psalm heading and every selected verse', () => {
    const passage = bundledWebPassage('PSA.23.1-2');
    expect(passage?.reference).toBe('Psalm 23:1-2');
    expect(passage?.text).toContain('A Psalm by David.');
    expect(passage?.text).toContain('He makes me lie down in green pastures.');
  });
  it('does not supply incomplete ranges or pretend to have full chapters', () => {
    for (const ref of ['JHN.11', 'JHN.11.35-36', 'JHN.11.36-35', 'JHN.0.35', 'PSA.23.1-1000000']) {
      expect(bundledWebPassage(ref)).toBeUndefined();
    }
  });
  it('uses the local public-domain source for curated WEB selections', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const passage = await fetchBiblePassage('WEB', 'JHN.11.35');
    expect(passage.text).toBe('Jesus wept.');
    expect(fetch).not.toHaveBeenCalled();
    expect(attributionFor(passage.translation).sourceLabel).toBe('eBible.org');
  });
  it('keeps licensed editions on the passage API and reads other WEB verses from the bundled book', async () => {
    const fetch = vi.fn(async (input: unknown) => String(input) === '/web/JHN.json'
      ? Response.json({ book: 'John', chapters: { '11': { '36': 'The Jews therefore said, “See how much affection he had for him!”' } } })
      : Response.json({
        passageId: 'JHN.11.35', reference: 'John 11:35', text: 'Jesus wept.', cache: 'HIT',
        translation: { key: 'NIV', label: 'NIV', copyright: 'Licensed' },
      }));
    vi.stubGlobal('fetch', fetch);
    await fetchBiblePassage('NIV', 'JHN.11.35');
    const web = await fetchBiblePassage('WEB', 'JHN.11.36');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain('/api/passage?translation=NIV');
    expect(String(fetch.mock.calls[1][0])).toBe('/web/JHN.json');
    expect(web.reference).toBe('John 11:36');
    expect(attributionFor(web.translation).sourceLabel).toBe('eBible.org');
  });
});
