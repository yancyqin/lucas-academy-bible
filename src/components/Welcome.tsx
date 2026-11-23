import { BookMark } from './icons';
import { SoundToggle } from './SoundToggle';
import { VersePicker, type VersePickerProps } from './VersePicker';
import type { DailyVerse } from '../daily';
import {
  CHINESE_TRANSLATIONS,
  ENGLISH_TRANSLATIONS,
  KOREAN_TRANSLATIONS,
  TRANSLATIONS,
  type BibleLanguage,
  type TranslationKey,
} from '../translation-config';

export type WelcomeTab =
  | 'verse'
  | 'journey'
  | 'daily'
  | 'scrabble'
  | 'word-search';

interface WelcomeProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onBegin: () => void;
  practiceMode: boolean;
  onTogglePracticeMode: () => void;
  activeTab: WelcomeTab;
  onSelectTab: (tab: WelcomeTab) => void;
  dailyVerse: DailyVerse | null;
  dailyLoading: boolean;
  dailyError: string;
  onRetryDaily: () => void;
  onBeginDaily: () => void;
  onBeginScrabble: () => void;
  onBeginWordSearch: () => void;
  /** Daily Verse / Daily Scrabble / Word Search tabs (need the Worker). */
  dailyEnabled: boolean;
  /** The Pick a Verse tab (bundled WEB + CUV work offline). */
  pickVerseEnabled: boolean;
  /** Offer English / 中文 between the bundled editions even without the API. */
  localTranslationsEnabled: boolean;
  translation: TranslationKey;
  onSelectTranslation: (translation: TranslationKey) => void;
  journeyError: string;
  translationApiEnabled: boolean;
  /** Everything the Pick a Verse panel needs, grouped so it travels as one. */
  versePicker: VersePickerProps;
}

export function Welcome({
  soundEnabled,
  onToggleSound,
  onBegin,
  practiceMode,
  onTogglePracticeMode,
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
  pickVerseEnabled,
  localTranslationsEnabled,
  translation,
  onSelectTranslation,
  journeyError,
  translationApiEnabled,
  versePicker,
}: WelcomeProps) {
  const dailyReady =
    dailyVerse !== null && dailyVerse.translation.key === translation;
  const selectedLanguage = TRANSLATIONS[translation].language;
  const languageTranslations =
    selectedLanguage === 'zh'
      ? CHINESE_TRANSLATIONS
      : selectedLanguage === 'ko'
        ? KOREAN_TRANSLATIONS
        : ENGLISH_TRANSLATIONS;
  // Without the Worker only the bundled public-domain editions are playable.
  const visibleTranslations = translationApiEnabled
    ? languageTranslations
    : languageTranslations.filter((option) => !option.requiresApi);
  const translationSelectorVisible =
    translationApiEnabled || localTranslationsEnabled;
  const tabStripVisible = pickVerseEnabled || dailyEnabled;
  const languageName: Record<BibleLanguage, string> = {
    en: 'English',
    zh: 'Chinese',
    ko: 'Korean',
  };

  return (
    <div className="stage stage--fit stage--welcome" role="region" aria-label="Welcome">
      <div className="card center-col celebrate">
        <div style={{ width: 72, height: 72 }} aria-hidden="true">
          <BookMark />
        </div>
        <p className="eyebrow">Lucas Academy</p>
        <h1 className="title-xl">Bible Sequence</h1>
        <p className="subtitle">Remember the Word. Restore the Verse.</p>

        {tabStripVisible && (
          <div
            className={`welcome-tabs ${dailyEnabled ? 'welcome-tabs--five' : ''}`}
            role="tablist"
            aria-label="Choose a Bible Sequence game"
          >
            {pickVerseEnabled && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'verse'}
                className={`welcome-tab ${activeTab === 'verse' ? 'welcome-tab--active' : ''}`}
                onClick={() => onSelectTab('verse')}
              >
                Pick a Verse
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'journey'}
              className={`welcome-tab ${activeTab === 'journey' ? 'welcome-tab--active' : ''}`}
              onClick={() => onSelectTab('journey')}
            >
              Challenge
            </button>
            {dailyEnabled && (
              <>
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
              </>
            )}
          </div>
        )}

        <div
          className={`btn-row welcome-options ${
            activeTab === 'journey' ? 'welcome-options--practice' : ''
          }`}
          role="group"
          aria-label="Options"
        >
          <SoundToggle
            enabled={soundEnabled}
            onToggle={onToggleSound}
            variant="switch"
          />
          {activeTab === 'journey' && (
            <button
              type="button"
              className={`welcome-switch welcome-switch--practice ${
                practiceMode ? 'welcome-switch--active' : ''
              }`}
              role="switch"
              aria-checked={practiceMode}
              aria-label={`Practice mode is ${
                practiceMode ? 'on. Turn practice mode off.' : 'off. Turn practice mode on.'
              }`}
              title={practiceMode ? 'Practice mode on — no timer' : 'Practice mode off'}
              onClick={onTogglePracticeMode}
            >
              <span className="welcome-switch__label">
                <span>Practice</span>
              </span>
              <span className="welcome-switch__track" aria-hidden="true">
                <span className="welcome-switch__thumb" />
              </span>
            </button>
          )}
        </div>

        {translationSelectorVisible && (
          <div className="translation-selector">
            <div
              className="translation-languages"
              role="radiogroup"
              aria-label="Bible language"
            >
              <button
                type="button"
                role="radio"
                aria-checked={selectedLanguage === 'en'}
                className={`translation-language ${
                  selectedLanguage === 'en'
                    ? 'translation-language--active'
                    : ''
                }`}
                onClick={() => onSelectTranslation('WEB')}
              >
                English
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={selectedLanguage === 'zh'}
                className={`translation-language ${
                  selectedLanguage === 'zh'
                    ? 'translation-language--active'
                    : ''
                }`}
                onClick={() => onSelectTranslation('CUV')}
                lang="zh-Hans"
              >
                中文
              </button>
              {translationApiEnabled && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedLanguage === 'ko'}
                  className={`translation-language ${
                    selectedLanguage === 'ko'
                      ? 'translation-language--active'
                      : ''
                  }`}
                  onClick={() => onSelectTranslation('KLB')}
                  lang="ko"
                >
                  한국어
                </button>
              )}
            </div>

            {(translationApiEnabled || visibleTranslations.length > 1) && (
              <div
                className={`translation-picker translation-picker--${visibleTranslations.length}`}
                role="radiogroup"
                aria-label={`${languageName[selectedLanguage]} Bible translation`}
              >
                {visibleTranslations.map((option) => (
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
          </div>
        )}

        {activeTab === 'verse' ? (
          <VersePicker {...versePicker} />
        ) : activeTab === 'journey' ? (
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
              <button
                type="button"
                className="btn btn--primary"
                aria-label={`${
                  activeTab === 'daily'
                    ? 'Play Daily Verse'
                    : activeTab === 'scrabble'
                      ? 'Play Daily Scrabble'
                      : 'Play Daily Word Search'
                } for ${dailyVerse.reference}`}
                onClick={
                  activeTab === 'daily'
                    ? onBeginDaily
                    : activeTab === 'scrabble'
                      ? onBeginScrabble
                      : onBeginWordSearch
                }
                disabled={!dailyReady || dailyLoading}
              >
                {dailyVerse.reference}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
