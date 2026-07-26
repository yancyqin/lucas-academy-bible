import { useLayoutEffect, useRef } from 'react';
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
  const groupRef = useRef<HTMLSpanElement>(null);
  const damagedHeartRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (lossSeq <= 0) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const heart = damagedHeartRef.current;
    const group = groupRef.current;
    if (!heart?.animate || !group?.animate) return undefined;

    const heartAnimation = heart.animate(
      [
        { transform: 'scale(1) rotate(0)', filter: 'brightness(1)' },
        {
          transform: 'scale(1.65) rotate(-8deg)',
          filter: 'brightness(1.65) drop-shadow(0 0 12px rgba(227, 202, 127, 1))',
          offset: 0.22,
        },
        { transform: 'scale(0.78) rotate(5deg)', offset: 0.46 },
        { transform: 'scale(1.2) rotate(-3deg)', offset: 0.72 },
        { transform: 'scale(1) rotate(0)', filter: 'brightness(1)' },
      ],
      { duration: 650, easing: 'cubic-bezier(0.2, 0.85, 0.3, 1.2)' },
    );
    const groupAnimation = group.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px)', offset: 0.2 },
        { transform: 'translateX(7px)', offset: 0.4 },
        { transform: 'translateX(-4px)', offset: 0.62 },
        { transform: 'translateX(3px)', offset: 0.8 },
        { transform: 'translateX(0)' },
      ],
      { duration: 420, easing: 'ease-out' },
    );

    return () => {
      heartAnimation.cancel();
      groupAnimation.cancel();
    };
  }, [lossIndex, lossSeq]);

  return (
    <span
      ref={groupRef}
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
            ref={edge ? damagedHeartRef : undefined}
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
