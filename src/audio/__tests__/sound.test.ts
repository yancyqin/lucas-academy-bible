import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundEngine } from '../sound';

afterEach(() => {
  vi.restoreAllMocks();
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

    expect(load).toHaveBeenCalledTimes(1);
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
});
