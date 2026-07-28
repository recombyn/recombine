import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineComputerDesktop,
  HiOutlineDevicePhoneMobile,
  HiOutlinePhoto,
  HiOutlineRectangleStack,
} from 'react-icons/hi2';
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
  icon: typeof HiOutlineComputerDesktop;
  labelKey: string;
}> = [
  { id: 'poster', icon: HiOutlineRectangleStack, labelKey: 'homeCategories.poster' },
  { id: 'mobile', icon: HiOutlineDevicePhoneMobile, labelKey: 'homeCategories.mobile' },
  { id: 'website', icon: HiOutlineComputerDesktop, labelKey: 'homeCategories.website' },
  { id: 'image', icon: HiOutlinePhoto, labelKey: 'homeCategories.image' },
];

function resolveHeroLang(langRaw: string) {
  const lang = langRaw || '';
  const isZh = lang === 'zh-CN' || lang === 'zh-TW' || lang.startsWith('zh');
  const isJa = lang === 'ja' || lang.startsWith('ja');
  return { isZh, isJa, isLatinHero: !isZh && !isJa };
}

/**
 * Home hero — fig2: brand + tagline title, one-click lead, category pills, composer.
 */
export default function HomeHero({ onSubmit }: Props): ReactNode {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState<HomeAgentCategory>('poster');
  const lastDesignCategoryRef = useRef<HomeAgentCategory>('poster');
  const { isZh, isJa, isLatinHero } = resolveHeroLang(
    i18n.resolvedLanguage || i18n.language || ''
  );

  const setCategorySafe = (next: HomeAgentCategory) => {
    if (next !== 'image') lastDesignCategoryRef.current = next;
    setCategory(next);
  };

  /** Composer Image mode ↔ hero tabs. */
  const onComposerCategoryChange = (next: HomeAgentCategory) => {
    if (next === 'image') {
      setCategory('image');
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

  return (
    <section className="relative mx-auto mb-8 flex w-full max-w-[760px] shrink-0 flex-col items-center self-center px-1 pb-2 pt-[190px] text-center sm:mb-12 md:mb-[65px]">
      <div className="mb-6 flex w-full flex-col items-center">
        <h1
          className={cn(
            'flex flex-col items-center font-bold text-[var(--ink)] sm:block',
            isLatinHero
              ? 'text-[48px] leading-[1.12] tracking-[-0.02em] sm:text-[56px]'
              : 'text-[40px] leading-[1.2] tracking-[0.02em] sm:text-[48px]'
          )}
        >
          <span
            className="tracking-[-0.02em] sm:inline"
            style={{ fontFamily: 'var(--font-hero-en)' }}
          >
            {t('app.name')}
          </span>
          <span className="hidden sm:inline"> </span>
          <span
            className="sm:inline"
            style={{ fontFamily: isLatinHero ? 'var(--font-hero-en)' : 'var(--font-hero)' }}
          >
            {t('app.tagline')}
          </span>
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
