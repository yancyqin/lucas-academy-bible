/**
 * Star rating for a completed level, from the winning attempt's mistake count
 * and how many times the player ran out of hearts (retries) on the way.
 *
 *   3 stars — first try, flawless (no retries, no mistakes)
 *   2 stars — no retries and at most 2 mistakes
 *   1 star  — everything else (needed a retry, or several mistakes)
 */
export function computeStars(mistakes: number, retries: number): 1 | 2 | 3 {
  if (retries === 0 && mistakes === 0) return 3;
  if (retries === 0 && mistakes <= 2) return 2;
  return 1;
}

export function starLabel(stars: number): string {
  return `${stars} of 3 stars`;
}

/**
 * Final run score: the percentage of hearts kept across every level the player
 * attempted (each level starts with `heartsPerLevel`). A flawless full run is
 * 100%; a level the player failed contributes 0 kept hearts out of its max.
 */
export function heartPercent(
  heartsKept: number,
  levelsAttempted: number,
  heartsPerLevel = 3,
): number {
  if (levelsAttempted <= 0) return 0;
  const pct = (heartsKept / (heartsPerLevel * levelsAttempted)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
