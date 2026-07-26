import { useEffect, useReducer, useRef, useState } from 'react';
import type { BuiltLevel } from '../game/build';
import { initRecall, recallReducer } from '../game/recall';
import type { SoundEngine } from '../audio/sound';
import { Hearts } from './Hearts';
import { Tile } from './Tile';

interface RecallPhaseProps {
  level: BuiltLevel;
  showChinese: boolean;
  sound: SoundEngine;
  announce: (msg: string, assertive?: boolean) => void;
  /** Level cleared: reports mistakes + hearts remaining (for the run score). */
  onComplete: (mistakes: number, hearts: number) => void;
  /** Ran out of hearts — the run ends. */
  onFail: () => void;
  /** Restart the whole run from Level 0. */
  onStartOver: () => void;
}

export function RecallPhase({
  level,
  showChinese,
  sound,
  announce,
  onComplete,
  onFail,
  onStartOver,
}: RecallPhaseProps) {
  const [state, dispatch] = useReducer(recallReducer, level, initRecall);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [heartLossSeq, setHeartLossSeq] = useState(0);
  const resolved = useRef(false);
  const wrongTimer = useRef<number | undefined>(undefined);

  // Challenge timer: you get twice the memorize (prep) time to rebuild. When it
  // runs out you bleed ¼ heart every 1.5s until the level is done or hearts hit 0.
  const timeBudget = Math.max(1, level.memorizeSeconds * 2);
  const [timeLeft, setTimeLeft] = useState(timeBudget);

  const section = state.level.sections[state.sectionIndex];
  const singleWord = level.sections.every((s) => s.correct.every((c) => !c.includes(' ')));
  const hearts = level.hearts;
  const remainingSlots = section.correct.length - state.placed.length;
  const overtime = timeLeft <= 0 && state.status === 'playing';

  // React to game events: sound, heart/tile effects, and screen-reader announcements.
  useEffect(() => {
    const ev = state.lastEvent;
    if (!ev) return;
    switch (ev.kind) {
      case 'correct':
        sound.playCorrect(ev.streak);
        break;
      case 'wrong': {
        sound.playWrong();
        setHeartLossSeq((seq) => seq + 1);
        setWrongId(ev.tileId);
        window.clearTimeout(wrongTimer.current);
        wrongTimer.current = window.setTimeout(() => setWrongId(null), 480);
        if (ev.belongsToVerse) {
          announce('Right word, but out of order. Half a heart lost.', true);
        } else {
          announce('That word is not in the verse. One heart lost.', true);
        }
        break;
      }
      case 'section-advance':
        sound.playSection();
        announce(
          `Verse complete. Now verse ${ev.sectionIndex + 1} of ${state.level.sections.length}.`,
        );
        break;
      case 'level-complete':
        sound.playComplete();
        announce('Passage restored! Level complete.', true);
        break;
      case 'undo':
        sound.playClick();
        break;
      case 'drain':
        sound.playHeartDrain();
        setHeartLossSeq((seq) => seq + 1);
        break;
      case 'failed':
        sound.playWrong();
        announce('Out of hearts. The run is over.', true);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.eventSeq]);

  // Challenge countdown (1s tick). Stops once the level resolves.
  useEffect(() => {
    if (state.status !== 'playing') return undefined;
    const id = window.setInterval(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  // Overtime: once the clock hits zero, bleed ¼ heart every 1.5s.
  useEffect(() => {
    if (!overtime) return undefined;
    announce('Time is up. Rebuild quickly — you are losing hearts.', true);
    const id = window.setInterval(() => dispatch({ type: 'drain', amount: 0.25 }), 1500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overtime]);

  // Resolve the level once — either cleared (report hearts) or failed (run ends).
  useEffect(() => {
    if (resolved.current) return;
    if (state.status === 'complete') {
      resolved.current = true;
      const id = window.setTimeout(() => onComplete(state.mistakes, state.hearts), 650);
      return () => window.clearTimeout(id);
    }
    if (state.status === 'failed') {
      resolved.current = true;
      const id = window.setTimeout(() => onFail(), 700);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => () => window.clearTimeout(wrongTimer.current), []);

  const select = (id: string) => {
    sound.resume();
    dispatch({ type: 'select', tileId: id });
  };

  return (
    <div className="stage stage--recall" role="region" aria-label={`Rebuild ${level.reference}`}>
      <div className="recall">
        <div className="recall__top">
          <span className="eyebrow">Level {level.level} · Recall</span>
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            {level.sectioned && <span className="recall__sectionlabel">{section.label}</span>}
            <Hearts total={hearts} remaining={state.hearts} lossSeq={heartLossSeq} />
          </span>
        </div>

        <p className="reference" style={{ display: 'block' }}>
          {level.reference}
          {showChinese && level.referenceZh && (
            <span className="reference-zh"> · {level.referenceZh}</span>
          )}
        </p>

        {/* Optional Chinese meaning hint. Native details keeps it collapsed on
            every new exam while remaining keyboard/screen-reader accessible. */}
        {showChinese && level.fullTextZh && (
          <details className="zh-disclosure">
            <summary lang="zh-Hans">中文提示</summary>
            <p className="scripture-zh zh-disclosure__text" lang="zh-Hans">
              {level.fullTextZh}
            </p>
          </details>
        )}

        {/* Challenge timer — 2× the memorize time; overtime bleeds hearts. */}
        <div
          className={`memo ${overtime ? 'memo--urgent' : timeLeft / timeBudget <= 0.25 ? 'memo--urgent' : ''}`}
          role="timer"
          aria-label={overtime ? 'Time is up, hearts draining' : `${timeLeft} seconds left`}
        >
          <div className="memo__track">
            <div
              className="memo__fill"
              style={{ width: `${Math.max(0, Math.min(1, timeLeft / timeBudget)) * 100}%` }}
            />
          </div>
          <span className="memo__digits" aria-hidden="true">
            {overtime ? "Time's up!" : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
          </span>
        </div>

        {/* Answer area — assembled sequence, always visible above the bank. */}
        <div className="answer" aria-label="Assembled passage so far" aria-live="off">
          {state.completedSections.length > 0 && (
            <p className="answer__prior">{state.completedSections.join(' ')}</p>
          )}
          <div className="answer__tiles">
            {state.placed.length === 0 && remainingSlots > 0 && level.hintLevel !== 'slots' && (
              <span className="answer__placeholder">Tap the first word&hellip;</span>
            )}
            {state.placed.map((t) => (
              <span key={t.id} className="placed-tile">
                {t.text}
              </span>
            ))}
            {level.hintLevel === 'slots' &&
              Array.from({ length: remainingSlots }, (_, i) => (
                <span key={`slot-${i}`} className={`slot ${i === 0 ? 'slot--next' : ''}`}>
                  {state.placed.length + i + 1}
                </span>
              ))}
          </div>
          {level.hintLevel === 'count' && (
            <p className="progress-caption" style={{ marginTop: 10, color: 'var(--on-navy-soft)' }}>
              {state.placed.length} of {section.correct.length} placed
            </p>
          )}
        </div>

        {/* Tile bank */}
        <div className="bank" role="group" aria-label="Word tiles — choose the next one in the passage">
          {state.bank.map((t) => (
            <Tile key={t.id} tile={t} wrong={wrongId === t.id} onSelect={select} singleWord={singleWord} />
          ))}
        </div>

        <div className="recall__controls">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onStartOver}
            title="Start the whole run again from Level 0"
          >
            ⟳ Restart from Level 0
          </button>
        </div>
      </div>
    </div>
  );
}
