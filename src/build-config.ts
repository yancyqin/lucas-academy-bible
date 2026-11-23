/**
 * Build-time feature flags, decided by `VITE_DIST_TARGET`:
 *
 *   web  (default) — the Cloudflare Worker site: every tab, every translation.
 *   itch            — itch.io HTML5 upload: no API, WEB Challenge only, no footer.
 *   ios             — the Capacitor App Store build: fully offline. Challenge
 *                     and Pick a Verse in the bundled WEB + CUV editions,
 *                     public-domain attribution footer kept.
 *
 * `VITE_ITCH_BUILD=true` is still honoured as an alias for `itch` so older
 * scripts and skills keep working. See docs/DISTRIBUTION.md.
 */

export const DIST_TARGETS = ['web', 'itch', 'ios'] as const;
export type DistTarget = (typeof DIST_TARGETS)[number];

export interface BuildFeatures {
  target: DistTarget;
  /** Legacy alias for `target === 'itch'`. */
  itchBuild: boolean;
  /** True when the build must never call `/api/*` (no Worker behind it). */
  offline: boolean;
  /** Daily Verse, Daily Scrabble and Word Search — all need the Worker. */
  dailyVerse: boolean;
  /** Pick a Verse: bundled WEB + CUV work offline; licensed editions need the API. */
  pickVerse: boolean;
  /** NIV, NIrV, NASB 2020, CCB, CCBT, KLB via the Worker. */
  licensedTranslations: boolean;
  /** Choosing between the bundled WEB and CUV editions. */
  localTranslations: boolean;
  translationFooter: boolean;
}

export function isDistTarget(value: unknown): value is DistTarget {
  return typeof value === 'string' && (DIST_TARGETS as readonly string[]).includes(value);
}

export function resolveDistTarget(
  env: Record<string, string | boolean | undefined>,
): DistTarget {
  if (isDistTarget(env.VITE_DIST_TARGET)) return env.VITE_DIST_TARGET;
  if (env.VITE_ITCH_BUILD === 'true') return 'itch';
  return 'web';
}

export function buildFeatures(
  env: Record<string, string | boolean | undefined>,
): BuildFeatures {
  const target = resolveDistTarget(env);
  const offline = target !== 'web';
  return {
    target,
    itchBuild: target === 'itch',
    offline,
    dailyVerse: !offline,
    pickVerse: target !== 'itch',
    licensedTranslations: !offline,
    localTranslations: target !== 'itch',
    // The itch page carries its own attribution; the iOS build keeps the
    // public-domain (WEB / CUV) line because nothing else in the app says
    // where the text comes from.
    translationFooter: target !== 'itch',
  };
}

export const BUILD_FEATURES = buildFeatures(import.meta.env);

/** The public web edition, where a shared Pick a Verse link is played. */
export const PUBLIC_SITE_URL = 'https://bible.lucasacademy.org/';

/**
 * Base URL for a Pick a Verse share link. A build with no site behind it (the
 * iOS app runs from its own internal address) links to the public web edition
 * instead, so a copied link opens for whoever receives it.
 */
export function shareLinkBase(
  features: Pick<BuildFeatures, 'offline'>,
  currentHref: string,
): string {
  return features.offline ? PUBLIC_SITE_URL : currentHref;
}

/** Single source of truth: `version` in package.json, injected by vite.config.ts. */
export const APP_VERSION: string = __APP_VERSION__;
