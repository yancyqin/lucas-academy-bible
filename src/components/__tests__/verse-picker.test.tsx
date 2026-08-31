import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BibleBook } from '../../books';
import { VersePicker, type VersePickerProps } from '../VersePicker';

const books: BibleBook[] = [
  {
    id: 'PSA',
    title: '诗篇',
    canon: 'old_testament',
    chapters: [6, 12, 9],
    gaps: { 3: [7, 8] },
  },
  { id: 'JHN', title: '约翰福音', canon: 'new_testament', chapters: [51, 25, 36] },
];

const noop = vi.fn();

function setup(overrides: Partial<VersePickerProps> = {}) {
  const props: VersePickerProps = {
    books,
    loading: false,
    error: '',
    onRetry: noop,
    request: { book: 'JHN', chapter: 3, verse: 16 },
    onChangeRequest: noop,
    difficulty: 'normal',
    onChangeDifficulty: noop,
    onPlay: noop,
    playError: '',
    shareUrl: 'https://bible.lucasacademy.org/?passage=JHN.3.16',
    ...overrides,
  };
  render(<VersePicker {...props} />);
  return props;
}

describe('Pick a Verse', () => {
  it('names the verse in the edition’s own language on the play button', () => {
    const onPlay = vi.fn();
    setup({ onPlay });

    const play = screen.getByRole('button', { name: /Play 约翰福音 3:16 on Normal/ });
    fireEvent.click(play);
    expect(play).toHaveTextContent('约翰福音 3:16');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('lists books grouped by testament, and this chapter’s verses', () => {
    setup();

    const bookSelect = screen.getByLabelText('Book') as HTMLSelectElement;
    expect(bookSelect.value).toBe('JHN');
    expect(
      Array.from(bookSelect.querySelectorAll('optgroup')).map((group) =>
        group.getAttribute('label'),
      ),
    ).toEqual(['Old Testament', 'New Testament']);

    const chapters = screen.getByLabelText('Chapter') as HTMLSelectElement;
    expect(chapters.options).toHaveLength(3);
    const verses = screen.getByLabelText('Verse') as HTMLSelectElement;
    expect(verses.options).toHaveLength(36);
  });

  it('never offers a verse the edition merged away', () => {
    setup({ request: { book: 'PSA', chapter: 3, verse: 1 } });

    const verses = screen.getByLabelText('Verse') as HTMLSelectElement;
    expect(Array.from(verses.options).map((option) => option.value)).toEqual([
      '1', '2', '3', '4', '5', '6', '9',
    ]);
  });

  it('starts a new book at its first verse', () => {
    const onChangeRequest = vi.fn();
    setup({ onChangeRequest });

    fireEvent.change(screen.getByLabelText('Book'), { target: { value: 'PSA' } });
    expect(onChangeRequest).toHaveBeenCalledWith({
      book: 'PSA',
      chapter: 1,
      verse: 1,
    });
  });

  it('offers a range of up to eight verses, and only forwards', () => {
    setup({ request: { book: 'JHN', chapter: 3, verse: 16 } });

    const through = screen.getByLabelText('Through') as HTMLSelectElement;
    expect(Array.from(through.options).map((option) => option.value)).toEqual([
      '16', '17', '18', '19', '20', '21', '22', '23',
    ]);
  });

  it('drops the range when the player picks the dash', () => {
    const onChangeRequest = vi.fn();
    setup({
      request: { book: 'JHN', chapter: 3, verse: 16, endVerse: 18 },
      onChangeRequest,
    });

    fireEvent.change(screen.getByLabelText('Through'), { target: { value: '16' } });
    expect(onChangeRequest).toHaveBeenCalledWith({
      book: 'JHN',
      chapter: 3,
      verse: 16,
    });
  });

  it('disables the range when the verse is the last in the chapter', () => {
    setup({ request: { book: 'JHN', chapter: 3, verse: 36 } });
    expect(screen.getByLabelText('Through')).toBeDisabled();
  });

  it('offers the four difficulties and marks the chosen one', () => {
    const onChangeDifficulty = vi.fn();
    setup({ difficulty: 'practice', onChangeDifficulty });

    const modes = screen.getByRole('radiogroup', { name: 'Difficulty' });
    expect(
      Array.from(modes.querySelectorAll('[role="radio"]')).map(
        (radio) => radio.textContent,
      ),
    ).toEqual(['Easy', 'Normal', 'Hard', 'Practice']);
    expect(screen.getByRole('radio', { name: 'Practice' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/no timer, five hearts/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    expect(onChangeDifficulty).toHaveBeenCalledWith('hard');
  });

  it('copies the share link', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(
      'https://bible.lucasacademy.org/?passage=JHN.3.16',
    );
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows the link to copy by hand where the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(
      await screen.findByText('https://bible.lucasacademy.org/?passage=JHN.3.16'),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('offers a retry when the book list fails to load', () => {
    const onRetry = vi.fn();
    setup({ books: null, error: 'The book list could not be loaded.', onRetry });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The book list could not be loaded.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Book')).not.toBeInTheDocument();
  });

  it('shows why a verse could not be played, with the picker still usable', () => {
    setup({ playError: 'That passage could not be loaded. Please try again.' });

    expect(screen.getByRole('alert')).toHaveTextContent('That passage could not be loaded.');
    expect(screen.getByLabelText('Book')).toBeInTheDocument();
  });
});
