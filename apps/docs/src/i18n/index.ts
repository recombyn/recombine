import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en'
import zhCN from './locales/zh-CN'
import zhTW from './locales/zh-TW'
import ja from './locales/ja'

export const SUPPORTED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
] as const

export type DocsLang = (typeof SUPPORTED_LANGS)[number]['code']

export const DEFAULT_LANG: DocsLang = 'en'

const resources = {
  en: { common: en },
  'zh-CN': { common: zhCN },
  'zh-TW': { common: zhTW },
  ja: { common: ja },
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANG,
    defaultNS: 'common',
    // Same key as apps/web so language stays in sync across products.
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })
  .then(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = i18n.resolvedLanguage || i18n.language || DEFAULT_LANG
    }
  })

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
  }
})

export function normalizeDocsLang(lng?: string | null): DocsLang {
  const raw = String(lng || '').trim()
  if (raw === 'zh-CN' || raw === 'zh-TW' || raw === 'en' || raw === 'ja') return raw
  if (raw === 'zh' || raw.startsWith('zh-Hans')) return 'zh-CN'
  if (raw.startsWith('zh-Hant') || raw === 'zh-HK' || raw === 'zh-MO') return 'zh-TW'
  if (raw.startsWith('ja')) return 'ja'
  if (raw.startsWith('en')) return 'en'
  return DEFAULT_LANG
}

export default i18n
