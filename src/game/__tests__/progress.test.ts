import { describe, expect, it } from 'vitest';
import {
  defaultProgress,
  loadProgress,
  recordCompletion,
  sanitizeProgress,
  saveProgress,
  totalStars,
} from '../progress';

/** A minimal in-memory Storage stand-in for deterministic tests. */
function fakeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('progress persistence', () => {
  it('starts locked to level 1', () => {
    const p = defaultProgress();
    expect(p.highestUnlocked).toBe(1);
    expect(p.completed).toEqual([]);
  });

  // Requirement 8
  it('unlocks the next level only after completion', () => {
    let p = defaultProgress();
    expect(p.highestUnlocked).toBe(1);
    p = recordCompletion(p, 1, 3, 1);
    expect(p.completed).toContain(1);
    expect(p.highestUnlocked).toBe(2);
    // Completing level 1 does NOT unlock level 5.
    expect(p.highestUnlocked).toBeLessThan(5);
  });

  it('keeps the best stars and fewest attempts, and never un-completes', () => {
    let p = recordCompletion(defaultProgress(), 3, 1, 4);
    p = recordCompletion(p, 3, 3, 2); // replayed better
    expect(p.stars[3]).toBe(3);
    expect(p.bestAttempts[3]).toBe(2);
    p = recordCompletion(p, 3, 1, 9); // replayed worse — keep the best
    expect(p.stars[3]).toBe(3);
    expect(p.bestAttempts[3]).toBe(2);
    expect(p.completed).toEqual([3]);
  });

  // Requirement 9
  it('completed progress survives a reload (save then load)', () => {
    const store = fakeStore();
    let p = defaultProgress();
    p = recordCompletion(p, 1, 3, 1);
    p = recordCompletion(p, 2, 2, 1);
    p.soundEnabled = false;
    saveProgress(p, store);

    const reloaded = loadProgress(store);
    expect(reloaded.completed).toEqual([1, 2]);
    expect(reloaded.highestUnlocked).toBe(3);
    expect(reloaded.stars[1]).toBe(3);
    expect(reloaded.soundEnabled).toBe(false);
    expect(totalStars(reloaded)).toBe(5);
  });

  // Requirement 10
  it('handles invalid / corrupt localStorage safely', () => {
    expect(loadProgress(fakeStore({ 'lucas-bible-sequence:v1': 'not json{' }))).toEqual(
      defaultProgress(),
    );
    expect(sanitizeProgress(null)).toEqual(defaultProgress());
    expect(sanitizeProgress(42)).toEqual(defaultProgress());
    expect(sanitizeProgress('nope')).toEqual(defaultProgress());
  });

  it('sanitizes out-of-range and wrong-typed fields', () => {
    const messy = sanitizeProgress({
      version: 999,
      highestUnlocked: 9999,
      completed: [1, 2, 'x', -3, 2, 99],
      stars: { '1': 7, '2': -1, bad: 3, '3': 'nope' },
      bestAttempts: { '1': 0, '2': 'x', '3': 4 },
      currentLevel: -5,
      soundEnabled: 'yes',
      introSeen: 1,
    });
    expect(messy.highestUnlocked).toBeLessThanOrEqual(20);
    expect(messy.highestUnlocked).toBeGreaterThanOrEqual(1);
    expect(messy.completed.every((n) => n >= 1 && n <= 20)).toBe(true);
    expect(messy.completed).toEqual([...new Set(messy.completed)]); // deduped
    expect(messy.stars[1]).toBeLessThanOrEqual(3);
    expect(messy.stars[2]).toBeGreaterThanOrEqual(0);
    expect(messy.currentLevel).toBeGreaterThanOrEqual(1);
    expect(typeof messy.soundEnabled).toBe('boolean');
    expect(typeof messy.introSeen).toBe('boolean');
  });

  it('unlock covers all completed levels even if stored highestUnlocked is stale', () => {
    const p = sanitizeProgress({ highestUnlocked: 1, completed: [1, 2, 3] });
    expect(p.highestUnlocked).toBeGreaterThanOrEqual(4);
  });

  it('never lets a missing Storage crash load/save', () => {
    expect(() => saveProgress(defaultProgress())).not.toThrow();
    // loadProgress with no store falls back to real/absent localStorage.
    expect(loadProgress()).toBeTruthy();
  });
});
