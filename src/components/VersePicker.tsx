import { useEffect, useRef, useState } from 'react';
import {
  CANON_LABELS,
  chapterVerses,
  findBook,
  type BibleBook,
  type BibleCanon,
} from '../books';
import {
  VERSE_DIFFICULTIES,
  VERSE_MODES,
  type VerseDifficulty,
} from '../game/verse-modes';
import { MAX_VERSE_SPAN, type VerseGame, type VerseRequest } from '../verse-request';

export interface VersePickerProps {
  books: BibleBook[] | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  request: VerseRequest;
  onChangeRequest: (request: VerseRequest) => void;
  difficulty: VerseDifficulty;
  onChangeDifficulty: (difficulty: VerseDifficulty) => void;
  /** How the verse is played; difficulty applies to the Sequence game only. */
  game: VerseGame;
  onChangeGame: (game: VerseGame) => void;
  /** Start the chosen game on the picked verse. */
  onPlay: () => void;
  playError: string;
  /** Absolute link that replays this exact selection. */
  shareUrl: string;
}

const CANON_ORDER: BibleCanon[] = ['old_testament', 'new_testament'];

const GAMES: { key: VerseGame; title: string; caption: string; blurb: string }[] = [
  {
    key: 'sequence',
    title: 'Rebuild',
    caption: 'Memorize, then rebuild',
    blurb: '',
  },
  {
    key: 'letters',
    title: 'Guess Letters',
    caption: 'Claude Shannon’s game',
    blurb: 'Every word shows its start. Pick the letter that finishes it.',
  },
  {
    key: 'words',
    title: 'Next Word',
    caption: 'How an AI learns',
    blurb: 'Each sentence starts with a few words. Pick the word that comes next.',
  },
];

/** Each game in miniature: tiles to order, a word missing its end, a missing word. */
function GameSample({ game }: { game: VerseGame }) {
  if (game === 'sequence') {
    return (
      <span className="verse-game__sample verse-game__sample--tiles" aria-hidden="true">
        <span className="verse-game__tile" />
        <span className="verse-game__tile" />
        <span className="verse-game__tile" />
      </span>
    );
  }
  return (
    <span className="verse-game__sample" aria-hidden="true">
      {game === 'letters' ? 'Go' : 'so'}
      <span className={`verse-game__slot ${game === 'words' ? 'verse-game__slot--word' : ''}`}>
        {game === 'words' ? '?' : ''}
      </span>
    </span>
  );
}

/** "John 3:16" / "John 3:16-18", in the edition's own book name. */
export function pickedReference(
  books: BibleBook[] | null,
  request: VerseRequest,
): string {
  const title = books ? findBook(books, request.book)?.title : undefined;
  const span =
    request.endVerse === undefined
      ? `${request.verse}`
      : `${request.verse}-${request.endVerse}`;
  return `${title ?? request.book} ${request.chapter}:${span}`;
}

