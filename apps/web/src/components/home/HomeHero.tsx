import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineComputerDesktop,
  HiOutlineDevicePhoneMobile,
  HiOutlinePhoto,
  HiOutlineRectangleStack,
} from 'react-icons/hi2';
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

/** Home hero — brand mark, serif headline + lead, category pills, composer. */
export default function HomeHero({ onSubmit }: Props): ReactNode {
  const { t, i18n } = useTranslation();
  const [category, setCategory] = useState<HomeAgentCategory>('poster');
  const lang = i18n.resolvedLanguage || i18n.language || '';
  const isZh = lang === 'zh-CN' || lang === 'zh-TW' || lang.startsWith('zh');

  return (
    <section className="relative mx-auto flex w-full max-w-[760px] shrink-0 flex-col items-center self-center px-1 pb-2 pt-[240px] text-center sm:pt-[276px]">
      <div className="mb-3 flex flex-col items-center">
        <h1
          className={cn(
            'text-[36px] font-bold leading-[1.15] text-[var(--ink)] sm:text-[48px]',
            isZh ? 'tracking-[0.12em]' : 'tracking-tight'
          )}
          style={{ fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, serif' }}
        >
          {t('app.heroTitle')}
        </h1>
        <p
          className={cn(
            'mt-3 max-w-[min(100%,36rem)] font-sans text-[15px] leading-relaxed text-[var(--muted)] sm:mt-4 sm:text-[16px]',
            isZh && 'tracking-[0.08em]'
          )}
        >
          {t('app.heroLead')}
        </p>
      </div>

      <div
        className="mb-5 mt-5 inline-flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-[var(--line)] bg-[var(--slider-inactive)] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
        role="tablist"
        aria-label={t('app.name')}
      >
        {CATEGORIES.map(({ id, icon: Icon, labelKey }) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                'inline-flex min-w-[90px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              )}
              onClick={() => setCategory(id)}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      <div className="w-full text-left">
        <HomeAgentComposer category={category} onSubmit={onSubmit} />
      </div>
    </section>
  );
}
