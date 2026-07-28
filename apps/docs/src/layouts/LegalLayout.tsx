import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LEGAL_LINK_DEFS } from '@/data/nav'
import { LangSwitcher } from '@/components/LangSwitcher'

export function LegalLayout() {
  const { t } = useTranslation()

  return (
    <div className="legal-shell">
      <header className="legal-top">
        <div className="legal-top-inner">
          <Link className="legal-brand" to="/guide/getting-started">
            <img className="legal-mark" src="/logo-mark-light.png" width={22} height={22} alt="" />
            <span>recombyn</span>
          </Link>
          <div className="legal-top-actions">
            <LangSwitcher />
          </div>
        </div>
      </header>

      <main className="legal-main">
        <p className="legal-product" aria-hidden>
          recombyn
        </p>
        <Outlet />

        <nav className="legal-links" aria-label={t('legalNavAria')}>
          {LEGAL_LINK_DEFS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {t(`pages.${item.pageKey}`)}
            </NavLink>
          ))}
        </nav>
      </main>

      <footer className="legal-foot">
        <p>{t('legalTagline')}</p>
      </footer>
    </div>
  )
}
