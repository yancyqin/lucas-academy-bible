/**
 * Interaction sound via Web Audio plus one original, locally hosted damage cue.
 *
 * Design goals from the spec: soft, warm, never a harsh buzzer. All tones are
 * gentle sine/triangle waves with short envelopes. The engine:
 *   - only builds an AudioContext after a user gesture (autoplay-safe),
 *   - no-ops silently when Web Audio is unavailable or sound is disabled,
 *   - is never the sole channel of information (UI + a11y carry meaning too).
 */

type OscType = OscillatorType;

interface ToneOpts {
  type?: OscType;
  gain?: number;
  attack?: number;
  release?: number;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private damageAudio: HTMLAudioElement | null = null;
  private correctAudio: HTMLAudioElement[] = [];
  private correctPlaybackSeq = 0;
  private resumePending: Promise<void> | null = null;
  private enabled = true;
  readonly supported: boolean;

  constructor() {
    this.supported =
      typeof window !== 'undefined' &&
      (!!(window.AudioContext ||
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) ||
        typeof Audio !== 'undefined');
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.correctPlaybackSeq += 1;
      this.stopContextGain();
      this.damageAudio?.pause();
      this.correctAudio.forEach((audio) => audio.pause());
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Create/resume the AudioContext. Call from within a user-gesture handler. */
  resume(): Promise<void> {
    if (!this.supported || !this.enabled) return Promise.resolve();
    this.prepareDamageAudio();
    this.prepareCorrectAudio();
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return Promise.resolve();
      if (!this.ctx) {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'running') return Promise.resolve();
      if (this.resumePending) return this.resumePending;

      // Safari may report a non-standard "interrupted" state after narration
      // or backgrounding. Keep one shared promise so a cue can wait for the
      // context to be genuinely running instead of losing its first note.
      const context = this.ctx;
      this.resumePending = context
        .resume()
        .catch(() => {
          // A later user gesture can retry; audio never blocks gameplay.
        })
        .finally(() => {
          this.resumePending = null;
        });
      return this.resumePending;
    } catch {
      this.ctx = null;
      this.master = null;
      this.resumePending = null;
      return Promise.resolve();
    }
  }

  private prepareDamageAudio(): void {
    if (this.damageAudio || typeof Audio === 'undefined') return;
    try {
      const src = new URL('audio/damage.wav', document.baseURI).href;
      this.damageAudio = new Audio(src);
      this.damageAudio.preload = 'auto';
      this.damageAudio.volume = 1;
      this.damageAudio.load();
    } catch {
      this.damageAudio = null;
    }
  }

  private prepareCorrectAudio(): void {
    if (this.correctAudio.length || typeof Audio === 'undefined') return;
    try {
      const filenames = [
        'correct.wav',
        'correct-2.wav',
        'correct-3.wav',
        'correct-4.wav',
        'correct-5.wav',
        'correct-6.wav',
      ];
      this.correctAudio = filenames.map((filename) => {
        const src = new URL(`audio/${filename}`, document.baseURI).href;
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume = 1;
        audio.load();
        return audio;
      });
    } catch {
      this.correctAudio = [];
    }
  }

  private playDamageAudio(volume: number): boolean {
    if (!this.enabled) return false;
    this.prepareDamageAudio();
    const audio = this.damageAudio;
    if (!audio) return false;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = volume;
      const playback = audio.play();
      if (playback) {
        void playback.catch(() => this.playWrongSynth());
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Warm Safari's media audio session after speech synthesis ends. iOS can
   * swallow the first audible clip while switching away from narration, even
   * though play() was called from a tap. A nearly silent, short play on the
   * first scale element makes the subsequent first-word cue reliable.
   */
  primeCorrectAudio(): void {
    if (!this.enabled) return;
    this.prepareCorrectAudio();
    const audio = this.correctAudio[0];
    if (!audio) return;

    const token = ++this.correctPlaybackSeq;
    const finishPrime = () => {
      window.setTimeout(() => {
        if (token !== this.correctPlaybackSeq) return;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
      }, 48);
    };

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0.01;
      audio.playbackRate = 1;
      const playback = audio.play();
      if (playback) {
        void playback.then(finishPrime).catch(() => {
          if (token === this.correctPlaybackSeq) audio.volume = 1;
        });
      } else {
        finishPrime();
      }
    } catch {
      if (token === this.correctPlaybackSeq) audio.volume = 1;
    }
  }

  private stopContextGain(): void {
    // Let scheduled tones finish naturally; nothing to force-stop.
  }

  private ready(): boolean {
    return (
      this.supported &&
      this.enabled &&
      this.ctx !== null &&
      this.ctx.state === 'running' &&
      this.master !== null
    );
  }

  private tone(freq: number, startOffset: number, duration: number, opts: ToneOpts = {}): void {
    if (!this.ready()) {
      void this.resume().then(() => {
        if (this.ready()) this.tone(freq, startOffset, duration, opts);
      });
      return;
    }
    const ctx = this.ctx as AudioContext;
    const master = this.master as GainNode;
    const t0 = ctx.currentTime + startOffset;
    const { type = 'sine', gain = 0.22, attack = 0.012, release = 0.18 } = opts;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + release + 0.02);
  }

