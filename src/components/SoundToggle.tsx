import { SoundOffIcon, SoundOnIcon } from './icons';

interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
  variant?: 'icon' | 'switch';
}

export function SoundToggle({
  enabled,
  onToggle,
  variant = 'icon',
}: SoundToggleProps) {
  if (variant === 'switch') {
    return (
      <button
        type="button"
        className={`welcome-switch ${enabled ? 'welcome-switch--active' : ''}`}
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? 'Sound is on. Turn sound off.' : 'Sound is off. Turn sound on.'}
        title={enabled ? 'Sound on' : 'Sound off'}
      >
        <span className="welcome-switch__label">
          <span>Sound</span>
        </span>
        <span className="welcome-switch__track" aria-hidden="true">
          <span className="welcome-switch__thumb" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Sound is on. Turn sound off.' : 'Sound is off. Turn sound on.'}
      title={enabled ? 'Sound on' : 'Sound off'}
    >
      <span className="icon-btn__glyph" aria-hidden="true">
        {enabled ? <SoundOnIcon /> : <SoundOffIcon />}
      </span>
      <span>{enabled ? 'Sound' : 'Muted'}</span>
    </button>
  );
}
