/**
 * Small, deterministic PRNG + Fisher–Yates shuffle.
 *
 * The RNG is injectable/seedable so shuffles and distractor picks are
 * reproducible in tests. We use mulberry32 — tiny, fast, good enough for
 * shuffling game tiles (not for anything security-sensitive).
 */

export type Rng = () => number;

/** Create a seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle. Returns a NEW array; never mutates the input.
 * Pass an `rng` for deterministic output (defaults to Math.random).
 */
export function shuffle<T>(input: readonly T[], rng: Rng = Math.random): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Pick a single element deterministically. */
export function pick<T>(input: readonly T[], rng: Rng = Math.random): T {
  return input[Math.floor(rng() * input.length)];
}
