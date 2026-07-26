import { BookMark } from './icons';
import { SoundToggle } from './SoundToggle';
import { ChineseToggle } from './ChineseToggle';
import type { DailyVerse } from '../daily';
import {
  TRANSLATIONS,
  type TranslationKey,
} from '../translation-config';

export type WelcomeTab = 'journey' | 'daily';

interface WelcomeProps {
  soundEnabled: boolean;
  showChinese: boolean;
  onToggleSound: () => void;
  onToggleChinese: () => void;
  onBegin: () => void;
  activeTab: WelcomeTab;
  onSelectTab: (tab: WelcomeTab) => void;
  dailyVerse: DailyVerse | null;
  dailyLoading: boolean;
  dailyError: string;
  onRetryDaily: () => void;
  onBeginDaily: () => void;
  dailyEnabled: boolean;
  translation: TranslationKey;
  onSelectTranslation: (translation: TranslationKey) => void;
  journeyError: string;
  translationApiEnabled: boolean;
}

export function Welcome({
  soundEnabled,
  showChinese,
  onToggleSound,
  onToggleChinese,
  onBegin,
  activeTab,
  onSelectTab,
  dailyVerse,
  dailyLoading,
  dailyError,
  onRetryDaily,
  onBeginDaily,
  dailyEnabled,
  translation,
  onSelectTranslation,
  journeyError,
  translationApiEnabled,
}: WelcomeProps) {
  return (
    <div className="stage stage--fit stage--welcome" role="region" aria-label="Welcome">
      <div className="card center-col celebrate">
        <div style={{ width: 72, height: 72 }} aria-hidden="true">
          <BookMark />
        </div>
        <p className="eyebrow">Lucas Academy</p>
        <h1 className="title-xl">Bible Sequence</h1>
        <p className="subtitle">Remember the Word. Restore the Verse.</p>

        {dailyEnabled && (
          <div className="welcome-tabs" role="tablist" aria-label="Choose a Bible Sequence game">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'journey'}
              className={`welcome-tab ${activeTab === 'journey' ? 'welcome-tab--active' : ''}`}
              onClick={() => onSelectTab('journey')}
            >
              Challenge
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'daily'}
              className={`welcome-tab ${activeTab === 'daily' ? 'welcome-tab--active' : ''}`}
              onClick={() => onSelectTab('daily')}
            >
              Daily Verse
            </button>
          </div>
        )}

        <div className="btn-row" role="group" aria-label="Options">
          <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
          <ChineseToggle enabled={showChinese} onToggle={onToggleChinese} />
        </div>

        {translationApiEnabled && (
          <div
            className="translation-picker"
            role="radiogroup"
            aria-label="English Bible translation"
          >
            {Object.values(TRANSLATIONS).map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={translation === option.key}
                className={`translation-option ${
                  translation === option.key ? 'translation-option--active' : ''
                }`}
                onClick={() => onSelectTranslation(option.key)}
                title={option.name}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'journey' ? (
          <div className="welcome-panel" role="tabpanel">
            {journeyError && (
              <p className="daily-panel__error" role="alert">
                {journeyError}
              </p>
            )}
            <div className="btn-row">
              <button type="button" className="btn btn--primary" onClick={onBegin}>
                Begin challenge
              </button>
            </div>
          </div>
        ) : (
          <div className="welcome-panel daily-panel" role="tabpanel" aria-live="polite">
            {dailyLoading && <p className="lede welcome-panel__copy">Loading today’s verse…</p>}

            {!dailyLoading && dailyError && (
              <>
                <p className="daily-panel__error" role="alert">{dailyError}</p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onRetryDaily}>
                  Try again
                </button>
              </>
            )}

            {!dailyLoading && dailyVerse && (
              <>
                <p className="eyebrow">Today</p>
                <p className="daily-panel__reference">{dailyVerse.reference}</p>
                <button type="button" className="btn btn--primary" onClick={onBeginDaily}>
                  Play today’s verse
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
