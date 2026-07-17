import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft } from 'react-icons/hi2';

export type LegalKind = 'terms' | 'privacy';

type LegalSection = { title: string; body: string };

type LegalPageProps = {
  kind: LegalKind;
};

/** Public Terms of Service / Privacy Policy pages. */
export default function LegalPage({ kind }: LegalPageProps) {
  const { t } = useTranslation();

  const title = t(`legal.${kind}.title`);
  const updated = t(`legal.${kind}.updated`);
  const sections = t(`legal.${kind}.sections`, {
    returnObjects: true,
  }) as LegalSection[];
  const list = Array.isArray(sections) ? sections : [];

  const other: LegalKind = kind === 'terms' ? 'privacy' : 'terms';

  return (
    <div className="h-full overflow-y-auto bg-[var(--canvas)]">
      <div className="mx-auto w-full max-w-[640px] px-5 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
          {t('legal.backHome')}
        </Link>

        <header className="mt-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ink)] text-[13px] font-bold tracking-tight text-[var(--on-brand)]">
              RY
            </span>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">
                {title}
              </h1>
              <p className="mt-0.5 text-[13px] text-[var(--muted)]">{t('app.name')}</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-[var(--muted)]">{updated}</p>
        </header>

        <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-[var(--ink)]">
          {list.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">
                {section.title}
              </h2>
              <p className="whitespace-pre-line text-[var(--muted)]">{section.body}</p>
            </section>
          ))}
        </div>

        <nav className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]">
          <Link
            to={`/${other}`}
            className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
          >
            {t(`legal.${other}.title`)}
          </Link>
          <span className="text-[var(--line)]">·</span>
          <Link
            to="/about"
            className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
          >
            {t('about.title')}
          </Link>
        </nav>

        <p className="mt-12 text-center text-[11px] text-[var(--muted)]">
          {t('legal.footer', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}
