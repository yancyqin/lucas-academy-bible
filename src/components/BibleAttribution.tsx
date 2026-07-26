import type { ScriptureAttribution } from '../game/build';

interface BibleAttributionProps {
  attribution?: ScriptureAttribution;
}

export function BibleAttribution({ attribution }: BibleAttributionProps) {
  if (!attribution) return null;

  return (
    <footer className="bible-attribution" aria-label="Bible translation copyright">
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
      {attribution.copyright && <span className="bible-attribution__copyright">{attribution.copyright}</span>}
    </footer>
  );
}
