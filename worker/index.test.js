import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dateInfo,
  getDailyVerse,
  getTranslationMetadata,
  getTranslationPassage,
} from './index.js';

class MemoryKv {
  values = new Map();

  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('daily verse Worker', () => {
  it('uses the America/Los_Angeles calendar day', () => {
    expect(dateInfo(new Date('2026-01-01T07:30:00Z'))).toEqual({
      date: '2025-12-31',
      dayOfYear: 365,
    });
    expect(dateInfo(new Date('2026-01-01T08:30:00Z'))).toEqual({
      date: '2026-01-01',
      dayOfYear: 1,
    });
  });

  it('shares one daily selection while caching each translation separately', async () => {
    const kv = new MemoryKv();
    const api = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/verse_of_the_days/206')) {
        return Response.json({ day: 206, passage_id: 'JHN.3.16' });
      }
      if (url.includes('/bibles/111/passages/JHN.3.16')) {
        return Response.json({
          id: 'JHN.3.16',
          reference: 'John 3:16',
          content: 'For God so loved the world.',
        });
      }
      if (url.endsWith('/bibles/111')) {
        return Response.json({
          id: 111,
          abbreviation: 'NIV',
          title: 'New International Version',
          copyright: 'Required NIV copyright.',
          youversion_deep_link: 'https://www.bible.com/versions/111',
        });
      }
      if (url.includes('/bibles/110/passages/JHN.3.16')) {
        return Response.json({
          id: 'JHN.3.16',
          reference: 'John 3:16',
          content: 'God loved the world so much.',
        });
      }
      if (url.endsWith('/bibles/110')) {
        return Response.json({
          id: 110,
          abbreviation: 'NIrV',
          title: "New International Reader's Version",
          copyright: 'Required NIrV copyright.',
          youversion_deep_link: 'https://www.bible.com/versions/110',
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', api);

    const env = { YVP_APP_KEY: 'test-only', DAILY_VERSE_KV: kv };
    const now = new Date('2026-07-25T19:00:00Z');
    const first = await getDailyVerse(env, 'NIV', now);
    const second = await getDailyVerse(env, 'NIV', now);
    const readerVersion = await getDailyVerse(env, 'NIRV', now);

    expect(first.cache).toBe('MISS');
    expect(first.reference).toBe('John 3:16');
    expect(first.translation.abbreviation).toBe('NIV');
    expect(second.cache).toBe('HIT');
    expect(readerVersion.translation.label).toBe('NIrV');
    expect(readerVersion.cache).toBe('MISS');
    expect(api).toHaveBeenCalledTimes(5);
    for (const call of api.mock.calls) {
      expect(call[1].headers['X-YVP-App-Key']).toBe('test-only');
    }
  });

  it('caches passages by translation and rejects invalid ids before fetch', async () => {
    const kv = new MemoryKv();
    const api = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/bibles/2692/passages/PSA.23.1')) {
        return Response.json({
          id: 'PSA.23.1',
          reference: 'Psalm 23:1',
          content: 'The Lord is my shepherd.',
        });
      }
      if (url.endsWith('/bibles/2692')) {
        return Response.json({
          id: 2692,
          abbreviation: 'NASB2020',
          title: 'New American Standard Bible 2020',
          copyright: 'Required NASB copyright.',
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', api);
    const env = { YVP_APP_KEY: 'test-only', DAILY_VERSE_KV: kv };

    const first = await getTranslationPassage(env, 'NASB2020', 'PSA.23.1');
    const second = await getTranslationPassage(env, 'NASB2020', 'PSA.23.1');

    expect(first.cache).toBe('MISS');
    expect(second.cache).toBe('HIT');
    expect(first.translation.label).toBe('NASB 2020');
    expect(api).toHaveBeenCalledTimes(2);
    await expect(
      getTranslationPassage(env, 'NIV', '../../secrets'),
    ).rejects.toThrow('Invalid YouVersion passage id');
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('returns cached translation metadata without fetching a passage', async () => {
    const kv = new MemoryKv();
    const api = vi.fn(async (input) => {
      if (String(input).endsWith('/bibles/111')) {
        return Response.json({
          id: 111,
          abbreviation: 'NIV',
          title: 'New International Version',
          copyright: 'Required NIV copyright.',
          youversion_deep_link: 'https://www.bible.com/versions/111',
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', api);
    const env = { YVP_APP_KEY: 'test-only', DAILY_VERSE_KV: kv };

    const first = await getTranslationMetadata(env, 'NIV');
    const second = await getTranslationMetadata(env, 'NIV');

    expect(first.cache).toBe('MISS');
    expect(second.cache).toBe('HIT');
    expect(first.translation.copyright).toBe('Required NIV copyright.');
    expect(api).toHaveBeenCalledTimes(1);
  });
});
