/**
 * Scripture narration via the browser SpeechSynthesis API.
 * Narration is always started by a tap on a Listen control — nothing here ever
 * speaks on its own.
 * Degrades gracefully: if speech synthesis is unavailable, every method is a
 * safe no-op and `supported` is false so callers can hide the Listen button.
 *
 * "Slow" mode reads the passage clause-by-clause with a pause between clauses
 * AND a reduced rate. Gap-pacing matters because browsers (notably iOS Safari)
 * clamp very low `rate` values — pauses are what actually make it feel slower.
 */

export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export type SpeechLanguage = 'en' | 'zh' | 'ko';

/** Detect the spoken language from the scripture text itself. */
export function detectSpeechLanguage(text: string): SpeechLanguage {
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  return 'en';
}

/** Break text into clause-sized segments for gap-paced narration. */
export function segmentForSpeech(text: string): string[] {
  if (/\p{Script=Han}/u.test(text)) {
    return (
      text.match(/[^，；：。！？]+[，；：。！？]+[”’"」』】）)]*|[^，；：。！？]+$/gu) ??
      [text]
    );
  }
  const tokens = text.split(' ');
  const segments: string[] = [];
  let cur: string[] = [];
  const clauseEnd = /[,;:.!?”’")]$/;
  for (const tok of tokens) {
    cur.push(tok);
    if ((clauseEnd.test(tok) && cur.length >= 2) || cur.length >= 8) {
      segments.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) segments.push(cur.join(' '));
  return segments.length ? segments : [text];
}

function scoreVoice(v: SpeechSynthesisVoice, language: SpeechLanguage): number {
  let score = 0;
  const name = v.name.toLowerCase();
  const lang = (v.lang || '').toLowerCase();
  if (lang.startsWith(language)) score += 5;
  if (language === 'en' && (lang === 'en-us' || lang === 'en_us')) score += 2;
  if (language === 'zh' && /zh-(cn|tw|hans|hant)/.test(lang)) score += 2;
  if (language === 'ko' && (lang === 'ko-kr' || lang === 'ko_kr')) score += 2;
  if (/natural|neural|premium|enhanced/.test(name)) score += 4;
  if (
    language === 'en' &&
    /samantha|aria|jenny|google us english|daniel|serena|allison|ava/.test(name)
  ) {
    score += 3;
  }
  if (language === 'zh' && /ting|mei|xiaoxiao|yunxi|google.*中文|mandarin/.test(name)) {
    score += 3;
  }
  if (language === 'ko' && /yuna|sunhi|google.*한국|korean/.test(name)) {
    score += 3;
  }
  if (v.localService) score += 1;
  return score;
}

export class Narrator {
  readonly supported: boolean;
  private voices: SpeechSynthesisVoice[] = [];
  private sessionId = 0;
  private active = false;

  constructor() {
    this.supported = speechSupported();
    if (this.supported) {
      this.refreshVoice();
      try {
        window.speechSynthesis.addEventListener?.('voiceschanged', () => this.refreshVoice());
      } catch {
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
      this.voices = [...voices];
    } catch {
      this.voices = [];
    }
  }

  getVoiceName(): string | null {
    return this.bestVoice('en')?.name ?? null;
  }

  private bestVoice(language: SpeechLanguage): SpeechSynthesisVoice | null {
    const matching = this.voices.filter((voice) =>
      (voice.lang || '').toLowerCase().startsWith(language),
    );
    // If Korean is not installed, keep the requested ko-KR language and let
    // the browser resolve its default instead of forcing an English voice.
    const pool =
      matching.length || language !== 'ko'
        ? matching.length
          ? matching
          : this.voices
        : [];
    return (
      pool
        .slice()
        .sort((first, second) =>
          scoreVoice(second, language) - scoreVoice(first, language),
        )[0] ?? null
    );
  }

  /**
   * Speak text aloud. In slow mode (default) the passage is read clause by
   * clause with pauses. `onend` fires when narration finishes or is cancelled.
   */
  speak(
    text: string,
    opts: { onend?: () => void; onstart?: () => void; slow?: boolean } = {},
  ): void {
    if (!this.supported) {
      opts.onend?.();
      return;
    }
    const slow = opts.slow !== false;
    const rate = slow ? 0.7 : 0.95;
    const gapMs = slow ? 320 : 60;
    const segments = slow ? segmentForSpeech(text) : [text];
    const language = detectSpeechLanguage(text);
    const voice = this.bestVoice(language);

    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }

    const id = ++this.sessionId;
    this.active = true;
    let i = 0;
    let started = false;

    const finish = () => {
      if (id !== this.sessionId) return;
      this.active = false;
      opts.onend?.();
    };

    const next = () => {
      if (id !== this.sessionId) return; // cancelled/superseded
      if (i >= segments.length) {
        finish();
        return;
      }
      const chunk = segments[i++];
      try {
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) u.voice = voice;
        u.lang =
          voice?.lang ||
          (language === 'zh'
            ? 'zh-CN'
            : language === 'ko'
              ? 'ko-KR'
              : 'en-US');
        u.rate = rate;
        u.pitch = 1.0;
        u.volume = 1.0;
        if (!started) {
          started = true;
          u.onstart = () => opts.onstart?.();
        }
        u.onend = () => {
          if (id !== this.sessionId) return;
          window.setTimeout(next, gapMs);
        };
        u.onerror = () => {
          if (id !== this.sessionId) return;
          window.setTimeout(next, gapMs);
        };
        window.speechSynthesis.speak(u);
      } catch {
        finish();
      }
    };

    next();
  }

  stop(): void {
    this.sessionId++; // invalidate any in-flight queue
    this.active = false;
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
      return this.active || window.speechSynthesis.speaking;
    } catch {
      return this.active;
    }
  }
}

export const narrator = new Narrator();
