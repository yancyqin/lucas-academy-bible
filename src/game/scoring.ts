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
