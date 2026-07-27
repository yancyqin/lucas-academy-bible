import { describe, expect, it } from 'vitest';
import { segmentForSpeech, shouldAutoNarrate } from '../speech';

describe('shouldAutoNarrate', () => {
  // Requirement 13
  it('never auto-narrates when sound is disabled', () => {
    expect(shouldAutoNarrate(false, true)).toBe(false);
    expect(shouldAutoNarrate(false, false)).toBe(false);
  });

  it('auto-narrates only when sound is enabled AND speech is supported', () => {
    expect(shouldAutoNarrate(true, true)).toBe(true);
    expect(shouldAutoNarrate(true, false)).toBe(false);
  });
});

describe('segmentForSpeech (slow, gap-paced narration)', () => {
  it('splits a long verse into several clause segments', () => {
    const text =
      'For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.';
    const segments = segmentForSpeech(text);
    expect(segments.length).toBeGreaterThan(1);
    // segments rejoin to the source (nothing dropped or added)
    expect(segments.join(' ')).toBe(text);
  });

  it('handles a short text as a single segment', () => {
    expect(segmentForSpeech('Jesus wept.')).toEqual(['Jesus wept.']);
  });

  it('segments Chinese clauses without inserting spaces', () => {
    const text = '神爱世人，甚至赐下独生子。信他的人有永生。';
    const segments = segmentForSpeech(text);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join('')).toBe(text);
  });
});
