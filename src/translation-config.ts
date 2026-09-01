/**
 * `bibleId` is YouVersion's own numeric Bible id — the same number that appears
 * in a bible.com URL. It is what makes `?version=111` deep links work, and the
 * Worker keeps the matching table for its API calls. CUV is served from local
 * public-domain assets and has no YouVersion id.
 */
export const TRANSLATIONS = {
  WEB: {
    key: 'WEB',
    label: 'WEB',
    name: 'World English Bible',
    language: 'en',
    bibleId: 206,
    requiresApi: false,
  },
  NIV: {
    key: 'NIV',
    label: 'NIV',
    name: 'New International Version',
    language: 'en',
    bibleId: 111,
    requiresApi: true,
  },
  NIRV: {
    key: 'NIRV',
    label: 'NIrV',
    name: "New International Reader's Version",
    language: 'en',
    bibleId: 110,
    requiresApi: true,
  },
  NASB2020: {
    key: 'NASB2020',
    label: 'NASB 2020',
    name: 'New American Standard Bible 2020',
    language: 'en',
    bibleId: 2692,
    requiresApi: true,
  },
  CUV: {
    key: 'CUV',
    label: 'CUV',
    name: 'Chinese Union Version (Simplified)',
    language: 'zh',
    bibleId: 0,
    requiresApi: false,
  },
  CCB: {
    key: 'CCB',
    label: 'CCB',
    name: '当代译本',
    language: 'zh',
    bibleId: 36,
    requiresApi: true,
  },
  CCBT: {
    key: 'CCBT',
    label: 'CCBT',
    name: '當代譯本',
    language: 'zh',
    bibleId: 1392,
    requiresApi: true,
  },
  KLB: {
    key: 'KLB',
    label: 'KLB',
    name: '현대인의 성경 (Korean Living Bible 1985)',
    language: 'ko',
    bibleId: 86,
    requiresApi: true,
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS;
export type BibleLanguage = (typeof TRANSLATIONS)[TranslationKey]['language'];

export const DEFAULT_TRANSLATION: TranslationKey = 'WEB';

export const ENGLISH_TRANSLATIONS = Object.values(TRANSLATIONS).filter(
  (translation) => translation.language === 'en',
);

export const CHINESE_TRANSLATIONS = Object.values(TRANSLATIONS).filter(
  (translation) => translation.language === 'zh',
);

export const KOREAN_TRANSLATIONS = Object.values(TRANSLATIONS).filter(
  (translation) => translation.language === 'ko',
);

export function isTranslationKey(value: unknown): value is TranslationKey {
  return typeof value === 'string' && value in TRANSLATIONS;
}

/** Our key for a YouVersion Bible id, e.g. 111 → NIV (undefined if unknown). */
export function bibleIdTranslation(
  bibleId: number,
): TranslationKey | undefined {
  if (!Number.isInteger(bibleId) || bibleId <= 0) return undefined;
  return Object.values(TRANSLATIONS).find(
    (translation) => translation.bibleId === bibleId,
  )?.key;
}

export function isChineseTranslation(
  translation: TranslationKey,
): boolean {
  return TRANSLATIONS[translation].language === 'zh';
}
