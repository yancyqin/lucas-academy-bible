import { useEffect, useRef, useState } from 'react';
import { TOTAL_LEVELS } from '../game/levels';
import type { BuiltLevel } from '../game/build';
import type { Narrator } from '../audio/speech';
import { shouldAutoNarrate } from '../audio/speech';
import { Stars } from './Stars';

interface LevelCompleteProps {
  level: BuiltLevel;
  stars: number;
  mistakes: number;
  attempts: number;
  soundEnabled: boolean;
  narrator: Narrator;
  onContinue: () => void;
  onReview: () => void;
}

export function LevelComplete({
  level,
  stars,
  mistakes,
  attempts,
  soundEnabled,
  narrator,
  onContinue,
  onReview,
}: LevelCompleteProps) {
  const [speaking, setSpeaking] = useState(false);
  const started = useRef(false);
  const nextLevel = level.level + 1;

  const readAloud = () => {
    if (!narrator.supported) return;
    setSpeaking(true);
    narrator.speak(level.fullText, { onend: () => setSpeaking(false) });
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
        <p className="eyebrow">
          Level {level.level} of {TOTAL_LEVELS} · Complete
        </p>
        <Stars value={stars} animate size={40} />
        <h1 className="title-xl" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.6rem)' }}>
          {praise}
        </h1>

        <p className="reference" style={{ display: 'block' }}>
          {level.reference}
        </p>
        <blockquote className="restored">{level.fullText}</blockquote>

        <div className="stat-row">
          <div className="stat">
            <div className="stat__num">{mistakes}</div>
            <div className="stat__label">{mistakes === 1 ? 'mistake' : 'mistakes'}</div>
          </div>
          <div className="stat">
            <div className="stat__num">{attempts}</div>
            <div className="stat__label">{attempts === 1 ? 'attempt' : 'attempts'}</div>
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
          {level.level < TOTAL_LEVELS ? (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              Continue to Level {nextLevel}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              Finish
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReview}>
            Level map
          </button>
        </div>
      </div>
    </div>
  );
}
