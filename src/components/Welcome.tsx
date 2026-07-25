import { BookMark } from './icons';
import { SoundToggle } from './SoundToggle';

interface WelcomeProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onBegin: () => void;
}

export function Welcome({ soundEnabled, onToggleSound, onBegin }: WelcomeProps) {
  return (
    <div className="stage" role="region" aria-label="Welcome">
      <div className="card center-col celebrate">
        <div style={{ width: 64, height: 64 }} aria-hidden="true">
          <BookMark />
        </div>
        <p className="eyebrow">Lucas Academy</p>
        <h1 className="title-xl">Bible Sequence</h1>
        <p className="subtitle">Remember the Word. Restore the Verse.</p>
        <p className="lede">
          One run, verse by verse. Keep your hearts and see how far you can go.
        </p>

        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={onBegin}>
            Begin
          </button>
          <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
        </div>
      </div>
    </div>
  );
}
