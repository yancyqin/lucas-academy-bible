import { HeartIcon } from './icons';

interface HeartsProps {
  total: number;
  remaining: number; // may be fractional (½, ¼ hearts)
  /** True to briefly animate the heart that just changed. */
  justLost?: boolean;
}

function label(remaining: number, total: number): string {
  return `${remaining} of ${total} ${total === 1 ? 'heart' : 'hearts'} remaining`;
}

export function Hearts({ total, remaining, justLost }: HeartsProps) {
  return (
    <span className="hearts" role="img" aria-label={label(remaining, total)}>
      {Array.from({ length: total }, (_, i) => {
        const frac = Math.max(0, Math.min(1, remaining - i));
        const edge = justLost && i === Math.floor(Math.max(0, remaining - 0.0001));
        return (
          <span
            key={i}
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
