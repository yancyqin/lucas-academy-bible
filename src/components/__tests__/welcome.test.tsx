import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DailyVerse } from '../../daily';
import { Welcome } from '../Welcome';

const daily: DailyVerse = {
  date: '2026-07-25',
  dayOfYear: 206,
  passageId: 'JHN.3.16',
  reference: 'John 3:16',
  text: 'For God so loved the world.',
  cache: 'HIT',
  translation: {
    key: 'NIV',
    label: 'NIV',
    id: 111,
    abbreviation: 'NIV',
    title: 'New International Version',
    copyright: 'Required NIV copyright.',
    promotionalContent: '',
    youVersionDeepLink: 'https://www.bible.com/versions/111',
  },
};

const noop = vi.fn();

const versePicker = {
  books: null,
  loading: false,
  error: '',
  onRetry: noop,
  request: { book: 'JHN', chapter: 3, verse: 16 },
  onChangeRequest: noop,
  difficulty: 'normal' as const,
  onChangeDifficulty: noop,
  onPlay: noop,
  playError: '',
  shareUrl: 'https://bible.lucasacademy.org/?passage=JHN.3.16',
};

describe('welcome game tabs', () => {
  it('switches among English, Chinese, and Korean Bible editions', () => {
    const selectTranslation = vi.fn();
    render(
      <Welcome
        soundEnabled
        onToggleSound={noop}
        onBegin={noop}
        practiceMode={false}
        onTogglePracticeMode={noop}
        activeTab="journey"
        onSelectTab={noop}
        dailyVerse={daily}
        dailyLoading={false}
        dailyError=""
        onRetryDaily={noop}
        onBeginDaily={noop}
        onBeginScrabble={noop}
        onBeginWordSearch={noop}
        dailyEnabled
        translation="NIV"
        onSelectTranslation={selectTranslation}
        journeyError=""
        translationApiEnabled
        versePicker={versePicker}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Bible language' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByRole('button', { name: /中文 translation/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '中文' }));
    expect(selectTranslation).toHaveBeenCalledWith('CUV');

    fireEvent.click(screen.getByRole('radio', { name: '한국어' }));
    expect(selectTranslation).toHaveBeenCalledWith('KLB');
  });

  it('shows KLB as the Korean Bible edition', () => {
    render(
      <Welcome
        soundEnabled
        onToggleSound={noop}
        onBegin={noop}
        practiceMode={false}
        onTogglePracticeMode={noop}
        activeTab="journey"
        onSelectTab={noop}
        dailyVerse={daily}
        dailyLoading={false}
        dailyError=""
        onRetryDaily={noop}
        onBeginDaily={noop}
        onBeginScrabble={noop}
        onBeginWordSearch={noop}
        dailyEnabled
        translation="KLB"
        onSelectTranslation={noop}
        journeyError=""
        translationApiEnabled
        versePicker={versePicker}
      />,
    );

    expect(screen.getByRole('radio', { name: '한국어' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      screen.getByRole('radiogroup', { name: 'Korean Bible translation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'KLB' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('offers an accessible no-timer Practice Mode option for Challenge', () => {
    const togglePracticeMode = vi.fn();
    render(
      <Welcome
        soundEnabled
        onToggleSound={noop}
        onBegin={noop}
        practiceMode={false}
        onTogglePracticeMode={togglePracticeMode}
        activeTab="journey"
        onSelectTab={noop}
        dailyVerse={daily}
        dailyLoading={false}
        dailyError=""
        onRetryDaily={noop}
        onBeginDaily={noop}
        onBeginScrabble={noop}
        onBeginWordSearch={noop}
        dailyEnabled
        translation="WEB"
        onSelectTranslation={noop}
        journeyError=""
        translationApiEnabled
        versePicker={versePicker}
      />,
    );

    const option = screen.getByRole('switch', { name: /practice mode/i });
    const sound = screen.getByRole('switch', { name: /sound is on/i });
    expect(option).toHaveAttribute('aria-checked', 'false');
    expect(sound).toHaveAttribute('aria-checked', 'true');
    expect(option).toHaveTextContent('Practice');
    expect(option.closest('[aria-label="Options"]')).toContainElement(
      sound,
    );
    fireEvent.click(option);
    expect(togglePracticeMode).toHaveBeenCalledTimes(1);
  });

  it('shows a ready Daily Verse challenge without revealing the verse text', () => {
    render(
      <Welcome
        soundEnabled={false}
        onToggleSound={noop}
        onBegin={noop}
        practiceMode={false}
        onTogglePracticeMode={noop}
        activeTab="daily"
        onSelectTab={noop}
        dailyVerse={daily}
        dailyLoading={false}
        dailyError=""
        onRetryDaily={noop}
        onBeginDaily={noop}
        onBeginScrabble={noop}
        onBeginWordSearch={noop}
        dailyEnabled
        translation="NIV"
        onSelectTranslation={noop}
        journeyError=""
        translationApiEnabled
        versePicker={versePicker}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Daily Verse' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Challenge' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Daily Scrabble' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Word Search' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Journey' })).not.toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: 'Play Daily Verse for John 3:16',
    });
    expect(button).toHaveTextContent(/^John 3:16$/);
    expect(screen.queryByText('John 3:16', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.queryByText(daily.text)).not.toBeInTheDocument();
    expect(screen.queryByText(/^today$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/one fresh challenge|build from a two-word verse/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'NIV' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps the Daily Verse panel stable while a new translation loads', () => {
    render(
      <Welcome
        soundEnabled={false}
        onToggleSound={noop}
        onBegin={noop}
        practiceMode={false}
        onTogglePracticeMode={noop}
        activeTab="daily"
        onSelectTab={noop}
        dailyVerse={daily}
        dailyLoading
        dailyError=""
        onRetryDaily={noop}
        onBeginDaily={noop}
        onBeginScrabble={noop}
        onBeginWordSearch={noop}
        dailyEnabled
        translation="NASB2020"
        onSelectTranslation={noop}
        journeyError=""
        translationApiEnabled
        versePicker={versePicker}
      />,
    );

    expect(screen.queryByText(/loading today’s verse/i)).not.toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: 'Play Daily Verse for John 3:16',
    });
    expect(button).toHaveTextContent(/^John 3:16$/);
    expect(button).toBeDisabled();
  });

  it('offers the same loaded passage in the Daily Scrabble tab', () => {
    render(
      <Welcome
        soundEnabled
        onToggleSound={noop}
        onBegin={noop}
        practiceMode={false}
        onTogglePracticeMode={noop}
        activeTab="scrabble"
        onSelectTab={noop}
        dailyVerse={daily}
        dailyLoading={false}
        dailyError=""
        onRetryDaily={noop}
        onBeginDaily={noop}
        onBeginScrabble={noop}
        onBeginWordSearch={noop}
        dailyEnabled
        translation="NIV"
        onSelectTranslation={noop}
        journeyError=""
        translationApiEnabled
        versePicker={versePicker}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Daily Scrabble' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const button = screen.getByRole('button', {
      name: 'Play Daily Scrabble for John 3:16',
    });
    expect(button).toHaveTextContent(/^John 3:16$/);
    expect(button).toBeEnabled();
    expect(screen.queryByText('John 3:16', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.queryByText(daily.text)).not.toBeInTheDocument();
  });

  it('offers the loaded passage in the Word Search tab', () => {
    render(
      <Welcome
        soundEnabled
        onToggleSound={noop}
        onBegin={noop}
        practiceMode={false}
        onTogglePracticeMode={noop}
        activeTab="word-search"
        onSelectTab={noop}
        dailyVerse={daily}
        dailyLoading={false}
        dailyError=""
        onRetryDaily={noop}
        onBeginDaily={noop}
        onBeginScrabble={noop}
        onBeginWordSearch={noop}
        dailyEnabled
        translation="NIV"
        onSelectTranslation={noop}
        journeyError=""
        translationApiEnabled
        versePicker={versePicker}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Word Search' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const button = screen.getByRole('button', {
      name: 'Play Daily Word Search for John 3:16',
    });
    expect(button).toHaveTextContent(/^John 3:16$/);
    expect(button).toBeEnabled();
    expect(screen.queryByText('John 3:16', { selector: 'p' })).not.toBeInTheDocument();
  });
});
