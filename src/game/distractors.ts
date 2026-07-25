import { allPassages } from '../data/scripture';
import { isContentWord, tokenize } from './chunk';
import { shuffle, type Rng } from './random';

/**
 * Distractor tiles are believable-but-wrong fragments drawn ONLY from other
 * passages in data/verses.json — never invented. We take real contiguous word
 * windows from other passages so every distractor is genuine WEB text.
 *
 * We prefer distractors that:
 *   - match the word-length of the correct chunks in the current section, and
 *   - are not identical to any correct chunk needed in this section (so the
 *     correct instance is never ambiguous).
 */

const letters = (s: string): number => s.replace(/[^\p{L}\p{N}]/gu, '').length;

/** All contiguous `size`-word windows from every passage except `excludeId`. */
function buildWindows(excludeId: string, size: number): string[] {
  const out: string[] = [];
  for (const p of allPassages) {
    if (p.id === excludeId) continue;
    const toks = tokenize(p.text);
    for (let i = 0; i + size <= toks.length; i++) {
      out.push(toks.slice(i, i + size).join(' '));
    }
  }
  return out;
}

export interface DistractorRequest {
  /** The current passage id — its text is fully excluded from the pool. */
  excludeId: string;
  /** Ordered correct chunk texts for the current section. */
  correctChunks: string[];
  /** How many distractors to produce. */
  count: number;
  rng: Rng;
}

/**
 * Choose `count` distractor strings for a section. Deterministic given `rng`.
 * Returns fewer than `count` only if the pool genuinely can't supply more
 * (never happens with real data at our sizes).
 */
export function pickDistractors(req: DistractorRequest): string[] {
  const { excludeId, correctChunks, count, rng } = req;
  if (count <= 0) return [];

  const correctSet = new Set(correctChunks);
  const sizes = Array.from(
    new Set(correctChunks.map((c) => tokenize(c).length)),
  ).sort((a, b) => a - b);

  // Shuffled, filtered candidate list per target size.
  const lists: string[][] = sizes.map((size) => {
    let windows = buildWindows(excludeId, size)
      .filter((w) => !correctSet.has(w))
      // Every decoy must carry a content word — no confusing lone 虚词 decoys.
      .filter((w) => w.split(' ').some(isContentWord));
    // For single-word distractors, prefer meatier words.
    if (size === 1) {
      const meaty = windows.filter((w) => letters(w) >= 3);
      if (meaty.length >= count * 2) windows = meaty;
    }
    return shuffle(Array.from(new Set(windows)), rng);
  });

  const chosen: string[] = [];
  const chosenSet = new Set<string>();

  // Round-robin across sizes so distractor lengths resemble the correct tiles.
  let progressed = true;
  while (chosen.length < count && progressed) {
    progressed = false;
    for (let k = 0; k < lists.length && chosen.length < count; k++) {
      const list = lists[k];
      while (list.length && chosenSet.has(list[list.length - 1])) list.pop();
      if (list.length) {
        const cand = list.pop() as string;
        chosen.push(cand);
        chosenSet.add(cand);
        progressed = true;
      }
    }
  }

  return chosen;
}
