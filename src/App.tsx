import { useEffect, useState } from 'react';
import './styles.css';

import { getLevelConfig, TOTAL_LEVELS } from './game/levels';
import { buildLevel, type BuiltLevel } from './game/build';
import { computeStars } from './game/scoring';
import {
  loadProgress,
  recordCompletion,
  saveProgress,
  type Progress,
} from './game/progress';
import { requirePassage } from './data/scripture';
import { soundEngine } from './audio/sound';
import { narrator } from './audio/speech';

import { Welcome } from './components/Welcome';
import { LevelIntro } from './components/LevelIntro';
import { StudyPhase } from './components/StudyPhase';
import { RecallPhase } from './components/RecallPhase';
import { LevelComplete } from './components/LevelComplete';
import { FinalCelebration } from './components/FinalCelebration';
import { SoundToggle } from './components/SoundToggle';
import { BookMark } from './components/icons';

type Phase = 'welcome' | 'intro' | 'study' | 'recall' | 'success' | 'final';

interface Result {
  stars: number;
  mistakes: number;
  attempts: number;
}

interface LiveMsg {
  text: string;
  id: number;
}

export default function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [phase, setPhase] = useState<Phase>('welcome');
  const [level, setLevel] = useState(1);
  const [attempt, setAttempt] = useState(1); // 1-based attempt number for this visit
  const [retries, setRetries] = useState(0);
  const [built, setBuilt] = useState<BuiltLevel | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [polite, setPolite] = useState<LiveMsg>({ text: '', id: 0 });
  const [assertive, setAssertive] = useState<LiveMsg>({ text: '', id: 0 });

  const soundEnabled = progress.soundEnabled;

  // Keep the audio engine's enabled flag in sync with saved preference.
  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const persist = (next: Progress) => {
    setProgress(next);
    saveProgress(next);
  };

  const announce = (text: string, isAssertive = false) => {
    if (isAssertive) setAssertive((m) => ({ text, id: m.id + 1 }));
    else setPolite((m) => ({ text, id: m.id + 1 }));
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    soundEngine.setEnabled(next);
    if (next) soundEngine.resume();
    else narrator.stop();
    persist({ ...progress, soundEnabled: next });
    announce(next ? 'Sound on.' : 'Sound off.');
  };

  const cfg = getLevelConfig(level);

  const enterStudy = (lvl: number, attemptNum: number, prog: Progress) => {
    const config = getLevelConfig(lvl);
    if (!config) return;
    setBuilt(buildLevel(config, { seed: lvl * 1000 + attemptNum }));
    if (prog.soundEnabled) soundEngine.resume();
    setPhase('study');
  };

  const startLevel = (lvl: number) => {
    const next = { ...progress, currentLevel: lvl };
    persist(next);
    setLevel(lvl);
    setAttempt(1);
    setRetries(0);
    setBuilt(null);
    setResult(null);
    narrator.stop();
    setPhase('intro');
  };

  const beginStudyFromIntro = () => {
    const prog = progress.introSeen ? progress : { ...progress, introSeen: true };
    if (!progress.introSeen) persist(prog);
    // First real user gesture into audio: allow the engine to start.
    if (prog.soundEnabled) soundEngine.resume();
    enterStudy(level, attempt, prog);
  };

  const handleComplete = (mistakes: number) => {
    const attemptsUsed = attempt;
    const stars = computeStars(mistakes, retries);
    setResult({ stars, mistakes, attempts: attemptsUsed });
    const nextProgress = recordCompletion(progress, level, stars, attemptsUsed);
    persist(nextProgress);
    if (level >= TOTAL_LEVELS) setPhase('final');
    else setPhase('success');
  };

  const handleRetry = () => {
    const nextAttempt = attempt + 1;
    setAttempt(nextAttempt);
    setRetries((r) => r + 1);
    narrator.stop();
    enterStudy(level, nextAttempt, progress);
  };

  const goWelcome = () => {
    narrator.stop();
    setPhase('welcome');
  };

  const continueNext = () => {
    narrator.stop();
    const next = level + 1;
    if (next > TOTAL_LEVELS) setPhase('final');
    else startLevel(next);
  };

  const showBrandToggle = phase !== 'welcome';

  return (
    <div className="app">
      {/* Screen-reader live regions */}
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        <span key={polite.id}>{polite.text}</span>
      </div>
      <div className="visually-hidden" aria-live="assertive" aria-atomic="true" role="alert">
        <span key={assertive.id}>{assertive.text}</span>
      </div>

      {showBrandToggle && (
        <header className="brandbar">
          <button
            type="button"
            className="brandbar__title"
            onClick={goWelcome}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Bible Sequence — go to level map"
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
          progress={progress}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          onStartLevel={startLevel}
        />
      )}

      {phase === 'intro' && cfg && (
        <LevelIntro
          config={cfg}
          verseCount={requirePassage(cfg.passageId).verses.length}
          firstEver={!progress.introSeen}
          onBegin={beginStudyFromIntro}
          onBack={goWelcome}
        />
      )}

      {phase === 'study' && cfg && (
        <StudyPhase
          config={cfg}
          passage={requirePassage(cfg.passageId)}
          soundEnabled={soundEnabled}
          narrator={narrator}
          sound={soundEngine}
          onReady={() => setPhase('recall')}
          onBack={goWelcome}
          announce={announce}
        />
      )}

      {phase === 'recall' && built && (
        <RecallPhase
          key={`${level}-${attempt}`}
          level={built}
          sound={soundEngine}
          announce={announce}
          onComplete={handleComplete}
          onRetry={handleRetry}
          onExit={goWelcome}
        />
      )}

      {phase === 'success' && built && result && (
        <LevelComplete
          level={built}
          stars={result.stars}
          mistakes={result.mistakes}
          attempts={result.attempts}
          soundEnabled={soundEnabled}
          narrator={narrator}
          onContinue={continueNext}
          onReview={goWelcome}
        />
      )}

      {phase === 'final' && (
        <FinalCelebration
          progress={progress}
          level20Reference={requirePassage(getLevelConfig(TOTAL_LEVELS)!.passageId).reference}
          soundEnabled={soundEnabled}
          sound={soundEngine}
          onPlayAgain={() => startLevel(1)}
          onReview={goWelcome}
        />
      )}
    </div>
  );
}
