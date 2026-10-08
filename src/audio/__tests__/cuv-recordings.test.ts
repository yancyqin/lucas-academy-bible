import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const features = vi.hoisted(() => ({ itchBuild: false }));
vi.mock('../../build-config', () => ({ BUILD_FEATURES: features }));
import { recordingsForCuv, type CuvRecordingRelease } from '../cuv-recordings';

const catalog: CuvRecordingRelease = {
  enabled: true,
  clips: [
    { id: 'JHN.11.35', text: '耶稣哭了。', url: `/audio/cuv-fangfang/${'a'.repeat(16)}/JHN/11/35-${'b'.repeat(64)}.mp3` },
    { id: 'PSA.23.1', text: '耶和华是我的牧者， 我必不致缺乏。', url: `/audio/cuv-fangfang/${'a'.repeat(16)}/PSA/23/1-${'c'.repeat(64)}.mp3` },
    { id: 'PSA.23.2', text: '他使我躺卧在青草地上，领我在可安歇的水边。', url: `/audio/cuv-fangfang/${'a'.repeat(16)}/PSA/23/2-${'d'.repeat(64)}.mp3` },
  ],
};
beforeEach(() => { features.itchBuild = false; vi.stubEnv('VITE_DIST_TARGET', 'web'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('CUV recording selection', () => {
  it('plays complete matching verses in passage order despite display spacing', () => {
    const texts = ['耶稣哭了。', '耶和华是我的牧者，我必不致缺乏。'];
    expect(recordingsForCuv(texts.join(' '), texts, catalog)?.map((clip) => clip.id))
      .toEqual(['JHN.11.35', 'PSA.23.1']);
  });

  it('requires an enabled catalog and explicit CUV verse texts', () => {
    expect(recordingsForCuv('耶稣哭了。', ['耶稣哭了。'], { ...catalog, enabled: false })).toBeUndefined();
    expect(recordingsForCuv('耶稣哭了。', undefined, catalog)).toBeUndefined();
  });

  it('plays a picked range that arrives as a single text entry', () => {
    const text = catalog.clips.slice(1).map((clip) => clip.text).join('');
    expect(recordingsForCuv(text, [text], catalog)?.map((clip) => clip.id))
      .toEqual(['PSA.23.1', 'PSA.23.2']);
  });

  it('rejects ranges with missing, reordered, or nonconsecutive verses', () => {
    const first = catalog.clips[1];
    const second = catalog.clips[2];
    const text = first.text + second.text;
    expect(recordingsForCuv(text, [text], { ...catalog, clips: [first] })).toBeUndefined();
    expect(recordingsForCuv(second.text + first.text, [second.text + first.text], catalog)).toBeUndefined();
    expect(recordingsForCuv(text, [text], { ...catalog, clips: [first, { ...second, id: 'PSA.23.3' }] })).toBeUndefined();
  });

  it('does not request shared audio from the offline distributions', () => {
    features.itchBuild = true;
    expect(recordingsForCuv('耶稣哭了。', ['耶稣哭了。'], catalog)).toBeUndefined();
  });

  it('does not request recordings in the native offline target', () => {
    vi.stubEnv('VITE_DIST_TARGET', 'ios');
    expect(recordingsForCuv('耶稣哭了。', ['耶稣哭了。'], catalog)).toBeUndefined();
  });

  it('falls back for a missing verse, changed wording, or a fragment', () => {
    expect(recordingsForCuv('耶稣哭了。新的经文。', ['耶稣哭了。', '新的经文。'], catalog)).toBeUndefined();
    expect(recordingsForCuv('耶稣流泪了。', ['耶稣流泪了。'], catalog)).toBeUndefined();
    expect(recordingsForCuv('耶稣', ['耶稣哭了。'], catalog)).toBeUndefined();
  });

  it('rejects external URLs and paths outside the fingerprinted audio directory', () => {
    for (const url of ['https://example.org/audio.mp3', '//example.org/audio.mp3', '/audio/cuv-fangfang/../other.mp3']) {
      expect(recordingsForCuv('耶稣哭了。', ['耶稣哭了。'], {
        ...catalog, clips: [{ ...catalog.clips[0], url }],
      })).toBeUndefined();
    }
  });
});