  /** Short synthesized pitch glide for original game-like cues. */
  private sweep(
    from: number,
    to: number,
    startOffset: number,
    duration: number,
    opts: ToneOpts = {},
  ): void {
    if (!this.ready()) {
      void this.resume().then(() => {
        if (this.ready()) {
          this.sweep(from, to, startOffset, duration, opts);
        }
      });
      return;
    }
    const ctx = this.ctx as AudioContext;
    const master = this.master as GainNode;
    const t0 = ctx.currentTime + startOffset;
    const { type = 'triangle', gain = 0.16, attack = 0.008, release = 0.1 } = opts;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + release + 0.02);
  }

  /** Soft cue when a study/level begins. */
  playStart(): void {
    this.tone(392.0, 0, 0.16, { type: 'sine', gain: 0.16 });
    this.tone(587.33, 0.09, 0.22, { type: 'sine', gain: 0.14 });
  }

  /** Gentle click for a neutral action. */
  playClick(): void {
    this.tone(660, 0, 0.06, { type: 'triangle', gain: 0.12, release: 0.06 });
  }

  /**
   * Ascending A-major pentatonic correct-cue. Each note is a separately
   * rendered clip with the original two-sine timbre and full decay, rather than
   * a speed-shifted sample. It keeps the reliable HTML Audio path on mobile
   * without sacrificing the musical scale. Falls back to Web Audio if needed.
   */
  playCorrect(streak = 1): void {
    if (!this.enabled) return;
    this.prepareCorrectAudio();
    const noteIndex = Math.max(0, streak - 1) % 6;
    const audio = this.correctAudio[noteIndex];
    if (audio) {
      try {
        this.correctPlaybackSeq += 1;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        audio.playbackRate = 1;
        const playback = audio.play();
        if (playback) void playback.catch(() => this.playCorrectSynth(streak));
        return;
      } catch {
        /* fall back to the synth below */
      }
    }
    this.playCorrectSynth(streak);
  }

  private playCorrectSynth(streak = 1): void {
    // A major pentatonic: A C# E F# A ...
    const scale = [440, 554.37, 659.25, 739.99, 880, 1108.73];
    const note = scale[Math.max(0, streak - 1) % scale.length];
    this.tone(note, 0, 0.14, { type: 'sine', gain: 0.2 });
    this.tone(note * 2, 0.0, 0.1, { type: 'sine', gain: 0.05 });
  }

  private playWrongSynth(): void {
    this.sweep(720, 210, 0, 0.16, { type: 'triangle', gain: 0.26, release: 0.1 });
    this.tone(330, 0.025, 0.12, { type: 'square', gain: 0.16, release: 0.1 });
    this.tone(196, 0.11, 0.09, { type: 'triangle', gain: 0.18, release: 0.1 });
  }

  /** Loud original adventure-game damage cue, optimized for phone speakers. */
  playWrong(): void {
    if (!this.playDamageAudio(1)) this.playWrongSynth();
  }

  /** Clear but slightly lighter cue for each quarter-heart lost during overtime. */
  playHeartDrain(): void {
    if (!this.playDamageAudio(0.82)) {
      this.sweep(520, 240, 0, 0.12, { type: 'triangle', gain: 0.2, release: 0.08 });
      this.tone(293.66, 0.04, 0.08, { type: 'sine', gain: 0.14, release: 0.08 });
    }
  }

  /** Small lift when a verse/section is finished. */
  playSection(): void {
    this.tone(523.25, 0, 0.12, { type: 'sine', gain: 0.16 });
    this.tone(659.25, 0.1, 0.16, { type: 'sine', gain: 0.16 });
  }

  /** Warm major chord when a level is complete. */
  playComplete(): void {
    const chord = [523.25, 659.25, 783.99]; // C major
    chord.forEach((f, i) => this.tone(f, i * 0.04, 0.5, { type: 'sine', gain: 0.16, release: 0.5 }));
    this.tone(1046.5, 0.22, 0.4, { type: 'sine', gain: 0.08, release: 0.4 });
  }

  /** Distinct but restrained fanfare for finishing all 20 levels. */
  playFinale(): void {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => this.tone(f, i * 0.16, 0.3, { type: 'triangle', gain: 0.16 }));
    // sustained warm chord underneath
    [261.63, 329.63, 392.0].forEach((f) =>
      this.tone(f, 0.64, 0.9, { type: 'sine', gain: 0.12, release: 0.8 }),
    );
  }
}

export const soundEngine = new SoundEngine();
