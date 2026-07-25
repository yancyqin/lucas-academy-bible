import { TOTAL_LEVELS } from './levels';

/**
 * Local progress persistence. Frontend-only: everything lives in localStorage.
 * Corrupt or hostile data must never crash the app — `loadProgress` always
 * returns a valid object, resetting to defaults when parsing/validation fails.
 */

const STORAGE_KEY = 'lucas-bible-sequence:v1';
const CURRENT_VERSION = 1;

export interface Progress {
  version: number;
  /** Highest level the player may enter (1..TOTAL_LEVELS). */
  highestUnlocked: number;
  /** Levels the player has cleared at least once. */
  completed: number[];
  /** Best (highest) stars earned per level. */
  stars: Record<number, number>;
  /** Best (fewest) total attempts to clear a level (1 = first try). */
  bestAttempts: Record<number, number>;
  /** Level the player was last on (for a "Continue" button). */
  currentLevel: number;
  soundEnabled: boolean;
  introSeen: boolean;
}

export function defaultProgress(): Progress {
  return {
    version: CURRENT_VERSION,
    highestUnlocked: 1,
    completed: [],
    stars: {},
    bestAttempts: {},
    currentLevel: 1,
    soundEnabled: true,
    introSeen: false,
  };
}

function clampLevel(n: unknown, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(TOTAL_LEVELS, Math.max(1, Math.floor(n)));
}

/**
 * Validate an arbitrary parsed value into a safe Progress object. Anything
 * malformed is dropped and replaced with a sensible default — the function
 * never throws.
 */
export function sanitizeProgress(raw: unknown): Progress {
  const base = defaultProgress();
  if (typeof raw !== 'object' || raw === null) return base;
  const obj = raw as Record<string, unknown>;

  const completed = Array.isArray(obj.completed)
    ? Array.from(
        new Set(
          obj.completed
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
            .map((v) => clampLevel(v, 1)),
        ),
      ).sort((a, b) => a - b)
    : [];

  const stars: Record<number, number> = {};
  if (typeof obj.stars === 'object' && obj.stars !== null) {
    for (const [k, v] of Object.entries(obj.stars as Record<string, unknown>)) {
      const lvl = clampLevel(Number(k), NaN as unknown as number);
      if (Number.isFinite(lvl) && typeof v === 'number' && Number.isFinite(v)) {
        stars[lvl] = Math.min(3, Math.max(0, Math.floor(v)));
      }
    }
  }

  const bestAttempts: Record<number, number> = {};
  if (typeof obj.bestAttempts === 'object' && obj.bestAttempts !== null) {
    for (const [k, v] of Object.entries(obj.bestAttempts as Record<string, unknown>)) {
      const lvl = clampLevel(Number(k), NaN as unknown as number);
      if (Number.isFinite(lvl) && typeof v === 'number' && Number.isFinite(v) && v >= 1) {
        bestAttempts[lvl] = Math.floor(v);
      }
    }
  }

  // highestUnlocked must be at least 1 and cover every completed level (+ next).
  let highestUnlocked = clampLevel(obj.highestUnlocked, 1);
  for (const c of completed) {
    highestUnlocked = Math.max(highestUnlocked, Math.min(TOTAL_LEVELS, c + 1));
  }

  return {
    version: CURRENT_VERSION,
    highestUnlocked,
    completed,
    stars,
    bestAttempts,
    currentLevel: clampLevel(obj.currentLevel, 1),
    soundEnabled: typeof obj.soundEnabled === 'boolean' ? obj.soundEnabled : true,
    introSeen: typeof obj.introSeen === 'boolean' ? obj.introSeen : false,
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function getStore(store?: StorageLike): StorageLike | null {
  if (store) return store;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* access can throw in sandboxed contexts */
  }
  return null;
}

export function loadProgress(store?: StorageLike): Progress {
  const s = getStore(store);
  if (!s) return defaultProgress();
  try {
    const rawStr = s.getItem(STORAGE_KEY);
    if (!rawStr) return defaultProgress();
    return sanitizeProgress(JSON.parse(rawStr));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: Progress, store?: StorageLike): void {
  const s = getStore(store);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* quota / privacy mode — fail silently, the game still works in-session */
  }
}

/**
 * Record a level completion and return the updated progress. Unlocks the next
 * level, keeps the best stars/attempts, and never revokes prior completions.
 */
export function recordCompletion(
  progress: Progress,
  level: number,
  stars: number,
  attempts: number,
): Progress {
  const completed = Array.from(new Set([...progress.completed, level])).sort(
    (a, b) => a - b,
  );
  const nextUnlock = Math.min(TOTAL_LEVELS, level + 1);
  const prevStars = progress.stars[level] ?? 0;
  const prevBest = progress.bestAttempts[level] ?? Infinity;

  return {
    ...progress,
    completed,
    highestUnlocked: Math.max(progress.highestUnlocked, nextUnlock),
    stars: { ...progress.stars, [level]: Math.max(prevStars, stars) },
    bestAttempts: { ...progress.bestAttempts, [level]: Math.min(prevBest, attempts) },
    currentLevel: nextUnlock,
  };
}

export function totalStars(progress: Progress): number {
  return Object.values(progress.stars).reduce((a, b) => a + b, 0);
}

export const STORAGE_KEY_FOR_TESTS = STORAGE_KEY;
