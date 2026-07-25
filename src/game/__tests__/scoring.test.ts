import { describe, expect, it } from 'vitest';
import { computeStars, heartPercent } from '../scoring';

describe('computeStars', () => {
  it('awards 3 stars for a flawless first try', () => {
    expect(computeStars(0, 0)).toBe(3);
  });

  it('awards 2 stars for a few mistakes with no retries', () => {
    expect(computeStars(1, 0)).toBe(2);
    expect(computeStars(2, 0)).toBe(2);
  });

  it('awards 1 star after a retry or many mistakes', () => {
    expect(computeStars(3, 0)).toBe(1);
    expect(computeStars(0, 1)).toBe(1);
    expect(computeStars(5, 2)).toBe(1);
  });
});

describe('heartPercent (final run score)', () => {
  it('is 100% for a flawless run', () => {
    // 5 levels, kept all 3 hearts each
    expect(heartPercent(15, 5)).toBe(100);
  });

  it('reflects hearts lost across the run', () => {
    // 4 levels attempted, kept 9 of 12 hearts
    expect(heartPercent(9, 4)).toBe(75);
    // half hearts count
    expect(heartPercent(2.5, 1)).toBe(83);
  });

  it('a failed level (0 kept) drags the score down', () => {
    // cleared 2 levels flawlessly (6), failed the 3rd (0) → 6 of 9
    expect(heartPercent(6, 3)).toBe(67);
  });

  it('is 0 when nothing was attempted, and clamps to 0..100', () => {
    expect(heartPercent(0, 0)).toBe(0);
    expect(heartPercent(0, 3)).toBe(0);
    expect(heartPercent(99, 1)).toBe(100);
  });
});
