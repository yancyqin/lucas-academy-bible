import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundledWebPassage } from '../bundled-web';
import { attributionFor, fetchBiblePassage } from '../../youversion';

afterEach(() => vi.unstubAllGlobals());

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
  it('keeps other editions and missing WEB references on the normal passage API', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      passageId: 'JHN.11.35', reference: 'John 11:35', text: 'Jesus wept.', cache: 'HIT',
      translation: { key: 'NIV', label: 'NIV', copyright: 'Licensed' },
    }) });
    vi.stubGlobal('fetch', fetch);
    await fetchBiblePassage('NIV', 'JHN.11.35');
    await fetchBiblePassage('WEB', 'JHN.11.36');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain('translation=NIV');
    expect(fetch.mock.calls[1][0]).toContain('translation=WEB');
  });
});
