import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import ja from './locales/ja';

const resources = {
  en: { common: en },
  'zh-CN': { common: zhCN },
  'zh-TW': { common: zhTW },
  ja: { common: ja },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })
  .then(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = i18n.resolvedLanguage || i18n.language || 'zh-CN';
    }
  });

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
});

export default i18n;

export const SUPPORTED_LANGS = [
  { code: 'en', labelKey: 'lang.en' },
  { code: 'zh-CN', labelKey: 'lang.zh-CN' },
  { code: 'zh-TW', labelKey: 'lang.zh-TW' },
  { code: 'ja', labelKey: 'lang.ja' },
] as const;
