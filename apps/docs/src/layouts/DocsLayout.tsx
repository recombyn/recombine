import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DOC_GROUP_DEFS, findDocMeta, isHelpDocPath } from '@/data/nav'
import { LangSwitcher } from '@/components/LangSwitcher'

const APP_URL = __APP_URL__

export function DocsLayout() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const meta = findDocMeta(pathname)

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <div className={`docs-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      <header className="docs-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="docs-mobile-toggle"
            aria-label={t('openMenu')}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <Link to="/guide/getting-started" className="docs-brand">
            <img src="/logo-mark.png" width={22} height={22} alt="" />
            <span className="docs-brand-text">
              <span className="docs-brand-name">recombyn</span>
              <span className="docs-brand-sub">{t('brandDocs')}</span>
            </span>
          </Link>
        </div>

        <nav className="docs-top-nav" aria-label={t('navAria')}>
          <a href={APP_URL}>{t('navHome')}</a>
          <Link
            to="/guide/getting-started"
            className={isHelpDocPath(pathname) ? 'active' : undefined}
          >
            {t('navDocs')}
          </Link>
        </nav>

        <div className="docs-top-actions">
          <LangSwitcher />
          <a className="docs-cta" href={APP_URL} target="_blank" rel="noopener noreferrer">
            {t('startCreating')}
          </a>
        </div>
      </header>

      <div className="docs-body">
        <aside className="docs-sidebar" aria-label={t('sidebarAria')}>
          {DOC_GROUP_DEFS.map((group) => (
            <div key={group.groupKey} className="docs-group">
              <h2 className="docs-group-title">{t(`groups.${group.groupKey}`)}</h2>
              <div className="docs-group-list">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => (isActive ? 'active' : undefined)}
                    end={item.path.endsWith('/')}
                  >
                    {t(`pages.${item.pageKey}`)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <main className="docs-main">
          <div className="docs-main-inner">
            {meta ? (
              <p className="docs-breadcrumb">
                {t(`groups.${meta.groupKey}`)} / {t(`pages.${meta.pageKey}`)}
              </p>
            ) : null}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
