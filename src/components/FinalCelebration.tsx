import { useEffect, useRef } from 'react';
import { TOTAL_LEVELS } from '../game/levels';
import type { Progress } from '../game/progress';
import { totalStars } from '../game/progress';
import type { SoundEngine } from '../audio/sound';
import { Stars } from './Stars';
import { BookMark } from './icons';

interface FinalCelebrationProps {
  progress: Progress;
  level20Reference: string;
  soundEnabled: boolean;
  sound: SoundEngine;
  onPlayAgain: () => void;
  onReview: () => void;
}

export function FinalCelebration({
  progress,
  level20Reference,
  soundEnabled,
  sound,
  onPlayAgain,
  onReview,
}: FinalCelebrationProps) {
  const played = useRef(false);
  const stars = totalStars(progress);
  const maxStars = TOTAL_LEVELS * 3;

  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (soundEnabled) {
      sound.resume();
      sound.playFinale();
    }
  }, [soundEnabled, sound]);

  return (
    <div className="stage" role="region" aria-label="All levels complete">
      <div className="card center-col celebrate">
        <div style={{ width: 72, height: 72 }} aria-hidden="true">
          <BookMark />
        </div>
        <p className="eyebrow">Journey complete</p>
        <h1 className="title-xl">You restored all 20 passages.</h1>
        <Stars value={3} animate size={40} />

        <div className="stat-row">
          <div className="stat">
            <div className="stat__num">{progress.completed.length}</div>
            <div className="stat__label">passages</div>
          </div>
          <div className="stat">
            <div className="stat__num">
              {stars}
              <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>/{maxStars}</span>
            </div>
            <div className="stat__label">total stars</div>
          </div>
        </div>

        <div className="divider" />
        <p className="lede" style={{ textAlign: 'center' }}>
          Your final passage was
        </p>
        <p className="reference" style={{ display: 'block', fontSize: '1rem' }}>
          {level20Reference}
        </p>

        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReview}>
            Review any level
          </button>
        </div>
      </div>
    </div>
  );
}
