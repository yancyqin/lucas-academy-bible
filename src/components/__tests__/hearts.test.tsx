import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hearts } from '../Hearts';

describe('Hearts', () => {
  it('renders smooth quarter-step fills instead of pixel art', () => {
    const { container } = render(<Hearts total={3} remaining={2.25} />);

    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '2.25 of 3 hearts remaining');
    expect(Array.from(container.querySelectorAll('svg')).every((svg) => svg.getAttribute('viewBox') === '0 0 24 24')).toBe(true);
    expect(
      Array.from(container.querySelectorAll('clipPath rect')).map((rect) =>
        rect.getAttribute('width'),
      ),
    ).toEqual(['24', '24', '6']);
    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });
});
