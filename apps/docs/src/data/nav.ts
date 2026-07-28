import type { DocsLang } from '@/i18n'

export type DocLink = {
  /** i18n key under pages.* */
  pageKey: string
  path: string
}

export type DocGroupDef = {
  /** i18n key under groups.* */
  groupKey: string
  items: DocLink[]
}

export type LegalLinkDef = {
  pageKey: string
  path: string
}

/** Help docs sidebar structure (titles come from i18n). */
export const DOC_GROUP_DEFS: DocGroupDef[] = [
  {
    groupKey: 'guide',
    items: [
      { pageKey: 'getting-started', path: '/guide/getting-started' },
      { pageKey: 'canvas', path: '/guide/canvas' },
      { pageKey: 'shortcuts', path: '/guide/shortcuts' },
      { pageKey: 'agent', path: '/guide/agent' },
      { pageKey: 'image-generation', path: '/guide/image-generation' },
      { pageKey: 'image-tools', path: '/guide/image-tools' },
      { pageKey: 'account', path: '/guide/account' },
    ],
  },
  {
    groupKey: 'features',
    items: [
      { pageKey: 'overview', path: '/features/overview' },
      { pageKey: 'plaza', path: '/features/plaza' },
      { pageKey: 'import', path: '/features/import' },
      { pageKey: 'export-share', path: '/features/export-share' },
    ],
  },
  {
    groupKey: 'faq',
    items: [{ pageKey: 'faq', path: '/faq/' }],
  },
]

export const LEGAL_LINK_DEFS: LegalLinkDef[] = [
  { pageKey: 'terms', path: '/legal/terms' },
  { pageKey: 'privacy', path: '/legal/privacy' },
  { pageKey: 'ai-terms', path: '/legal/ai-terms' },
  { pageKey: 'about', path: '/legal/about' },
]

const DOC_MODULES = import.meta.glob('../../content/{zh-CN,zh-TW,en,ja}/{guide,features,faq,legal}/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function filePathToRoute(file: string): { locale: DocsLang; path: string } | null {
  // ../../content/zh-CN/guide/getting-started.md → { locale, path: /guide/getting-started }
  // ../../content/en/faq/index.md → { locale, path: /faq/ }
  const normalized = file.replace(/\\/g, '/')
  const m = normalized.match(/\/content\/(zh-CN|zh-TW|en|ja)\/(.+)\.md$/)
  if (!m) return null
  const locale = m[1] as DocsLang
  let rel = m[2]
  if (rel.endsWith('/index')) {
    rel = rel.slice(0, -'/index'.length)
    return { locale, path: `/${rel}/` }
  }
  return { locale, path: `/${rel}` }
}

/** locale → route path → markdown body */
export const DOC_CONTENT_BY_LOCALE: Record<DocsLang, Record<string, string>> = {
  'zh-CN': {},
  'zh-TW': {},
  en: {},
  ja: {},
}

for (const [file, raw] of Object.entries(DOC_MODULES)) {
  const parsed = filePathToRoute(file)
  if (!parsed) continue
  DOC_CONTENT_BY_LOCALE[parsed.locale][parsed.path] = stripFrontmatter(raw)
}

export function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '')
}

export function normalizePath(pathname: string): string {
  let p = pathname.replace(/\.html$/, '')
  if (p.length > 1 && p.endsWith('/')) {
    const without = p.slice(0, -1)
    // Prefer keeping trailing slash for index routes like /faq/
    for (const locale of Object.keys(DOC_CONTENT_BY_LOCALE) as DocsLang[]) {
      const map = DOC_CONTENT_BY_LOCALE[locale]
      if (map[p] || map[`${without}/`]) return map[p] ? p : `${without}/`
    }
    return without
  }
  for (const locale of Object.keys(DOC_CONTENT_BY_LOCALE) as DocsLang[]) {
    const map = DOC_CONTENT_BY_LOCALE[locale]
    if (map[p]) return p
    if (map[`${p}/`]) return `${p}/`
  }
  return p
}

const FALLBACK_ORDER: DocsLang[] = ['zh-CN', 'en', 'zh-TW', 'ja']

export function getDocMarkdown(pathname: string, locale: DocsLang): string | undefined {
  const path = normalizePath(pathname)
  const primary = DOC_CONTENT_BY_LOCALE[locale]?.[path]
  if (primary) return primary
  for (const fb of FALLBACK_ORDER) {
    if (fb === locale) continue
    const hit = DOC_CONTENT_BY_LOCALE[fb]?.[path]
    if (hit) return hit
  }
  return undefined
}

export function findDocMeta(
  pathname: string,
): { groupKey: string; pageKey: string; path: string } | null {
  const path = normalizePath(pathname)
  for (const group of DOC_GROUP_DEFS) {
    for (const item of group.items) {
      if (item.path === path || item.path === `${path}/` || `${item.path}` === path) {
        return { groupKey: group.groupKey, pageKey: item.pageKey, path: item.path }
      }
    }
  }
  return null
}

export function findLegalPageKey(pathname: string): string | null {
  const path = normalizePath(pathname)
  return LEGAL_LINK_DEFS.find((l) => l.path === path || l.path === `${path}/`)?.pageKey ?? null
}

export function isHelpDocPath(pathname: string): boolean {
  const p = normalizePath(pathname)
  return p.startsWith('/guide/') || p.startsWith('/features/') || p === '/faq' || p.startsWith('/faq/')
}

export function isLegalPath(pathname: string): boolean {
  return normalizePath(pathname).startsWith('/legal/')
}

/** @deprecated Prefer DOC_GROUP_DEFS + i18n. Kept for any leftover imports. */
export const DOC_GROUPS = DOC_GROUP_DEFS
/** @deprecated Prefer LEGAL_LINK_DEFS + i18n */
export const LEGAL_LINKS = LEGAL_LINK_DEFS
/** @deprecated Prefer getDocMarkdown */
export const DOC_CONTENT: Record<string, string> = DOC_CONTENT_BY_LOCALE['zh-CN']
