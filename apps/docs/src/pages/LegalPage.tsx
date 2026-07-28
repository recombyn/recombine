import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { findLegalPageKey, getDocMarkdown, normalizePath } from '@/data/nav'
import { MarkdownView } from '@/components/MarkdownView'
import { normalizeDocsLang } from '@/i18n'

export function LegalPage() {
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()
  const path = normalizePath(pathname)
  const locale = normalizeDocsLang(i18n.resolvedLanguage || i18n.language)
  const markdown = getDocMarkdown(path, locale)
  const pageKey = findLegalPageKey(path)

  useEffect(() => {
    const title = pageKey ? t(`pages.${pageKey}`) : null
    document.title = title ? `${title} · recombyn` : 'recombyn'
  }, [pageKey, t, i18n.language])

  if (!markdown) {
    return <Navigate to="/legal/terms" replace />
  }

  return <MarkdownView key={`${locale}:${path}`} className="legal-article" markdown={markdown} />
}
