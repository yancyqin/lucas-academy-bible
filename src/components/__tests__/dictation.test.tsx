import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Narrator } from '../../audio/speech';
import type { SoundEngine } from '../../audio/sound';
import { buildLevel } from '../../game/build';
import { getLevelFile } from '../../game/levels';
import { StudyPhase } from '../StudyPhase';

// Level 0 is always "Jesus wept."
const level = buildLevel(getLevelFile(0)!, { seed: 1 });
const chineseLevel = { ...level, fullText: '耶稣哭了。', reference: '约翰福音 11:35' };
const noop = vi.fn();

function soundMock() {
  return {
    resume: vi.fn(),
    primeCorrectAudio: vi.fn(),
    playComplete: vi.fn(),
  } as unknown as SoundEngine;
}

/** A narrator whose reading can be finished on cue. */
function talker() {
  let finish: (() => void) | undefined;
  const narrator = {
    supported: true,
    speak: vi.fn((_text: string, opts: { onend?: () => void }) => {
      finish = opts.onend;
    }),
    stop: vi.fn(),
  } as unknown as Narrator;
  return { narrator, finishReading: () => act(() => finish?.()) };
}

const writeButton = () => screen.queryByRole('button', { name: /write from memory|默写/i });
/** Long enough for any test verse to finish playing in word by word. */
const playThrough = () => act(() => vi.advanceTimersByTime(5_000));

describe('dictation in Practice Mode', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('offers writing from memory once the verse has played in on screen', () => {
    const { narrator } = talker();
    render(
      <StudyPhase built={level} narrator={narrator} sound={soundMock()} onReady={noop} announce={noop} practiceMode />,
    );

    // "Jesus wept." plays in over two 350 ms words, plus the last word's growth.
    expect(writeButton()).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));
    expect(writeButton()).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(50));
    expect(writeButton()).toBeInTheDocument();
    // The usual way on stays.
    expect(screen.getByRole('button', { name: /start recall/i })).toBeInTheDocument();
  });

  it('offers it as soon as Listen has read the verse to the end', () => {
    const { narrator, finishReading } = talker();
    render(
      <StudyPhase built={level} narrator={narrator} sound={soundMock()} onReady={noop} announce={noop} practiceMode />,
    );

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    expect(writeButton()).not.toBeInTheDocument();
    finishReading();
    expect(writeButton()).toBeInTheDocument();
  });

  it('does not count narration stopped before the end', () => {
    const { narrator } = talker();
    render(
      <StudyPhase built={level} narrator={narrator} sound={soundMock()} onReady={noop} announce={noop} practiceMode />,
    );

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(writeButton()).not.toBeInTheDocument();
  });

  it('never offers it on a timed level', () => {
    const { narrator, finishReading } = talker();
    render(<StudyPhase built={level} narrator={narrator} sound={soundMock()} onReady={noop} announce={noop} />);

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    finishReading();
    playThrough();
    expect(writeButton()).not.toBeInTheDocument();
  });

  it('offers it when nothing can read the verse aloud', () => {
    const silent = { supported: false, speak: vi.fn(), stop: vi.fn() } as unknown as Narrator;
    render(
      <StudyPhase built={level} narrator={silent} sound={soundMock()} onReady={noop} announce={noop} practiceMode />,
    );
    playThrough();
    expect(writeButton()).toBeInTheDocument();
  });

  it('hides the verse, grades the writing and shows what was wrong', () => {
    const { narrator, finishReading } = talker();
    const sound = soundMock();
    const announce = vi.fn();
    const { container } = render(
      <StudyPhase built={level} narrator={narrator} sound={sound} onReady={noop} announce={announce} practiceMode />,
    );
    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    finishReading();
    fireEvent.click(writeButton()!);

    expect(container.querySelector('.study__scripture')).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: /your verse/i });
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Jesus wpet' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 words right')).toBeInTheDocument();
    const wrong = container.querySelector('.dictation__verse .dictation-mark--wrong');
    expect(wrong).toHaveTextContent('wept');
    expect(wrong?.querySelector('rt')).toHaveTextContent('wpet');
    expect(container.querySelector('.dictation__verse .dictation-mark--correct')).toHaveTextContent('Jesus');
    expect(sound.playComplete).not.toHaveBeenCalled();
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/accuracy 50%/i));

    // Write again starts from a clean page.
    fireEvent.click(screen.getByRole('button', { name: /write again/i }));
    expect(screen.getByRole('textbox', { name: /your verse/i })).toHaveValue('');
  });

  it('celebrates a perfect dictation', () => {
    const silent = { supported: false, speak: vi.fn(), stop: vi.fn() } as unknown as Narrator;
    const sound = soundMock();
    render(
      <StudyPhase built={level} narrator={silent} sound={sound} onReady={noop} announce={noop} practiceMode />,
    );
    playThrough();
    fireEvent.click(writeButton()!);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'jesus wept' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /perfect/i })).toBeInTheDocument();
    expect(sound.playComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps an unfinished draft across a look back at the verse', () => {
    const silent = { supported: false, speak: vi.fn(), stop: vi.fn() } as unknown as Narrator;
    const { container } = render(
      <StudyPhase built={level} narrator={silent} sound={soundMock()} onReady={noop} announce={noop} practiceMode />,
    );
    playThrough();
    fireEvent.click(writeButton()!);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Jesus' } });
    fireEvent.click(screen.getByRole('button', { name: /look again/i }));

    expect(container.querySelector('.study__scripture')).toBeInTheDocument();
    fireEvent.click(writeButton()!);
    expect(screen.getByRole('textbox')).toHaveValue('Jesus');
  });

  it('speaks Chinese and counts characters for a Chinese passage', () => {
    const silent = { supported: false, speak: vi.fn(), stop: vi.fn() } as unknown as Narrator;
    const { container } = render(
      <StudyPhase built={chineseLevel} narrator={silent} sound={soundMock()} onReady={noop} announce={noop} practiceMode />,
    );
    playThrough();
    fireEvent.click(screen.getByRole('button', { name: '✎ 默写' }));
    fireEvent.change(screen.getByRole('textbox', { name: '你的默写' }), { target: { value: '耶苏了' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('2 / 4 个字写对')).toBeInTheDocument();
    expect(container.querySelector('.dictation__verse .dictation-mark--wrong')).toHaveTextContent('稣');
    expect(container.querySelector('.dictation__verse .dictation-mark--missing')).toHaveTextContent('哭');
    expect(screen.getByRole('button', { name: '再写一次' })).toBeInTheDocument();
  });
});
