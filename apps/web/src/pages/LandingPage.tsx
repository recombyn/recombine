import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowRight,
  HiOutlineGlobeAlt,
  HiOutlineChevronDown,
} from 'react-icons/hi2';
import { SUPPORTED_LANGS } from '@/i18n';
import {
  absoluteLocaleUrl,
  buildLocaleSwitchUrl,
  normalizeI18nLang,
} from '@/i18n/localePath';
import { docsUrl } from '@/utils/docsUrl';
import { cn } from '@/utils/classnames';
import './LandingPage.css';

const SITE_ORIGIN_PROD = 'https://recombyn.com';

type GlyphProps = { className?: string };

/** Brand-toned glyphs — filled ink + jade accent (not generic outline icons). */
function IconChat({ className }: GlyphProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M7 8.5c0-1.4 1.1-2.5 2.5-2.5h13c1.4 0 2.5 1.1 2.5 2.5v9c0 1.4-1.1 2.5-2.5 2.5H14.2L9.8 24.2c-.55.4-1.3 0-1.3-.65V20H9.5C8.1 20 7 18.9 7 17.5v-9Z"
        fill="currentColor"
        opacity="0.92"
      />
      <circle cx="12.2" cy="13" r="1.35" fill="var(--lp-paper)" />
      <circle cx="16" cy="13" r="1.35" fill="var(--lp-paper)" />
      <circle cx="19.8" cy="13" r="1.35" fill="var(--lp-paper)" />
      <path
        d="M22.5 6.5h1.2c1.5 0 2.8 1.2 2.8 2.8v6.2c0 1.1-.9 2-2 2h-.5"
        stroke="var(--lp-signal)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

function IconCanvas({ className }: GlyphProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="2.5" fill="currentColor" opacity="0.9" />
      <rect
        x="12"
        y="12"
        width="16"
        height="14"
        rx="2.5"
        fill="var(--lp-signal)"
        opacity="0.88"
      />
      <path
        d="M16 16.5h8M16 20h5.5"
        stroke="var(--lp-paper)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="9.2" cy="10.2" r="1.2" fill="var(--lp-paper)" opacity="0.85" />
    </svg>
  );
}

function IconLayers({ className }: GlyphProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 5.5 27 12.2 16 18.9 5 12.2 16 5.5Z"
        fill="currentColor"
        opacity="0.88"
      />
      <path
        d="M5 16.2 16 22.9 27 16.2"
        stroke="var(--lp-signal)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20.4 16 27.1 27 20.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
    </svg>
  );
}

function IconPoster({ className }: GlyphProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="8" y="4" width="16" height="24" rx="2.5" fill="currentColor" opacity="0.9" />
      <rect x="11" y="8" width="10" height="2.2" rx="1.1" fill="var(--lp-paper)" />
      <rect x="11" y="12" width="7" height="1.6" rx="0.8" fill="var(--lp-paper)" opacity="0.7" />
      <rect x="11" y="18" width="10" height="6" rx="1.5" fill="var(--lp-signal)" />
    </svg>
  );
}

function IconMobile({ className }: GlyphProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="10" y="3.5" width="12" height="25" rx="3" fill="currentColor" opacity="0.9" />
      <rect x="12.5" y="7.5" width="7" height="12" rx="1.2" fill="var(--lp-signal)" />
      <rect x="13.5" y="23.5" width="5" height="1.8" rx="0.9" fill="var(--lp-paper)" opacity="0.75" />
    </svg>
  );
}

