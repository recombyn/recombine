import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import ja from './locales/ja';
import {
  DEFAULT_I18N_LANG,
  basenameToI18nLang,
  getLocaleBasename,
} from './localePath';

const resources = {
  en: { common: en },
  'zh-CN': { common: zhCN },
  'zh-TW': { common: zhTW },
  ja: { common: ja },
};

/** Prefer URL prefix (`/zh/...`) over localStorage when present. */
function detectLngFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const basename = getLocaleBasename(window.location.pathname);
  if (basename) return basenameToI18nLang(basename);
  // Unprefixed routes are English (default locale).
  return DEFAULT_I18N_LANG;
}

async function initI18n() {
  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: DEFAULT_I18N_LANG,
      lng: detectLngFromUrl(),
      defaultNS: 'common',
      detection: {
        // URL is source of truth at boot via `lng`; keep detector for caches.
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: 'language',
        caches: ['localStorage'],
      },
      interpolation: { escapeValue: false },
    });
  const fromUrl = detectLngFromUrl();
  if (fromUrl && i18n.language !== fromUrl) {
    void i18n.changeLanguage(fromUrl);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang =
      i18n.resolvedLanguage || i18n.language || DEFAULT_I18N_LANG;
  }
}
void initI18n();

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

export {
  DEFAULT_I18N_LANG,
  I18N_TO_PREFIX,
  PREFIX_TO_I18N,
  absoluteLocaleUrl,
  basenameToI18nLang,
  buildLocaleSwitchUrl,
  getLocaleBasename,
  normalizeI18nLang,
  stripLocalePrefix,
  withLocalePrefix,
} from './localePath';
