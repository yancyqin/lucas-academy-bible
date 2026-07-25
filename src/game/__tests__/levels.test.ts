import { describe, expect, it } from 'vitest';
import { LEVELS, TOTAL_LEVELS } from '../levels';
import { buildLevel } from '../build';
import { chunksReproduce, tokenize } from '../chunk';
import { getPassage, allPassages } from '../../data/scripture';

/** Does `text` occur as a contiguous word-window inside `passage.text`? */
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

describe('level configuration', () => {
  it('defines exactly 20 levels in order 1..20', () => {
    expect(TOTAL_LEVELS).toBe(20);
    expect(LEVELS.map((l) => l.level)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  // Requirement 1
  it('every configured passage id exists in verses.json', () => {
    for (const l of LEVELS) {
      expect(getPassage(l.passageId), `${l.passageId} (level ${l.level})`).toBeDefined();
    }
  });

  // Requirement 2
  it('Level 1 is John 11:35', () => {
    const l1 = LEVELS[0];
    expect(l1.passageId).toBe('passage-001');
    expect(getPassage(l1.passageId)?.reference).toBe('John 11:35');
  });

  // Requirement 3
  it('Level 1 reconstructs exactly "Jesus wept."', () => {
    const built = buildLevel(LEVELS[0], { seed: 1 });
    expect(built.sections).toHaveLength(1);
    expect(built.sections[0].correct).toEqual(['Jesus', 'wept.']);
    expect(built.sections[0].correct.join(' ')).toBe('Jesus wept.');
    expect(built.fullText).toBe('Jesus wept.');
  });

  it('Level 1 has zero distractors', () => {
    const built = buildLevel(LEVELS[0], { seed: 1 });
    expect(built.sections[0].bank.filter((t) => t.isDistractor)).toHaveLength(0);
  });

  // Requirement 4
  it('correct chunks reproduce their source scripture for every level', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 7 });
      const passage = getPassage(l.passageId)!;
      if (l.sectioned) {
        expect(built.sections).toHaveLength(passage.verses.length);
        built.sections.forEach((s, i) => {
          const verseText = passage.verses[i].text;
          expect(
            chunksReproduce(verseText, s.correct),
            `L${l.level} verse ${i + 1}`,
          ).toBe(true);
        });
        // all sections joined reproduce the whole passage
        const joined = built.sections.map((s) => s.correct.join(' ')).join(' ');
        expect(joined).toBe(passage.text);
      } else {
        expect(built.sections).toHaveLength(1);
        expect(
          chunksReproduce(passage.text, built.sections[0].correct),
          `L${l.level}`,
        ).toBe(true);
      }
    }
  });

  // Requirement 5
  it('every distractor comes from a different passage', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 3 });
      for (const section of built.sections) {
        for (const tile of section.bank) {
          if (!tile.isDistractor) continue;
          const fromOther = allPassages.some(
            (p) => p.id !== l.passageId && isWindowOf(tile.text, p.text),
          );
          expect(fromOther, `L${l.level} distractor "${tile.text}"`).toBe(true);
        }
      }
    }
  });

  it('a distractor never equals a correct chunk in the same section', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 9 });
      for (const section of built.sections) {
        const correctSet = new Set(section.correct);
        for (const tile of section.bank) {
          if (tile.isDistractor) {
            expect(correctSet.has(tile.text), `L${l.level} "${tile.text}"`).toBe(false);
          }
        }
      }
    }
  });

  it('produces roughly the configured number of distractors per section', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 5 });
      for (const section of built.sections) {
        const d = section.bank.filter((t) => t.isDistractor).length;
        expect(d, `L${l.level}`).toBe(l.distractorsPerSection);
      }
    }
  });

  // Requirement 6
  it('all tile ids are unique within a section, even for repeated words', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 2 });
      for (const section of built.sections) {
        const ids = section.bank.map((t) => t.id);
        expect(new Set(ids).size, `L${l.level}`).toBe(ids.length);
      }
    }
  });

  it('repeated visible words become separate tile instances (Ephesians 4)', () => {
    // Level 20 verse 5 = "one Lord, one faith, one baptism," — "one" repeats.
    const built = buildLevel(LEVELS[19], { seed: 1 });
    const verse5 = built.sections.find((s) => s.verse === 5)!;
    const ones = verse5.bank.filter((t) => t.text === 'one' && !t.isDistractor);
    expect(ones.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ones.map((t) => t.id)).size).toBe(ones.length);
  });

  it('does not start a round already in the correct sequence', () => {
    for (const l of LEVELS) {
      const built = buildLevel(l, { seed: 1 });
      for (const section of built.sections) {
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

  it('is deterministic for a given seed', () => {
    const a = buildLevel(LEVELS[9], { seed: 42 });
    const b = buildLevel(LEVELS[9], { seed: 42 });
    expect(a.sections[0].bank.map((t) => t.id + t.text)).toEqual(
      b.sections[0].bank.map((t) => t.id + t.text),
    );
  });
});
