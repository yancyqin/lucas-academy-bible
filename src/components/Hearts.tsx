import { HeartIcon } from './icons';

interface HeartsProps {
  total: number;
  remaining: number; // may be fractional (half hearts)
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
        const fill: 'full' | 'half' | 'empty' =
          remaining >= i + 1 ? 'full' : remaining >= i + 0.5 ? 'half' : 'empty';
        // Animate the slot at the current fractional boundary when a heart drops.
        const edge = justLost && i === Math.floor(remaining);
        const cls =
          fill === 'empty' ? 'heart--empty' : 'heart--full';
        return (
          <span
            key={i}
            className={`heart ${cls} ${edge ? 'heart--lost' : ''}`}
            aria-hidden="true"
          >
            <HeartIcon fill={fill} />
          </span>
        );
      })}
    </span>
  );
}
