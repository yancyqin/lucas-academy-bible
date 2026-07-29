import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundEngine } from '../sound';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SoundEngine mobile damage cue', () => {
  it('preloads and retriggers the loud HTML Audio cue on every wrong tap', () => {
    const load = vi
      .spyOn(window.HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => undefined);
    const pause = vi
      .spyOn(window.HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const sound = new SoundEngine();

    sound.resume();
    sound.playWrong();
    sound.playWrong();

    // resume() preloads damage.wav plus all six notes of the correct scale.
    expect(load).toHaveBeenCalledTimes(7);
    expect(pause).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);
    const audio = play.mock.instances[0] as unknown as HTMLAudioElement;
    expect(audio.src).toContain('/audio/damage.wav');
    expect(audio.volume).toBe(1);
  });

  it('does not play the damage asset while sound is disabled', () => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(
      () => undefined,
    );
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const sound = new SoundEngine();

    sound.resume();
    sound.setEnabled(false);
    sound.playWrong();

    expect(play).not.toHaveBeenCalled();
  });

  it('plays the correct cue through six pre-rendered scale notes', () => {
    const load = vi
      .spyOn(window.HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );
    const srcs: string[] = [];
    const rates: number[] = [];
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockImplementation(function (this: HTMLMediaElement) {
        srcs.push(this.src);
        rates.push(this.playbackRate);
        return Promise.resolve();
      });
    const sound = new SoundEngine();

    sound.resume();
    for (let streak = 1; streak <= 6; streak += 1) {
      sound.playCorrect(streak);
    }

    // damage.wav plus six correct-scale clips are preloaded on resume().
    expect(load).toHaveBeenCalledTimes(7);
    expect(play).toHaveBeenCalledTimes(6);
    expect(srcs[0]).toContain('/audio/correct.wav');
    expect(srcs[1]).toContain('/audio/correct-2.wav');
    expect(srcs[5]).toContain('/audio/correct-6.wav');
    expect(new Set(srcs)).toHaveLength(6);
    expect(rates).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('does not play the correct cue while sound is disabled', () => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(
      () => undefined,
    );
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const sound = new SoundEngine();

    sound.resume();
    sound.setEnabled(false);
    sound.playCorrect(1);

    expect(play).not.toHaveBeenCalled();
  });
});
