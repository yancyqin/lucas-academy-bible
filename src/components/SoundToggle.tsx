import { SoundOffIcon, SoundOnIcon } from './icons';

interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
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
