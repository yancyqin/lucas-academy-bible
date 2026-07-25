import { describe, expect, it } from 'vitest';
import { computeStars } from '../scoring';

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
