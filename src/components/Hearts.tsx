import { HeartIcon } from './icons';

interface HeartsProps {
  total: number;
  remaining: number;
  /** Index that was just lost, to animate (optional). */
  justLost?: boolean;
}

export function Hearts({ total, remaining, justLost }: HeartsProps) {
  return (
    <span
      className="hearts"
      role="img"
      aria-label={`${remaining} of ${total} ${total === 1 ? 'heart' : 'hearts'} remaining`}
    >
      {Array.from({ length: total }, (_, i) => {
        const full = i < remaining;
        const isEdge = i === remaining && justLost;
        return (
          <span
            key={i}
            className={`heart ${full ? 'heart--full' : 'heart--empty'} ${isEdge ? 'heart--lost' : ''}`}
            aria-hidden="true"
          >
            <HeartIcon filled={full} />
          </span>
        );
      })}
    </span>
  );
}
