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

  it('waits for a suspended mobile context before playing the first correct cue', async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(
      () => undefined,
    );
    let finishResume: (() => void) | undefined;
    const start = vi.fn();
    const resume = vi.fn();

    class FakeAudioContext {
      state: AudioContextState = 'suspended';
      currentTime = 0;
      destination = {} as AudioDestinationNode;

      createGain(): GainNode {
        return {
          gain: {
            value: 1,
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        } as unknown as GainNode;
      }

      createOscillator(): OscillatorNode {
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          start,
          stop: vi.fn(),
        } as unknown as OscillatorNode;
      }

      resume = resume.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishResume = () => {
              this.state = 'running';
              resolve();
            };
          }),
      );
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);
    const sound = new SoundEngine();
    const resuming = sound.resume();

    sound.playCorrect();
    expect(start).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalledTimes(1);

    finishResume?.();
    await resuming;
    await Promise.resolve();

    expect(start).toHaveBeenCalledTimes(2);
  });
});
