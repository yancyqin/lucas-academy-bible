import { describe, expect, it } from 'vitest';
import {
  PUBLIC_SITE_URL,
  buildFeatures,
  resolveDistTarget,
  shareLinkBase,
} from '../../build-config';
import { verseLinkUrl } from '../../verse-request';

describe('build feature flags', () => {
  it('enables the full web experience by default', () => {
    expect(buildFeatures({})).toEqual({
      target: 'web',
      itchBuild: false,
      offline: false,
      dailyVerse: true,
      pickVerse: true,
      licensedTranslations: true,
      localTranslations: true,
      translationFooter: true,
    });
  });

  it('makes the itch build WEB-only and removes licensed features', () => {
    expect(buildFeatures({ VITE_DIST_TARGET: 'itch' })).toEqual({
      target: 'itch',
      itchBuild: true,
      offline: true,
      dailyVerse: false,
      pickVerse: false,
      licensedTranslations: false,
      localTranslations: false,
      translationFooter: false,
    });
  });

  it('still honours the legacy VITE_ITCH_BUILD flag', () => {
    expect(buildFeatures({ VITE_ITCH_BUILD: 'true' })).toEqual(
      buildFeatures({ VITE_DIST_TARGET: 'itch' }),
    );
  });

  it('makes the iOS build offline with bundled Pick a Verse and attribution', () => {
    expect(buildFeatures({ VITE_DIST_TARGET: 'ios' })).toEqual({
      target: 'ios',
      itchBuild: false,
      offline: true,
      dailyVerse: false,
      pickVerse: true,
      licensedTranslations: false,
      localTranslations: true,
      translationFooter: true,
    });
  });

  it('shares a public link from the offline app and the page address on the web', () => {
    const link = {
      request: { book: 'JHN', chapter: 3, verse: 16, endVerse: 16 },
      translation: 'CUV',
      difficulty: 'normal',
    } as const;
    const appAddress = 'capacitor://localhost/index.html';
    expect(shareLinkBase(buildFeatures({ VITE_DIST_TARGET: 'ios' }), appAddress)).toBe(
      PUBLIC_SITE_URL,
    );
    expect(
      verseLinkUrl(link, shareLinkBase(buildFeatures({ VITE_DIST_TARGET: 'ios' }), appAddress)),
    ).toBe('https://bible.lucasacademy.org/?passage=JHN.3.16&translation=CUV');
    expect(shareLinkBase(buildFeatures({}), 'http://localhost:5188/?x=1')).toBe(
      'http://localhost:5188/?x=1',
    );
  });

  it('falls back to web for an unknown target and lets an explicit target win', () => {
    expect(resolveDistTarget({ VITE_DIST_TARGET: 'steam' })).toBe('web');
    expect(resolveDistTarget({ VITE_DIST_TARGET: 'web', VITE_ITCH_BUILD: 'true' })).toBe('web');
  });
});
