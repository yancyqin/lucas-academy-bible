import { describe, expect, it, vi } from 'vitest';
import {
  createStorage,
  detectPlatform,
  hydrateStorage,
  openExternalLink,
  saveFile,
} from '../../platform';

function fakeLocal(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

describe('platform detection', () => {
  it('is web when no Capacitor bridge is present (browsers, jsdom, tests)', () => {
    expect(detectPlatform(undefined)).toBe('web');
    expect(detectPlatform({})).toBe('web');
  });

  it('is ios only when the injected bridge says native + ios', () => {
    expect(
      detectPlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }),
    ).toBe('ios');
    expect(
      detectPlatform({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'ios' } }),
    ).toBe('web');
    expect(
      detectPlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'web' } }),
    ).toBe('web');
  });

  it('treats a throwing bridge as the web', () => {
    expect(
      detectPlatform({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error('nope');
          },
        },
      }),
    ).toBe('web');
  });
});

describe('storage', () => {
  it('uses the given local storage directly on the web', () => {
    const local = fakeLocal();
    const s = createStorage('web', local);
    s.setItem('lucas-bible-sequence:v1', '{"a":1}');
    expect(local.map.get('lucas-bible-sequence:v1')).toBe('{"a":1}');
    expect(s.getItem('lucas-bible-sequence:v1')).toBe('{"a":1}');
  });

  it('falls back to memory when local storage is inaccessible', () => {
    const s = createStorage('web', null);
    expect(s.getItem('x')).toBeNull();
    s.setItem('x', '1');
    expect(s.getItem('x')).toBe('1');
    s.removeItem('x');
    expect(s.getItem('x')).toBeNull();
  });

  it('on iOS writes through to local storage synchronously', () => {
    const local = fakeLocal();
    const s = createStorage('ios', local);
    s.setItem('lucas-bible-sequence:v1', 'v');
    expect(local.map.get('lucas-bible-sequence:v1')).toBe('v');
    expect(s.getItem('lucas-bible-sequence:v1')).toBe('v');
  });

  it('hydrate is a no-op on the web and never throws on iOS without the plugin', async () => {
    const local = fakeLocal();
    await expect(hydrateStorage('web', local)).resolves.toBeUndefined();
    await expect(hydrateStorage('ios', local)).resolves.toBeUndefined();
  });
});

describe('external links', () => {
  it('leaves the anchor alone on the web', () => {
    const preventDefault = vi.fn();
    openExternalLink({ currentTarget: { href: 'https://ebible.org/' }, preventDefault }, 'web');
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('intercepts the click on iOS', () => {
    const preventDefault = vi.fn();
    openExternalLink({ currentTarget: { href: 'https://ebible.org/' }, preventDefault }, 'ios');
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('saveFile', () => {
  it('downloads through an anchor on the web', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await saveFile(new Blob(['png']), 'cert.png', 'web');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('never throws on iOS when the native plugins are unavailable', async () => {
    await expect(saveFile(new Blob(['png']), 'cert.png', 'ios')).resolves.toBeUndefined();
  });
});
