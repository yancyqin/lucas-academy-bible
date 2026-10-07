import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundEngine } from '../../audio/sound';
import type { GuessGame } from '../../game/guess';
import { GuessPhase } from '../GuessPhase';

function soundMock(): SoundEngine {
  return {
    resume: vi.fn(),
    playCorrect: vi.fn(),
    playWrong: vi.fn(),
    playSection: vi.fn(),
    playComplete: vi.fn(),
  } as unknown as SoundEngine;
}

function play(game: GuessGame, chinese = false, sound = soundMock()) {
  const onPlayAgain = vi.fn();
  const onDone = vi.fn();
  render(
    <GuessPhase
      game={game}
      reference={chinese ? '约翰福音 11:35' : 'John 11:35'}
      chinese={chinese}
      sound={sound}
      announce={vi.fn()}
      onPlayAgain={onPlayAgain}
      onDone={onDone}
    />,
  );
  return { sound, onPlayAgain, onDone };
}

const verse = () => document.querySelector('.guess__verse') as HTMLElement;

const englishLetters: GuessGame = {
  kind: 'letters',
  tokens: ['Jesus', 'wept.'],
  separator: ' ',
  given: [],
  steps: [
    {
      tokenIndex: 0,
      word: 'Jesus',
      shown: 'Jes',
      units: [
        { answer: 'u', options: ['t', 'u', 's', 'e'] },
        { answer: 's', options: ['s', 't', 'e', 'w'] },
      ],
    },
    { tokenIndex: 1, word: 'wept', shown: 'wep', units: [{ answer: 't', options: ['s', 'p', 't', 'e'] }] },
  ],
};

const chineseLetters: GuessGame = {
  kind: 'letters',
  tokens: ['神', '爱', '世人。'],
  separator: '',
  given: [],
  steps: [{ tokenIndex: 2, word: '世人', shown: '世', units: [{ answer: '人', options: ['界', '人', '上', '代'] }] }],
};

const englishWords: GuessGame = {
  kind: 'words',
  tokens: ['God', 'is', 'love.'],
  separator: ' ',
  given: [0],
  steps: [
    { tokenIndex: 1, word: 'is', shown: '', units: [{ answer: 'is', options: ['was', 'is', 'are', 'be'] }] },
    { tokenIndex: 2, word: 'love', shown: '', units: [{ answer: 'love', options: ['light', 'good', 'love', 'near'] }] },
  ],
};

const chineseWords: GuessGame = {
  kind: 'words',
  tokens: ['耶稣', '哭', '了。'],
  separator: '',
  given: [0],
  steps: [
    { tokenIndex: 1, word: '哭', shown: '', units: [{ answer: '哭', options: ['笑', '哭', '说', '去'] }] },
    { tokenIndex: 2, word: '了', shown: '', units: [{ answer: '了', options: ['了', '的', '着', '过'] }] },
  ],
};

