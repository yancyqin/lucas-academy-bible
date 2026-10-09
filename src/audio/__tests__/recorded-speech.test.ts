import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordings = vi.hoisted(() => ({ find: vi.fn(), web: vi.fn() }));
vi.mock('../cuv-recordings', () => ({
  cuvRecordingsSupported: () => true,
  recordingsForCuv: recordings.find,
}));
vi.mock('../web-recordings', () => ({
  webRecordingsSupported: () => true,
  recordingsForWeb: recordings.web,
}));

import { Narrator } from '../speech';

class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  preload = '';
  playbackRate = 1;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  rejectPlay: ((reason: Error) => void) | undefined;
  play = vi.fn(() => new Promise<void>((_resolve, reject) => { this.rejectPlay = reject; }));
  pause = vi.fn();
  removeAttribute = vi.fn();
  constructor() { FakeAudio.instances.push(this); }
}

const clips = [
  { id: 'a', text: '耶稣哭了。', url: '/audio/cuv-fangfang/a.mp3' },
  { id: 'b', text: '神爱世人。', url: '/audio/cuv-fangfang/b.mp3' },
];
const synth = { cancel: vi.fn(), getVoices: () => [], addEventListener: vi.fn(), speak: vi.fn(), speaking: false };

beforeEach(() => {
  vi.clearAllMocks();
  FakeAudio.instances = [];
  recordings.find.mockReturnValue(clips);
  recordings.web.mockReturnValue(undefined);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('recorded scripture playback', () => {
  it('plays WEB recordings and falls back in English for the remaining verse', () => {
    const english = [
      { id: 'PSA.23.1', text: 'Yahweh is my shepherd.', url: '/audio/web-louise/1.mp3' },
      { id: 'PSA.23.2', text: 'He makes me lie down.', url: '/audio/web-louise/2.mp3' },
    ];
    recordings.find.mockReturnValue(undefined);
    recordings.web.mockReturnValue(english);
    const narrator = new Narrator();
    narrator.speak(english.map(c => c.text).join(' '), { webVerses: english.map(c => c.text), slow: false });
    const audio = FakeAudio.instances[0];
    expect(audio.src).toBe(english[0].url);
    audio.onplaying?.();
    audio.onended?.();
    expect(audio.src).toBe(english[1].url);
    audio.onerror?.();
    expect(synth.speak.mock.calls[0][0].text).toBe(english[1].text);
    expect(synth.speak.mock.calls[0][0].lang).toBe('en-US');
    expect(audio.pause).toHaveBeenCalledOnce();
  });
  it('plays every verse in order with one start and one finish callback', () => {
    const narrator = new Narrator();
    const onstart = vi.fn(), onend = vi.fn();
    narrator.speak('耶稣哭了。神爱世人。', { cuvVerses: clips.map((clip) => clip.text), onstart, onend });
    const audio = FakeAudio.instances[0];
    expect(audio.src).toBe(clips[0].url);
    expect(narrator.isSpeaking()).toBe(true);
    audio.onplaying?.();
    audio.onended?.();
    expect(audio.src).toBe(clips[1].url);
    audio.onplaying?.();
    audio.onended?.();
    expect(onstart).toHaveBeenCalledOnce();
    expect(onend).toHaveBeenCalledOnce();
    expect(narrator.isSpeaking()).toBe(false);
  });

  it('does not revive a stopped session when a pending play promise rejects', async () => {
    const narrator = new Narrator();
    narrator.speak('耶稣哭了。');
    const audio = FakeAudio.instances[0];
    narrator.stop();
    audio.rejectPlay?.(new Error('cancelled'));
    await Promise.resolve();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(synth.speak).not.toHaveBeenCalled();
    expect(narrator.isSpeaking()).toBe(false);
  });

  it('ignores a late play rejection after the last verse has finished', async () => {
    const narrator = new Narrator();
    const onend = vi.fn();
    narrator.speak('耶稣哭了。神爱世人。', { onend });
    const audio = FakeAudio.instances[0];
    audio.onended?.();
    audio.onended?.();
    audio.rejectPlay?.(new Error('late rejection'));
    await Promise.resolve();
    expect(onend).toHaveBeenCalledOnce();
    expect(synth.speak).not.toHaveBeenCalled();
    expect(narrator.isSpeaking()).toBe(false);
  });

  it('uses the browser voice for only the remaining verses after an audio error', () => {
    const narrator = new Narrator();
    narrator.speak('耶稣哭了。神爱世人。', { slow: false });
    const audio = FakeAudio.instances[0];
    audio.onplaying?.();
    audio.onended?.();
    audio.onerror?.();
    expect(synth.speak).toHaveBeenCalledOnce();
    expect(synth.speak.mock.calls[0][0].text).toBe('神爱世人。');
    expect(audio.pause).toHaveBeenCalledOnce();
  });
});
