/**
 * Dictation (默写): the player writes a passage from memory, then sees which
 * characters or words came out wrong and an overall accuracy.
 *
 * Chinese is graded character by character (字), English word by word.
 * Punctuation, spacing and letter case never count — only what is written.
 * The writing is lined up against the scripture with a minimum-edit
 * alignment, so one skipped word marks just that word, not everything after.
 */
import { isCjkText } from './chunk';

/** One gradable character (Chinese) or word (English) of the scripture. */
export interface DictationUnit {
  text: string;
  /** Position in the source text, so the verse can be redrawn around it. */
  start: number;
  end: number;
}

export type DictationMark =
  | { kind: 'correct'; target: number }
  | { kind: 'wrong'; target: number; typed: string }
  | { kind: 'missing'; target: number }
  /** Written but not in the verse; sits just before target unit `before`. */
  | { kind: 'extra'; typed: string; before: number };

export interface DictationResult {
  cjk: boolean;
  units: DictationUnit[];
  /** The alignment in reading order. */
  marks: DictationMark[];
  correct: number;
  wrong: number;
  missing: number;
  extra: number;
  /** Gradable units in the scripture. */
  total: number;
  /** Right units over everything graded, extras included: 0..1. */
  accuracy: number;
}

export type DictationSegment =
  | { kind: 'text'; text: string }
  | { kind: 'unit'; text: string; mark: 'correct' | 'missing' }
  | { kind: 'unit'; text: string; mark: 'wrong'; typed: string }
  | { kind: 'extra'; typed: string };

const CJK_UNIT = /[\p{L}\p{N}]/gu;
const WORD_UNIT = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

function unitsOf(text: string, cjk: boolean): DictationUnit[] {
  const pattern = new RegExp(cjk ? CJK_UNIT : WORD_UNIT);
  return Array.from(text.matchAll(pattern), (m) => ({
    text: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

/** Full-width letters, case and apostrophes never make an answer wrong. */
function keyOf(unit: string): string {
  return unit.normalize('NFKC').toLowerCase().replace(/['’]/g, '');
}

export function gradeDictation(scripture: string, written: string): DictationResult {
  const cjk = isCjkText(scripture);
  const units = unitsOf(scripture, cjk);
  const typed = unitsOf(written, cjk).map((u) => u.text);
  const a = units.map((u) => keyOf(u.text));
  const b = typed.map(keyOf);
  const n = a.length;
  const m = b.length;
  const w = m + 1;

  // cost[i][j] = fewest edits turning scripture units i.. into written
  // units j.. (suffixes, so the walk below can run in reading order).
  const cost = new Uint32Array((n + 1) * w);
  for (let i = 0; i <= n; i++) cost[i * w + m] = n - i;
  for (let j = 0; j <= m; j++) cost[n * w + j] = m - j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const pair = cost[(i + 1) * w + j + 1] + (a[i] === b[j] ? 0 : 1);
      const skip = cost[(i + 1) * w + j] + 1;
      const add = cost[i * w + j + 1] + 1;
      cost[i * w + j] = Math.min(pair, skip, add);
    }
  }

  // Walk from the start; on a tie prefer pairing the two up as early as
  // possible, so 耶稣哭了 written 耶苏了 marks 稣 wrong and 哭 missed, and a
  // misspelled word reads as one wrong word rather than missed + extra.
  const marks: DictationMark[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const here = cost[i * w + j];
    if (i < n && j < m) {
      const same = a[i] === b[j];
      if (here === cost[(i + 1) * w + j + 1] + (same ? 0 : 1)) {
        marks.push(same ? { kind: 'correct', target: i } : { kind: 'wrong', target: i, typed: typed[j] });
        i++;
        j++;
        continue;
      }
    }
    if (i < n && here === cost[(i + 1) * w + j] + 1) {
      marks.push({ kind: 'missing', target: i });
      i++;
    } else {
      marks.push({ kind: 'extra', typed: typed[j], before: i });
      j++;
    }
  }

  const count = (kind: DictationMark['kind']) => marks.filter((mark) => mark.kind === kind).length;
  const correct = count('correct');
  const extra = count('extra');
  const graded = n + extra;
  return {
    cjk,
    units,
    marks,
    correct,
    wrong: count('wrong'),
    missing: count('missing'),
    extra,
    total: n,
    accuracy: graded === 0 ? 0 : correct / graded,
  };
}

/** Redraw the scripture with every unit marked and extras slotted in place. */
export function dictationSegments(scripture: string, result: DictationResult): DictationSegment[] {
  const segments: DictationSegment[] = [];
  let cursor = 0;
  for (const mark of result.marks) {
    if (mark.kind === 'extra') {
      // An extra written after the last unit trails the closing punctuation.
      const at = mark.before < result.units.length ? result.units[mark.before].start : scripture.length;
      if (at > cursor) {
        segments.push({ kind: 'text', text: scripture.slice(cursor, at) });
        cursor = at;
      }
      segments.push({ kind: 'extra', typed: mark.typed });
      continue;
    }
    const unit = result.units[mark.target];
    if (unit.start > cursor) segments.push({ kind: 'text', text: scripture.slice(cursor, unit.start) });
    segments.push(
      mark.kind === 'wrong'
        ? { kind: 'unit', text: unit.text, mark: 'wrong', typed: mark.typed }
        : { kind: 'unit', text: unit.text, mark: mark.kind },
    );
    cursor = unit.end;
  }
  if (cursor < scripture.length) segments.push({ kind: 'text', text: scripture.slice(cursor) });
  return segments;
}
