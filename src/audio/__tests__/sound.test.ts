import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundEngine } from '../sound';

/** Every rendered cue asset that ships with the app (vite import.meta.glob). */
const shippedWavs = Object.keys(
  import.meta.glob('../../../public/audio/*.wav'),
).map((path) => path.split('/').pop());

type PlayMode = 'resolve' | 'reject' | 'defer';

interface PlayCall {
  el: HTMLMediaElement;
  src: string;
  muted: boolean;
  volume: number;
  rate: number;
}

/**
 * Mock the media methods the engine touches, capturing element state AT PLAY
 * TIME — the engine reuses one <audio> per note, so reading properties after
 * the fact would observe later mutations (e.g. a prime's unmute).
 */
function mockMedia(initialMode: PlayMode = 'resolve') {
  let mode = initialMode;
  const plays: PlayCall[] = [];
  const pauses: HTMLMediaElement[] = [];
  const deferred: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const load = vi
    .spyOn(window.HTMLMediaElement.prototype, 'load')
    .mockImplementation(() => undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    pauses.push(this);
  });
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    plays.push({
      el: this,
      src: this.src,
      muted: this.muted,
      volume: this.volume,
      rate: this.playbackRate,
    });
    if (mode === 'reject') {
      return Promise.reject(new DOMException('denied', 'NotAllowedError'));
    }
    if (mode === 'defer') {
      return new Promise<void>((resolve, reject) => {
        deferred.push({ resolve, reject });
      });
    }
    return Promise.resolve();
  });
  return {
    load,
    plays,
    pauses,
    deferred,
    setMode: (next: PlayMode) => {
      mode = next;
    },
    pausesOf: (el: HTMLMediaElement) => pauses.filter((paused) => paused === el).length,
  };
}

