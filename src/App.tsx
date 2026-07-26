import { useEffect, useState } from 'react';
import './styles.css';

import { getLevelFile, MAX_LEVEL, MIN_LEVEL } from './game/levels';
import { buildLevel, type BuiltLevel } from './game/build';
import { computeStars, heartPercent } from './game/scoring';
import { loadProgress, saveProgress, type Progress } from './game/progress';
import { soundEngine } from './audio/sound';
import { narrator } from './audio/speech';

import { Welcome } from './components/Welcome';
import { StudyPhase } from './components/StudyPhase';
import { RecallPhase } from './components/RecallPhase';
import { LevelComplete } from './components/LevelComplete';
import { FinalCelebration } from './components/FinalCelebration';
import { SoundToggle } from './components/SoundToggle';
import { ChineseToggle } from './components/ChineseToggle';
import { BookMark } from './components/icons';

type Phase = 'welcome' | 'study' | 'recall' | 'success' | 'final';

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

  const soundEnabled = progress.soundEnabled;
  const showChinese = progress.showChinese;

  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
  }, [soundEnabled]);

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
    saveProgress(updated); // sound + Chinese preferences are what we persist
    announce(next ? 'Sound on.' : 'Sound off.');
  };

  const toggleChinese = () => {
    const next = !showChinese;
    const updated = { ...progress, showChinese: next };
    setProgress(updated);
    saveProgress(updated);
    announce(next ? '中文 on.' : '中文 off.');
  };

  // Enter one level of the current run (does not touch the run score).
  const enterLevel = (lvl: number) => {
    const file = getLevelFile(lvl);
    if (!file) return;
    setLevel(lvl);
    setResult(null);
    narrator.stop();
    setBuilt(buildLevel(file, { seed: freshSeed() }));
    setPlayId((p) => p + 1);
    if (soundEnabled) soundEngine.resume(); // the tap into a level is our gesture
    setPhase('study');
  };

  // Start (or restart) a whole run from Level 0.
  const startRun = () => {
    setRun({ levelsAttempted: 0, heartsKept: 0, top: null });
    setFinal(null);
    enterLevel(MIN_LEVEL);
  };

  const handleComplete = (mistakes: number, hearts: number) => {
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
    setPhase('final');
  };

  const goWelcome = () => {
    narrator.stop();
    setPhase('welcome');
  };

  const continueNext = () => {
    narrator.stop();
    if (level >= MAX_LEVEL) setPhase('final');
    else enterLevel(level + 1);
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
        />
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
        />
      )}

      {phase === 'final' && final && (
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
