import { LEVELS, TOTAL_LEVELS } from '../game/levels';
import type { Progress } from '../game/progress';
import { totalStars } from '../game/progress';
import { BookMark } from './icons';
import { SoundToggle } from './SoundToggle';

interface WelcomeProps {
  progress: Progress;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onStartLevel: (level: number) => void;
}

export function Welcome({ progress, soundEnabled, onToggleSound, onStartLevel }: WelcomeProps) {
  const hasPlayed = progress.completed.length > 0 || progress.currentLevel > 1;
  const continueLevel = Math.min(
    TOTAL_LEVELS,
    Math.max(progress.currentLevel, progress.highestUnlocked),
  );
  const stars = totalStars(progress);

  return (
    <div className="stage" role="region" aria-label="Welcome">
      <div className="card center-col celebrate">
        <div style={{ width: 64, height: 64 }} aria-hidden="true">
          <BookMark />
        </div>
        <p className="eyebrow">Lucas Academy</p>
        <h1 className="title-xl">Bible Sequence</h1>
        <p className="subtitle">Remember the Word. Restore the Verse.</p>
        <p className="lede">Study each passage, then rebuild it in the correct order.</p>

        {hasPlayed && (
          <div className="stat-row" aria-label="Your progress">
            <div className="stat">
              <div className="stat__num">
                {progress.completed.length}
                <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>/{TOTAL_LEVELS}</span>
              </div>
              <div className="stat__label">Levels done</div>
            </div>
            <div className="stat">
              <div className="stat__num">
                {stars}
                <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>/{TOTAL_LEVELS * 3}</span>
              </div>
              <div className="stat__label">Stars</div>
            </div>
          </div>
        )}

        <div className="btn-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onStartLevel(hasPlayed ? continueLevel : 1)}
          >
            {hasPlayed ? `Continue · Level ${continueLevel}` : 'Begin Level 1'}
          </button>
          <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
        </div>

        <p className="progress-caption" aria-hidden="true">
          Level {continueLevel} of {TOTAL_LEVELS}
        </p>

        <div className="divider" />

        <div style={{ width: '100%' }}>
          <p className="reference" style={{ marginBottom: 10, display: 'block' }}>
            Choose a level
          </p>
          <div className="levelmap" role="list" aria-label={`Levels, 1 to ${TOTAL_LEVELS}`}>
            {LEVELS.map((l) => {
              const done = progress.completed.includes(l.level);
              const unlocked = l.level <= progress.highestUnlocked;
              const isCurrent = l.level === continueLevel && !done;
              const starsHere = progress.stars[l.level] ?? 0;
              const cls = [
                'levelnode',
                done ? 'levelnode--done' : '',
                isCurrent ? 'levelnode--current' : '',
                !unlocked ? 'levelnode--locked' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={l.level}
                  type="button"
                  role="listitem"
                  className={cls}
                  disabled={!unlocked}
                  onClick={() => unlocked && onStartLevel(l.level)}
                  aria-label={
                    `Level ${l.level}, ${l.reference}. ` +
                    (!unlocked
                      ? 'Locked.'
                      : done
                        ? `Completed, ${starsHere} of 3 stars.`
                        : 'Ready to play.')
                  }
                >
                  <span>{l.level}</span>
                  <span className="levelnode__stars" aria-hidden="true">
                    {done ? '★'.repeat(starsHere) : unlocked ? '' : ''}
                  </span>
                  {!unlocked && (
                    <span className="levelnode__lock" aria-hidden="true">
                      🔒
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
