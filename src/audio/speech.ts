import { cuvRecordingsSupported, recordingsForCuv } from './cuv-recordings';
import { webRecordingsSupported, recordingsForWeb } from './web-recordings';
import type { Recording } from './recordings';

interface SpeakOptions {
  onend?: () => void;
  onstart?: () => void;
  slow?: boolean;
  /** Full CUV verses only; callers must check the edition and fragment flag. */
  cuvVerses?: readonly string[];
  /** Full WEB verses only; callers must check the edition and fragment flag. */
  webVerses?: readonly string[];
}

/**
 * CUV and WEB scripture narration via local recordings, with browser speech fallback.
 * Passage narration is started by a tap on a Listen control. Short victory
 * praise is also available to the game after a successful round.
 * Degrades gracefully when recordings or browser speech are unavailable.
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

const VICTORY_PHRASES: Record<SpeechLanguage, string[]> = {
  en: ['Well done!', 'Beautifully restored!', 'Excellent work!', 'You remembered the Word!'],
  zh: ['做得好！', '经文恢复得很好！', '太棒了！', '你记住了神的话！'],
  ko: ['잘했어요!', '말씀을 아름답게 완성했어요!', '훌륭해요!', '말씀을 기억했어요!'],
};

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
  private audio: HTMLAudioElement | null = null;

  constructor() {
    this.supported = speechSupported() || cuvRecordingsSupported() || webRecordingsSupported();
    if (speechSupported()) {
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
    if (!speechSupported()) return;
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

  private speakInLanguage(
    text: string,
    language: SpeechLanguage,
    opts: { onend?: () => void; onstart?: () => void; slow?: boolean } = {},
  ): void {
    this.stop();
    if (!speechSupported()) {
      opts.onend?.();
      return;
    }
    const slow = opts.slow !== false;
    const rate = slow ? 0.7 : 0.95;
    const gapMs = slow ? 320 : 60;
    const segments = slow ? segmentForSpeech(text) : [text];
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

  /**
   * Speak text aloud. In slow mode (default) the passage is read clause by
   * clause with pauses. `onend` fires when narration finishes.
   */
  speak(
    text: string,
    opts: SpeakOptions = {},
  ): void {
    const clips = recordingsForCuv(text, opts.cuvVerses) ?? recordingsForWeb(text, opts.webVerses);
    if (clips && typeof Audio !== 'undefined') {
      this.speakRecordings(clips, opts);
      return;
    }
    this.speakInLanguage(text, detectSpeechLanguage(text), opts);
  }

  private speakRecordings(clips: Recording[], opts: SpeakOptions): void {
    this.stop();
    const id = ++this.sessionId;
    this.active = true;
    const audio = new Audio();
    this.audio = audio;
    audio.preload = 'none';
    // The files already use the selected 0.85 reading pace.
    audio.playbackRate = opts.slow === false ? 1 / 0.85 : 1;
    let index = 0;
    let started = false;
    let fallingBack = false;
    const next = () => {
      if (id !== this.sessionId) return;
      if (index >= clips.length) {
        this.active = false;
        audio.onended = audio.onerror = audio.onplaying = null;
        this.audio = null;
        this.sessionId++;
        opts.onend?.();
        return;
      }
      audio.src = clips[index].url;
      try {
        void audio.play().catch(fallback);
      } catch {
        fallback();
      }
    };
    const fallback = () => {
      if (id !== this.sessionId || fallingBack) return;
      fallingBack = true;
      // Finish the remaining verses if delivery fails, without replaying
      // the preceding ones or reviving a cancelled Listen session.
      this.speakInLanguage(clips.slice(index).map((clip) => clip.text).join(' '), detectSpeechLanguage(clips[index].text), {
        ...opts,
        onstart: started ? undefined : opts.onstart,
      });
    };
    audio.onplaying = () => {
      if (id !== this.sessionId || started) return;
      started = true;
      opts.onstart?.();
    };
    audio.onended = () => {
      if (id !== this.sessionId) return;
      index += 1;
      next();
    };
    audio.onerror = fallback;
    next();
  }

  /**
   * Short, randomized praise after a completed passage. The phrase follows
   * the language of the scripture rather than forcing an English voice, and
   * uses the same browser-native voice selection as Listen.
   */
  speakVictory(
    scriptureText: string,
    opts: { onend?: () => void; onstart?: () => void } = {},
  ): void {
    const language = detectSpeechLanguage(scriptureText);
    const phrases = VICTORY_PHRASES[language];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    this.speakInLanguage(phrase, language, { ...opts, slow: false });
  }

  stop(): void {
    this.sessionId++; // invalidate any in-flight queue
    this.active = false;
    if (this.audio) {
      this.audio.onended = this.audio.onerror = this.audio.onplaying = null;
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio = null;
    }
    if (!speechSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  isSpeaking(): boolean {
    if (this.audio) return this.active;
    if (!speechSupported()) return false;
    try {
      return this.active || window.speechSynthesis.speaking;
    } catch {
      return this.active;
    }
  }
}

export const narrator = new Narrator();
