import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { SoundEngine } from '../audio/sound';
import type { DailyVerse } from '../daily';
import {
  buildDailyWordSearch,
  lineBetween,
  pathKey,
  type GridPoint,
} from '../game/daily-word-search';

interface DailyWordSearchProps {
  verse: DailyVerse;
  sound: SoundEngine;
  announce: (message: string, assertive?: boolean) => void;
  onDone: () => void;
}

function samePoint(first: GridPoint, second: GridPoint): boolean {
  return first.row === second.row && first.col === second.col;
}

export function DailyWordSearch({
  verse,
  sound,
  announce,
  onDone,
}: DailyWordSearchProps) {
  const [layoutVersion, setLayoutVersion] = useState(0);
  const puzzle = useMemo(
    () =>
      buildDailyWordSearch(
        verse.text,
        `${verse.date}:${verse.passageId}:${verse.translation.key}:layout-${layoutVersion}`,
      ),
    [
      layoutVersion,
      verse.date,
      verse.passageId,
      verse.text,
      verse.translation.key,
    ],
  );
  const [foundIds, setFoundIds] = useState<string[]>([]);
  const [selection, setSelection] = useState<GridPoint[]>([]);
  const dragStart = useRef<GridPoint | null>(null);
  const dragEnd = useRef<GridPoint | null>(null);
  const activePointer = useRef<number | null>(null);
  const tapStart = useRef<GridPoint | null>(null);
  const suppressNextClick = useRef(false);

  const complete = puzzle.targets.length === 0 || foundIds.length === puzzle.targets.length;
  const targetByToken = new Map(
    puzzle.targets.map((target) => [target.tokenIndex, target]),
  );
  const selectedCells = new Set(selection.map((point) => `${point.row}:${point.col}`));
  const foundCells = new Set(
    puzzle.targets
      .filter((target) => foundIds.includes(target.id))
      .flatMap((target) => target.path)
      .map((point) => `${point.row}:${point.col}`),
  );

  const pointFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): GridPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const cellWidth = bounds.width / puzzle.size;
    const cellHeight = bounds.height / puzzle.size;
    return {
      row: Math.max(
        0,
        Math.min(
          puzzle.size - 1,
          Math.floor((event.clientY - bounds.top) / cellHeight),
        ),
      ),
      col: Math.max(
        0,
        Math.min(
          puzzle.size - 1,
          Math.floor((event.clientX - bounds.left) / cellWidth),
        ),
      ),
    };
  };

  const resolvePath = (path: GridPoint[]) => {
    setSelection([]);
    if (path.length < 2) return;
    const forward = pathKey(path);
    const backward = pathKey([...path].reverse());
    const found = puzzle.targets.find(
      (target) =>
        !foundIds.includes(target.id) &&
        (pathKey(target.path) === forward || pathKey(target.path) === backward),
    );

    if (!found) {
      sound.playWrong();
      navigator.vibrate?.(35);
      announce('That line is not one of the hidden words.', true);
      return;
    }

    const nextFound = [...foundIds, found.id];
    setFoundIds(nextFound);
    announce(`${found.word} found.`);
    if (nextFound.length === puzzle.targets.length) {
      sound.playComplete();
      announce('Today’s verse is restored.', true);
    } else {
      sound.playSection();
    }
  };

  const beginSelection = (
    event: ReactPointerEvent<HTMLButtonElement>,
    point: GridPoint,
  ) => {
    if (complete) return;
    event.preventDefault();
    sound.resume();
    dragStart.current = point;
    dragEnd.current = point;
    activePointer.current = event.pointerId;
    setSelection([point]);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Selection still works when an embedded browser blocks pointer capture.
    }
  };

  const moveSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      activePointer.current === null ||
      activePointer.current !== event.pointerId ||
      !dragStart.current
    ) {
      return;
    }
    const point = pointFromPointer(event);
    if (dragEnd.current && samePoint(point, dragEnd.current)) return;
    dragEnd.current = point;
    setSelection(lineBetween(dragStart.current, point));
  };

  const finishSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      activePointer.current === null ||
      activePointer.current !== event.pointerId ||
      !dragStart.current
    ) {
      return;
    }
    const start = dragStart.current;
    const end = pointFromPointer(event);
    const path = lineBetween(start, end);
    dragStart.current = null;
    dragEnd.current = null;
    activePointer.current = null;
    setSelection([]);

    if (path.length < 2) return;
    suppressNextClick.current = true;
    window.setTimeout(() => {
      suppressNextClick.current = false;
    }, 0);
    tapStart.current = null;
    resolvePath(path);
  };

  const cancelSelection = () => {
    dragStart.current = null;
    dragEnd.current = null;
    activePointer.current = null;
    setSelection([]);
  };

  const refreshLayout = () => {
    sound.resume();
    sound.playClick();
    dragStart.current = null;
    dragEnd.current = null;
    activePointer.current = null;
    tapStart.current = null;
    setFoundIds([]);
    setSelection([]);
    setLayoutVersion((version) => version + 1);
    announce('New word-search layout.');
  };

  const tapCell = (point: GridPoint) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    sound.resume();
    if (!tapStart.current) {
      tapStart.current = point;
      setSelection([point]);
      return;
    }

    const path = lineBetween(tapStart.current, point);
    tapStart.current = null;
    resolvePath(path);
  };

  return (
    <main
      className="stage stage--fit stage--word-search"
      role="region"
      aria-label={`Daily Word Search for ${verse.reference}`}
    >
      <div className="card word-search">
        <div className="word-search__heading">
          <div>
            <p className="eyebrow">Daily Word Search</p>
            <h1 className="word-search__reference">{verse.reference}</h1>
          </div>
          <div className="word-search__tools">
            {!complete && (
              <span className="word-search__progress">
                {foundIds.length} of {puzzle.targets.length} found
              </span>
            )}
            <button
              type="button"
              className="word-search__refresh"
              onClick={refreshLayout}
              aria-label="Refresh word-search layout"
              title="New layout"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M19 8a8 8 0 1 0 1 6M19 4v4h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {!complete && (
          <div
            className="word-search__grid"
            role="grid"
            aria-label={`${puzzle.size} by ${puzzle.size} hidden word grid`}
            style={{
              gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
            }}
            onPointerMove={moveSelection}
            onPointerUp={finishSelection}
            onPointerCancel={cancelSelection}
          >
            {puzzle.grid.flatMap((row, rowIndex) =>
              row.map((letter, colIndex) => {
                const key = `${rowIndex}:${colIndex}`;
                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    aria-rowindex={rowIndex + 1}
                    aria-colindex={colIndex + 1}
                    aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}, ${letter}`}
                    className={`word-search-cell ${
                      selectedCells.has(key) ? 'word-search-cell--selected' : ''
                    } ${foundCells.has(key) ? 'word-search-cell--found' : ''}`}
                    onPointerDown={(event) =>
                      beginSelection(event, { row: rowIndex, col: colIndex })
                    }
                    onClick={() => tapCell({ row: rowIndex, col: colIndex })}
                  >
                    {letter}
                  </button>
                );
              }),
            )}
          </div>
        )}

        {complete && (
          <div className="word-search__complete" role="status">
            <span className="word-search__check" aria-hidden="true">✓</span>
            <strong>Verse restored!</strong>
          </div>
        )}

        <p
          className="word-search__verse scripture"
          aria-label="Daily verse with hidden words"
        >
          {puzzle.tokens.map((token, tokenIndex) => {
            const tokenTarget = targetByToken.get(tokenIndex);
            if (!tokenTarget) {
              return (
                <Fragment key={`${tokenIndex}-${token}`}>
                  <span>{token}</span>{' '}
                </Fragment>
              );
            }
            if (foundIds.includes(tokenTarget.id)) {
              return (
                <Fragment key={tokenTarget.id}>
                  <span className="word-search__restored-word">{token}</span>{' '}
                </Fragment>
              );
            }
            const leadingPunctuation = token.match(/^[^\p{L}]+/u)?.[0] ?? '';
            const trailingPunctuation = token.match(/[^\p{L}]+$/u)?.[0] ?? '';
            return (
              <Fragment key={tokenTarget.id}>
                <span>
                  {leadingPunctuation}
                  <span className="word-search__blank" aria-label="hidden word">
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
