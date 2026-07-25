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
  const [feedback, setFeedback] = useState<{ tone: 'correct' | 'wrong' | 'neutral'; text: string }>(
    { tone: 'neutral', text: '' },
  );
  const resolved = useRef(false);
  const wrongTimer = useRef<number | undefined>(undefined);

  const section = state.level.sections[state.sectionIndex];
  const singleWord = level.sections.every((s) => s.correct.every((c) => !c.includes(' ')));
  const hearts = level.hearts;
  const remainingSlots = section.correct.length - state.placed.length;

  // React to game events: sound + screen-reader announcements + visual feedback.
  useEffect(() => {
    const ev = state.lastEvent;
    if (!ev) return;
    switch (ev.kind) {
      case 'correct':
        sound.playCorrect(ev.streak);
        setFeedback({ tone: 'correct', text: 'Yes — keep going.' });
        break;
      case 'wrong': {
        sound.playWrong();
        setWrongId(ev.tileId);
        window.clearTimeout(wrongTimer.current);
        wrongTimer.current = window.setTimeout(() => setWrongId(null), 480);
        if (ev.belongsToVerse) {
          setFeedback({ tone: 'wrong', text: 'Right word, wrong spot — half a heart.' });
          announce('Right word, but out of order. Half a heart lost.', true);
        } else {
          setFeedback({ tone: 'wrong', text: 'That word isn’t in the verse — one heart.' });
          announce('That word is not in the verse. One heart lost.', true);
        }
        break;
      }
      case 'section-advance':
        sound.playSection();
        setFeedback({ tone: 'correct', text: 'Verse complete!' });
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
        setFeedback({ tone: 'neutral', text: 'Took back the last word.' });
        break;
      case 'failed':
        sound.playWrong();
        announce('Out of hearts. The run is over.', true);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.eventSeq]);

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
    <div className="stage" role="region" aria-label={`Rebuild ${level.reference}`}>
      <div className="recall">
        <div className="recall__top">
          <span className="eyebrow">Level {level.level} · Recall</span>
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            {level.sectioned && <span className="recall__sectionlabel">{section.label}</span>}
            <Hearts total={hearts} remaining={state.hearts} justLost={!!wrongId} />
          </span>
        </div>

        <p className="reference" style={{ display: 'block' }}>
          {level.reference}
          {showChinese && level.referenceZh && (
            <span className="reference-zh"> · {level.referenceZh}</span>
          )}
        </p>

        {/* Chinese (和合本) shown as a meaning reference while you rebuild the
            English. It won't line up word-for-word with the tiles — that's fine. */}
        {showChinese && level.fullTextZh && (
          <p className="scripture-zh recall__zh" lang="zh-Hans">
            {level.fullTextZh}
          </p>
        )}

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

        {/* Feedback line with reserved height (no layout shift). */}
        <div className={`feedback feedback--${feedback.tone}`} role="status" aria-hidden="true">
          {feedback.text}
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
            onClick={() => dispatch({ type: 'undo' })}
            disabled={state.placed.length === 0}
          >
            ↩ Undo
          </button>
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
