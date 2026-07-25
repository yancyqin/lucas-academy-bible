import { StarIcon } from './icons';

interface StarsProps {
  value: number; // 0..3
  animate?: boolean;
  size?: number;
}

export function Stars({ value, animate, size = 34 }: StarsProps) {
  return (
    <span
      className={`stars ${animate ? 'stars--pop' : ''}`}
      role="img"
      aria-label={`${value} of 3 stars`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`star ${i < value ? 'star--on' : 'star--off'}`}
          style={{ width: size, height: size }}
          aria-hidden="true"
        >
          <StarIcon />
        </span>
      ))}
    </span>
  );
}
