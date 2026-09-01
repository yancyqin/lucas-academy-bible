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
import { MAX_VERSE_SPAN, type VerseRequest } from '../verse-request';

export interface VersePickerProps {
  books: BibleBook[] | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  request: VerseRequest;
  onChangeRequest: (request: VerseRequest) => void;
  difficulty: VerseDifficulty;
  onChangeDifficulty: (difficulty: VerseDifficulty) => void;
  onPlay: () => void;
  playError: string;
  /** Absolute link that replays this exact selection. */
  shareUrl: string;
}

const CANON_ORDER: BibleCanon[] = ['old_testament', 'new_testament'];

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
  onPlay,
  playError,
  shareUrl,
}: VersePickerProps) {
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  const moveDifficulty = (from: number, step: number) => {
    const next =
      (from + step + VERSE_DIFFICULTIES.length) % VERSE_DIFFICULTIES.length;
    onChangeDifficulty(VERSE_DIFFICULTIES[next]);
    modeRefs.current[next]?.focus();
  };

  const onDifficultyKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveDifficulty(index, 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveDifficulty(index, -1);
    }
  };

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
                // Roving tabindex: Tab reaches the group once, arrows move on.
                tabIndex={difficulty === key ? 0 : -1}
                ref={(node) => {
                  modeRefs.current[index] = node;
                }}
                className={`verse-mode ${
                  difficulty === key ? 'verse-mode--active' : ''
                }`}
                title={VERSE_MODES[key].blurb}
                onClick={() => onChangeDifficulty(key)}
                onKeyDown={(event) => onDifficultyKeyDown(event, index)}
              >
                {VERSE_MODES[key].label}
              </button>
            ))}
          </div>

          <p className="verse-mode__blurb">{VERSE_MODES[difficulty].blurb}</p>

          {playError && (
            <p className="daily-panel__error" role="alert">{playError}</p>
          )}

          <div className="btn-row verse-actions">
            <button
              type="button"
              className="btn btn--primary"
              aria-label={`Play ${reference} on ${VERSE_MODES[difficulty].label}`}
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
