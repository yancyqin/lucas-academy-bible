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
import { pickedReference } from './components/VersePicker';
import {
  TRANSLATIONS,
  type TranslationKey,
} from './translation-config';
import {
  attributionFor,
  fetchBiblePassage,
  fetchBibleTranslation,
  localDistractorPool,
  prepareJourneyLevel,
} from './youversion';
import { clampRequest, fetchBibleBooks, type BibleBook } from './books';
import {
  buildPickedVerse,
  DEFAULT_VERSE_DIFFICULTY,
  VERSE_MODES,
  type VerseDifficulty,
} from './game/verse-modes';
import {
  formatPassageId,
  readVerseLink,
  verseLinkUrl,
  type VerseRequest,
} from './verse-request';
import type { DistractorPassage } from './game/distractors';
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
type GameMode =
  | 'journey'
  | 'verse'
  | 'daily'
  | 'daily-scrabble'
  | 'daily-word-search';

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

/** Where a picked verse starts before the player touches anything. */
const DEFAULT_VERSE_REQUEST: VerseRequest = { book: 'JHN', chapter: 3, verse: 16 };

/**
 * Decoy source for a picked verse in a licensed edition, where the bundled
 * collection has no matching text: well-known passages that exist in every
 * Bible, long enough to yield believable fragments. Never the picked book.
 */
const DISTRACTOR_SOURCES = [
  'PSA.23.1-4',
  'JHN.1.1-5',
  'PRO.3.5-6',
  'ISA.40.28-31',
];

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

/**
 * Same-edition decoy text for a picked verse: the bundled collection covers
 * WEB and CUV outright; a licensed edition needs one extra passage request
 * from a book the player did not pick.
 */
async function loadDistractors(
  edition: TranslationKey,
  request: VerseRequest,
  difficulty: VerseDifficulty,
  seed: number,
  signal: AbortSignal,
): Promise<DistractorPassage[] | undefined> {
  if (VERSE_MODES[difficulty].policy.distractorsPerSection === 0) {
    return undefined;
  }
  if (edition === 'WEB') return localDistractorPool(request, false);
  if (edition === 'CUV') return localDistractorPool(request, true);

  const sources = DISTRACTOR_SOURCES.filter(
    (id) => !id.startsWith(`${request.book}.`),
  );
  const source = sources[seed % sources.length];
  try {
    const passage = await fetchBiblePassage(edition, source, signal);
    return [{ id: `youversion-${passage.passageId}`, text: passage.text }];
  } catch {
    // The verse itself already loaded. Play it decoy-free rather than throwing
    // the round away over the second request — an empty pool yields no decoys,
    // where falling through to the bundled pool would put English tiles in a
    // Korean round.
    return [];
  }
}

