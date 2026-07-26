import { useEffect, useRef, useState } from 'react';
import './styles.css';

import { getLevelFile, MAX_LEVEL, MIN_LEVEL } from './game/levels';
import type { BuiltLevel } from './game/build';
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
import { ChineseToggle } from './components/ChineseToggle';
import { BookMark } from './components/icons';
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
  fetchBiblePassage,
  prepareJourneyLevel,
} from './youversion';
import { tokenize } from './game/chunk';

type Phase =
  | 'welcome'
  | 'loading'
  | 'study'
  | 'recall'
  | 'success'
  | 'failure-reveal'
  | 'final';
type GameMode = 'journey' | 'daily';

/** Score accumulated across a single run (which always starts at Level 0). */
interface Run {
  levelsAttempted: number;
  heartsKept: number;
  /** The highest level fully cleared so far (for the certificate). */
  top: { level: number; reference: string; referenceZh: string } | null;
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
  referenceZh: string;
}

interface LiveMsg {
  text: string;
  id: number;
}

// App can use Math.random for a fresh verse each play (only Workflow scripts forbid it).
function freshSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

export default function App() {
  const dailyEnabled = import.meta.env.VITE_DAILY_VERSE_ENABLED !== 'false';
  const translationApiEnabled =
    import.meta.env.VITE_TRANSLATION_API_ENABLED !== 'false';
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
  const [welcomeTab, setWelcomeTab] = useState<WelcomeTab>('journey');
  const [dailyVerse, setDailyVerse] = useState<DailyVerse | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState('');
  const [dailyRequest, setDailyRequest] = useState(0);
  const [journeyError, setJourneyError] = useState('');
  const [loadingLabel, setLoadingLabel] = useState('');
  const activeGameRequest = useRef<AbortController | null>(null);

  const soundEnabled = progress.soundEnabled;
  const showChinese = progress.showChinese;
  const translation = translationApiEnabled ? progress.translation : 'WEB';

  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (!dailyEnabled || phase !== 'welcome' || welcomeTab !== 'daily') return undefined;

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

  const toggleChinese = () => {
    const next = !showChinese;
    const updated = { ...progress, showChinese: next };
    setProgress(updated);
    saveProgress(updated);
    announce(next ? '中文 on.' : '中文 off.');
  };

  const selectTranslation = (next: TranslationKey) => {
    if (next === translation) return;
    const updated = { ...progress, translation: next };
    setProgress(updated);
    saveProgress(updated);
    setDailyVerse(null);
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
      translation === 'WEB'
        ? `Preparing Level ${lvl}…`
        : `Loading Level ${lvl} in ${TRANSLATIONS[translation].label}…`,
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

  const handleComplete = (mistakes: number, hearts: number) => {
    if (gameMode === 'daily') {
      setResult({ stars: computeStars(mistakes, 0), mistakes });
      setPhase('success');
      return;
    }

    const top = {
      level,
      reference: built?.reference ?? '',
      referenceZh: built?.referenceZh ?? '',
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
        referenceZh: top.referenceZh,
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
      referenceZh: run.top?.referenceZh ?? '',
    });
    setPhase('failure-reveal');
  };

  const goWelcome = () => {
    activeGameRequest.current?.abort();
    narrator.stop();
    setWelcomeTab(gameMode === 'daily' ? 'daily' : 'journey');
    setPhase('welcome');
  };

  const continueNext = () => {
    narrator.stop();
    if (gameMode === 'daily') {
      goWelcome();
      return;
    }
    if (level >= MAX_LEVEL) setPhase('final');
    else void enterLevel(level + 1);
  };

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
          <span style={{ display: 'inline-flex', gap: 10 }}>
            <ChineseToggle enabled={showChinese} onToggle={toggleChinese} />
            <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
          </span>
        </header>
      )}

      {phase === 'welcome' && (
        <Welcome
          soundEnabled={soundEnabled}
          showChinese={showChinese}
          onToggleSound={toggleSound}
          onToggleChinese={toggleChinese}
          onBegin={startRun}
          activeTab={welcomeTab}
          onSelectTab={setWelcomeTab}
          dailyVerse={dailyVerse}
          dailyLoading={dailyLoading}
          dailyError={dailyError}
          onRetryDaily={() => setDailyRequest((request) => request + 1)}
          onBeginDaily={startDaily}
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
          showChinese={showChinese}
          narrator={narrator}
          sound={soundEngine}
          onReady={() => setPhase('recall')}
          announce={announce}
          modeLabel={gameMode === 'daily' ? 'Daily Verse' : undefined}
        />
      )}

      {phase === 'recall' && built && (
        <RecallPhase
          key={`recall-${playId}`}
          level={built}
          showChinese={showChinese}
          sound={soundEngine}
          announce={announce}
          onComplete={handleComplete}
          onFail={handleFail}
          modeLabel={gameMode === 'daily' ? 'Daily Verse' : undefined}
        />
      )}

      {phase === 'success' && built && result && (
        <LevelComplete
          level={built}
          stars={result.stars}
          mistakes={result.mistakes}
          soundEnabled={soundEnabled}
          showChinese={showChinese}
          narrator={narrator}
          onContinue={continueNext}
          modeLabel={gameMode === 'daily' ? 'Daily Verse' : undefined}
          continueLabel={gameMode === 'daily' ? 'Done for today' : undefined}
        />
      )}

      {phase === 'failure-reveal' && built && (
        <FailureReveal
          level={built}
          showChinese={showChinese}
          onContinue={() => {
            if (gameMode === 'daily') goWelcome();
            else setPhase('final');
          }}
          modeLabel={gameMode === 'daily' ? 'Daily Verse' : undefined}
        />
      )}

      {phase === 'final' && final && gameMode === 'journey' && (
        <FinalCelebration
          pass={final.pass}
          certLevel={final.certLevel}
          clearedCount={final.clearedCount}
          scorePercent={final.scorePercent}
          reference={final.reference}
          referenceZh={final.referenceZh}
          showChinese={showChinese}
          soundEnabled={soundEnabled}
          sound={soundEngine}
          onPlayAgain={startRun}
          onHome={goWelcome}
        />
      )}
    </div>
  );
}
