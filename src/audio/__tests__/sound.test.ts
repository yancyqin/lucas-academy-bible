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

    // resume() preloads both cues (damage.wav + correct.wav).
    expect(load).toHaveBeenCalledTimes(2);
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

  it('plays the correct cue through the preloaded HTML Audio clip, not the suspended synth', () => {
    const load = vi
      .spyOn(window.HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    );
    // The correct cue reuses one <audio> element, so capture playbackRate at
    // play-time rather than reading the mutated value afterward.
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
    sound.playCorrect(1);
    sound.playCorrect(3);

    // Both damage.wav and correct.wav are preloaded on resume().
    expect(load).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);
    expect(srcs[0]).toContain('/audio/correct.wav');
    // Streak raises the pitch via playbackRate.
    expect(rates[0]).toBe(1);
    expect(rates[1]).toBeGreaterThan(1);
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
