import { useId } from 'react';

/**
 * Smooth adventure-game health heart with four discrete fill states.
 * The reference progression is quadrant-based rather than a straight bar:
 * ¼ = upper-left, ½ = left half, ¾ = left half + lower-right, 1 = full.
 */
export function HeartIcon({ fill }: { fill: number }) {
  const clipId = useId();
  const fraction = Math.round(Math.max(0, Math.min(1, fill)) * 4) / 4;
  const path =
    'M12 21.1C10.8 20.2 3 15.2 3 9.2 3 6 5.4 3.7 8.4 3.7c1.6 0 2.9.7 3.6 1.9.7-1.2 2-1.9 3.6-1.9 3 0 5.4 2.3 5.4 5.5 0 6-7.8 11-9 11.9z';

  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          {fraction === 0.75 ? (
            <path d="M0 0h12v12h12v12H0z" />
          ) : (
            <rect
              x="0"
              y="0"
              width={fraction >= 1 ? 24 : fraction > 0 ? 12 : 0}
              height={fraction === 0.25 ? 12 : fraction > 0 ? 24 : 0}
            />
          )}
        </clipPath>
      </defs>
      <path d={path} fill="currentColor" opacity="0.16" />
      {fraction > 0 && (
        <path d={path} fill="currentColor" clipPath={`url(#${clipId})`} />
      )}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path
        d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.9 6.4 19.8l1.3-6.3L2.9 9.2l6.4-.7z"
        fill="currentColor"
      />
    </svg>
  );
}

export function BookMark() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="24" height="22" rx="3" fill="#16233b" />
      <path d="M16 8v16" stroke="#c8a24c" strokeWidth="1.6" />
      <path d="M9 11h4M9 15h4M19 11h4M19 15h4" stroke="#e3ca7f" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 24l3 2V22z" fill="#c8a24c" />
    </svg>
  );
}

export function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 8.5a4 4 0 010 7M18.5 6a7 7 0 010 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M12 3v10m0 0l-4-4m4 4l4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
