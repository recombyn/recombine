import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS, normalizeDocsLang, type DocsLang } from '@/i18n'

export function LangSwitcher(): ReactNode {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = normalizeDocsLang(i18n.resolvedLanguage || i18n.language)
  const currentLabel =
    SUPPORTED_LANGS.find((l) => l.code === current)?.label || current

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (code: DocsLang) => {
    setOpen(false)
    if (code === current) return
    void i18n.changeLanguage(code)
  }

  return (
    <div className="docs-lang" ref={rootRef}>
      <button
        type="button"
        className="docs-lang-btn"
        aria-label={t('langLabel')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="docs-lang-globe" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
        <span className="docs-lang-label">{currentLabel}</span>
        <svg className="docs-lang-caret" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open ? (
        <ul className="docs-lang-menu" role="listbox" aria-label={t('langLabel')}>
          {SUPPORTED_LANGS.map((lang) => (
            <li key={lang.code} role="option" aria-selected={lang.code === current}>
              <button
                type="button"
                className={lang.code === current ? 'active' : undefined}
                onClick={() => pick(lang.code)}
              >
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
