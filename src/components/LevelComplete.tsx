import { useEffect, useState } from 'react';
import { MAX_LEVEL } from '../game/levels';
import type { BuiltLevel } from '../game/build';
// MAX_LEVEL is used only to decide the final "Finish" vs "Continue" label.
import type { Narrator } from '../audio/speech';
import { Stars } from './Stars';

interface LevelCompleteProps {
  level: BuiltLevel;
  stars: number;
  mistakes: number;
  narrator: Narrator;
  onContinue: () => void;
  modeLabel?: string;
  continueLabel?: string;
}

export function LevelComplete({
  level,
  stars,
  mistakes,
  narrator,
  onContinue,
  modeLabel,
  continueLabel,
}: LevelCompleteProps) {
  const [speaking, setSpeaking] = useState(false);
  const nextLevel = level.level + 1;

  // Narration never starts on its own here — the verse is read back only when
  // someone taps Listen.
  const readAloud = () => {
    if (!narrator.supported) return;
    setSpeaking(true);
    narrator.speak(level.fullText, { slow: true, onend: () => setSpeaking(false) });
  };

  const stopReading = () => {
    narrator.stop();
    setSpeaking(false);
  };

  useEffect(() => () => narrator.stop(), [narrator]);

  const praise = stars === 3 ? 'Beautifully done!' : stars === 2 ? 'Well restored!' : 'You made it!';

  return (
    <div
      className="stage stage--fit stage--complete"
      role="region"
      aria-label={`${modeLabel ?? `Level ${level.level}`} complete`}
    >
      <div className="card center-col celebrate">
        <p className="eyebrow">{modeLabel ?? `Level ${level.level}`} · Complete</p>
        <Stars value={stars} animate size={40} />
        <h1 className="title-xl" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.6rem)' }}>
          {praise}
        </h1>

        <p className="reference" style={{ display: 'block' }}>
          {level.reference}
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
          {narrator.supported &&
            (speaking ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={stopReading}>
                ⏹ Stop
              </button>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" onClick={readAloud}>
                ▶ Listen
              </button>
            ))}
          {continueLabel ? (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              {continueLabel}
            </button>
          ) : level.level < MAX_LEVEL ? (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              Continue to Level {nextLevel}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onContinue}>
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
