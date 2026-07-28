import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { findDocMeta, getDocMarkdown, normalizePath } from '@/data/nav'
import { MarkdownView } from '@/components/MarkdownView'
import { normalizeDocsLang } from '@/i18n'

export function DocPage() {
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()
  const path = normalizePath(pathname)
  const locale = normalizeDocsLang(i18n.resolvedLanguage || i18n.language)
  const markdown = getDocMarkdown(path, locale)
  const meta = findDocMeta(path)

  useEffect(() => {
    const title = meta ? t(`pages.${meta.pageKey}`) : null
    document.title = title ? `${title} · ${t('docTitleSuffix')}` : t('docTitleSuffix')
  }, [meta, t, i18n.language])

  if (!markdown) {
    return <Navigate to="/guide/getting-started" replace />
  }

  return <MarkdownView key={`${locale}:${path}`} className="docs-article" markdown={markdown} />
}
