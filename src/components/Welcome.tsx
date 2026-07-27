import { BookMark } from './icons';
import { SoundToggle } from './SoundToggle';
import { ChineseToggle } from './ChineseToggle';
import type { DailyVerse } from '../daily';
import {
  TRANSLATIONS,
  type TranslationKey,
} from '../translation-config';

export type WelcomeTab = 'journey' | 'daily' | 'scrabble' | 'word-search';

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
  onBeginScrabble: () => void;
  onBeginWordSearch: () => void;
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
  onBeginScrabble,
  onBeginWordSearch,
  dailyEnabled,
  translation,
  onSelectTranslation,
  journeyError,
  translationApiEnabled,
}: WelcomeProps) {
  const dailyReady =
    dailyVerse !== null && dailyVerse.translation.key === translation;

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
          <div
            className="welcome-tabs welcome-tabs--four"
            role="tablist"
            aria-label="Choose a Bible Sequence game"
          >
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
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'scrabble'}
              className={`welcome-tab ${activeTab === 'scrabble' ? 'welcome-tab--active' : ''}`}
              onClick={() => onSelectTab('scrabble')}
            >
              Daily Scrabble
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'word-search'}
              className={`welcome-tab ${activeTab === 'word-search' ? 'welcome-tab--active' : ''}`}
              onClick={() => onSelectTab('word-search')}
            >
              Word Search
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
          <div
            className="welcome-panel daily-panel"
            role="tabpanel"
            aria-live="polite"
            aria-busy={dailyLoading}
          >
            {dailyLoading && !dailyVerse && (
              <p className="lede welcome-panel__copy">Loading today’s verse…</p>
            )}

            {!dailyLoading && dailyError && !dailyVerse && (
              <>
                <p className="daily-panel__error" role="alert">{dailyError}</p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onRetryDaily}>
                  Try again
                </button>
              </>
            )}

            {dailyVerse && (
              <>
                <p className="daily-panel__reference">{dailyVerse.reference}</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={
                    activeTab === 'daily'
                      ? onBeginDaily
                      : activeTab === 'scrabble'
                        ? onBeginScrabble
                        : onBeginWordSearch
                  }
                  disabled={!dailyReady || dailyLoading}
                >
                  {activeTab === 'daily'
                    ? 'Play today’s verse'
                    : activeTab === 'scrabble'
                      ? 'Play Daily Scrabble'
                      : 'Play Daily Word Search'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
