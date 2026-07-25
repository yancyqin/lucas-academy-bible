import { useEffect, useReducer, useRef, useState } from 'react';
import { TOTAL_LEVELS } from '../game/levels';
import type { BuiltLevel } from '../game/build';
import { initRecall, recallReducer } from '../game/recall';
import type { SoundEngine } from '../audio/sound';
import { Hearts } from './Hearts';
import { Tile } from './Tile';

interface RecallPhaseProps {
  level: BuiltLevel;
  sound: SoundEngine;
  announce: (msg: string, assertive?: boolean) => void;
  onComplete: (mistakes: number) => void;
  onRetry: () => void;
  onExit: () => void;
}

export function RecallPhase({
  level,
  sound,
  announce,
  onComplete,
  onRetry,
  onExit,
}: RecallPhaseProps) {
  const [state, dispatch] = useReducer(recallReducer, level, initRecall);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'correct' | 'wrong' | 'neutral'; text: string }>(
    { tone: 'neutral', text: '' },
  );
  const completeFired = useRef(false);
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
        const heartWord = ev.heartsLeft === 1 ? 'heart' : 'hearts';
        setFeedback({ tone: 'wrong', text: `Not this one. ${ev.heartsLeft} ${heartWord} left.` });
        announce(`Not the next word. ${ev.heartsLeft} ${heartWord} remaining.`, true);
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
        announce('Out of hearts. Study the passage again.', true);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.eventSeq]);

  // Fire completion once, letting the complete chord play first.
  useEffect(() => {
    if (state.status === 'complete' && !completeFired.current) {
      completeFired.current = true;
      const id = window.setTimeout(() => onComplete(state.mistakes), 650);
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

  const failed = state.status === 'failed';

  return (
    <div className="stage" role="region" aria-label={`Rebuild ${level.reference}`}>
      <div className="recall">
        <div className="recall__top">
          <span className="eyebrow">
            Level {level.level} of {TOTAL_LEVELS} · Recall
          </span>
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            {level.sectioned && (
              <span className="recall__sectionlabel">{section.label}</span>
            )}
            <Hearts total={hearts} remaining={state.hearts} justLost={!!wrongId} />
          </span>
        </div>

        <p className="reference" style={{ display: 'block' }}>
          {level.reference}
        </p>

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
        <div
          className={`feedback feedback--${feedback.tone}`}
          role="status"
          aria-hidden="true"
        >
          {feedback.text}
        </div>

        {/* Tile bank */}
        <div className="bank" role="group" aria-label="Word tiles — choose the next one in the passage">
          {state.bank.map((t) => (
            <Tile
              key={t.id}
              tile={t}
              wrong={wrongId === t.id}
              onSelect={select}
              singleWord={singleWord}
            />
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
            onClick={() => {
              dispatch({ type: 'restart' });
              setFeedback({ tone: 'neutral', text: 'Restarted this level.' });
              announce('Level restarted.');
            }}
          >
            ⟳ Restart level
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onExit}>
            Level map
          </button>
        </div>
      </div>

      {/* Out-of-hearts overlay */}
      {failed && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="fail-title">
          <div className="card overlay__card center-col">
            <p className="eyebrow" id="fail-title">
              Out of hearts
            </p>
            <h2 className="title-xl" style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}>
              Let&rsquo;s study it again
            </h2>
            <p className="reference" style={{ display: 'block' }}>
              {level.reference}
            </p>
            <blockquote className="restored">{level.fullText}</blockquote>
            <div className="btn-row">
              <button type="button" className="btn btn--primary" onClick={onRetry}>
                Study again
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onExit}>
                Level map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
