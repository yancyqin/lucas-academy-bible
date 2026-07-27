import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundEngine } from '../../audio/sound';
import type { DailyVerse } from '../../daily';
import { buildDailyWordSearch } from '../../game/daily-word-search';
import { DailyWordSearch } from '../DailyWordSearch';

const verse: DailyVerse = {
  date: '2026-07-26',
  dayOfYear: 207,
  passageId: 'JHN.11.35',
  reference: 'John 11:35',
  text: 'Jesus wept.',
  cache: 'HIT',
  translation: {
    key: 'WEB',
    label: 'WEB',
    id: 206,
    abbreviation: 'WEB',
    title: 'World English Bible Classic',
    copyright: 'Public Domain',
    promotionalContent: '',
    youVersionDeepLink: 'https://www.bible.com/versions/206',
  },
};

function soundMock(): SoundEngine {
  return {
    resume: vi.fn(),
    playWrong: vi.fn(),
    playClick: vi.fn(),
    playSection: vi.fn(),
    playComplete: vi.fn(),
  } as unknown as SoundEngine;
}

describe('Daily Word Search', () => {
  it('fills a verse blank when its grid path is dragged', () => {
    const sound = soundMock();
    const puzzle = buildDailyWordSearch(
      verse.text,
      `${verse.date}:${verse.passageId}:${verse.translation.key}:layout-0`,
    );
    const target = puzzle.targets[0];

    render(
      <DailyWordSearch
        verse={verse}
        sound={sound}
        announce={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    const start = target.path[0];
    const end = target.path[target.path.length - 1];
    const startCell = screen.getByRole('gridcell', {
      name: `Row ${start.row + 1}, column ${start.col + 1}, ${puzzle.grid[start.row][start.col]}`,
    });
    const endCell = screen.getByRole('gridcell', {
      name: `Row ${end.row + 1}, column ${end.col + 1}, ${puzzle.grid[end.row][end.col]}`,
    });
    fireEvent.click(startCell);
    fireEvent.click(endCell);

    expect(screen.getByText('1 of 2 found')).toBeInTheDocument();
    expect(screen.getByText(target.word)).toHaveClass(
      'word-search__restored-word',
    );
    expect(sound.playSection).toHaveBeenCalledTimes(1);

    const firstGrid = screen
      .getAllByRole('gridcell')
      .map((cell) => cell.textContent)
      .join('');
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh word-search layout' }),
    );
    const refreshedGrid = screen
      .getAllByRole('gridcell')
      .map((cell) => cell.textContent)
      .join('');

    expect(refreshedGrid).not.toBe(firstGrid);
    expect(screen.getByText('0 of 2 found')).toBeInTheDocument();
    expect(sound.playClick).toHaveBeenCalledTimes(1);
  });
});
