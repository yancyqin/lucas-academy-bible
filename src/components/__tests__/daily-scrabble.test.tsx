import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundEngine } from '../../audio/sound';
import type { DailyVerse } from '../../daily';
import { buildDailyScrabble } from '../../game/daily-scrabble';
import { DailyScrabble } from '../DailyScrabble';

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
    playCorrect: vi.fn(),
    playWrong: vi.fn(),
    playSection: vi.fn(),
    playComplete: vi.fn(),
  } as unknown as SoundEngine;
}

describe('Daily Scrabble', () => {
  it('fills each blank after the word is spelled', () => {
    const sound = soundMock();
    const onDone = vi.fn();
    const puzzle = buildDailyScrabble(
      verse.text,
      `${verse.date}:${verse.passageId}:${verse.translation.key}`,
    );

    render(
      <DailyScrabble
        verse={verse}
        sound={sound}
        announce={vi.fn()}
        onDone={onDone}
      />,
    );

    expect(screen.getByText('Word 1 of 2')).toBeInTheDocument();

    for (const target of puzzle.targets) {
      for (const character of target.answer) {
        const matchingButtons = screen.getAllByRole('button', {
          name: `Letter ${character}`,
        });
        const available = matchingButtons.find(
          (button) => !(button as HTMLButtonElement).disabled,
        );
        expect(available).toBeDefined();
        fireEvent.click(available as HTMLButtonElement);
      }
    }

    expect(screen.getByText('Verse restored!')).toBeInTheDocument();
    expect(screen.getByText('Jesus')).toHaveClass('scrabble__restored-word');
    expect(screen.getByText('wept.')).toHaveClass('scrabble__restored-word');
    expect(sound.playComplete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Done for today' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
