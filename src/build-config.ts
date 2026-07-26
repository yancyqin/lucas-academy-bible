export interface BuildFeatures {
  itchBuild: boolean;
  dailyVerse: boolean;
  licensedTranslations: boolean;
  translationFooter: boolean;
}

export function buildFeatures(
  env: Record<string, string | boolean | undefined>,
): BuildFeatures {
  const itchBuild = env.VITE_ITCH_BUILD === 'true';
  return {
    itchBuild,
    dailyVerse: !itchBuild,
    licensedTranslations: !itchBuild,
    translationFooter: !itchBuild,
  };
}

export const BUILD_FEATURES = buildFeatures(import.meta.env);

