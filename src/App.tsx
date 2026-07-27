import { useEffect, useRef, useState } from 'react';
import './styles.css';

import { getLevelFile, MAX_LEVEL, MIN_LEVEL } from './game/levels';
import type { BuiltLevel, ScriptureAttribution } from './game/build';
import { computeStars, heartPercent } from './game/scoring';
import { loadProgress, saveProgress, type Progress } from './game/progress';
import { soundEngine } from './audio/sound';
import { narrator } from './audio/speech';

import { Welcome } from './components/Welcome';
import { StudyPhase } from './components/StudyPhase';
import { RecallPhase } from './components/RecallPhase';
import { LevelComplete } from './components/LevelComplete';
import { FailureReveal } from './components/FailureReveal';
import { FinalCelebration } from './components/FinalCelebration';
import { SoundToggle } from './components/SoundToggle';
import { BookMark } from './components/icons';
import { BibleAttribution } from './components/BibleAttribution';
import { DailyScrabble } from './components/DailyScrabble';
import { DailyWordSearch } from './components/DailyWordSearch';
import {
  buildDailyVerse,
  currentPacificDate,
  dailyLevelFile,
  fetchDailyVerse,
  type DailyVerse,
} from './daily';
import type { WelcomeTab } from './components/Welcome';
import {
  TRANSLATIONS,
  type TranslationKey,
} from './translation-config';
import {
  attributionFor,
  fetchBiblePassage,
  fetchBibleTranslation,
  prepareJourneyLevel,
} from './youversion';
import { tokenize } from './game/chunk';
import { BUILD_FEATURES } from './build-config';

type Phase =
  | 'welcome'
  | 'loading'
  | 'study'
  | 'recall'
  | 'success'
  | 'failure-reveal'
  | 'scrabble'
  | 'word-search'
  | 'final';
type GameMode = 'journey' | 'daily' | 'daily-scrabble' | 'daily-word-search';

/** Score accumulated across a single run (which always starts at Level 0). */
interface Run {
  levelsAttempted: number;
  heartsKept: number;
  /** The highest level fully cleared so far (for the certificate). */
  top: { level: number; reference: string } | null;
}

interface Result {
  stars: number;
  mistakes: number;
}

interface FinalState {
  pass: boolean;
  /** Highest level fully passed (null if the player failed the very first level). */
  certLevel: number | null;
  /** Levels fully cleared — the FAILED level is not counted. */
  clearedCount: number;
  /** Percentage of hearts kept across the cleared levels (excludes the fail). */
  scorePercent: number;
  reference: string;
  practiceMode: boolean;
}

interface LiveMsg {
  text: string;
  id: number;
}

// App can use Math.random for a fresh verse each play (only Workflow scripts forbid it).
function freshSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

const WEB_ATTRIBUTION: ScriptureAttribution = {
  abbreviation: 'WEB',
  title: 'World English Bible Classic',
  copyright: 'Public Domain',
  sourceLabel: 'eBible.org',
  sourceUrl: 'https://ebible.org/details.php?id=eng-web',
};

const CUV_ATTRIBUTION: ScriptureAttribution = {
  abbreviation: 'CUV',
  title: 'Chinese Union Version (Simplified)',
  copyright: 'Public Domain',
  sourceLabel: 'eBible.org',
  sourceUrl: 'https://ebible.org/details.php?id=cmn-cu89s',
};

function translationFallback(
  translation: Exclude<TranslationKey, 'WEB' | 'CUV'>,
): ScriptureAttribution {
  const configured = TRANSLATIONS[translation];
  return {
    abbreviation: configured.label,
    title: configured.name,
    copyright: '',
    sourceLabel: 'YouVersion',
    sourceUrl: 'https://www.bible.com/',
  };
}

