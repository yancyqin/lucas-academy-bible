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
} as unknown as SoundEngine;
const noop = vi.fn();

describe('phase controls', () => {
  it('collapses Chinese on study and has no quit control', () => {
    const { container } = render(
      <StudyPhase
        built={level}
        soundEnabled={false}
        showChinese
        narrator={narrator}
        sound={sound}
        onReady={noop}
        announce={noop}
      />,
    );

    const summary = screen.getByText('中文经文');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: /start recall/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quit/i })).not.toBeInTheDocument();
    const animatedWords = container.querySelectorAll('.study__word');
    expect(animatedWords).toHaveLength(2);
    expect(animatedWords[0]).toHaveStyle({ animationDuration: '350ms' });
    expect(animatedWords[1]).toHaveStyle({
      animationDelay: '350ms',
      animationDuration: '350ms',
    });
  });

  it('has neither undo nor quit controls during recall', () => {
    render(
      <RecallPhase
        level={level}
        showChinese
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

  it('restarts damage sound and heart visuals for every wrong tap, including failure', () => {
    const damageSound = {
      resume: vi.fn(),
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
        showChinese={false}
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

  it('shows only the continue action on the level-complete screen', () => {
    render(
      <LevelComplete
        level={level}
        stars={3}
        mistakes={0}
        soundEnabled={false}
        showChinese
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
        showChinese
        onContinue={noop}
      />,
    );

    expect(screen.getByRole('heading', { name: /here is the verse/i })).toBeInTheDocument();
    expect(screen.getByText(level.fullText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();
    expect(screen.getByText('中文经文').closest('details')).not.toHaveAttribute('open');
  });
});