/** A running fake AudioContext so any Web Audio synth fallback is observable. */
function stubSynthContext() {
  const createOscillator = vi.fn(() => ({
    type: 'sine',
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  class FakeAudioContext {
    state: AudioContextState = 'running';
    currentTime = 0;
    destination = {} as AudioDestinationNode;
    resume = vi.fn(() => Promise.resolve());
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
    createOscillator = createOscillator as unknown as () => OscillatorNode;
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { createOscillator };
}

/** Flush microtasks plus one macrotask so the engine's promise chains settle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SoundEngine mobile damage cue', () => {
  it('preloads and retriggers the loud HTML Audio cue on every wrong tap', () => {
    const media = mockMedia();
    const sound = new SoundEngine();

    sound.resume();
    sound.playWrong();
    sound.playWrong();

    // resume() preloads damage.wav plus all six notes of the correct scale.
    expect(media.load).toHaveBeenCalledTimes(7);
    expect(media.pauses).toHaveLength(2);
    expect(media.plays).toHaveLength(2);
    expect(media.plays[0].src).toContain('/audio/damage.wav');
    expect(media.plays[0].volume).toBe(1);
  });

  it('does not play the damage asset while sound is disabled', () => {
    const media = mockMedia();
    const sound = new SoundEngine();

    sound.resume();
    sound.setEnabled(false);
    sound.playWrong();

    expect(media.plays).toHaveLength(0);
  });
});

describe('SoundEngine six-note correct scale', () => {
  it('plays six unique pre-rendered scale notes in ascending order', () => {
    const media = mockMedia();
    const sound = new SoundEngine();

    for (let streak = 1; streak <= 7; streak += 1) {
      sound.playCorrect(streak);
    }

    expect(media.plays).toHaveLength(7);
    // Cache-safe URLs: the wav bytes changed under the same filenames, so a
    // version token keeps phones from replaying a stale cached first note.
    expect(media.plays[0].src).toContain('/audio/correct.wav?v=');
    expect(media.plays[1].src).toContain('/audio/correct-2.wav?v=');
    expect(media.plays[2].src).toContain('/audio/correct-3.wav?v=');
    expect(media.plays[3].src).toContain('/audio/correct-4.wav?v=');
    expect(media.plays[4].src).toContain('/audio/correct-5.wav?v=');
    expect(media.plays[5].src).toContain('/audio/correct-6.wav?v=');
    expect(new Set(media.plays.slice(0, 6).map((p) => p.src)).size).toBe(6);
    // Streak 7 wraps back to the first note — same asset, no pitch shifting.
    expect(media.plays[6].src).toBe(media.plays[0].src);
    for (const play of media.plays) {
      expect(play.muted).toBe(false);
      expect(play.volume).toBe(1);
      expect(play.rate).toBe(1);
    }
    // Idle notes are never paused/rewound first — nothing to abort.
    expect(media.pauses).toHaveLength(0);
  });

  it('ships the six rendered scale clips and the damage cue as real assets', () => {
    const files = [
      'correct.wav',
      'correct-2.wav',
      'correct-3.wav',
      'correct-4.wav',
      'correct-5.wav',
      'correct-6.wav',
      'damage.wav',
    ];
    for (const file of files) {
      expect(shippedWavs, `${file} missing from public/audio`).toContain(file);
    }
  });

  it('does not play the correct cue while sound is disabled', () => {
    const media = mockMedia();
    const sound = new SoundEngine();

    sound.resume();
    sound.setEnabled(false);
    sound.playCorrect(1);

    expect(media.plays).toHaveLength(0);
  });

  it('primes every scale note muted so priming is never audible', async () => {
    const media = mockMedia();
    const sound = new SoundEngine();

    sound.resume();
    sound.primeCorrectAudio();

    // All six notes are unlocked inside the gesture — Safari's unlock is per
    // media element. Muted, because iOS pins `volume` to 1 (0.01 would blare).
    expect(media.plays).toHaveLength(6);
    for (const play of media.plays) {
      expect(play.muted).toBe(true);
      expect(play.volume).toBe(1);
    }

    await flush();

    // Each prime parks its own note (one pause) and restores muted.
    expect(media.pauses).toHaveLength(6);
    for (const play of media.plays) {
      expect(play.el.muted).toBe(false);
    }

    // Unlocked notes are not primed again.
    sound.primeCorrectAudio();
    expect(media.plays).toHaveLength(6);
  });

  it('primes Safari quietly without stopping the first real correct cue', async () => {
    const media = mockMedia('defer');
    const synth = stubSynthContext();
    const sound = new SoundEngine();

    sound.resume();
    sound.primeCorrectAudio();
    expect(media.plays).toHaveLength(6);

    // The player taps the first word while every prime is still pending —
    // exactly the iOS timing (play() promises settle late after narration).
    sound.playCorrect(1);
    expect(media.plays).toHaveLength(7);
    const prime = media.plays[0];
    const real = media.plays[6];
    expect(real.el).toBe(prime.el);
    expect(prime.muted).toBe(true);
    expect(real.muted).toBe(false); // the real cue unmutes the pending prime

    media.deferred.forEach((d) => d.resolve());
    await flush();

    // The prime's late cleanup backed off: the claimed note was never paused,
    // rewound, or re-muted; the other five were parked normally.
    expect(media.pausesOf(real.el)).toBe(0);
    expect(real.el.muted).toBe(false);
    for (const play of media.plays.slice(1, 6)) {
      expect(media.pausesOf(play.el)).toBe(1);
    }
    // No Web Audio fallback fired underneath the real cue.
    expect(synth.createOscillator).not.toHaveBeenCalled();

    // Everything is unlocked now — a later prime replays nothing.
    sound.primeCorrectAudio();
    expect(media.plays).toHaveLength(7);
  });

  it('recovers from a rejected prime and keeps the real cue silent-fallback-free', async () => {
    const media = mockMedia('reject');
    const synth = stubSynthContext();
    const sound = new SoundEngine();

    sound.resume();
    sound.primeCorrectAudio(); // no user gesture available — all six reject
    expect(media.plays).toHaveLength(6);

    await flush();

    // Rejected primes restore the notes: unmuted, never paused, no synth.
    for (const play of media.plays) {
      expect(play.el.muted).toBe(false);
    }
    expect(media.pauses).toHaveLength(0);
    expect(synth.createOscillator).not.toHaveBeenCalled();

    // The first real in-gesture tap still plays the HTML Audio note.
    media.setMode('resolve');
    sound.playCorrect(1);
    expect(media.plays).toHaveLength(7);
    expect(media.plays[6].muted).toBe(false);
    await flush();
    expect(synth.createOscillator).not.toHaveBeenCalled();

    // Rejected notes were not marked unlocked: the next gesture re-primes the
    // remaining five (note 1 unlocked itself by actually playing).
    sound.primeCorrectAudio();
    expect(media.plays).toHaveLength(12);
  });

  it('stops an in-flight correct cue immediately when sound is turned off', async () => {
    const media = mockMedia('defer');
    const synth = stubSynthContext();
    const sound = new SoundEngine();

    sound.playCorrect(1);
    expect(media.plays).toHaveLength(1);

    sound.setEnabled(false);
    expect(media.pausesOf(media.plays[0].el)).toBe(1); // halted right away

    // The interrupted play() rejection must not fire the synth fallback.
    media.deferred[0].reject(new DOMException('interrupted', 'AbortError'));
    await flush();
    expect(synth.createOscillator).not.toHaveBeenCalled();

    // And nothing plays or primes while disabled.
    sound.playCorrect(2);
    sound.primeCorrectAudio();
    expect(media.plays).toHaveLength(1);
  });

  it('never fires the synth fallback for a play superseded by a newer cue', async () => {
    const media = mockMedia('defer');
    const synth = stubSynthContext();
    const sound = new SoundEngine();

    sound.playCorrect(1);
    sound.playCorrect(1); // rapid retap of the same note supersedes the first
    expect(media.plays).toHaveLength(2);

    media.deferred[0].reject(new DOMException('interrupted', 'AbortError'));
    media.deferred[1].resolve();
    await flush();

    // Exactly one audible cue: the aborted older play stays silent.
    expect(synth.createOscillator).not.toHaveBeenCalled();
  });
});
