interface ChineseToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

/** Toggles the 和合本 (Chinese Union Version) translation on the cards. */
export function ChineseToggle({ enabled, onToggle }: ChineseToggleProps) {
  return (
    <button
      type="button"
      className={`icon-btn ${enabled ? 'icon-btn--on' : ''}`}
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? '中文 translation on. Turn it off.' : '中文 translation off. Turn it on.'}
      title={enabled ? '中文 on' : '中文 off'}
      lang="zh-Hans"
    >
      <span className="icon-btn__glyph" aria-hidden="true">
        中
      </span>
      <span>中文</span>
    </button>
  );
}
