import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Narrator } from '../../audio/speech';
import type { SoundEngine } from '../../audio/sound';
import { buildLevel } from '../../game/build';
import { getLevelFile } from '../../game/levels';
import { FailureReveal } from '../FailureReveal';
import { LevelComplete } from '../LevelComplete';
import { RecallPhase } from '../RecallPhase';
import { StudyPhase } from '../StudyPhase';

const level = buildLevel(getLevelFile(0)!, { seed: 1 });
const narrator = {
  supported: false,
  speak: vi.fn(),
  stop: vi.fn(),
} as unknown as Narrator;
const sound = {
  resume: vi.fn(),
  primeCorrectAudio: vi.fn(),
} as unknown as SoundEngine;
const noop = vi.fn();

describe('phase controls', () => {
  it('animates the study text and has no quit control', () => {
    const { container } = render(
      <StudyPhase
        built={level}
        soundEnabled={false}
        narrator={narrator}
        sound={sound}
        onReady={noop}
        announce={noop}
      />,
    );

    expect(screen.queryByText('中文经文')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start recall/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quit/i })).not.toBeInTheDocument();
    const animatedWords = container.querySelectorAll('.study__word');
    expect(animatedWords).toHaveLength(2);
    expect(animatedWords[0]).toHaveStyle({ animationDuration: '350ms' });
    expect(animatedWords[1]).toHaveStyle({
      animationDelay: '350ms',
      animationDuration: '350ms',
    });

    fireEvent.click(screen.getByRole('button', { name: /start recall/i }));
    expect(sound.resume).toHaveBeenCalled();
    expect(sound.primeCorrectAudio).toHaveBeenCalled();
  });

  it('does not count down or auto-advance during Practice Mode study', () => {
    vi.useFakeTimers();
    const onReady = vi.fn();
    const { unmount } = render(
      <StudyPhase
        built={level}
        soundEnabled={false}
        narrator={narrator}
        sound={sound}
        onReady={onReady}
        announce={noop}
        practiceMode
      />,
    );

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/practice mode · no timer/i);
    vi.advanceTimersByTime((level.memorizeSeconds + 10) * 1_000);
    expect(onReady).not.toHaveBeenCalled();

    unmount();
    vi.useRealTimers();
  });

  it('has neither undo nor quit controls during recall', () => {
    render(
      <RecallPhase
        level={level}
        sound={sound}
        announce={noop}
        onComplete={noop}
        onFail={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restart from level 0/i })).not.toBeInTheDocument();
  });

  it('does not count down or drain hearts during Practice Mode recall', () => {
    vi.useFakeTimers();
    const onFail = vi.fn();
    const { unmount } = render(
      <RecallPhase
        level={level}
        sound={sound}
        announce={noop}
        onComplete={noop}
        onFail={onFail}
        practiceMode
      />,
    );

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/practice mode · no timer/i);
    vi.advanceTimersByTime(level.memorizeSeconds * 10_000);
    expect(onFail).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: '3 of 3 hearts remaining' })).toBeInTheDocument();

    unmount();
    vi.useRealTimers();
  });

  it('restarts damage sound and heart visuals for every wrong tap, including failure', () => {
    const damageSound = {
      resume: vi.fn(),
      primeCorrectAudio: vi.fn(),
      playWrong: vi.fn(),
      playCorrect: vi.fn(),
      playSection: vi.fn(),
      playComplete: vi.fn(),
      playClick: vi.fn(),
      playHeartDrain: vi.fn(),
    } as unknown as SoundEngine;
    const { container } = render(
      <RecallPhase
        level={level}
        sound={damageSound}
        announce={noop}
        onComplete={noop}
        onFail={noop}
      />,
    );
    const wrongWord = screen.getByRole('button', { name: 'Word: wept.' });

    fireEvent.click(wrongWord);
    const firstDamageHeart = container.querySelector('.heart--lost');
    expect(firstDamageHeart).toBeInTheDocument();

    fireEvent.click(wrongWord);
    expect(container.querySelector('.heart--lost')).not.toBe(firstDamageHeart);

    for (let tap = 0; tap < 4; tap += 1) fireEvent.click(wrongWord);
    fireEvent.click(wrongWord);

    expect(damageSound.resume).toHaveBeenCalledTimes(6);
    expect(damageSound.playWrong).toHaveBeenCalledTimes(6);
    expect(screen.getByRole('img', { name: '0 of 3 hearts remaining' })).toHaveAttribute(
      'data-loss-seq',
      '6',
    );
    expect(container.querySelector('.heart--lost')).toBeInTheDocument();
  });

  it('plays exactly one correct cue inside the first correct tap', () => {
    const firstCorrectSound = {
      resume: vi.fn(),
      primeCorrectAudio: vi.fn(),
      playWrong: vi.fn(),
      playCorrect: vi.fn(),
      playSection: vi.fn(),
      playComplete: vi.fn(),
      playClick: vi.fn(),
      playHeartDrain: vi.fn(),
    } as unknown as SoundEngine;
    render(
      <RecallPhase
        level={level}
        sound={firstCorrectSound}
        announce={noop}
        onComplete={noop}
        onFail={noop}
      />,
    );

    // Recall warms the note clips on mount — right after narration stops.
    expect(firstCorrectSound.primeCorrectAudio).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Word: Jesus' }));

    expect(firstCorrectSound.resume).toHaveBeenCalledTimes(1);
    // Exactly one scale note, from the tap handler only — the React effect
    // must not add a duplicate.
    expect(firstCorrectSound.playCorrect).toHaveBeenCalledTimes(1);
    expect(firstCorrectSound.playCorrect).toHaveBeenCalledWith(1);
    expect(firstCorrectSound.playWrong).not.toHaveBeenCalled();
    expect(firstCorrectSound.playSection).not.toHaveBeenCalled();
    expect(firstCorrectSound.playComplete).not.toHaveBeenCalled();
  });

  it('plays the complete cue, not another scale note, for a level-ending word', () => {
    const finishSound = {
      resume: vi.fn(),
      primeCorrectAudio: vi.fn(),
      playWrong: vi.fn(),
      playCorrect: vi.fn(),
      playSection: vi.fn(),
      playComplete: vi.fn(),
      playClick: vi.fn(),
      playHeartDrain: vi.fn(),
    } as unknown as SoundEngine;
    render(
      <RecallPhase
        level={level}
        sound={finishSound}
        announce={noop}
        onComplete={noop}
        onFail={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Word: Jesus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Word: wept.' }));

    // Only the non-final word sounded a scale note; the ending word defers to
    // the level-complete cue.
    expect(finishSound.playCorrect).toHaveBeenCalledTimes(1);
    expect(finishSound.playComplete).toHaveBeenCalledTimes(1);
    expect(finishSound.playSection).not.toHaveBeenCalled();
  });

  it('shows only the continue action on the level-complete screen', () => {
    render(
      <LevelComplete
        level={level}
        stars={3}
        mistakes={0}
        soundEnabled={false}
        narrator={narrator}
        onContinue={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /continue to level/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hear|stop|quit/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /level 0 complete/i })).toHaveClass(
      'stage--complete',
    );
  });

  it('reveals the failed verse before continuing', () => {
    render(
      <FailureReveal
        level={level}
        onContinue={noop}
      />,
    );

    expect(screen.getByRole('heading', { name: /here is the verse/i })).toBeInTheDocument();
    expect(screen.getByText(level.fullText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();
    expect(screen.queryByText('中文经文')).not.toBeInTheDocument();
  });
});
