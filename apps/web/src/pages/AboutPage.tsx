import { Link, useSearchParams } from 'react-router-dom';
import AppLogo from '@/components/base/AppLogo';
import { useTranslation } from 'react-i18next';
import { FaGithub } from 'react-icons/fa';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import { readReturnToParam } from '@/utils/authReturnTo';

const GITHUB_REPO = 'https://github.com/tianmeng1603/Recombine';

/** Public about page — personal project, open source, payment notes. */
export default function AboutPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const returnTo = readReturnToParam(searchParams);
  const backLabel = returnTo === '/home' ? t('about.backHome') : t('about.back');

  return (
    <div className="h-full overflow-y-auto bg-[var(--canvas)]">
      <div className="mx-auto w-full max-w-[640px] px-5 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Link
          to={returnTo}
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <header className="mt-8 flex items-center gap-3">
          <AppLogo size={44} />
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">
              {t('about.title')}
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">{t('app.name')}</p>
          </div>
        </header>

        <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-[var(--ink)]">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">{t('about.soloTitle')}</h2>
            <p className="text-[var(--muted)]">{t('about.soloBody')}</p>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">{t('about.openTitle')}</h2>
            <p className="text-[var(--muted)]">{t('about.openBody')}</p>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--ink)] ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
            >
              <FaGithub className="h-4 w-4" />
              {t('about.viewSource')}
            </a>
          </section>

          <section className="rounded-2xl bg-[var(--surface)] px-4 py-4 ring-1 ring-[var(--line)]">
            <h2 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">{t('about.payTitle')}</h2>
            <p className="text-[var(--muted)]">{t('about.payBody')}</p>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">{t('about.thanksTitle')}</h2>
            <p className="text-[var(--muted)]">{t('about.thanksBody')}</p>
          </section>
        </div>

        <p className="mt-12 text-center text-[11px] text-[var(--muted)]">
          <Link
            to="/terms"
            className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
          >
            {t('auth.terms')}
          </Link>
          <span className="mx-2 text-[var(--line)]">|</span>
          <Link
            to="/privacy"
            className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
          >
            {t('auth.privacy')}
          </Link>
          <span className="mx-2 text-[var(--line)]">|</span>
          {t('about.footer')}
        </p>
      </div>
    </div>
  );
}
