import { BookMark } from './icons';
import { SoundToggle } from './SoundToggle';
import { ChineseToggle } from './ChineseToggle';

interface WelcomeProps {
  soundEnabled: boolean;
  showChinese: boolean;
  onToggleSound: () => void;
  onToggleChinese: () => void;
  onBegin: () => void;
}

export function Welcome({
  soundEnabled,
  showChinese,
  onToggleSound,
  onToggleChinese,
  onBegin,
}: WelcomeProps) {
  return (
    <div className="stage" role="region" aria-label="Welcome">
      <div className="card center-col celebrate">
        <div style={{ width: 72, height: 72 }} aria-hidden="true">
          <BookMark />
        </div>
        <p className="eyebrow">Lucas Academy</p>
        <h1 className="title-xl">Bible Sequence</h1>
        <p className="subtitle">Remember the Word. Restore the Verse.</p>

        <div className="btn-row" role="group" aria-label="Options">
          <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
          <ChineseToggle enabled={showChinese} onToggle={onToggleChinese} />
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={onBegin}>
            Begin
          </button>
        </div>
      </div>
    </div>
  );
}
