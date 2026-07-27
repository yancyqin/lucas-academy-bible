import type { BuiltLevel } from '../game/build';

interface FailureRevealProps {
  level: BuiltLevel;
  onContinue: () => void;
  modeLabel?: string;
}

export function FailureReveal({
  level,
  onContinue,
  modeLabel,
}: FailureRevealProps) {
  return (
    <div
      className="stage stage--fit stage--failure-reveal"
      role="region"
      aria-label={`Review ${level.reference}`}
    >
      <div className="card center-col failure-reveal">
        <p className="eyebrow">{modeLabel ?? `Level ${level.level}`} · Review</p>
        <h1 className="title-xl failure-reveal__title">Here is the verse</h1>

        <p className="reference" style={{ display: 'block' }}>
          {level.reference}
        </p>

        <div className="failure-reveal__scroll">
          <blockquote className="restored failure-reveal__verse">
            {level.verses.length > 1
              ? level.verses.map((verse, index) => (
                  <span key={`${verse.verse}-${index}`}>
                    <sup aria-hidden="true">{verse.verse}</sup>
                    {verse.text}
                    {index < level.verses.length - 1 ? ' ' : ''}
                  </span>
                ))
              : level.fullText}
          </blockquote>

        </div>

        <div className="btn-row failure-reveal__actions">
          <button type="button" className="btn btn--primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