export default function App() {
  const dailyEnabled = BUILD_FEATURES.dailyVerse;
  const translationApiEnabled = BUILD_FEATURES.licensedTranslations;
  // A ?passage= link opens straight into that verse. Read once, before any
  // state initializer that depends on it. The itch build has no API to ask.
  const [verseLink] = useState(() =>
    dailyEnabled && typeof window !== 'undefined'
      ? readVerseLink(window.location.search)
      : null,
  );
  const [progress, setProgress] = useState<Progress>(() => {
    const stored = loadProgress();
    // A shared link names its own edition; honour it for this visit without
    // overwriting the player's saved choice.
    return verseLink?.translation
      ? { ...stored, translation: verseLink.translation }
      : stored;
  });
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
  // Pick a Verse is the home tab. The itch build has no tab strip and no API to
  // fill the picker, so it opens on the Challenge it can actually play.
  const [welcomeTab, setWelcomeTab] = useState<WelcomeTab>(
    dailyEnabled ? 'verse' : 'journey',
  );
  const [verseRequest, setVerseRequest] = useState<VerseRequest>(
    verseLink?.request ?? DEFAULT_VERSE_REQUEST,
  );
  const [verseDifficulty, setVerseDifficulty] = useState<VerseDifficulty>(
    verseLink?.difficulty ?? DEFAULT_VERSE_DIFFICULTY,
  );
  const [verseCatalogue, setVerseCatalogue] = useState<{
    translation: TranslationKey;
    books: BibleBook[];
  } | null>(null);
  const [booksError, setBooksError] = useState<{
    translation: TranslationKey;
    message: string;
  } | null>(null);
  const [booksRequest, setBooksRequest] = useState(0);
  const [verseError, setVerseError] = useState('');
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
  const verseLinkStarted = useRef(false);
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

  // The book/chapter/verse lists belong to the chosen edition, so they reload
  // whenever the edition changes (and only while the picker is on screen).
  // "Loading" is derived, not stored: a request that is aborted mid-flight —
  // which is exactly what a ?passage= link does on the first render — can never
  // leave a stale flag behind.
  const booksErrorMessage =
    booksError?.translation === translation ? booksError.message : '';
  const booksLoading =
    verseCatalogue?.translation !== translation && booksErrorMessage === '';

  useEffect(() => {
    if (!dailyEnabled || phase !== 'welcome' || welcomeTab !== 'verse') {
      return undefined;
    }
    if (verseCatalogue?.translation === translation) return undefined;
    if (booksErrorMessage) return undefined; // wait for an explicit retry

    const controller = new AbortController();
    fetchBibleBooks(translation, controller.signal)
      .then((catalogue) => {
        if (controller.signal.aborted) return;
        setVerseCatalogue({ translation, books: catalogue.books });
        // Chapter and verse counts differ between editions — keep the current
        // selection inside what this one actually has.
        setVerseRequest((request) => clampRequest(catalogue.books, request));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBooksError({
          translation,
          message:
            error instanceof Error
              ? error.message
              : 'The list of books could not be loaded.',
        });
      });

    return () => controller.abort();
  }, [
    booksErrorMessage,
    booksRequest,
    dailyEnabled,
    phase,
    translation,
    verseCatalogue?.translation,
    welcomeTab,
  ]);

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
    if (next) {
      soundEngine.resume();
      // This toggle tap is a user gesture — unlock the note clips for iOS.
      soundEngine.primeCorrectAudio();
    } else {
      narrator.stop();
    }
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
    setVerseError('');
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
    if (soundEnabled) {
      soundEngine.resume(); // the tap into a level is our gesture
      // Unlock all six correct-scale clips while we still hold the gesture —
      // iOS requires each media element to play once from a tap before it can
      // be replayed programmatically.
      soundEngine.primeCorrectAudio();
    }
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

  /**
   * Play any verse the player named. One passage request builds the whole
   * game — the difficulty supplies the policy, so no level bank is involved.
   */
  const startPickedVerse = async (
    request: VerseRequest,
    difficulty: VerseDifficulty,
    edition: TranslationKey,
  ) => {
    activeGameRequest.current?.abort();
    const controller = new AbortController();
    activeGameRequest.current = controller;
    const seed = freshSeed();
    const passageId = formatPassageId(request);
    setGameMode('verse');
    setVerseRequest(request);
    setVerseDifficulty(difficulty);
    setRun({ levelsAttempted: 0, heartsKept: 0, top: null });
    setFinal(null);
    setResult(null);
    setBuilt(null);
    setVerseError('');
    narrator.stop();
    if (soundEnabled) {
      soundEngine.resume(); // the tap into the verse is our gesture
      soundEngine.primeCorrectAudio();
    }
    setLoadingLabel(
      `Loading ${pickedReference(
        verseCatalogue?.translation === edition ? verseCatalogue.books : null,
        request,
      )} in ${TRANSLATIONS[edition].label}…`,
    );
    setPhase('loading');

    try {
      const passage = await fetchBiblePassage(
        edition,
        passageId,
        controller.signal,
      );
      const distractors = await loadDistractors(
        edition,
        request,
        difficulty,
        seed,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const picked = buildPickedVerse(
        {
          passageId: passage.passageId,
          reference: passage.reference,
          text: passage.text,
          attribution: attributionFor(passage.translation),
        },
        difficulty,
        seed,
        distractors,
      );
      setLevel(picked.level);
      setBuilt(picked);
      setPlayId((p) => p + 1);
      setPhase('study');
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setVerseError(
        error instanceof Error
          ? error.message
          : 'That verse could not be loaded.',
      );
      setWelcomeTab('verse');
      setPhase('welcome');
    }
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
    if (soundEnabled) {
      soundEngine.resume();
      soundEngine.primeCorrectAudio(); // unlock note clips inside this tap
    }
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
    if (soundEnabled) {
      soundEngine.resume();
      soundEngine.primeCorrectAudio(); // Scrabble plays the scale notes too
    }
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
    if (gameMode === 'daily' || gameMode === 'verse') {
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
    if (gameMode === 'daily' || gameMode === 'verse') {
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
      gameMode === 'verse'
        ? 'verse'
        : gameMode === 'daily'
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

  // A ?passage= link plays that verse straight away — once per page load.
  useEffect(() => {
    if (!verseLink || verseLinkStarted.current) return;
    verseLinkStarted.current = true;
    void startPickedVerse(verseLink.request, verseLink.difficulty, translation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continueNext = () => {
    narrator.stop();
    if (gameMode === 'daily' || gameMode === 'verse') {
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
  // Picked verses carry their difficulty instead of a level number, and the
  // Practice difficulty is what turns the clocks off for them.
  const untimedPhase =
    gameMode === 'verse'
      ? VERSE_MODES[verseDifficulty].untimed
      : practiceRunActive;
  const phaseModeLabel =
    gameMode === 'verse'
      ? VERSE_MODES[verseDifficulty].label
      : gameMode === 'daily'
        ? 'Daily Verse'
        : practiceRunActive && built
          ? `Practice · Level ${built.level}`
          : undefined;
  const verseShareUrl =
    typeof window === 'undefined'
      ? ''
      : verseLinkUrl(
          {
            request: verseRequest,
            translation,
            difficulty: verseDifficulty,
          },
          window.location.href,
        );

  return (
    <div
      className={`app ${phase === 'recall' ? 'app--recall' : 'app--fit'} ${
        phase === 'welcome' ? 'app--welcome' : ''
      }`}
    >
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
          versePicker={{
            books:
              verseCatalogue?.translation === translation
                ? verseCatalogue.books
                : null,
            loading: booksLoading,
            error: booksErrorMessage,
            onRetry: () => {
              setBooksError(null);
              setBooksRequest((request) => request + 1);
            },
            request: verseRequest,
            onChangeRequest: (request) => {
              setVerseRequest(request);
              setVerseError('');
            },
            difficulty: verseDifficulty,
            onChangeDifficulty: setVerseDifficulty,
            onPlay: () => {
              void startPickedVerse(verseRequest, verseDifficulty, translation);
            },
            playError: verseError,
            shareUrl: verseShareUrl,
          }}
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
          narrator={narrator}
          sound={soundEngine}
          onReady={() => setPhase('recall')}
          announce={announce}
          modeLabel={phaseModeLabel}
          practiceMode={untimedPhase}
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
          practiceMode={untimedPhase}
        />
      )}

      {phase === 'success' && built && result && (
        <LevelComplete
          level={built}
          stars={result.stars}
          mistakes={result.mistakes}
          narrator={narrator}
          onContinue={continueNext}
          modeLabel={phaseModeLabel}
          continueLabel={
            gameMode === 'daily'
              ? 'Done for today'
              : gameMode === 'verse'
                ? 'Pick another verse'
                : undefined
          }
        />
      )}

      {phase === 'failure-reveal' && built && (
        <FailureReveal
          level={built}
          onContinue={() => {
            if (gameMode === 'daily' || gameMode === 'verse') goWelcome();
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
