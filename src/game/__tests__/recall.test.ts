import { describe, expect, it } from 'vitest';
import { LEVELS, getLevelFile } from '../levels';
import { buildLevel, type BuiltLevel } from '../build';
import {
  expectedChunk,
  initRecall,
  recallReducer,
  type RecallState,
} from '../recall';

function playPerfectly(level: BuiltLevel): RecallState {
  let s = initRecall(level);
  let guard = 0;
  while (s.status === 'playing' && guard < 4000) {
    guard++;
    const section = s.level.sections[s.sectionIndex];
    const expected = section.correct[s.placed.length];
    const tile = s.bank.find((t) => t.text === expected);
    if (!tile) throw new Error(`no tile for expected chunk "${expected}"`);
    s = recallReducer(s, { type: 'select', tileId: tile.id });
  }
  return s;
}

describe('recall state machine (bank model)', () => {
  // Requirement 1 — half heart for a right-word/wrong-order tap
  it('a right word tapped out of order costs half a heart', () => {
    const level = buildLevel(getLevelFile(0)!, { seed: 1, questionIndex: 0 }); // "Jesus wept.", 0 distractors
    const s0 = initRecall(level);
    expect(s0.hearts).toBe(3);
    // "wept." is a correct tile, but it isn't the expected first word ("Jesus").
    const outOfOrder = s0.bank.find((t) => !t.isDistractor && t.text !== expectedChunk(s0))!;
    const s1 = recallReducer(s0, { type: 'select', tileId: outOfOrder.id });
    expect(s1.hearts).toBe(2.5);
    expect(s1.lastEvent).toMatchObject({ kind: 'wrong', penalty: 0.5, belongsToVerse: true });
  });

  // Requirement 1 — a word not in the verse (a distractor) costs a full heart
  it('a distractor word costs a full heart', () => {
    const level = buildLevel(getLevelFile(11)!, { seed: 1, questionIndex: 0 }); // has distractors
    const s0 = initRecall(level);
    const distractor = s0.bank.find((t) => t.isDistractor)!;
    const s1 = recallReducer(s0, { type: 'select', tileId: distractor.id });
    expect(s1.hearts).toBe(2);
    expect(s1.lastEvent).toMatchObject({ kind: 'wrong', penalty: 1, belongsToVerse: false });
  });

  it('time-out drain removes a quarter heart and is not a mistake', () => {
    const level = buildLevel(getLevelFile(0)!, { seed: 1, questionIndex: 0 }); // 3 hearts
    let s = initRecall(level);
    s = recallReducer(s, { type: 'drain', amount: 0.25 });
    expect(s.hearts).toBe(2.75);
    expect(s.mistakes).toBe(0);
    expect(s.lastEvent).toMatchObject({ kind: 'drain', heartsLeft: 2.75 });
  });

  it('draining all hearts (12 quarter-ticks) fails the level', () => {
    const level = buildLevel(getLevelFile(0)!, { seed: 1, questionIndex: 0 });
    let s = initRecall(level);
    for (let i = 0; i < 12 && s.status === 'playing'; i++) {
      s = recallReducer(s, { type: 'drain', amount: 0.25 });
    }
    expect(s.hearts).toBe(0);
    expect(s.status).toBe('failed');
    expect(s.lastEvent).toMatchObject({ kind: 'failed', cause: 'drain' });
  });

  it('running out of hearts (3 distractor taps) moves to failed', () => {
    const level = buildLevel(getLevelFile(11)!, { seed: 1, questionIndex: 0 });
    let s = initRecall(level);
    const distractor = s.bank.find((t) => t.isDistractor)!;
    s = recallReducer(s, { type: 'select', tileId: distractor.id }); // 3 -> 2
    s = recallReducer(s, { type: 'select', tileId: distractor.id }); // 2 -> 1
    expect(s.status).toBe('playing');
    s = recallReducer(s, { type: 'select', tileId: distractor.id }); // 1 -> 0
    expect(s.hearts).toBe(0);
    expect(s.status).toBe('failed');
    expect(s.lastEvent).toMatchObject({
      kind: 'failed',
      cause: 'wrong',
      tileId: distractor.id,
    });
  });

  it('a correct selection moves the tile from bank to placed', () => {
    const level = buildLevel(getLevelFile(0)!, { seed: 1, questionIndex: 0 });
    const s0 = initRecall(level);
    const first = s0.bank.find((t) => t.text === expectedChunk(s0))!;
    const s1 = recallReducer(s0, { type: 'select', tileId: first.id });
    expect(s1.placed.map((t) => t.text)).toEqual(['Jesus']);
    expect(s1.bank.find((t) => t.id === first.id)).toBeUndefined();
  });

  it('undo returns the most recent correct tile to the bank', () => {
    const level = buildLevel(getLevelFile(0)!, { seed: 1, questionIndex: 0 });
    let s = initRecall(level);
    const first = s.bank.find((t) => t.text === expectedChunk(s))!;
    s = recallReducer(s, { type: 'select', tileId: first.id });
    expect(s.placed).toHaveLength(1);
    s = recallReducer(s, { type: 'undo' });
    expect(s.placed).toHaveLength(0);
    expect(s.bank.some((t) => t.id === first.id)).toBe(true);
  });

  it('completing the passage marks the level complete (flawless)', () => {
    const final = playPerfectly(buildLevel(getLevelFile(0)!, { seed: 1, questionIndex: 0 }));
    expect(final.status).toBe('complete');
    expect(final.hearts).toBe(3);
    expect(final.mistakes).toBe(0);
  });

  // Requirement 12 — long multi-section passages advance through every section
  it('the longest level completes section by section', () => {
    const top = LEVELS[LEVELS.length - 1]; // longest passages, verse-sectioned
    const level = buildLevel(top, { seed: 1, questionIndex: 0 });
    expect(level.sections.length).toBeGreaterThan(1);
    let s = initRecall(level);
    const seen = new Set<number>();
    let guard = 0;
    while (s.status === 'playing' && guard < 5000) {
      guard++;
      seen.add(s.sectionIndex);
      const section = s.level.sections[s.sectionIndex];
      const tile = s.bank.find((t) => t.text === section.correct[s.placed.length])!;
      s = recallReducer(s, { type: 'select', tileId: tile.id });
    }
    expect(s.status).toBe('complete');
    expect(seen.size).toBe(level.sections.length);
    expect(s.completedSections).toHaveLength(level.sections.length);
    expect(s.completedSections.join(' ')).toBe(level.fullText);
  });

  it('every level, every question, can be completed by picking correct tiles', () => {
    for (const l of LEVELS) {
      for (let qi = 0; qi < l.questions.length; qi++) {
        const built = buildLevel(l, { seed: 4, questionIndex: qi });
        const final = playPerfectly(built);
        expect(final.status, `L${l.level} q${qi}`).toBe('complete');
      }
    }
  });

  it('restart resets placed tiles, hearts, and mistakes', () => {
    const level = buildLevel(getLevelFile(11)!, { seed: 1, questionIndex: 0 });
    let s = initRecall(level);
    const wrong = s.bank.find((t) => t.text !== expectedChunk(s))!;
    s = recallReducer(s, { type: 'select', tileId: wrong.id });
    s = recallReducer(s, { type: 'restart' });
    expect(s.hearts).toBe(level.hearts);
    expect(s.mistakes).toBe(0);
    expect(s.placed).toHaveLength(0);
    expect(s.status).toBe('playing');
  });
});
