/**
 * Scripture narration via the browser SpeechSynthesis API. English only.
 * Degrades gracefully: if speech synthesis is unavailable, every method is a
 * safe no-op and `supported` is false so callers can hide the Listen button.
 */

export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Pure decision: should we auto-narrate when a study phase opens?
 * Only when sound is on AND speech is supported — never when muted.
 * `supported` is injectable for testing.
 */
export function shouldAutoNarrate(
  soundEnabled: boolean,
  supported: boolean = speechSupported(),
): boolean {
  return soundEnabled === true && supported === true;
}

/** Score a voice for "natural English" preference (higher = better). */
function scoreVoice(v: SpeechSynthesisVoice): number {
  let score = 0;
  const name = v.name.toLowerCase();
  const lang = (v.lang || '').toLowerCase();
  if (lang.startsWith('en')) score += 5;
  if (lang === 'en-us' || lang === 'en_us') score += 2;
  if (/natural|neural|premium|enhanced/.test(name)) score += 4;
  if (/samantha|aria|jenny|google us english|daniel|serena|allison|ava/.test(name)) score += 3;
  if (v.localService) score += 1;
  return score;
}

export class Narrator {
  readonly supported: boolean;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.supported = speechSupported();
    if (this.supported) {
      this.refreshVoice();
      // Voices often load asynchronously.
      try {
        window.speechSynthesis.addEventListener?.('voiceschanged', () => this.refreshVoice());
      } catch {
        /* older browsers: onvoiceschanged only */
        try {
          window.speechSynthesis.onvoiceschanged = () => this.refreshVoice();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private refreshVoice(): void {
    if (!this.supported) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      const english = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('en'));
      const pool = english.length ? english : voices;
      this.voice = pool.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
    } catch {
      this.voice = null;
    }
  }

  getVoiceName(): string | null {
    return this.voice?.name ?? null;
  }

  /** Speak text aloud. `onend` fires when narration finishes or is cancelled. */
  speak(text: string, opts: { onend?: () => void; onstart?: () => void } = {}): void {
    if (!this.supported) {
      opts.onend?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang || 'en-US';
      u.rate = 0.92; // a touch slower — calm, memorizable
      u.pitch = 1.0;
      u.volume = 1.0;
      if (opts.onstart) u.onstart = () => opts.onstart?.();
      u.onend = () => opts.onend?.();
      u.onerror = () => opts.onend?.();
      window.speechSynthesis.speak(u);
    } catch {
      opts.onend?.();
    }
  }

  stop(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  isSpeaking(): boolean {
    if (!this.supported) return false;
    try {
      return window.speechSynthesis.speaking;
    } catch {
      return false;
    }
  }
}

export const narrator = new Narrator();
