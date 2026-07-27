import { useEffect, useRef, useState } from 'react';
import type { BuiltLevel } from '../game/build';
import type { Narrator } from '../audio/speech';
import { shouldAutoNarrate } from '../audio/speech';
import type { SoundEngine } from '../audio/sound';
import { Hearts } from './Hearts';
import { isCjkText, tokenize } from '../game/chunk';

interface StudyPhaseProps {
  built: BuiltLevel;
  soundEnabled: boolean;
  narrator: Narrator;
  sound: SoundEngine;
  onReady: () => void;
  announce: (msg: string, assertive?: boolean) => void;
  modeLabel?: string;
  practiceMode?: boolean;
}

/** About 171 words per minute: a deliberate pace for attentive memorization. */
const WORD_READING_MS = 350;

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function wordCount(text: string): number {
  return tokenize(text.trim()).filter(Boolean).length;
}

function AnimatedWords({
  text,
  startIndex,
  wordTimeMs,
}: {
  text: string;
  startIndex: number;
  wordTimeMs: number;
}) {
  const chinese = isCjkText(text);
  let wordOffset = 0;
  return tokenize(text).map((part, index) => {
    const animationIndex = startIndex + wordOffset;
    wordOffset += 1;
    return (
      <span key={`${animationIndex}-${index}`}>
        {!chinese && index > 0 ? ' ' : ''}
        <span
          className="study__word"
          style={{
            animationDelay: `${animationIndex * wordTimeMs}ms`,
            animationDuration: `${wordTimeMs}ms`,
          }}
        >
          {part}
        </span>
      </span>
    );
  });
}

export function StudyPhase({
  built,
  soundEnabled,
  narrator,
  sound,
  onReady,
  announce,
  modeLabel,
  practiceMode = false,
}: StudyPhaseProps) {
  const total = built.memorizeSeconds;
  const [left, setLeft] = useState(total);
  const [speaking, setSpeaking] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const startedNarration = useRef(false);

  const readAloud = () => {
    if (!narrator.supported) return;
    sound.resume();
    setSpeaking(true);
    narrator.speak(built.fullText, { slow: true, onend: () => setSpeaking(false) });
  };

  const stopReading = () => {
    narrator.stop();
    setSpeaking(false);
  };

  // Countdown: the interval only decrements (a pure state update).
  useEffect(() => {
    if (practiceMode) return undefined;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [practiceMode]);

  // When it hits zero, announce + advance — in an effect, never inside a
  // setState updater (which would setState during render).
  useEffect(() => {
    if (practiceMode || left > 0) return undefined;
    announce('Time is up. Rebuild the verse now.', true);
    const id = window.setTimeout(() => onReadyRef.current(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, practiceMode]);

  // Auto-narrate once (slow) when memorize opens — only if sound is on.
  useEffect(() => {
    if (startedNarration.current) return;
    startedNarration.current = true;
    announce(
      practiceMode
        ? `Practice mode. Memorize ${built.reference}. Take as much time as you need.`
        : `Memorize ${built.reference}. ${total} seconds.`,
    );
    if (shouldAutoNarrate(soundEnabled, narrator.supported)) {
      const id = window.setTimeout(readAloud, 350);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => narrator.stop(), [narrator]);

  const startRecall = () => {
    narrator.stop();
    announce('Rebuild the verse now.');
    onReadyRef.current();
  };

  const pct = Math.max(0, Math.min(1, left / total));
  const urgent = pct <= 0.25;
  const wordTimeMs = WORD_READING_MS;
  let verseWordOffset = 0;

  return (
    <div className="stage stage--fit stage--study" role="region" aria-label={`Memorize ${built.reference}`}>
      <div className="card">
        <div className="study__scroll">
          <div className="study__meta">
            <span className="eyebrow">{modeLabel ?? `Level ${built.level}`} · Memorize</span>
            <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
              <Hearts total={built.hearts} remaining={built.hearts} />
            </span>
          </div>

          {practiceMode ? (
            <div className="memo memo--practice" role="status">
              <span className="memo__practice-mark" aria-hidden="true">∞</span>
              <span className="memo__practice-label">Practice Mode · No timer</span>
            </div>
          ) : (
            <div
              className={`memo ${urgent ? 'memo--urgent' : ''}`}
              role="timer"
              aria-label={`${left} seconds left to memorize`}
            >
              <div className="memo__track">
                <div className="memo__fill" style={{ width: `${pct * 100}%` }} />
              </div>
              <span className="memo__digits" aria-hidden="true">
                {clock(left)}
              </span>
            </div>
          )}

          <p className="reference" style={{ display: 'block', marginTop: 12 }}>
            {built.reference}
          </p>

          <blockquote className="scripture study__scripture">
            {built.verses.length > 1
              ? built.verses.map((v, i) => {
                  const startIndex = verseWordOffset;
                  verseWordOffset += wordCount(v.text);
                  return (
                    <span key={`${v.verse}-${i}`}>
                      <sup
                        style={{ color: 'var(--gold-deep)', fontWeight: 700, marginRight: 3, fontSize: '0.6em' }}
                        aria-hidden="true"
                      >
                        {v.verse}
                      </sup>
                      <AnimatedWords
                        text={v.text}
                        startIndex={startIndex}
                        wordTimeMs={wordTimeMs}
                      />
                      {i < built.verses.length - 1 ? ' ' : ''}
                    </span>
                  );
                })
              : (
                <AnimatedWords
                  text={built.fullText}
                  startIndex={0}
                  wordTimeMs={wordTimeMs}
                />
              )}
          </blockquote>

        </div>

        <div className="divider" />

        <div className="btn-row study__actions" style={{ justifyContent: 'space-between' }}>
          <div className="btn-row study__listen" style={{ justifyContent: 'flex-start' }}>
            {narrator.supported ? (
              speaking ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={stopReading}>
                  ⏹ Stop
                </button>
              ) : (
                <button type="button" className="btn btn--ghost btn--sm" onClick={readAloud}>
                  ▶ Listen
                </button>
              )
            ) : (
              <span className="progress-caption">Narration unavailable in this browser</span>
            )}
          </div>

          <div className="btn-row study__start">
            <button type="button" className="btn btn--primary" onClick={startRecall}>
              Start recall
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
