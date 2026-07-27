import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { SoundEngine } from '../audio/sound';
import type { DailyVerse } from '../daily';
import {
  buildDailyScrabble,
  type ScrabbleLetter,
} from '../game/daily-scrabble';

interface DailyScrabbleProps {
  verse: DailyVerse;
  sound: SoundEngine;
  announce: (message: string, assertive?: boolean) => void;
  onDone: () => void;
}

export function DailyScrabble({
  verse,
  sound,
  announce,
  onDone,
}: DailyScrabbleProps) {
  const puzzle = useMemo(
    () =>
      buildDailyScrabble(
        verse.text,
        `${verse.date}:${verse.passageId}:${verse.translation.key}`,
      ),
    [verse.date, verse.passageId, verse.text, verse.translation.key],
  );
  const [targetIndex, setTargetIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [solvedIds, setSolvedIds] = useState<string[]>([]);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const wrongTimer = useRef<number | undefined>(undefined);

  const target = puzzle.targets[targetIndex];
  const complete = puzzle.targets.length === 0 || solvedIds.length === puzzle.targets.length;
  const selectedLetters =
    selectedIds
      .map((id) => target?.letters.find((letter) => letter.id === id))
      .filter((letter): letter is ScrabbleLetter => letter !== undefined);
  const targetByToken = new Map(
    puzzle.targets.map((candidate) => [candidate.tokenIndex, candidate]),
  );

  useEffect(() => () => window.clearTimeout(wrongTimer.current), []);

  const chooseLetter = (letter: ScrabbleLetter) => {
    if (!target || complete || selectedIds.includes(letter.id)) return;
    sound.resume();
    const expected = target.answer[selectedIds.length];

    if (letter.char !== expected) {
      sound.playWrong();
      navigator.vibrate?.(35);
      setWrongId(letter.id);
      window.clearTimeout(wrongTimer.current);
      wrongTimer.current = window.setTimeout(() => setWrongId(null), 420);
      announce('Try another letter.', true);
      return;
    }

    const nextSelected = [...selectedIds, letter.id];
    if (nextSelected.length < target.answer.length) {
      setSelectedIds(nextSelected);
      sound.playCorrect(nextSelected.length);
      return;
    }

    const nextSolved = [...solvedIds, target.id];
    setSolvedIds(nextSolved);
    setSelectedIds([]);
    announce(`${target.word} restored.`);

    if (nextSolved.length === puzzle.targets.length) {
      sound.playComplete();
      announce('Today’s verse is restored.', true);
      return;
    }

    sound.playSection();
    setTargetIndex((index) => index + 1);
  };

  return (
    <main
      className="stage stage--fit stage--scrabble"
      role="region"
      aria-label={`Daily Scrabble for ${verse.reference}`}
    >
      <div className="card scrabble">
        <div className="scrabble__heading">
          <div>
            <p className="eyebrow">Daily Scrabble</p>
            <h1 className="scrabble__reference">{verse.reference}</h1>
          </div>
          {!complete && target && (
            <span className="scrabble__progress">
              Word {targetIndex + 1} of {puzzle.targets.length}
            </span>
          )}
        </div>

        {!complete && target && (
          <section className="scrabble__play" aria-label={`Word ${targetIndex + 1}`}>
            <div className="scrabble__answer" aria-label="Word being spelled">
              {target.answer.map((_, index) => (
                <span
                  key={`${target.id}-slot-${index}`}
                  className={`scrabble__answer-slot ${
                    selectedLetters[index] ? 'scrabble__answer-slot--filled' : ''
                  }`}
                >
                  {selectedLetters[index]?.char ?? ''}
                </span>
              ))}
            </div>

            <div className="scrabble__letters" role="group" aria-label="Scrambled letters">
              {target.letters.map((letter) => {
                const selected = selectedIds.includes(letter.id);
                return (
                  <button
                    key={letter.id}
                    type="button"
                    className={`scrabble-letter ${
                      selected ? 'scrabble-letter--selected' : ''
                    } ${wrongId === letter.id ? 'scrabble-letter--wrong' : ''}`}
                    onClick={() => chooseLetter(letter)}
                    disabled={selected}
                    aria-label={`Letter ${letter.char}`}
                  >
                    {letter.char}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {complete && (
          <div className="scrabble__complete" role="status">
            <span className="scrabble__check" aria-hidden="true">✓</span>
            <strong>Verse restored!</strong>
          </div>
        )}

        <p className="scrabble__verse scripture" aria-label="Daily verse with missing words">
          {puzzle.tokens.map((token, tokenIndex) => {
            const tokenTarget = targetByToken.get(tokenIndex);
            if (!tokenTarget) {
              return (
                <Fragment key={`${tokenIndex}-${token}`}>
                  <span>{token}</span>{' '}
                </Fragment>
              );
            }
            if (solvedIds.includes(tokenTarget.id)) {
              return (
                <Fragment key={tokenTarget.id}>
                  <span className="scrabble__restored-word">{token}</span>{' '}
                </Fragment>
              );
            }
            const isCurrent = tokenTarget.id === target?.id;
            const leadingPunctuation = token.match(/^[^\p{L}]+/u)?.[0] ?? '';
            const trailingPunctuation = token.match(/[^\p{L}]+$/u)?.[0] ?? '';
            return (
              <Fragment key={tokenTarget.id}>
                <span>
                  {leadingPunctuation}
                  <span
                    className={`scrabble__blank ${
                      isCurrent ? 'scrabble__blank--current' : ''
                    }`}
                    aria-label={isCurrent ? 'current missing word' : 'missing word'}
                  >
                    {'_'.repeat(tokenTarget.answer.length)}
                  </span>
                  {trailingPunctuation}
                </span>
                {' '}
              </Fragment>
            );
          })}
        </p>

        {complete && (
          <button type="button" className="btn btn--primary" onClick={onDone}>
            Done for today
          </button>
        )}
      </div>
    </main>
  );
}
