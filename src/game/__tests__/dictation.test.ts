import { describe, expect, it } from 'vitest';
import { dictationSegments, gradeDictation, type DictationSegment } from '../dictation';

/** The scripture back out of the segments, extras left out. */
function rejoin(segments: DictationSegment[]): string {
  return segments.map((s) => (s.kind === 'extra' ? '' : s.text)).join('');
}

describe('gradeDictation', () => {
  it('ignores case, punctuation and spacing', () => {
    const result = gradeDictation('Jesus wept.', '  jesus   WEPT ');
    expect(result).toMatchObject({ cjk: false, correct: 2, wrong: 0, missing: 0, extra: 0, total: 2 });
    expect(result.accuracy).toBe(1);
  });

  it('treats curly and straight apostrophes, and none, as the same word', () => {
    expect(gradeDictation('the Lord’s house', "the lord's house").accuracy).toBe(1);
    expect(gradeDictation('the Lord’s house', 'the lords house').accuracy).toBe(1);
  });

  it('marks a misspelled English word as one wrong word', () => {
    const result = gradeDictation('For God so loved the world,', 'For God so love the world');
    expect(result).toMatchObject({ correct: 5, wrong: 1, missing: 0, extra: 0, total: 6 });
    expect(result.marks[3]).toEqual({ kind: 'wrong', target: 3, typed: 'love' });
    expect(result.accuracy).toBeCloseTo(5 / 6);
  });

  it('marks only the skipped word as missing, not everything after it', () => {
    const result = gradeDictation('For God so loved the world,', 'For God loved the world');
    expect(result).toMatchObject({ correct: 5, wrong: 0, missing: 1, extra: 0 });
    expect(result.marks[2]).toEqual({ kind: 'missing', target: 2 });
  });

  it('counts extra words against the accuracy', () => {
    const result = gradeDictation('For God so loved the world,', 'For God so so loved the world');
    expect(result).toMatchObject({ correct: 6, wrong: 0, missing: 0, extra: 1, total: 6 });
    expect(result.accuracy).toBeCloseTo(6 / 7);
  });

  it('grades Chinese character by character and skips punctuation', () => {
    const result = gradeDictation(
      '神爱世人，甚至将他的独生子赐给他们，',
      '神爱世人甚至把他的独生子赐给他们',
    );
    expect(result).toMatchObject({ cjk: true, total: 16, correct: 15, wrong: 1, missing: 0, extra: 0 });
    expect(result.marks.find((m) => m.kind === 'wrong')).toEqual({ kind: 'wrong', target: 6, typed: '把' });
  });

  it('finds a missing Chinese character and an extra one', () => {
    const missing = gradeDictation('耶稣哭了。', '耶稣了');
    expect(missing).toMatchObject({ correct: 3, missing: 1, wrong: 0, extra: 0 });
    expect(missing.marks[2]).toEqual({ kind: 'missing', target: 2 });

    const extra = gradeDictation('耶稣哭了。', '耶稣哭哭了');
    expect(extra).toMatchObject({ correct: 4, missing: 0, wrong: 0, extra: 1 });
    expect(extra.accuracy).toBeCloseTo(4 / 5);
  });

  it('scores an empty page as all missing', () => {
    const result = gradeDictation('Jesus wept.', '');
    expect(result).toMatchObject({ correct: 0, missing: 2, accuracy: 0 });
  });
});

describe('dictationSegments', () => {
  it('redraws the exact scripture with each word marked', () => {
    const text = 'For God so loved the world,';
    const segments = dictationSegments(text, gradeDictation(text, 'for god loved teh world'));
    expect(rejoin(segments)).toBe(text);
    expect(segments).toContainEqual({ kind: 'unit', text: 'so', mark: 'missing' });
    expect(segments).toContainEqual({ kind: 'unit', text: 'the', mark: 'wrong', typed: 'teh' });
    expect(segments.at(-1)).toEqual({ kind: 'text', text: ',' });
  });

  it('slots extras in place, trailing ones after the closing punctuation', () => {
    const text = '耶稣哭了。';
    const segments = dictationSegments(text, gradeDictation(text, '主耶稣哭了啊'));
    expect(rejoin(segments)).toBe(text);
    expect(segments[0]).toEqual({ kind: 'extra', typed: '主' });
    expect(segments.at(-2)).toEqual({ kind: 'text', text: '。' });
    expect(segments.at(-1)).toEqual({ kind: 'extra', typed: '啊' });
  });
});
