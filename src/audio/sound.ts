/**
 * Interaction sound via Web Audio plus original, locally hosted cue clips
 * (the damage cue and the six-note correct scale).
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

/**
 * The six-note ascending A-major pentatonic correct scale, one separately
 * rendered clip per note (see scripts/build_correct_cue.py):
 * A4 → C♯5 → E5 → F♯5 → A5 → C♯6.
 */
const CORRECT_CUE_FILES = [
  'correct.wav',
  'correct-2.wav',
  'correct-3.wav',
  'correct-4.wav',
  'correct-5.wav',
  'correct-6.wav',
];

/**
 * Cache-safe URL token for the rendered clips. The wav bytes have changed
 * under the same filenames; Safari's media cache on a phone that played an
 * older build can keep serving the stale first note. Bump whenever
 * scripts/build_correct_cue.py output changes.
 */
const CORRECT_CUE_VERSION = '20260728';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private damageAudio: HTMLAudioElement | null = null;
  private correctAudio: HTMLAudioElement[] = [];
  /**
   * Per-note claim counters. Every real playCorrect() bumps its note's
   * counter, so a prime still pending on that note can tell the note has been
   * claimed and must not pause/rewind/re-mute the player's actual cue (iOS
   * play() promises can settle seconds late after speech synthesis).
   */
  private correctSeq: number[] = [];
  /** Notes that finished a play() — Safari's per-element gesture unlock done. */
  private correctUnlocked: boolean[] = [];
  private correctPriming: boolean[] = [];
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
      this.stopContextGain();
      this.damageAudio?.pause();
      this.correctAudio.forEach((audio, index) => {
        // Claiming every note invalidates pending prime cleanups and keeps an
        // in-flight play() rejection from firing the synth fallback.
        this.correctSeq[index] += 1;
        audio.pause();
        audio.muted = false; // never leave a note muted for the next enable
      });
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
      this.correctAudio = CORRECT_CUE_FILES.map((filename) => {
        const src = new URL(
          `audio/${filename}?v=${CORRECT_CUE_VERSION}`,
          document.baseURI,
        ).href;
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume = 1;
        audio.load();
        return audio;
      });
      this.correctSeq = this.correctAudio.map(() => 0);
      this.correctUnlocked = this.correctAudio.map(() => false);
      this.correctPriming = this.correctAudio.map(() => false);
    } catch {
      this.correctAudio = [];
      this.correctSeq = [];
      this.correctUnlocked = [];
      this.correctPriming = [];
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
   * Unlock + warm every scale note for mobile Safari. Two iOS realities shape
   * this:
   *   - Each media element must play once from a user gesture before it can
   *     be replayed programmatically, and right after speech synthesis the
   *     first audible clip is often swallowed while the audio session
   *     switches back from narration. A sacrificial play per note absorbs
   *     both — and the unlock is per element, so all six notes need it.
   *   - iOS IGNORES the `volume` property (it is pinned to 1), so "nearly
   *     silent" priming at volume 0.01 is actually full volume on an iPhone.
   *     Prime MUTED instead — `muted` is honored — then pause and unmute once
   *     playback has actually started.
   * If a real cue claims a note while its prime is still pending (play()
   * promises settle seconds late on iOS), the prime's cleanup backs off
   * entirely so it can never pause, rewind, or re-mute the real note.
   * Safe to call outside a gesture: locked notes just reject and stay ready
   * for their first in-gesture play.
   */
  primeCorrectAudio(): void {
    if (!this.enabled) return;
    this.prepareCorrectAudio();
    this.correctAudio.forEach((audio, index) => {
      if (this.correctUnlocked[index] || this.correctPriming[index]) return;
      if (!audio.paused) return; // a real cue is already sounding this note
      const claim = this.correctSeq[index];
      try {
        audio.muted = true;
        const playback = audio.play();
        if (!playback) {
          // Ancient promiseless play(): stop straight away and restore.
          audio.pause();
          audio.muted = false;
          return;
        }
        this.correctPriming[index] = true;
        void playback
          .then(() => {
            this.correctPriming[index] = false;
            this.correctUnlocked[index] = true;
            // A real cue claimed this note while the prime was pending —
            // never pause or rewind it out from under the player.
            if (this.correctSeq[index] !== claim) return;
            audio.pause();
            try {
              audio.currentTime = 0;
            } catch {
              /* not seekable yet — the next play starts at 0 anyway */
            }
            audio.muted = false;
          })
          .catch(() => {
            // No user gesture available (or the load failed). Restore and let
            // the first real in-gesture play unlock the note itself.
            this.correctPriming[index] = false;
            if (this.correctSeq[index] === claim) audio.muted = false;
          });
      } catch {
        this.correctPriming[index] = false;
        if (this.correctSeq[index] === claim) audio.muted = false;
      }
    });
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
   * rendered clip with the original two-sine timbre and full decay, rather
   * than a speed-shifted sample. It keeps the reliable HTML Audio path on
   * mobile without sacrificing the musical scale, and only falls back to the
   * Web Audio synth when this exact play attempt fails while still being the
   * newest cue on its note.
   */
  playCorrect(streak = 1): void {
    if (!this.enabled) return;
    this.prepareCorrectAudio();
    const noteIndex = Math.max(0, streak - 1) % CORRECT_CUE_FILES.length;
    const audio = this.correctAudio[noteIndex];
    if (audio) {
      // Claim the note before anything else: a pending prime must never
      // pause or re-mute this play, and an older aborted play() must not
      // fire the synth fallback on top of it.
      const claim = ++this.correctSeq[noteIndex];
      try {
        audio.muted = false; // a pending prime may have muted this element
        audio.volume = 1;
        audio.playbackRate = 1;
        if (!audio.paused) audio.pause(); // retrigger the same note cleanly
        try {
          audio.currentTime = 0;
        } catch {
          // Safari throws when seeking before metadata has arrived. Playback
          // starts at 0 regardless — a failed seek must NOT abandon the
          // reliable HTML Audio path for the (possibly suspended) synth.
        }
        const playback = audio.play();
        if (playback) {
          void playback
            .then(() => {
              this.correctUnlocked[noteIndex] = true;
            })
            .catch(() => {
              // Only this note's newest play may fall back; a play aborted by
              // a newer cue or by Sound Off stays silent.
              if (this.correctSeq[noteIndex] === claim) {
                this.playCorrectSynth(streak);
              }
            });
        }
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
