import type { ScriptureAttribution } from '../game/build';

interface BibleAttributionProps {
  attributions: ScriptureAttribution[];
}

export function BibleAttribution({ attributions }: BibleAttributionProps) {
  return (
    <footer className="bible-attribution" aria-label="Bible translation copyright">
      {attributions.map((attribution) => (
        <span
          className="bible-attribution__item"
          key={`${attribution.abbreviation}-${attribution.title}`}
        >
          <span>
            {attribution.title} ({attribution.abbreviation})
          </span>
          {attribution.sourceLabel && attribution.sourceUrl && (
            <>
              {' · '}
              <a href={attribution.sourceUrl} target="_blank" rel="noreferrer">
                {attribution.sourceLabel}
              </a>
            </>
          )}
          {attribution.copyright && (
            <span className="bible-attribution__copyright">
              {' · '}
              {attribution.copyright}
            </span>
          )}
        </span>
      ))}
    </footer>
  );
}
