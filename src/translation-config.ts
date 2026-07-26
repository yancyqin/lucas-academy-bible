export const TRANSLATIONS = {
  WEB: {
    key: 'WEB',
    label: 'WEB',
    name: 'World English Bible',
    requiresApi: false,
  },
  NIV: {
    key: 'NIV',
    label: 'NIV',
    name: 'New International Version',
    requiresApi: true,
  },
  NIRV: {
    key: 'NIRV',
    label: 'NIrV',
    name: "New International Reader's Version",
    requiresApi: true,
  },
  NASB2020: {
    key: 'NASB2020',
    label: 'NASB 2020',
    name: 'New American Standard Bible 2020',
    requiresApi: true,
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS;

export const DEFAULT_TRANSLATION: TranslationKey = 'WEB';

export function isTranslationKey(value: unknown): value is TranslationKey {
  return typeof value === 'string' && value in TRANSLATIONS;
}

