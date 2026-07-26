import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Hearts } from '../Hearts';
import { HeartIcon } from '../icons';

describe('Hearts', () => {
  it('announces fractional health and uses a smooth heart silhouette', () => {
    const { container } = render(<Hearts total={3} remaining={2.25} lossSeq={1} />);

    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '2.25 of 3 hearts remaining');
    expect(
      Array.from(container.querySelectorAll('svg')).every(
        (svg) => svg.getAttribute('viewBox') === '0 0 24 24',
      ),
    ).toBe(true);
    expect(container.querySelectorAll('.heart--lost')).toHaveLength(1);
  });

  it('uses quadrant geometry for quarter, half, three-quarter, and full states', () => {
    const { container, rerender } = render(<HeartIcon fill={0.25} />);

    const clipRect = () => container.querySelector('clipPath rect');
    expect(clipRect()).toHaveAttribute('width', '12');
    expect(clipRect()).toHaveAttribute('height', '12');

    rerender(<HeartIcon fill={0.5} />);
    expect(clipRect()).toHaveAttribute('width', '12');
    expect(clipRect()).toHaveAttribute('height', '24');

    rerender(<HeartIcon fill={0.75} />);
    expect(container.querySelector('clipPath path')).toHaveAttribute(
      'd',
      'M0 0h12v12h12v12H0z',
    );

    rerender(<HeartIcon fill={1} />);
    expect(
      [clipRect()?.getAttribute('width'), clipRect()?.getAttribute('height')],
    ).toEqual(['24', '24']);
  });

  it('force-restarts heart and group animations for every loss sequence', () => {
    const originalAnimate = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'animate',
    );
    const animate = vi.fn(
      () => ({ cancel: vi.fn() }) as unknown as Animation,
    );
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    });

    try {
      const { rerender } = render(
        <Hearts total={3} remaining={2.5} lossSeq={1} />,
      );
      expect(animate).toHaveBeenCalledTimes(2);

      rerender(<Hearts total={3} remaining={2} lossSeq={2} />);
      expect(animate).toHaveBeenCalledTimes(4);
    } finally {
      if (originalAnimate) {
        Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
      } else {
        delete (HTMLElement.prototype as { animate?: unknown }).animate;
      }
    }
  });
});
