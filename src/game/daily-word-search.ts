import {
  buildDailyScrabble,
  type ScrabbleTarget,
} from './daily-scrabble';
import { isCjkText } from './chunk';

const MIN_GRID_SIZE = 7;
const MAX_GRID_SIZE = 10;
const FILLER_ALPHABET = 'EEEEEEEEEEEEAAAAAAAAAIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUDGBCMPFHVWYKJXQZ';

export interface GridPoint {
  row: number;
  col: number;
}

export interface WordSearchTarget extends ScrabbleTarget {
  path: GridPoint[];
}

export interface DailyWordSearchPuzzle {
  tokens: string[];
  size: number;
  grid: string[][];
  targets: WordSearchTarget[];
}

interface Direction {
  row: number;
  col: number;
}

interface PathOption {
  path: GridPoint[];
  directionIndex: number;
}

const DIRECTIONS: Direction[] = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number): () => number {
  let state = seed || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function candidatePaths(
  size: number,
  length: number,
  random: () => number,
  preferredDirection: number,
): PathOption[] {
  const options: PathOption[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      DIRECTIONS.forEach((direction, directionIndex) => {
        const endRow = row + direction.row * (length - 1);
        const endCol = col + direction.col * (length - 1);
        if (
          endRow < 0 ||
          endRow >= size ||
          endCol < 0 ||
          endCol >= size
        ) {
          return;
        }
        options.push({
          directionIndex,
          path: Array.from({ length }, (_, index) => ({
            row: row + direction.row * index,
            col: col + direction.col * index,
          })),
        });
      });
    }
  }
  const preferred = options.filter(
    (option) => option.directionIndex === preferredDirection,
  );
  const alternatives = options.filter(
    (option) => option.directionIndex !== preferredDirection,
  );
  return [
    ...shuffle(preferred, random),
    ...shuffle(alternatives, random),
  ];
}

function directionFamily(directionIndex: number): number {
  return Math.min(directionIndex, 2);
}

function placeTargets(
  targets: ScrabbleTarget[],
  size: number,
  random: () => number,
  directionOffset: number,
): { grid: Array<Array<string | null>>; paths: Map<string, GridPoint[]> } | null {
  const grid = Array.from(
    { length: size },
    () => Array<string | null>(size).fill(null),
  );
  const paths = new Map<string, GridPoint[]>();
  const placementOrder = [...targets].sort(
    (first, second) => second.answer.length - first.answer.length,
  );
  const familyCounts = [0, 0, 0];
  const requiredFamilies = Math.min(3, placementOrder.length);

  const place = (targetIndex: number): boolean => {
    if (targetIndex >= placementOrder.length) {
      return familyCounts.filter((count) => count > 0).length >= requiredFamilies;
    }
    const target = placementOrder[targetIndex];
    const preferredDirection =
      (targetIndex + directionOffset) % DIRECTIONS.length;
    const options = candidatePaths(
      size,
      target.answer.length,
      random,
      preferredDirection,
    );

    for (const { path, directionIndex } of options) {
      const fits = path.every(({ row, col }, letterIndex) => {
        const current = grid[row][col];
        return current === null || current === target.answer[letterIndex];
      });
      if (!fits) continue;

      const changed: GridPoint[] = [];
      path.forEach(({ row, col }, letterIndex) => {
        if (grid[row][col] === null) {
          grid[row][col] = target.answer[letterIndex];
          changed.push({ row, col });
        }
      });
      paths.set(target.id, path);
      const family = directionFamily(directionIndex);
      familyCounts[family] += 1;

      if (place(targetIndex + 1)) return true;

      familyCounts[family] -= 1;
      paths.delete(target.id);
      changed.forEach(({ row, col }) => {
        grid[row][col] = null;
      });
    }

    return false;
  };

  return place(0) ? { grid, paths } : null;
}

export function lineBetween(start: GridPoint, end: GridPoint): GridPoint[] {
  const rowDelta = end.row - start.row;
  const colDelta = end.col - start.col;
  const rowDistance = Math.abs(rowDelta);
  const colDistance = Math.abs(colDelta);
  if (
    rowDelta !== 0 &&
    colDelta !== 0 &&
    rowDistance !== colDistance
  ) {
    return [];
  }

  const steps = Math.max(rowDistance, colDistance);
  const rowStep = Math.sign(rowDelta);
  const colStep = Math.sign(colDelta);
  return Array.from({ length: steps + 1 }, (_, index) => ({
    row: start.row + rowStep * index,
    col: start.col + colStep * index,
  }));
}

export function pathKey(path: GridPoint[]): string {
  return path.map(({ row, col }) => `${row}:${col}`).join('|');
}

/** Build the same five meaningful Daily Verse words into an N×N letter grid. */
export function buildDailyWordSearch(
  text: string,
  puzzleKey = text,
): DailyWordSearchPuzzle {
  const base = buildDailyScrabble(text, puzzleKey);
  const longestWord = Math.max(
    MIN_GRID_SIZE,
    ...base.targets.map((target) => target.answer.length),
  );
  const seed = hashString(`word-search:${puzzleKey}:${text}`);
  let placement:
    | { grid: Array<Array<string | null>>; paths: Map<string, GridPoint[]> }
    | null = null;
  let size = Math.min(MAX_GRID_SIZE, longestWord);

  while (!placement && size <= MAX_GRID_SIZE) {
    placement = placeTargets(
      base.targets,
      size,
      randomFrom(seed ^ size),
      seed % DIRECTIONS.length,
    );
    if (!placement) size += 1;
  }

  // Five words of at most ten letters always fit on separate rows of a 10×10
  // board; retain a defensive empty board if hostile input breaks that rule.
  if (!placement) {
    size = MAX_GRID_SIZE;
    placement = {
      grid: Array.from(
        { length: size },
        () => Array<string | null>(size).fill(null),
      ),
      paths: new Map(),
    };
  }

  const fillerRandom = randomFrom(seed ^ 0xa5a5a5a5);
  // Drawing Chinese fillers from the verse itself keeps simplified and
  // traditional boards consistent without maintaining two fragile alphabets.
  const fillerCharacters = isCjkText(text)
    ? Array.from(text).filter((character) => /\p{Script=Han}/u.test(character))
    : Array.from(FILLER_ALPHABET);
  const grid = placement.grid.map((row) =>
    row.map(
      (cell) =>
        cell ??
        fillerCharacters[
          Math.floor(fillerRandom() * fillerCharacters.length)
        ],
    ),
  );
  const targets = base.targets
    .filter((target) => placement?.paths.has(target.id))
    .map((target) => ({
      ...target,
      path: placement?.paths.get(target.id) ?? [],
    }));

  return {
    tokens: base.tokens,
    size,
    grid,
    targets,
  };
}

export const DAILY_WORD_SEARCH_GRID_LIMITS = {
  minimum: MIN_GRID_SIZE,
  maximum: MAX_GRID_SIZE,
};
