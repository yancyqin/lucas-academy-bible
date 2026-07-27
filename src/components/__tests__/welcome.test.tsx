import { render, screen } from '@testing-library/react';
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

describe('welcome game tabs', () => {
  it('shows a ready Daily Verse challenge without revealing the verse text', () => {
    render(
      <Welcome
        soundEnabled={false}
        showChinese={false}
        onToggleSound={noop}
        onToggleChinese={noop}
        onBegin={noop}
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
      />,
    );

    expect(screen.getByRole('tab', { name: 'Daily Verse' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Challenge' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Daily Scrabble' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Word Search' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Journey' })).not.toBeInTheDocument();
    expect(screen.getByText('John 3:16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play today’s verse' })).toBeInTheDocument();
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
        showChinese
        onToggleSound={noop}
        onToggleChinese={noop}
        onBegin={noop}
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
      />,
    );

    expect(screen.getByText('John 3:16')).toBeInTheDocument();
    expect(screen.queryByText(/loading today’s verse/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play today’s verse' })).toBeDisabled();
  });

  it('offers the same loaded passage in the Daily Scrabble tab', () => {
    render(
      <Welcome
        soundEnabled
        showChinese={false}
        onToggleSound={noop}
        onToggleChinese={noop}
        onBegin={noop}
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
      />,
    );

    expect(screen.getByRole('tab', { name: 'Daily Scrabble' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('John 3:16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Daily Scrabble' })).toBeEnabled();
    expect(screen.queryByText(daily.text)).not.toBeInTheDocument();
  });

  it('offers the loaded passage in the Word Search tab', () => {
    render(
      <Welcome
        soundEnabled
        showChinese={false}
        onToggleSound={noop}
        onToggleChinese={noop}
        onBegin={noop}
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
      />,
    );

    expect(screen.getByRole('tab', { name: 'Word Search' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('John 3:16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Daily Word Search' })).toBeEnabled();
  });
});
