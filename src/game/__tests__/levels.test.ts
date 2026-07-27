import { describe, expect, it } from 'vitest';
import { LEVELS, TOTAL_LEVELS, getLevelFile, memorizeSeconds } from '../levels';
import { buildLevel } from '../build';
import { chunksReproduce, isContentWord, tokenize } from '../chunk';
import { getPassage, allPassages } from '../../data/scripture';

/** Does `text` occur as a contiguous word-window inside `passageText`? */
function isWindowOf(text: string, passageText: string): boolean {
  const needle = tokenize(text);
  const hay = tokenize(passageText);
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

describe('level bank files', () => {
  it('levels are contiguous starting at 0, each with a non-empty bank', () => {
    expect(LEVELS.length).toBeGreaterThan(1);
    expect(TOTAL_LEVELS).toBe(LEVELS.length);
    const nums = LEVELS.map((l) => l.level);
    // auto-loaded and sorted; contiguous 0..N so unlock (level+1) always works
    nums.forEach((n, i) => expect(n, `position ${i}`).toBe(i));
    for (const l of LEVELS) {
      expect(l.questions.length, `level ${l.level}`).toBeGreaterThanOrEqual(1);
    }
  });

  // Requirement 1 — every referenced passage exists
  it('every question references a passage that exists in verses.json', () => {
    for (const l of LEVELS) {
      for (const q of l.questions) {
        expect(getPassage(q.passageId), `${q.id} -> ${q.passageId}`).toBeDefined();
      }
    }
  });

  // Guards hand-edits: stored text must come from the configured scripture bank
  it('every question text is an exact contiguous window of its cited passage', () => {
    for (const l of LEVELS) {
      for (const q of l.questions) {
        const passage = getPassage(q.passageId)!;
        expect(isWindowOf(q.text, passage.text), `${q.id}: "${q.text}"`).toBe(true);
        // and its verses join back to its text
        expect(q.verses.map((v) => v.text).join(' ')).toBe(q.text);
      }
    }
  });

  // Requirement 2 — Level 0 is the single fixed warm-up verse, John 11:35
  it('Level 0 is a single "Jesus wept." (John 11:35) question', () => {
    const l0 = getLevelFile(0)!;
    expect(l0.questions).toHaveLength(1);
    expect(l0.questions[0].reference).toBe('John 11:35');
    expect(l0.questions[0].passageId).toBe('passage-001');
    expect(l0.questions[0].text).toBe('Jesus wept.');
    expect(l0.policy.distractorsPerSection).toBe(0);
  });

  it('Level 1 no longer contains "Jesus wept." (moved to Level 0)', () => {
    const l1 = getLevelFile(1)!;
    expect(l1.questions.some((q) => q.text === 'Jesus wept.')).toBe(false);
  });

  it('keeps the audited per-level bank sizes', () => {
    for (const level of LEVELS) {
      const expected =
        level.level === 0
          ? 1
          : level.level <= 16
            ? 15
            : level.level === 17
              ? 11
              : level.level === 18
                ? 13
                : 9;
      expect(level.questions, `Level ${level.level}`).toHaveLength(expected);
    }
    expect(
      LEVELS.reduce((total, level) => total + level.questions.length, 0),
    ).toBe(283);
  });

  it('does not reuse the same question text across different levels', () => {
    const allQuestions = LEVELS.flatMap((level) => level.questions);
    expect(new Set(allQuestions.map((question) => question.text)).size).toBe(
      allQuestions.length,
    );
  });

  // Requirement 3 — Level 0 reconstructs exactly "Jesus wept."
  it('Level 0 reconstructs exactly "Jesus wept."', () => {
    const built = buildLevel(getLevelFile(0)!, { seed: 1, questionIndex: 0 });
    expect(built.fullText).toBe('Jesus wept.');
    expect(built.sections).toHaveLength(1);
    expect(built.sections[0].correct).toEqual(['Jesus', 'wept.']);
    expect(built.sections[0].correct.join(' ')).toBe('Jesus wept.');
    expect(built.sections[0].bank.filter((t) => t.isDistractor)).toHaveLength(0);
  });

  // Requirement 4 — correct chunks reconstruct source for EVERY question in EVERY level
  it('correct chunks reconstruct the source text for every question', () => {
    for (const l of LEVELS) {
      for (let qi = 0; qi < l.questions.length; qi++) {
        const built = buildLevel(l, { seed: 5, questionIndex: qi });
        // each section reproduces its unit; all sections joined reproduce fullText
        const joined = built.sections.flatMap((s) => s.correct).join(' ');
        expect(joined, `${built.reference}`).toBe(built.fullText);
        for (const s of built.sections) {
          expect(s.correct.every((c) => c.length > 0)).toBe(true); // no empty tiles
        }
        // and the assembled correct chunks are a faithful chunking
        expect(chunksReproduce(built.fullText, built.sections.flatMap((s) => s.correct))).toBe(
          true,
        );
      }
    }
  });

  // Requirement 5 — distractors come from OTHER passages
  it('every distractor is real text from a different passage', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 3, questionIndex: 0 });
      for (const section of built.sections) {
        for (const tile of section.bank) {
          if (!tile.isDistractor) continue;
          const fromOther = allPassages.some(
            (p) => p.id !== built.passageId && isWindowOf(tile.text, p.text),
          );
          expect(fromOther, `L${l.level} distractor "${tile.text}"`).toBe(true);
        }
      }
    }
  });

  it('a distractor never equals a correct chunk in the same section', () => {
    for (const l of LEVELS) {
      for (let qi = 0; qi < l.questions.length; qi++) {
        const built = buildLevel(l, { seed: 9, questionIndex: qi });
        for (const section of built.sections) {
          const correctSet = new Set(section.correct);
          for (const tile of section.bank) {
            if (tile.isDistractor) {
              expect(correctSet.has(tile.text), `L${l.level} "${tile.text}"`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('produces the configured number of distractors per section', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 5, questionIndex: 0 });
      for (const section of built.sections) {
        const d = section.bank.filter((t) => t.isDistractor).length;
        expect(d, `L${l.level}`).toBe(l.policy.distractorsPerSection);
      }
    }
  });

  // Requirement 6 — duplicate words get unique tile ids
  it('all tile ids are unique within a section, even for repeated words', () => {
    for (const l of LEVELS) {
      for (let qi = 0; qi < l.questions.length; qi++) {
        const built = buildLevel(l, { seed: 2, questionIndex: qi });
        for (const section of built.sections) {
          const ids = section.bank.map((t) => t.id);
          expect(new Set(ids).size, `L${l.level}`).toBe(ids.length);
        }
      }
    }
  });

  it('does not start a round already in the correct sequence', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 1, questionIndex: 0 });
      for (const section of built.sections) {
        // A single-tile section is trivially "in order" — nothing to shuffle.
        if (section.correct.length < 2) continue;
        const correctInBankOrder = section.bank
          .filter((t) => !t.isDistractor)
          .map((t) => t.text);
        const alreadyOrdered =
          correctInBankOrder.length === section.correct.length &&
          correctInBankOrder.every((t, i) => t === section.correct[i]);
        expect(alreadyOrdered, `L${l.level}`).toBe(false);
      }
    }
  });

  it('no correct tile is a lone function word (虚词) in any level/question', () => {
    for (const l of LEVELS) {
      for (let qi = 0; qi < l.questions.length; qi++) {
        const built = buildLevel(l, { seed: 6, questionIndex: qi });
        for (const section of built.sections) {
          for (const c of section.correct) {
            expect(c.split(' ').some(isContentWord), `L${l.level}: "${c}"`).toBe(true);
          }
        }
      }
    }
  });

  it('is deterministic for a given seed + questionIndex', () => {
    const a = buildLevel(getLevelFile(10)!, { seed: 42, questionIndex: 1 });
    const b = buildLevel(getLevelFile(10)!, { seed: 42, questionIndex: 1 });
    expect(a.sections[0].bank.map((t) => t.id + t.text)).toEqual(
      b.sections[0].bank.map((t) => t.id + t.text),
    );
  });

  it('memorize time scales with length and respects the level bounds', () => {
    for (const l of LEVELS) {
      const short = memorizeSeconds(l.policy, 2);
      const long = memorizeSeconds(l.policy, 500);
      expect(short).toBeGreaterThanOrEqual(l.policy.memorizeMin);
      expect(long).toBe(l.policy.memorizeMax);
      expect(long).toBeGreaterThanOrEqual(short);
    }
  });

  it('every level has 3 hearts, and distractors rise across the game', () => {
    for (const l of LEVELS) {
      expect(l.policy.hearts, `L${l.level}`).toBe(3);
    }
    const first = LEVELS[1].policy.distractorsPerSection;
    const last = LEVELS[LEVELS.length - 1].policy.distractorsPerSection;
    expect(last).toBeGreaterThan(first);
  });

  it('adds Chinese (和合本) for every passage the banks reference', () => {
    for (const l of LEVELS) {
      for (const q of l.questions) {
        const passage = getPassage(q.passageId)!;
        expect(passage.textZh, `${q.passageId}`).toBeTruthy();
        for (const v of q.verses) {
          const src = passage.verses.find((sv) => sv.verse === v.verse);
          expect(src?.textZh, `${q.passageId} v${v.verse}`).toBeTruthy();
        }
      }
    }
  });
});
