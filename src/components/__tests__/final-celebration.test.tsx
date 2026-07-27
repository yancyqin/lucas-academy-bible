import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundEngine } from '../../audio/sound';
import { downloadCertificate } from '../../game/certificate';
import { FinalCelebration } from '../FinalCelebration';

vi.mock('../../game/certificate', () => ({
  downloadCertificate: vi.fn(),
}));

const sound = {
  resume: vi.fn(),
  playFinale: vi.fn(),
  playComplete: vi.fn(),
} as unknown as SoundEngine;

describe('Practice Mode certificate', () => {
  it('marks both the on-screen and downloaded certificate as Practice Mode', () => {
    const { container } = render(
      <FinalCelebration
        pass={false}
        certLevel={4}
        clearedCount={5}
        scorePercent={92}
        reference="John 3:16"
        practiceMode
        soundEnabled={false}
        sound={sound}
        onPlayAgain={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    expect(screen.getByText('Practice Mode', { selector: '.verdict' })).toBeInTheDocument();
    expect(container.querySelector('.cert__body')).toHaveTextContent(
      /in practice mode/i,
    );

    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(downloadCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ practiceMode: true }),
    );
  });
});
