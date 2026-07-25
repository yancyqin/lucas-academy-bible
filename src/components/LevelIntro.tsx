import { TOTAL_LEVELS, type LevelConfig } from '../game/levels';
import { Hearts } from './Hearts';

interface LevelIntroProps {
  config: LevelConfig;
  verseCount: number;
  firstEver: boolean;
  onBegin: () => void;
  onBack: () => void;
}

export function LevelIntro({ config, verseCount, firstEver, onBegin, onBack }: LevelIntroProps) {
  const sectioned = config.sectioned && verseCount > 1;
  return (
    <div className="stage" role="region" aria-label={`Level ${config.level} introduction`}>
      <div className="card center-col">
        <p className="eyebrow">
          Level {config.level} of {TOTAL_LEVELS}
        </p>
        <h1 className="title-xl">{config.reference}</h1>

        {firstEver ? (
          <p className="lede">
            First you&rsquo;ll <strong>study</strong> the passage for as long as you like. Then the
            words are shuffled and you <strong>rebuild</strong> it in order by tapping the tiles.
            Watch out for extra words borrowed from other verses!
          </p>
        ) : (
          <p className="lede">
            Study the passage, then rebuild it in order.{' '}
            {sectioned ? "This one is longer, so you'll restore it one verse at a time." : ''}
          </p>
        )}

        <div className="stat-row">
          <div className="stat">
            <div className="stat__num" aria-hidden="true">
              <Hearts total={config.hearts} remaining={config.hearts} />
            </div>
            <div className="stat__label">
              {config.hearts} {config.hearts === 1 ? 'heart' : 'hearts'}
            </div>
          </div>
          {sectioned && (
            <div className="stat">
              <div className="stat__num">{verseCount}</div>
              <div className="stat__label">verses</div>
            </div>
          )}
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={onBegin}>
            Study this passage
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            Level map
          </button>
        </div>
      </div>
    </div>
  );
}
