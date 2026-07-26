import { useEffect, useRef, useState } from 'react';
import { MAX_LEVEL } from '../game/levels';
import type { BuiltLevel } from '../game/build';
// MAX_LEVEL is used only to decide the final "Finish" vs "Continue" label.
import type { Narrator } from '../audio/speech';
import { shouldAutoNarrate } from '../audio/speech';
import { Stars } from './Stars';

interface LevelCompleteProps {
  level: BuiltLevel;
  stars: number;
  mistakes: number;
  soundEnabled: boolean;
  showChinese: boolean;
  narrator: Narrator;
  onContinue: () => void;
  onQuit: () => void;
}

export function LevelComplete({
  level,
  stars,
  mistakes,
  soundEnabled,
  showChinese,
  narrator,
  onContinue,
  onQuit,
}: LevelCompleteProps) {
  const [speaking, setSpeaking] = useState(false);
  const started = useRef(false);
  const nextLevel = level.level + 1;

  const readAloud = () => {
    if (!narrator.supported) return;
    setSpeaking(true);
    narrator.speak(level.fullText, { slow: true, onend: () => setSpeaking(false) });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (shouldAutoNarrate(soundEnabled, narrator.supported)) {
      const id = window.setTimeout(readAloud, 700); // after the complete chord
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => narrator.stop(), [narrator]);

  const praise = stars === 3 ? 'Beautifully done!' : stars === 2 ? 'Well restored!' : 'You made it!';

  return (
    <div className="stage" role="region" aria-label={`Level ${level.level} complete`}>
      <div className="card center-col celebrate">
        <p className="eyebrow">Level {level.level} · Complete</p>
        <Stars value={stars} animate size={40} />
        <h1 className="title-xl" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.6rem)' }}>
          {praise}
        </h1>

        <p className="reference" style={{ display: 'block' }}>
          {level.reference}
          {showChinese && level.referenceZh && (
            <span className="reference-zh"> · {level.referenceZh}</span>
          )}
        </p>

        <div className="stat-row">
          <div className="stat">
            <div className="stat__num">{mistakes}</div>
            <div className="stat__label">{mistakes === 1 ? 'mistake' : 'mistakes'}</div>
          </div>
          <div className="stat">
            <div className="stat__num">{stars}/3</div>
            <div className="stat__label">stars</div>
          </div>
        </div>

        <div className="btn-row">
          {narrator.supported && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={speaking ? () => { narrator.stop(); setSpeaking(false); } : readAloud}
            >
              {speaking ? '⏹ Stop' : '▶ Hear it'}
            </button>
          )}
          {level.level < MAX_LEVEL ? (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              Continue to Level {nextLevel}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              Finish
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}