export function VersePicker({
  books,
  loading,
  error,
  onRetry,
  request,
  onChangeRequest,
  difficulty,
  onChangeDifficulty,
  game,
  onChangeGame,
  onPlay,
  playError,
  shareUrl,
}: VersePickerProps) {
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gameRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  const book = books ? findBook(books, request.book) : undefined;
  const chapterCount = book?.chapters.length ?? 0;
  const verses = book ? chapterVerses(book, request.chapter) : [];
  // A range may run to MAX_VERSE_SPAN verses, and never past the chapter.
  const endChoices = verses.filter(
    (verse) => verse > request.verse && verse - request.verse < MAX_VERSE_SPAN,
  );
  const reference = pickedReference(books, request);
  const ready = books !== null && book !== undefined && !loading;

  const selectBook = (bookId: string) => {
    onChangeRequest({ book: bookId, chapter: 1, verse: 1 });
  };

  const selectChapter = (chapter: number) => {
    onChangeRequest({ book: request.book, chapter, verse: 1 });
  };

  const selectVerse = (verse: number) => {
    onChangeRequest({ book: request.book, chapter: request.chapter, verse });
  };

  const selectEndVerse = (endVerse: number) => {
    onChangeRequest({
      book: request.book,
      chapter: request.chapter,
      verse: request.verse,
      ...(endVerse > request.verse ? { endVerse } : {}),
    });
  };

  /** Arrow keys move a radio group's choice and focus along with it. */
  const onRadioKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    count: number,
    select: (next: number) => void,
  ) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    select((index + step + count) % count);
  };

  const selectDifficulty = (next: number) => {
    onChangeDifficulty(VERSE_DIFFICULTIES[next]);
    modeRefs.current[next]?.focus();
  };

  const selectGame = (next: number) => {
    onChangeGame(GAMES[next].key);
    gameRefs.current[next]?.focus();
  };

  const chosen = GAMES.find((entry) => entry.key === game) ?? GAMES[0];
  const playLabel =
    game === 'letters'
      ? `Guess the letters in ${reference}`
      : game === 'words'
        ? `Guess the next word in ${reference}`
        : `Play ${reference} on ${VERSE_MODES[difficulty].label}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // No clipboard here — an insecure origin (a tablet on the LAN) or a
      // browser that blocks it. Show the link so it can be copied by hand.
      setShowLink(true);
    }
  };

  return (
    <div
      className="welcome-panel verse-panel"
      role="tabpanel"
      aria-live="polite"
      aria-busy={loading}
    >
      {loading && !books && (
        <p className="lede welcome-panel__copy">Loading the books of the Bible…</p>
      )}

      {!loading && error && !books && (
        <>
          <p className="daily-panel__error" role="alert">{error}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
            Try again
          </button>
        </>
      )}

      {books && (
        <>
          <div className="verse-fields">
            <label className="verse-field">
              <span className="verse-field__label">Book</span>
              <select
                className="verse-field__input"
                value={request.book}
                onChange={(event) => selectBook(event.target.value)}
              >
                {CANON_ORDER.filter((canon) =>
                  books.some((entry) => entry.canon === canon),
                ).map((canon) => (
                  <optgroup key={canon} label={CANON_LABELS[canon]}>
                    {books
                      .filter((entry) => entry.canon === canon)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.title}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="verse-field verse-field--num">
              <span className="verse-field__label">Chapter</span>
              <select
                className="verse-field__input"
                value={request.chapter}
                onChange={(event) => selectChapter(Number(event.target.value))}
              >
                {Array.from({ length: chapterCount }, (_, index) => index + 1).map(
                  (chapter) => (
                    <option key={chapter} value={chapter}>
                      {chapter}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="verse-field verse-field--num">
              <span className="verse-field__label">Verse</span>
              <select
                className="verse-field__input"
                value={request.verse}
                onChange={(event) => selectVerse(Number(event.target.value))}
              >
                {verses.map((verse) => (
                  <option key={verse} value={verse}>
                    {verse}
                  </option>
                ))}
              </select>
            </label>

            <label className="verse-field verse-field--num">
              <span className="verse-field__label">Through</span>
              <select
                className="verse-field__input"
                value={request.endVerse ?? request.verse}
                onChange={(event) => selectEndVerse(Number(event.target.value))}
                disabled={endChoices.length === 0}
              >
                <option value={request.verse}>—</option>
                {endChoices.map((verse) => (
                  <option key={verse} value={verse}>
                    {verse}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="verse-games" role="radiogroup" aria-label="Game">
            {GAMES.map((entry, index) => (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={game === entry.key}
                // Roving tabindex: Tab reaches the group once, arrows move on.
                tabIndex={game === entry.key ? 0 : -1}
                ref={(node) => {
                  gameRefs.current[index] = node;
                }}
                className={`verse-game ${game === entry.key ? 'verse-game--active' : ''}`}
                aria-label={`${entry.title}: ${entry.caption}`}
                onClick={() => onChangeGame(entry.key)}
                onKeyDown={(event) => onRadioKeyDown(event, index, GAMES.length, selectGame)}
              >
                <GameSample game={entry.key} />
                <span className="verse-game__title">{entry.title}</span>
                <span className="verse-game__caption">{entry.caption}</span>
              </button>
            ))}
          </div>

          {game === 'sequence' && (
            <div
              className="verse-modes"
              role="radiogroup"
              aria-label="Difficulty"
            >
              {VERSE_DIFFICULTIES.map((key, index) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === key}
                  tabIndex={difficulty === key ? 0 : -1}
                  ref={(node) => {
                    modeRefs.current[index] = node;
                  }}
                  className={`verse-mode ${
                    difficulty === key ? 'verse-mode--active' : ''
                  }`}
                  title={VERSE_MODES[key].blurb}
                  onClick={() => onChangeDifficulty(key)}
                  onKeyDown={(event) =>
                    onRadioKeyDown(event, index, VERSE_DIFFICULTIES.length, selectDifficulty)
                  }
                >
                  {VERSE_MODES[key].label}
                </button>
              ))}
            </div>
          )}

          <p className="verse-mode__blurb">
            {game === 'sequence' ? VERSE_MODES[difficulty].blurb : chosen.blurb}
          </p>

          {playError && (
            <p className="daily-panel__error" role="alert">{playError}</p>
          )}

          <div className="btn-row verse-actions">
            <button
              type="button"
              className="btn btn--primary"
              aria-label={playLabel}
              onClick={onPlay}
              disabled={!ready}
            >
              {reference}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={copyLink}
              title={shareUrl}
            >
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          </div>

          {showLink && (
            <p className="verse-share-url">
              <code>{shareUrl}</code>
            </p>
          )}
        </>
      )}
    </div>
  );
}
