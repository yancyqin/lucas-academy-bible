import { describe, expect, it } from 'vitest';
import { shouldAutoNarrate } from '../speech';

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
