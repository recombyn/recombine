/**
 * Path-based locales (hreflang-friendly):
 * - English (default): `/home`, `/editor/...`  — no prefix
 * - 简体: `/zh/home`
 * - 繁體: `/zh-tw/home`
 * - 日本語: `/ja/home`
 *
 * Pair with React Router `basename` so in-app `navigate('/home')` stays prefix-aware.
 */

export const DEFAULT_I18N_LANG = 'en';

/** First URL segment → i18n language code. */
export const PREFIX_TO_I18N: Record<string, string> = {
  zh: 'zh-CN',
  'zh-tw': 'zh-TW',
  ja: 'ja',
};

/** i18n language → URL prefix (empty = default / English). */
export const I18N_TO_PREFIX: Record<string, string> = {
  en: '',
  'zh-CN': 'zh',
  'zh-TW': 'zh-tw',
  ja: 'ja',
};

export function normalizeI18nLang(raw: string | undefined | null): string {
  const s = String(raw || '');
  if (s.startsWith('zh-TW') || s === 'zh-Hant' || s.toLowerCase() === 'zh-tw') return 'zh-TW';
  if (s.startsWith('zh')) return 'zh-CN';
  if (s.startsWith('ja')) return 'ja';
  if (s.startsWith('en')) return 'en';
  if (s in I18N_TO_PREFIX) return s;
  return DEFAULT_I18N_LANG;
}

/** `/zh` | `/zh-tw` | `/ja` | `` — for BrowserRouter basename. */
export function getLocaleBasename(pathname?: string): string {
  const path =
    pathname ??
    (typeof window !== 'undefined' ? window.location.pathname : '/');
  const seg = path.split('/').filter(Boolean)[0]?.toLowerCase() || '';
  if (seg in PREFIX_TO_I18N) return `/${seg}`;
  return '';
}

export function basenameToI18nLang(basename: string): string {
  const seg = basename.replace(/^\//, '').toLowerCase();
  return PREFIX_TO_I18N[seg] || DEFAULT_I18N_LANG;
}

/** Strip `/zh` | `/zh-tw` | `/ja` from a full browser pathname. */
export function stripLocalePrefix(pathname: string): string {
  const parts = pathname.split('/');
  // ["", "zh", "home"] or ["", "home"]
  const seg = (parts[1] || '').toLowerCase();
  if (seg in PREFIX_TO_I18N) {
    const rest = '/' + parts.slice(2).join('/');
    return rest === '/' ? '/' : rest.replace(/\/$/, '') || '/';
  }
  return pathname || '/';
}

/** Build a full browser URL path for an i18n language + app path (no prefix in `appPath`). */
export function withLocalePrefix(appPath: string, i18nLang: string): string {
  const lang = normalizeI18nLang(i18nLang);
  const prefix = I18N_TO_PREFIX[lang] || '';
  const path = appPath.startsWith('/') ? appPath : `/${appPath}`;
  if (!prefix) return path === '' ? '/' : path;
  if (path === '/') return `/${prefix}`;
  return `/${prefix}${path}`;
}

/**
 * Absolute URL for switching language while staying on the same page.
 * Uses full browser pathname (includes current prefix).
 */
export function buildLocaleSwitchUrl(
  nextI18nLang: string,
  loc: { pathname: string; search?: string; hash?: string } = typeof window !==
  'undefined'
    ? window.location
    : { pathname: '/', search: '', hash: '' }
): string {
  const stripped = stripLocalePrefix(loc.pathname);
  const next = withLocalePrefix(stripped || '/', nextI18nLang);
  return `${next}${loc.search || ''}${loc.hash || ''}`;
}

/** Public absolute URL for SEO alternate links. */
export function absoluteLocaleUrl(origin: string, i18nLang: string, appPath = '/'): string {
  const path = withLocalePrefix(appPath, i18nLang);
  return `${origin.replace(/\/$/, '')}${path === '/' ? '/' : path}`;
}