describe('Guess the Letters screen', () => {
  it('shows the start of each word, offers four letters, and colours each by its tries', () => {
    const { sound, onPlayAgain, onDone } = play(englishLetters);

    expect(screen.getByText('Guess the Letters')).toBeInTheDocument();
    expect(screen.getByText('Letter 1 of 3')).toBeInTheDocument();
    // The start of the word is on show; its ending and the next word are not.
    expect(verse()).toHaveTextContent('Jes');
    expect(verse()).not.toHaveTextContent('Jesus');
    expect(verse()).not.toHaveTextContent('wep');
    expect(screen.getAllByRole('button', { name: /^Choice: / })).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Choice: t' }));
    expect(sound.playWrong).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Choice: t' })).toBeDisabled();
    expect(screen.getByText('Letter 1 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Choice: u' }));
    expect(screen.getByText('Letter 2 of 3')).toBeInTheDocument();
    // A missed letter is only out for the letter it was missed on.
    expect(screen.getByRole('button', { name: 'Choice: t' })).toBeEnabled();

    // On a laptop, typing a letter picks it, in either case…
    fireEvent.keyDown(window, { key: 'S' });
    expect(screen.getByText('Letter 3 of 3')).toBeInTheDocument();
    expect(verse()).toHaveTextContent('Jesus');
    expect(verse()).toHaveTextContent('wep');
    expect(screen.getByText('u', { selector: '.guess-letter' })).toHaveClass('guess-heat--second');
    expect(screen.getByText('s', { selector: '.guess-letter' })).toHaveClass('guess-heat--first');

    // …and so does its number: 3 is "t".
    fireEvent.keyDown(window, { key: '3' });
    expect(sound.playComplete).toHaveBeenCalledTimes(1);
    expect(verse()).toHaveTextContent('Jesus wept.');
    expect(screen.queryByRole('group', { name: 'Choices' })).toBeNull();

    const summary = screen.getByRole('status');
    expect(summary).toHaveTextContent('Every word is complete!');
    expect(summary).toHaveTextContent('3 letters guessed');
    expect(summary).toHaveTextContent('4 guesses');
    expect(summary).toHaveTextContent('2 right on the first try (67%)');
    expect(summary).toHaveTextContent('Shannon');

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick another verse' }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('offers characters to pick for a Chinese word', () => {
    play(chineseLetters, true);
    expect(screen.getByText('猜字')).toBeInTheDocument();
    expect(screen.getByText('第 1 个字，共 1 个')).toBeInTheDocument();
    expect(verse()).toHaveTextContent('神爱世');

    fireEvent.click(screen.getByRole('button', { name: '选项：界' }));
    expect(screen.getByRole('button', { name: '选项：界' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '选项：人' }));
    expect(verse()).toHaveTextContent('神爱世人。');
    expect(screen.getByRole('status')).toHaveTextContent('每个词都补全了！');
    expect(screen.getByRole('status')).toHaveTextContent('0 个一次猜中（0%）');
  });
});

describe('Guess the Next Word screen', () => {
  it('starts with the opening words as context, then asks for each next word', () => {
    const { sound } = play(englishWords);

    expect(screen.getByText('Guess the Next Word')).toBeInTheDocument();
    expect(screen.getByText('Word 1 of 2')).toBeInTheDocument();
    // The opening word is handed over; the rest is not on the page yet.
    expect(screen.getByText('God', { selector: '.guess-word' })).toHaveClass('guess-word--given');
    expect(verse()).not.toHaveTextContent('love');

    fireEvent.click(screen.getByRole('button', { name: 'Choice: was' }));
    expect(sound.playWrong).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Choice: was' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Choice: is' }));
    expect(screen.getByText('Word 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('is', { selector: '.guess-word' })).toHaveClass('guess-heat--second');

    // Number keys pick a choice: 3 is "love".
    fireEvent.keyDown(window, { key: '3' });
    expect(sound.playComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('love', { selector: '.guess-word' })).toHaveClass('guess-heat--first');

    const summary = screen.getByRole('status');
    expect(summary).toHaveTextContent('You guessed the whole passage!');
    expect(summary).toHaveTextContent('2 words guessed');
    expect(summary).toHaveTextContent('3 guesses');
    expect(summary).toHaveTextContent('1 right on the first try (50%)');
    expect(summary).toHaveTextContent('Given as context');
  });

  it('speaks Chinese for a Chinese passage', () => {
    play(chineseWords, true);
    expect(screen.getByText('猜下一个词')).toBeInTheDocument();
    expect(screen.getByText('第 1 个词，共 2 个')).toBeInTheDocument();
    expect(screen.getByText('耶稣', { selector: '.guess-word' })).toHaveClass('guess-word--given');
    fireEvent.click(screen.getByRole('button', { name: '选项：哭' }));
    fireEvent.click(screen.getByRole('button', { name: '选项：了' }));
    expect(verse()).toHaveTextContent('耶稣哭了。');
    expect(screen.getByRole('status')).toHaveTextContent('整段经文猜完了！');
    expect(screen.getByRole('status')).toHaveTextContent('2 个一次猜中（100%）');
  });
});
