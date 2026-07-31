import type { ReactNode } from 'react';
import { useMemo, useRef, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineDevicePhoneMobile,
  HiOutlinePhoto,
  HiOutlinePlay,
  HiOutlineRectangleStack,
} from 'react-icons/hi2';
import AppLogo from '@/components/base/AppLogo';
import { SegmentedControl } from '@/components/base/segmented';
import HomeAgentComposer, {
  type HomeAgentCategory,
  type HomeAgentSubmitPayload,
} from '@/components/home/HomeAgentComposer';
import { cn } from '@/utils/classnames';

type Props = {
  onSubmit: (payload: HomeAgentSubmitPayload) => void;
};

const CATEGORIES: Array<{
  id: HomeAgentCategory;
  icon: typeof HiOutlinePhoto;
  labelKey: string;
}> = [
  { id: 'poster', icon: HiOutlineRectangleStack, labelKey: 'homeCategories.poster' },
  { id: 'mobile', icon: HiOutlineDevicePhoneMobile, labelKey: 'homeCategories.mobile' },
  { id: 'image', icon: HiOutlinePhoto, labelKey: 'homeCategories.image' },
  { id: 'video', icon: HiOutlinePlay, labelKey: 'homeCategories.video' },
];

function resolveHeroLang(langRaw: string) {
  const lang = langRaw || '';
  const isZh = lang === 'zh-CN' || lang === 'zh-TW' || lang.startsWith('zh');
  const isJa = lang === 'ja' || lang.startsWith('ja');
  return { isZh, isJa };
}

/** Logo + brand name — same line weight as tagline (Lovart-style). */
function HeroBrandMark({ size }: { size: number }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-[0.22em] align-middle">
      {/* Decorative; brand name follows for screen readers. */}
      <span aria-hidden className="inline-flex">
        <AppLogo size={size} className="translate-y-[0.02em]" />
      </span>
      <span>{t('app.name').toLowerCase()}</span>
    </span>
  );
}

/**
 * Home hero — EN: "{tagline} with [logo] Brand"; other locales: "[logo] Brand {tagline}".
 */
function HomeHero({ onSubmit }: Props): ReactNode {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState<HomeAgentCategory>('poster');
  const lastDesignCategoryRef = useRef<HomeAgentCategory>('poster');
  const { isZh, isJa } = resolveHeroLang(
    i18n.resolvedLanguage || i18n.language || ''
  );

  const setCategorySafe = (next: HomeAgentCategory) => {
    if (next !== 'image' && next !== 'video') lastDesignCategoryRef.current = next;
    setCategory(next);
  };

  /** Composer Image / Video mode ↔ hero tabs. */
  const onComposerCategoryChange = (next: HomeAgentCategory) => {
    if (next === 'image' || next === 'video') {
      setCategory(next);
      return;
    }
    setCategorySafe(lastDesignCategoryRef.current || 'poster');
  };

  const categoryOptions = useMemo(
    () =>
      CATEGORIES.map(({ id, icon: Icon, labelKey }) => {
        const text = t(labelKey);
        const active = category === id;
        return {
          value: id,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {/* Mobile inactive: icon-only; md+: always icon + label. */}
              <span className={cn(!active && 'max-md:sr-only')}>{text}</span>
            </span>
          ),
        };
      }),
    [t, category]
  );

  const logoPx = 24;
  const prefix = t('app.heroLinePrefix');
  const suffix = t('app.heroLineSuffix');

  return (
    <section className="relative mx-auto mb-8 flex w-full max-w-[760px] shrink-0 flex-col items-center self-center px-1 pb-2 pt-[190px] text-center sm:mb-12 md:mb-[65px]">
      <div className="mb-6 flex w-full flex-col items-center">
        <h1
          className={cn(
            'inline-flex flex-wrap items-center justify-center gap-x-[0.35em] gap-y-1 font-medium text-[var(--ink)]',
            'text-[26px] leading-[1.3] tracking-[-0.01em] sm:text-[28px] sm:leading-[1.25]',
            (isZh || isJa) && 'tracking-[0.01em]'
          )}
          style={{ fontFamily: 'var(--font-hero)' }}
        >
          {prefix ? <span>{prefix}</span> : null}
          <HeroBrandMark size={logoPx} />
          {suffix ? <span>{suffix}</span> : null}
        </h1>
        <p
          className={cn(
            'mt-5 max-w-[min(100%,36rem)] text-[14px] font-normal leading-[1.6] text-[var(--muted)] sm:text-[15px]',
            (isZh || isJa) && 'tracking-[0.02em]'
          )}
        >
          {t('app.heroLead')}
        </p>
      </div>

      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-6 flex w-full max-w-full justify-center">
          <SegmentedControl
            radius="full"
            size="md"
            aria-label={t('app.name')}
            className="w-max max-w-full"
            options={categoryOptions}
            value={category}
            onChange={setCategorySafe}
          />
        </div>
        <div className="text-left">
          <HomeAgentComposer
            category={category}
            onCategoryChange={onComposerCategoryChange}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </section>
  );
}

export default memo(HomeHero);