export default function App() {
  const dailyEnabled = BUILD_FEATURES.dailyVerse;
  const translationApiEnabled = BUILD_FEATURES.licensedTranslations;
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [phase, setPhase] = useState<Phase>('welcome');
  const [level, setLevel] = useState(MIN_LEVEL);
  const [playId, setPlayId] = useState(0);
  const [built, setBuilt] = useState<BuiltLevel | null>(null);
  const [run, setRun] = useState<Run>({ levelsAttempted: 0, heartsKept: 0, top: null });
  const [result, setResult] = useState<Result | null>(null);
  const [final, setFinal] = useState<FinalState | null>(null);
  const [polite, setPolite] = useState<LiveMsg>({ text: '', id: 0 });
  const [assertive, setAssertive] = useState<LiveMsg>({ text: '', id: 0 });
  const [gameMode, setGameMode] = useState<GameMode>('journey');
  const [practiceMode, setPracticeMode] = useState(false);
  const [welcomeTab, setWelcomeTab] = useState<WelcomeTab>('journey');
  const [dailyVerse, setDailyVerse] = useState<DailyVerse | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState('');
  const [dailyRequest, setDailyRequest] = useState(0);
  const [journeyError, setJourneyError] = useState('');
  const [loadingLabel, setLoadingLabel] = useState('');
  const [loadedAttribution, setLoadedAttribution] = useState<{
    translation: TranslationKey;
    attribution: ScriptureAttribution;
  } | null>(null);
  const activeGameRequest = useRef<AbortController | null>(null);
  const phaseRef = useRef<Phase>('welcome');
  const gameHistoryActive = useRef(false);
  const ignoreNextPopState = useRef(false);
  const goWelcomeRef = useRef<() => void>(() => undefined);

  const soundEnabled = progress.soundEnabled;
  const translation = translationApiEnabled ? progress.translation : 'WEB';
  phaseRef.current = phase;

  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (
      !translationApiEnabled ||
      !TRANSLATIONS[translation].requiresApi
    ) {
      return undefined;
    }

    const controller = new AbortController();
    fetchBibleTranslation(translation, controller.signal)
      .then((metadata) => {
        setLoadedAttribution({
          translation,
          attribution: attributionFor(metadata),
        });
      })
      .catch(() => {
        // The passage request will retry metadata when play begins.
      });
    return () => controller.abort();
  }, [translation, translationApiEnabled]);

  useEffect(() => {
    if (
      !dailyEnabled ||
      phase !== 'welcome' ||
      (
        welcomeTab !== 'daily' &&
        welcomeTab !== 'scrabble' &&
        welcomeTab !== 'word-search'
      )
    ) {
      return undefined;
    }

    const today = currentPacificDate();
    if (
      dailyVerse?.date === today &&
      dailyVerse.translation.key === translation
    ) {
      return undefined;
    }

    const controller = new AbortController();
    setDailyLoading(true);
    setDailyError('');
    fetchDailyVerse(translation, controller.signal)
      .then((verse) => setDailyVerse(verse))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDailyError(error instanceof Error ? error.message : 'Today’s verse could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDailyLoading(false);
      });

    return () => controller.abort();
  }, [
    dailyEnabled,
    dailyRequest,
    dailyVerse?.date,
    dailyVerse?.translation.key,
    phase,
    translation,
    welcomeTab,
  ]);

  const announce = (text: string, isAssertive = false) => {
    if (isAssertive) setAssertive((m) => ({ text, id: m.id + 1 }));
    else setPolite((m) => ({ text, id: m.id + 1 }));
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    soundEngine.setEnabled(next);
    if (next) soundEngine.resume();
    else narrator.stop();
    const updated = { ...progress, soundEnabled: next };
    setProgress(updated);
    saveProgress(updated);
    announce(next ? 'Sound on.' : 'Sound off.');
  };

  const selectTranslation = (next: TranslationKey) => {
    if (next === translation) return;
    const updated = { ...progress, translation: next };
    setProgress(updated);
    saveProgress(updated);
    setDailyError('');
    setJourneyError('');
    announce(`${TRANSLATIONS[next].label} selected.`);
  };

  // Enter one level of the current run (does not touch the run score).
  const enterLevel = async (lvl: number) => {
    const file = getLevelFile(lvl);
    if (!file) return;
    activeGameRequest.current?.abort();
    const controller = new AbortController();
    activeGameRequest.current = controller;
    const seed = freshSeed();
    setLevel(lvl);
    setResult(null);
    setJourneyError('');
    narrator.stop();
    if (soundEnabled) soundEngine.resume(); // the tap into a level is our gesture
    setBuilt(null);
    setLoadingLabel(
      TRANSLATIONS[translation].requiresApi
        ? `Loading Level ${lvl} in ${TRANSLATIONS[translation].label}…`
        : `Preparing Level ${lvl} in ${TRANSLATIONS[translation].label}…`,
    );
    setPhase('loading');

    try {
      const next = await prepareJourneyLevel(
        file,
        translation,
        seed,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setBuilt(next);
      setPlayId((p) => p + 1);
      setPhase('study');
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setJourneyError(
        error instanceof Error
          ? error.message
          : 'That translation could not be loaded.',
      );
      setWelcomeTab('journey');
      setPhase('welcome');
    }
  };

  // Start (or restart) a whole run from Level 0.
  const startRun = () => {
    setGameMode('journey');
    setRun({ levelsAttempted: 0, heartsKept: 0, top: null });
    setFinal(null);
    void enterLevel(MIN_LEVEL);
  };

  const startDaily = async () => {
    if (!dailyVerse) return;
    activeGameRequest.current?.abort();
    const controller = new AbortController();
    activeGameRequest.current = controller;
    const seed = freshSeed();
    setGameMode('daily');
    setRun({ levelsAttempted: 0, heartsKept: 0, top: null });
    setFinal(null);
    setResult(null);
    setBuilt(null);
    narrator.stop();
    if (soundEnabled) soundEngine.resume();
    setLoadingLabel(`Preparing today’s verse in ${TRANSLATIONS[translation].label}…`);
    setPhase('loading');

    try {
      const file = dailyLevelFile(tokenize(dailyVerse.text).length);
      let distractor;
      if (file.policy.distractorsPerSection > 0) {
        const distractorId =
          dailyVerse.passageId === 'PSA.23.1' ? 'JHN.1.1' : 'PSA.23.1';
        distractor = await fetchBiblePassage(
          translation,
          distractorId,
          controller.signal,
        );
      }
      if (controller.signal.aborted) return;
      const daily = buildDailyVerse(dailyVerse, seed, distractor);
      setLevel(daily.level);
      setBuilt(daily);
      setPlayId((p) => p + 1);
      setPhase('study');
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setDailyError(
        error instanceof Error
          ? error.message
          : 'Today’s verse could not be prepared.',
      );
      setWelcomeTab('daily');
      setPhase('welcome');
    }
  };

  const startDailyScrabble = () => {
    if (!dailyVerse || dailyVerse.translation.key !== translation) return;
    activeGameRequest.current?.abort();
    setGameMode('daily-scrabble');
    setBuilt(null);
    setResult(null);
    setFinal(null);
    narrator.stop();
    if (soundEnabled) soundEngine.resume();
    setPhase('scrabble');
  };

  const startDailyWordSearch = () => {
    if (!dailyVerse || dailyVerse.translation.key !== translation) return;
    activeGameRequest.current?.abort();
    setGameMode('daily-word-search');
    setBuilt(null);
    setResult(null);
    setFinal(null);
    narrator.stop();
    if (soundEnabled) soundEngine.resume();
    setPhase('word-search');
  };

  const handleComplete = (mistakes: number, hearts: number) => {
    if (gameMode === 'daily') {
      setResult({ stars: computeStars(mistakes, 0), mistakes });
      setPhase('success');
      return;
    }

    const top = {
      level,
      reference: built?.reference ?? '',
    };
    const levelsAttempted = run.levelsAttempted + 1;
    const heartsKept = run.heartsKept + hearts;
    setRun({ levelsAttempted, heartsKept, top });
    setResult({ stars: computeStars(mistakes, 0), mistakes });

    if (level >= MAX_LEVEL) {
      // Full run: the certificate is for the final level, over all levels.
      setFinal({
        pass: true,
        certLevel: level,
        clearedCount: levelsAttempted,
        scorePercent: heartPercent(heartsKept, levelsAttempted),
        reference: top.reference,
        practiceMode,
      });
      setPhase('final');
    } else {
      setPhase('success');
    }
  };

  const handleFail = () => {
    if (gameMode === 'daily') {
      setPhase('failure-reveal');
      return;
    }

    // The failed level is NOT counted — the certificate is for the last level
    // cleared, and the score is over the cleared levels only.
    const clearedCount = run.levelsAttempted;
    setFinal({
      pass: false,
      certLevel: run.top ? run.top.level : null,
      clearedCount,
      scorePercent: clearedCount > 0 ? heartPercent(run.heartsKept, clearedCount) : 0,
      reference: run.top?.reference ?? '',
      practiceMode,
    });
    setPhase('failure-reveal');
  };

  const goWelcome = () => {
    activeGameRequest.current?.abort();
    narrator.stop();
    setWelcomeTab(
      gameMode === 'daily'
        ? 'daily'
        : gameMode === 'daily-scrabble'
          ? 'scrabble'
          : gameMode === 'daily-word-search'
            ? 'word-search'
          : 'journey',
    );
    setPhase('welcome');
  };
  goWelcomeRef.current = goWelcome;

  // Add one same-page history entry while a game is open. Browser Back consumes
  // that entry and returns to Welcome; Back from Welcome remains browser-native.
  useEffect(() => {
    const handlePopState = () => {
      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false;
        return;
      }
      if (phaseRef.current === 'welcome' || !gameHistoryActive.current) return;
      gameHistoryActive.current = false;
      goWelcomeRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (phase !== 'welcome' && !gameHistoryActive.current) {
      const existingState =
        window.history.state &&
        typeof window.history.state === 'object'
          ? window.history.state as Record<string, unknown>
          : {};
      try {
        window.history.pushState(
          { ...existingState, bibleSequenceGame: true },
          '',
          window.location.href,
        );
        gameHistoryActive.current = true;
      } catch {
        // Sandboxed or embedded browsers may disallow History API writes.
      }
      return;
    }

    // A visible in-app Home action already changed React state; remove the
    // matching game entry without handling the resulting popstate twice.
    if (phase === 'welcome' && gameHistoryActive.current) {
      gameHistoryActive.current = false;
      ignoreNextPopState.current = true;
      window.history.back();
    }
  }, [phase]);

  const continueNext = () => {
    narrator.stop();
    if (gameMode === 'daily') {
      goWelcome();
      return;
    }
    if (level >= MAX_LEVEL) setPhase('final');
    else void enterLevel(level + 1);
  };

  const dailyAttribution =
    dailyVerse?.translation.key === translation
      ? attributionFor(dailyVerse.translation)
      : null;
  const exactLoadedAttribution =
    loadedAttribution?.translation === translation
      ? loadedAttribution.attribution
      : null;
  const activePassageAttribution =
    built?.attribution &&
    phase !== 'welcome'
      ? built.attribution
      : null;
  const activeAttribution =
    translation === 'WEB'
      ? WEB_ATTRIBUTION
      : translation === 'CUV'
        ? CUV_ATTRIBUTION
      : activePassageAttribution ??
        dailyAttribution ??
        exactLoadedAttribution ??
        translationFallback(translation);
  const footerAttributions = [activeAttribution];
  const practiceRunActive = gameMode === 'journey' && practiceMode;
  const phaseModeLabel =
    gameMode === 'daily'
      ? 'Daily Verse'
      : practiceRunActive && built
        ? `Practice · Level ${built.level}`
        : undefined;

  return (
    <div className={`app ${phase === 'recall' ? 'app--recall' : 'app--fit'}`}>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        <span key={polite.id}>{polite.text}</span>
      </div>
      <div className="visually-hidden" aria-live="assertive" aria-atomic="true" role="alert">
        <span key={assertive.id}>{assertive.text}</span>
      </div>

      {phase !== 'welcome' && (
        <header className="brandbar">
          <button
            type="button"
            className="brandbar__title"
            onClick={goWelcome}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Bible Sequence — go to start screen"
          >
            <span className="brandbar__mark" aria-hidden="true">
              <BookMark />
            </span>
            Bible Sequence
          </button>
          <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
        </header>
      )}

      {phase === 'welcome' && (
        <Welcome
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          onBegin={startRun}
          practiceMode={practiceMode}
          onTogglePracticeMode={() => {
            const next = !practiceMode;
            setPracticeMode(next);
            announce(next ? 'Practice mode on. Timers disabled.' : 'Practice mode off.');
          }}
          activeTab={welcomeTab}
          onSelectTab={setWelcomeTab}
          dailyVerse={dailyVerse}
          dailyLoading={dailyLoading}
          dailyError={dailyError}
          onRetryDaily={() => setDailyRequest((request) => request + 1)}
          onBeginDaily={startDaily}
          onBeginScrabble={startDailyScrabble}
          onBeginWordSearch={startDailyWordSearch}
          dailyEnabled={dailyEnabled}
          translation={translation}
          onSelectTranslation={selectTranslation}
          journeyError={journeyError}
          translationApiEnabled={translationApiEnabled}
        />
      )}

      {phase === 'loading' && (
        <main className="stage stage--fit" aria-live="polite" aria-busy="true">
          <div className="card center-col">
            <p className="eyebrow">{TRANSLATIONS[translation].label}</p>
            <h1 className="title-xl">One moment</h1>
            <p className="lede">{loadingLabel}</p>
          </div>
        </main>
      )}

      {phase === 'study' && built && (
        <StudyPhase
          key={`study-${playId}`}
          built={built}
          soundEnabled={soundEnabled}
          narrator={narrator}
          sound={soundEngine}
          onReady={() => setPhase('recall')}
          announce={announce}
          modeLabel={phaseModeLabel}
          practiceMode={practiceRunActive}
        />
      )}

      {phase === 'recall' && built && (
        <RecallPhase
          key={`recall-${playId}`}
          level={built}
          sound={soundEngine}
          announce={announce}
          onComplete={handleComplete}
          onFail={handleFail}
          modeLabel={phaseModeLabel}
          practiceMode={practiceRunActive}
        />
      )}

      {phase === 'success' && built && result && (
        <LevelComplete
          level={built}
          stars={result.stars}
          mistakes={result.mistakes}
          soundEnabled={soundEnabled}
          narrator={narrator}
          onContinue={continueNext}
          modeLabel={phaseModeLabel}
          continueLabel={gameMode === 'daily' ? 'Done for today' : undefined}
        />
      )}

      {phase === 'failure-reveal' && built && (
        <FailureReveal
          level={built}
          onContinue={() => {
            if (gameMode === 'daily') goWelcome();
            else setPhase('final');
          }}
          modeLabel={phaseModeLabel}
        />
      )}

      {phase === 'scrabble' && dailyVerse && (
        <DailyScrabble
          key={`${dailyVerse.date}-${dailyVerse.translation.key}`}
          verse={dailyVerse}
          sound={soundEngine}
          announce={announce}
          onDone={goWelcome}
        />
      )}

      {phase === 'word-search' && dailyVerse && (
        <DailyWordSearch
          key={`${dailyVerse.date}-${dailyVerse.translation.key}`}
          verse={dailyVerse}
          sound={soundEngine}
          announce={announce}
          onDone={goWelcome}
        />
      )}

      {phase === 'final' && final && gameMode === 'journey' && (
        <FinalCelebration
          pass={final.pass}
          certLevel={final.certLevel}
          clearedCount={final.clearedCount}
          scorePercent={final.scorePercent}
          reference={final.reference}
          practiceMode={final.practiceMode}
          soundEnabled={soundEnabled}
          sound={soundEngine}
          onPlayAgain={startRun}
          onHome={goWelcome}
        />
      )}

      {BUILD_FEATURES.translationFooter && phase !== 'welcome' && (
        <BibleAttribution attributions={footerAttributions} />
      )}
    </div>
  );
}
