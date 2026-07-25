/** Small inline SVG icons — no external assets, theme via currentColor. */

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path
        d="M12 20.5S3.5 14.6 3.5 8.9C3.5 6.1 5.7 4 8.3 4c1.7 0 3.1.9 3.7 2.2C12.6 4.9 14 4 15.7 4c2.6 0 4.8 2.1 4.8 4.9 0 5.7-8.5 11.6-8.5 11.6z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
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

export function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