function IconWebsite({ className }: GlyphProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="3.5" y="6" width="25" height="16.5" rx="2.5" fill="currentColor" opacity="0.9" />
      <rect x="5.5" y="8.5" width="21" height="11.5" rx="1.2" fill="var(--lp-paper)" />
      <path d="M5.5 11.2h21" stroke="currentColor" strokeWidth="1.4" opacity="0.25" />
      <rect x="7.2" y="13.2" width="7" height="5" rx="1" fill="var(--lp-signal)" />
      <rect x="16" y="13.2" width="8.5" height="1.4" rx="0.7" fill="currentColor" opacity="0.35" />
      <rect x="16" y="16.2" width="6" height="1.4" rx="0.7" fill="currentColor" opacity="0.25" />
      <path d="M12 25.5h8M16 22.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconImage({ className }: GlyphProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="4" y="6" width="24" height="20" rx="3" fill="currentColor" opacity="0.9" />
      <circle cx="11.5" cy="13" r="2.2" fill="var(--lp-paper)" />
      <path
        d="M6.5 22.5 12 16.5l4.2 4.2 3.3-3.8 5.5 5.6H6.5Z"
        fill="var(--lp-signal)"
      />
    </svg>
  );
}

function siteOrigin(): string {
  if (typeof window === 'undefined') return SITE_ORIGIN_PROD;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return window.location.origin;
  return SITE_ORIGIN_PROD;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function normalizeLandingLang(raw: string | undefined): string {
  return normalizeI18nLang(raw);
}

/** Compact language menu — switches URL prefix (`/`, `/zh`, `/zh-tw`, `/ja`). */
function LandingLangSwitcher(): ReactNode {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = normalizeLandingLang(i18n.resolvedLanguage || i18n.language);
  const currentLabel = t(`lang.${current}`);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="landing-lang" ref={rootRef}>
      <button
        type="button"
        className="landing-lang-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('lang.label')}
        onClick={() => setOpen((v) => !v)}
      >
        <HiOutlineGlobeAlt className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        <span className="landing-lang-label">{currentLabel}</span>
        <HiOutlineChevronDown
          className={cn('landing-lang-chevron h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="landing-lang-menu" role="listbox" aria-label={t('lang.label')}>
          {SUPPORTED_LANGS.map((item) => {
            const active = item.code === current;
            return (
              <li key={item.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={cn('landing-lang-item', active && 'is-active')}
                  onClick={() => {
                    setOpen(false);
                    if (item.code === current) return;
                    // Full navigation remounts BrowserRouter with the new basename.
                    window.location.assign(buildLocaleSwitchUrl(item.code));
                  }}
                >
                  {t(item.labelKey)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

type LandingSeoProps = {
  title: string;
  description: string;
  locale: string;
};

const OG_LOCALE: Record<string, string> = {
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
  ja: 'ja_JP',
  en: 'en_US',
};

const HTML_LANG: Record<string, string> = {
  'zh-TW': 'zh-Hant',
  'zh-CN': 'zh-CN',
  ja: 'ja',
  en: 'en',
};

/** Document head for marketing `/` — title, OG/Twitter, canonical, JSON-LD. */
function applyLandingSeo({ title, description, locale }: LandingSeoProps) {
  const origin = siteOrigin();
  const lang = normalizeI18nLang(locale);
  const url = absoluteLocaleUrl(origin, lang, '/');
  const image = `${origin}/logo-mark.png`;
  const ogLocale = OG_LOCALE[lang] || OG_LOCALE.en;
  const htmlLang = HTML_LANG[lang] || HTML_LANG.en;

  document.title = title;
  document.documentElement.lang = htmlLang;

  upsertMeta('name', 'description', description);
  upsertMeta('name', 'robots', 'index,follow,max-image-preview:large');
  upsertMeta('name', 'keywords', 'Recombyn,AI设计,Agent设计,无限画布,海报设计,UI设计,智能设计工具');
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', 'Recombyn');
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:url', url);
  upsertMeta('property', 'og:image', image);
  upsertMeta('property', 'og:locale', ogLocale);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', image);
  upsertLink('canonical', url);

  // hreflang: en unprefixed; others /zh /zh-tw /ja.
  for (const [hreflang, i18nCode] of [
    ['en', 'en'],
    ['zh-CN', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['ja', 'ja'],
    ['x-default', 'en'],
  ] as const) {
    const href = absoluteLocaleUrl(origin, i18nCode, '/');
    let el = document.head.querySelector(
      `link[rel="alternate"][hreflang="${hreflang}"]`
    ) as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement('link');
      el.rel = 'alternate';
      el.hreflang = hreflang;
      document.head.appendChild(el);
    }
    el.href = href;
  }

  upsertJsonLd('recombyn-ld-org', {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Recombyn',
    url: origin,
    logo: image,
    sameAs: [],
  });
  upsertJsonLd('recombyn-ld-app', {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Recombyn',
    url,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'CNY',
    },
  });
  upsertJsonLd('recombyn-ld-website', {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Recombyn',
    url: origin,
    description,
    inLanguage: ['en', 'zh-CN', 'zh-TW', 'ja'],
  });
}

function useRevealOnScroll() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { root: null, threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return rootRef;
}

/** Public marketing homepage — brand-first, SEO-ready, scrollable. */
export default function LandingPage(): ReactNode {
  const { t, i18n } = useTranslation();
  const revealRef = useRevealOnScroll();
  const lang = i18n.resolvedLanguage || i18n.language || 'zh-CN';

  useEffect(() => {
    applyLandingSeo({
      title: t('landing.seoTitle'),
      description: t('landing.seoDescription'),
      locale: lang,
    });
  }, [t, lang]);

  // Unlock window scroll — app shell locks html/body/#root for the editor.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('landing-scroll');
    return () => root.classList.remove('landing-scroll');
  }, []);

  const year = new Date().getFullYear();
  const features = [
    {
      tone: 'chat',
      icon: IconChat,
      title: t('landing.featureChatTitle'),
      body: t('landing.featureChatBody'),
    },
    {
      tone: 'canvas',
      icon: IconCanvas,
      title: t('landing.featureCanvasTitle'),
      body: t('landing.featureCanvasBody'),
    },
    {
      tone: 'layers',
      icon: IconLayers,
      title: t('landing.featureEditTitle'),
      body: t('landing.featureEditBody'),
    },
  ] as const;

  const steps = [
    { n: '01', title: t('landing.step1Title'), body: t('landing.step1Body') },
    { n: '02', title: t('landing.step2Title'), body: t('landing.step2Body') },
    { n: '03', title: t('landing.step3Title'), body: t('landing.step3Body') },
  ] as const;

  const scenes = [
    { tone: 'poster', icon: IconPoster, label: t('homeCategories.poster') },
    { tone: 'mobile', icon: IconMobile, label: t('homeCategories.mobile') },
    { tone: 'website', icon: IconWebsite, label: t('homeCategories.website') },
    { tone: 'image', icon: IconImage, label: t('homeCategories.image') },
  ] as const;

  return (
    <div className="landing-page" ref={revealRef}>
      <a href="#main" className="landing-skip">
        {t('landing.skipToContent')}
      </a>

      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-start">
            <Link to="/" className="landing-brand" aria-label="Recombyn">
              <img src="/logo-mark.svg" alt="" width={26} height={26} className="landing-brand-mark" />
              <span className="landing-brand-word">recombyn</span>
            </Link>
            <nav className="landing-nav-links" aria-label={t('landing.navLabel')}>
              <a href="#features">{t('landing.navFeatures')}</a>
              <a href="#workflow">{t('landing.navWorkflow')}</a>
              <a href="#scenes">{t('landing.navScenes')}</a>
            </nav>
          </div>
          <div className="landing-nav-actions">
            <LandingLangSwitcher />
            <Link to="/home" className="landing-link-quiet">
              {t('landing.navOpenApp')}
            </Link>
            <span className="landing-nav-divider" aria-hidden />
            <Link to="/home?login=1" className="landing-btn landing-btn-primary landing-btn-nav">
              {t('landing.ctaStart')}
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-atmosphere" aria-hidden>
            <span className="landing-orb landing-orb-a" />
            <span className="landing-orb landing-orb-b" />
            <span className="landing-grid" />
            <span className="landing-grain" />
          </div>

          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow landing-fade-in">{t('landing.eyebrow')}</p>
              <h1 id="landing-hero-title" className="landing-h1 landing-fade-in landing-delay-1">
                <span className="landing-h1-brand">Recombyn</span>
                <span className="landing-h1-rest">{t('landing.heroRest')}</span>
              </h1>
              <p className="landing-hero-lead landing-fade-in landing-delay-2">
                {t('landing.heroLead')}
              </p>
              <div className="landing-hero-cta landing-fade-in landing-delay-3">
                <Link to="/home" className="landing-btn landing-btn-primary landing-btn-lg">
                  {t('landing.ctaPrimary')}
                  <HiOutlineArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <a href="#features" className="landing-btn landing-btn-ghost landing-btn-lg">
                  {t('landing.ctaSecondary')}
                </a>
              </div>
            </div>

            <div className="landing-hero-stage landing-fade-in landing-delay-4">
              <img
                className="landing-ink-visual"
                src="/landing-hero-pen.png?v=cutout"
                alt=""
                width={1024}
                height={1024}
                decoding="async"
                fetchPriority="high"
              />
            </div>
          </div>
        </section>

        <section id="features" className="landing-section" aria-labelledby="features-title">
          <div className="landing-section-inner">
            <header className="landing-section-head" data-reveal>
              <h2 id="features-title">{t('landing.featuresTitle')}</h2>
              <p>{t('landing.featuresLead')}</p>
            </header>
            <ul className="landing-feature-grid">
              {features.map((f, i) => (
                <li
                  key={f.title}
                  className="landing-feature-card"
                  data-reveal
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <span className={cn('landing-feature-icon', `is-${f.tone}`)}>
                    <f.icon className="landing-glyph" />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="workflow" className="landing-section landing-section-soft" aria-labelledby="workflow-title">
          <div className="landing-section-inner">
            <header className="landing-section-head" data-reveal>
              <h2 id="workflow-title">{t('landing.workflowTitle')}</h2>
              <p>{t('landing.workflowLead')}</p>
            </header>
            <ol className="landing-steps">
              {steps.map((s, i) => (
                <li
                  key={s.n}
                  className="landing-step"
                  data-reveal
                  style={{ transitionDelay: `${i * 90}ms` }}
                >
                  <span className="landing-step-n">{s.n}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="scenes" className="landing-section" aria-labelledby="scenes-title">
          <div className="landing-section-inner">
            <header className="landing-section-head" data-reveal>
              <h2 id="scenes-title">{t('landing.scenesTitle')}</h2>
              <p>{t('landing.scenesLead')}</p>
            </header>
            <ul className="landing-scenes" data-reveal>
              {scenes.map((s) => (
                <li key={s.label} className={cn('landing-scene-pill', `is-${s.tone}`)}>
                  <span className="landing-scene-icon">
                    <s.icon className="landing-glyph" />
                  </span>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-closing" aria-labelledby="closing-title">
          <div className="landing-closing-inner" data-reveal>
            <h2 id="closing-title">{t('landing.closingTitle')}</h2>
            <p>{t('landing.closingLead')}</p>
            <Link to="/home" className={cn('landing-btn', 'landing-btn-primary', 'landing-btn-lg')}>
              {t('landing.ctaPrimary')}
              <HiOutlineArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <img src="/logo-mark.svg" alt="" width={22} height={22} />
            <span>recombyn</span>
          </div>
          <nav className="landing-footer-links" aria-label={t('landing.footerNav')}>
            <a href={docsUrl('/guide/getting-started')} target="_blank" rel="noopener noreferrer">
              {t('landing.footerGuide')}
            </a>
            <a href={docsUrl('/legal/privacy')} target="_blank" rel="noopener noreferrer">
              {t('landing.footerPrivacy')}
            </a>
            <a href={docsUrl('/legal/terms')} target="_blank" rel="noopener noreferrer">
              {t('landing.footerTerms')}
            </a>
            <Link to="/home">{t('landing.navOpenApp')}</Link>
          </nav>
          <p className="landing-footer-copy">{t('landing.footerCopy', { year })}</p>
        </div>
      </footer>
    </div>
  );
}
