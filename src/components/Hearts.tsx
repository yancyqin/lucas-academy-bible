import { HeartIcon } from './icons';

interface HeartsProps {
  total: number;
  remaining: number; // may be fractional (½, ¼ hearts)
  /** Increment for every damage event so the loss animation reliably restarts. */
  lossSeq?: number;
}

function label(remaining: number, total: number): string {
  return `${remaining} of ${total} ${total === 1 ? 'heart' : 'hearts'} remaining`;
}

export function Hearts({ total, remaining, lossSeq = 0 }: HeartsProps) {
  const lossIndex = Math.min(total - 1, Math.max(0, Math.floor(remaining)));
  return (
    <span
      className="hearts"
      role="img"
      aria-label={label(remaining, total)}
      data-loss-seq={lossSeq}
    >
      {Array.from({ length: total }, (_, i) => {
        const frac = Math.max(0, Math.min(1, remaining - i));
        const edge = lossSeq > 0 && i === lossIndex;
        return (
          <span
            key={`${i}-${lossSeq}`}
            className={`heart ${frac > 0 ? 'heart--full' : 'heart--empty'} ${edge ? 'heart--lost' : ''}`}
            aria-hidden="true"
          >
            <HeartIcon fill={frac} />
          </span>
        );
      })}
    </span>
  );
}
