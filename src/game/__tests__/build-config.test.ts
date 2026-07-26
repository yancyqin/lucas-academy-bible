import { describe, expect, it } from 'vitest';
import { buildFeatures } from '../../build-config';

describe('build feature flags', () => {
  it('enables the full web experience by default', () => {
    expect(buildFeatures({})).toEqual({
      itchBuild: false,
      dailyVerse: true,
      licensedTranslations: true,
      translationFooter: true,
    });
  });

  it('makes the itch build WEB-only and removes licensed features', () => {
    expect(buildFeatures({ VITE_ITCH_BUILD: 'true' })).toEqual({
      itchBuild: true,
      dailyVerse: false,
      licensedTranslations: false,
      translationFooter: false,
    });
  });
});

