import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from '../random';

describe('shuffle', () => {
  // Requirement 7
  it('does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const snapshot = input.slice();
    const out = shuffle(input, mulberry32(123));
    expect(input).toEqual(snapshot); // untouched
    expect(out).not.toBe(input); // new array
    expect(out.slice().sort((a, b) => a - b)).toEqual(snapshot); // same multiset
  });

  it('is deterministic for a given seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    const a = shuffle(input, mulberry32(99));
    const b = shuffle(input, mulberry32(99));
    expect(a).toEqual(b);
  });

  it('produces different orders for different seeds', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffle(input, mulberry32(1));
    const b = shuffle(input, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('actually reorders a large array (not the identity)', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(input, mulberry32(7));
    expect(out).not.toEqual(input);
  });
});
