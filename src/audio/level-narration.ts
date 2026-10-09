import { translationInfo } from '../data/scripture';
import type { BuiltLevel } from '../game/build';

/** Unattributed Challenge levels use the bundled edition; picked passages carry attribution. */
export function levelNarrationOptions(level: Pick<BuiltLevel, 'fragment' | 'verses' | 'attribution'>) {
  const edition = level.attribution?.translationKey ?? level.attribution?.abbreviation ?? translationInfo.id;
  const texts = level.fragment ? undefined : level.verses.map((verse) => verse.text);
  return {
    cuvVerses: edition === 'CUV' ? texts : undefined,
    webVerses: edition === 'WEB' ? texts : undefined,
  };
}
