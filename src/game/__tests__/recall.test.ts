import { describe, expect, it } from 'vitest';
import { LEVELS, getLevelConfig } from '../levels';
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
  while (s.status === 'playing' && guard < 1000) {
    guard++;
    const section = s.level.sections[s.sectionIndex];
    const expected = section.correct[s.placed.length];
    const tile = s.bank.find((t) => t.text === expected);
    if (!tile) throw new Error(`no tile for expected chunk "${expected}"`);
    s = recallReducer(s, { type: 'select', tileId: tile.id });
  }
  return s;
}

describe('recall state machine', () => {
  // Requirement 11
  it('a wrong selection removes exactly one heart', () => {
    const level = buildLevel(LEVELS[0], { seed: 1 }); // 3 hearts
    const s0 = initRecall(level);
    expect(s0.hearts).toBe(3);
    const wrong = s0.bank.find((t) => t.text !== expectedChunk(s0));
    expect(wrong).toBeDefined();
    const s1 = recallReducer(s0, { type: 'select', tileId: wrong!.id });
    expect(s1.hearts).toBe(2);
    expect(s1.mistakes).toBe(1);
    expect(s1.status).toBe('playing');
    expect(s1.lastEvent).toMatchObject({ kind: 'wrong', heartsLeft: 2 });
  });

  it('running out of hearts moves to failed and keeps prior progress intact', () => {
    const level = buildLevel(getLevelConfig(11)!, { seed: 1 }); // 1 heart
    const s0 = initRecall(level);
    const wrong = s0.bank.find((t) => t.text !== expectedChunk(s0))!;
    const s1 = recallReducer(s0, { type: 'select', tileId: wrong.id });
    expect(s1.hearts).toBe(0);
    expect(s1.status).toBe('failed');
    expect(s1.lastEvent).toMatchObject({ kind: 'failed' });
  });

  it('a correct selection moves the tile out of the bank into placed', () => {
    const level = buildLevel(LEVELS[0], { seed: 1 });
    const s0 = initRecall(level);
    const correct = s0.bank.find((t) => t.text === expectedChunk(s0))!;
    const s1 = recallReducer(s0, { type: 'select', tileId: correct.id });
    expect(s1.placed.map((t) => t.text)).toEqual(['Jesus']);
    expect(s1.bank.find((t) => t.id === correct.id)).toBeUndefined();
    expect(s1.lastEvent).toMatchObject({ kind: 'correct', streak: 1 });
  });

  it('undo returns the most recent correct tile to the bank', () => {
    const level = buildLevel(LEVELS[0], { seed: 1 });
    let s = initRecall(level);
    const first = s.bank.find((t) => t.text === expectedChunk(s))!;
    s = recallReducer(s, { type: 'select', tileId: first.id });
    expect(s.placed).toHaveLength(1);
    s = recallReducer(s, { type: 'undo' });
    expect(s.placed).toHaveLength(0);
    expect(s.bank.some((t) => t.id === first.id)).toBe(true);
    expect(s.lastEvent).toMatchObject({ kind: 'undo' });
  });

  it('completing the passage marks the level complete', () => {
    const final = playPerfectly(buildLevel(LEVELS[0], { seed: 1 }));
    expect(final.status).toBe('complete');
    expect(final.hearts).toBe(3); // flawless
    expect(final.mistakes).toBe(0);
    expect(final.lastEvent).toMatchObject({ kind: 'level-complete' });
  });

  // Requirement 12
  it('long multi-section passages advance through every section', () => {
    for (const cfg of LEVELS.filter((l) => l.sectioned)) {
      const level = buildLevel(cfg, { seed: 4 });
      const sectionCount = level.sections.length;
      expect(sectionCount).toBeGreaterThan(1);

      // Walk the first section, then confirm we advance to section index 1.
      let s = initRecall(level);
      const seenSections = new Set<number>();
      let guard = 0;
      while (s.status === 'playing' && guard < 2000) {
        guard++;
        seenSections.add(s.sectionIndex);
        const section = s.level.sections[s.sectionIndex];
        const expected = section.correct[s.placed.length];
        const tile = s.bank.find((t) => t.text === expected)!;
        s = recallReducer(s, { type: 'select', tileId: tile.id });
      }
      expect(s.status).toBe('complete');
      expect(s.completedSections).toHaveLength(sectionCount);
      // Every section index was visited.
      expect(seenSections.size).toBe(sectionCount);
      // Each completed section text equals its verse text.
      s.completedSections.forEach((text, i) => {
        expect(text).toBe(level.sections[i].correct.join(' '));
      });
    }
  });

  it('the whole Ephesians 4 level (12 verses) can be completed section by section', () => {
    const level = buildLevel(LEVELS[19], { seed: 1 });
    const final = playPerfectly(level);
    expect(final.status).toBe('complete');
    expect(final.completedSections.join(' ')).toBe(level.fullText);
  });

  it('restart resets placed tiles, hearts, and mistakes', () => {
    const level = buildLevel(getLevelConfig(11)!, { seed: 1 });
    let s = initRecall(level);
    const wrong = s.bank.find((t) => t.text !== expectedChunk(s))!;
    s = recallReducer(s, { type: 'select', tileId: wrong.id }); // fails (1 heart)
    s = recallReducer(s, { type: 'restart' });
    expect(s.hearts).toBe(level.hearts);
    expect(s.mistakes).toBe(0);
    expect(s.placed).toHaveLength(0);
    expect(s.status).toBe('playing');
    expect(s.sectionIndex).toBe(0);
  });
});
