import { useEffect, useRef, useState } from 'react';
import { TOTAL_LEVELS, type LevelConfig } from '../game/levels';
import type { Passage } from '../data/scripture';
import type { Narrator } from '../audio/speech';
import { shouldAutoNarrate } from '../audio/speech';
import type { SoundEngine } from '../audio/sound';
import { Hearts } from './Hearts';

interface StudyPhaseProps {
  config: LevelConfig;
  passage: Passage;
  soundEnabled: boolean;
  narrator: Narrator;
  sound: SoundEngine;
  onReady: () => void;
  onBack: () => void;
  announce: (msg: string) => void;
}

export function StudyPhase({
  config,
  passage,
  soundEnabled,
  narrator,
  sound,
  onReady,
  onBack,
  announce,
}: StudyPhaseProps) {
  const [seconds, setSeconds] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const startedNarration = useRef(false);

  // Elapsed-time indicator — subtle, non-pressuring.
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const readAloud = () => {
    if (!narrator.supported) return;
    sound.resume();
    setSpeaking(true);
    narrator.speak(passage.text, {
      onend: () => setSpeaking(false),
    });
  };

  const stopReading = () => {
    narrator.stop();
    setSpeaking(false);
  };

  // Auto-narrate once when the study phase opens — only if sound is on.
  useEffect(() => {
    if (startedNarration.current) return;
    startedNarration.current = true;
    if (shouldAutoNarrate(soundEnabled, narrator.supported)) {
      // Slight delay so the screen settles before narration begins.
      const id = window.setTimeout(readAloud, 350);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop narration when leaving study.
  useEffect(() => () => narrator.stop(), [narrator]);

  const proceed = () => {
    narrator.stop();
    announce('Recall phase. Rebuild the passage in order.');
    onReady();
  };

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="stage" role="region" aria-label={`Study ${passage.reference}`}>
      <div className="card">
        <div className="study__meta">
          <span className="eyebrow">
            Level {config.level} of {TOTAL_LEVELS} · Study
          </span>
          <span className="study__meta-right" style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            <Hearts total={config.hearts} remaining={config.hearts} />
            <span className="timer" aria-hidden="true">
              <span className="timer__dot" />
              {mm}:{ss}
            </span>
          </span>
        </div>

        <p className="reference" style={{ display: 'block', marginTop: 6 }}>
          {passage.reference}
        </p>

        <blockquote className="scripture study__scripture">
          {passage.verses.length > 1
            ? passage.verses.map((v, i) => (
                <span key={v.verse}>
                  <sup
                    style={{ color: 'var(--gold-deep)', fontWeight: 700, marginRight: 3, fontSize: '0.6em' }}
                    aria-hidden="true"
                  >
                    {v.verse}
                  </sup>
                  {v.text}
                  {i < passage.verses.length - 1 ? ' ' : ''}
                </span>
              ))
            : passage.text}
        </blockquote>

        <p className="study__hint">Take your time. When the passage feels familiar, begin.</p>

        <div className="divider" />

        <div className="btn-row" style={{ justifyContent: 'space-between' }}>
          <div className="btn-row" style={{ justifyContent: 'flex-start' }}>
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

          <div className="btn-row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
              Level map
            </button>
            <button type="button" className="btn btn--primary" onClick={proceed}>
              I&rsquo;m Ready
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
