import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const features = vi.hoisted(() => ({ itchBuild: false }));
vi.mock('../../build-config', () => ({ BUILD_FEATURES: features }));
import { recordingsForWeb } from '../web-recordings';
import { levelNarrationOptions } from '../level-narration';
import type { RecordingRelease } from '../recordings';
import { allPassages } from '../../data/scripture';
import status from '../../../data/narration-web-louise.json';

const clip = (id: string, text: string, hash: string) => {
  const [book, chapter, verse] = id.split('.');
  return { id, text, url: `/audio/web-louise/${'a'.repeat(16)}/${book}/${chapter}/${verse}-${hash.repeat(64)}.mp3` };
};
const catalog: RecordingRelease = { enabled: true, clips: [
  clip('JHN.11.35', 'Jesus wept.', 'b'),
  clip('PSA.23.1', 'A Psalm by David. Yahweh is my shepherd; I shall lack nothing.', 'c'),
  clip('PSA.23.2', 'He makes me lie down in green pastures. He leads me beside still waters.', 'd'),
] };
beforeEach(() => { features.itchBuild = false; vi.stubEnv('VITE_DIST_TARGET', 'web'); });
afterEach(() => vi.unstubAllEnvs());

describe('WEB narration', () => {
  it('can narrate every complete curated passage when all source verses are available', () => {
    const catalog: RecordingRelease = { enabled: true, clips: status.verses.map((verse) =>
      clip(verse.id, verse.text, 'e')) };
    for (const passage of allPassages) {
      const selected = recordingsForWeb(passage.text, passage.verses.map(v => v.text), catalog);
      expect(selected, passage.reference).toHaveLength(passage.verses.length);
    }
  });
  it('matches a complete picked range in order and accepts display whitespace', () => {
    const text = catalog.clips.slice(1).map(c => c.text).join(' ');
    expect(recordingsForWeb(text, [text], catalog)?.map(c => c.id)).toEqual(['PSA.23.1', 'PSA.23.2']);
    expect(recordingsForWeb('Jesus   wept.', ['Jesus wept.'], catalog)?.[0].id).toBe('JHN.11.35');
  });
  it('keeps English word boundaries and requires every complete verse', () => {
    expect(recordingsForWeb('Jesuswept.', ['Jesuswept.'], catalog)).toBeUndefined();
    const text = catalog.clips.slice(1).map(c => c.text).join(' ');
    expect(recordingsForWeb(text, [text], { ...catalog, clips: catalog.clips.slice(0, 2) })).toBeUndefined();
    expect(recordingsForWeb('Jesus', ['Jesus wept.'], catalog)).toBeUndefined();
    expect(recordingsForWeb('Jesus cried.', ['Jesus cried.'], catalog)).toBeUndefined();
    expect(recordingsForWeb('Jesus wept.', undefined, catalog)).toBeUndefined();
  });
  it('rejects different editions and external asset paths', () => {
    for (const url of ['https://example.org/voice.mp3', catalog.clips[0].url.replace('web-louise', 'cuv-fangfang')]) {
      expect(recordingsForWeb('Jesus wept.', ['Jesus wept.'], { enabled: true, clips: [{ ...catalog.clips[0], url }] })).toBeUndefined();
    }
    const level = { fragment: false, verses: [{ verse: 35, text: 'Jesus wept.' }] };
    expect(levelNarrationOptions(level).webVerses).toEqual(['Jesus wept.']);
    expect(levelNarrationOptions({ ...level, attribution: { translationKey: 'WEB', abbreviation: 'engWEBUS', title: 'WEB', copyright: 'Public Domain' } }).webVerses).toEqual(['Jesus wept.']);
    expect(levelNarrationOptions({ ...level, attribution: { abbreviation: 'NIV', title: 'NIV', copyright: 'Licensed' } }).webVerses).toBeUndefined();
    expect(levelNarrationOptions({ ...level, fragment: true }).webVerses).toBeUndefined();
  });
  it('excludes recordings from offline targets', () => {
    for (const target of ['ios', 'itch']) {
      vi.stubEnv('VITE_DIST_TARGET', target);
      expect(recordingsForWeb('Jesus wept.', ['Jesus wept.'], catalog)).toBeUndefined();
    }
    vi.stubEnv('VITE_DIST_TARGET', 'web');
    features.itchBuild = true;
    expect(recordingsForWeb('Jesus wept.', ['Jesus wept.'], catalog)).toBeUndefined();
  });
});
