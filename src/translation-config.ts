export const TRANSLATIONS = {
  WEB: {
    key: 'WEB',
    label: 'WEB',
    name: 'World English Bible',
    language: 'en',
    requiresApi: false,
  },
  NIV: {
    key: 'NIV',
    label: 'NIV',
    name: 'New International Version',
    language: 'en',
    requiresApi: true,
  },
  NIRV: {
    key: 'NIRV',
    label: 'NIrV',
    name: "New International Reader's Version",
    language: 'en',
    requiresApi: true,
  },
  NASB2020: {
    key: 'NASB2020',
    label: 'NASB 2020',
    name: 'New American Standard Bible 2020',
    language: 'en',
    requiresApi: true,
  },
  CUV: {
    key: 'CUV',
    label: 'CUV',
    name: 'Chinese Union Version (Simplified)',
    language: 'zh',
    requiresApi: false,
  },
  CCB: {
    key: 'CCB',
    label: 'CCB',
    name: '当代译本',
    language: 'zh',
    requiresApi: true,
  },
  CCBT: {
    key: 'CCBT',
    label: 'CCBT',
    name: '當代譯本',
    language: 'zh',
    requiresApi: true,
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS;

export const DEFAULT_TRANSLATION: TranslationKey = 'WEB';

export const ENGLISH_TRANSLATIONS = Object.values(TRANSLATIONS).filter(
  (translation) => translation.language === 'en',
);

export const CHINESE_TRANSLATIONS = Object.values(TRANSLATIONS).filter(
  (translation) => translation.language === 'zh',
);

export function isTranslationKey(value: unknown): value is TranslationKey {
  return typeof value === 'string' && value in TRANSLATIONS;
}

export function isChineseTranslation(
  translation: TranslationKey,
): boolean {
  return TRANSLATIONS[translation].language === 'zh';
}
