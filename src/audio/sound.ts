/**
 * Interaction sound via the Web Audio API — no audio files required.
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
  private enabled = true;
  readonly supported: boolean;

  constructor() {
    this.supported =
      typeof window !== 'undefined' &&
      !!(window.AudioContext ||
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) this.stopContextGain();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Create/resume the AudioContext. Call from within a user-gesture handler. */
  resume(): void {
    if (!this.supported || !this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  private stopContextGain(): void {
    // Let scheduled tones finish naturally; nothing to force-stop.
  }

  private ready(): boolean {
    return this.supported && this.enabled && this.ctx !== null && this.master !== null;
  }

  private tone(freq: number, startOffset: number, duration: number, opts: ToneOpts = {}): void {
    if (!this.ready()) return;
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

  /** Soft cue when a study/level begins. */
  playStart(): void {
    this.tone(392.0, 0, 0.16, { type: 'sine', gain: 0.16 });
    this.tone(587.33, 0.09, 0.22, { type: 'sine', gain: 0.14 });
  }

  /** Gentle click for a neutral action. */
  playClick(): void {
    this.tone(660, 0, 0.06, { type: 'triangle', gain: 0.12, release: 0.06 });
  }

  /** Ascending pentatonic note; pitch rises with the streak. */
  playCorrect(streak = 1): void {
    // A major pentatonic: A C# E F# A ...
    const scale = [440, 554.37, 659.25, 739.99, 880, 1108.73];
    const note = scale[Math.max(0, streak - 1) % scale.length];
    this.tone(note, 0, 0.14, { type: 'sine', gain: 0.2 });
    this.tone(note * 2, 0.0, 0.1, { type: 'sine', gain: 0.05 });
  }

  /** Soft low note for a wrong pick — mellow, not a buzzer. */
  playWrong(): void {
    this.tone(196.0, 0, 0.18, { type: 'sine', gain: 0.16, release: 0.12 });
    this.tone(185.0, 0.05, 0.16, { type: 'sine', gain: 0.1 });
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
