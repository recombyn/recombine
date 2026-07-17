import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import HomeAgentComposer, {
  type HomeAgentSubmitPayload,
} from '@/components/home/HomeAgentComposer';

type Props = {
  onSubmit: (payload: HomeAgentSubmitPayload) => void;
};

/** Home hero: brand + composer. Style guides are internal (no skill chips). */
export default function HomeHero({ onSubmit }: Props): ReactNode {
  const { t } = useTranslation();

  return (
    <section className="relative mx-auto flex w-full max-w-[720px] flex-col items-center px-1 pb-2 pt-[186px] text-center">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ink)] text-[12px] font-bold tracking-tight text-[var(--on-brand)]">
          RY
        </span>
        <h1 className="text-[22px] font-semibold text-[var(--ink)] sm:text-[26px]">
          <span className="tracking-tight">{t('app.name')}</span>{' '}
          {/* CJK inherits normal tracking — do not inherit English tracking-tight. */}
          <span className="font-normal tracking-normal text-[var(--muted)]">
            {t('app.tagline')}
          </span>
        </h1>
      </div>
      <p className="mb-7 max-w-md text-[14px] leading-relaxed tracking-normal text-[var(--muted)]">
        {t('app.heroSubtitle')}
      </p>

      <div className="w-full text-left">
        <HomeAgentComposer onSubmit={onSubmit} />
      </div>
    </section>
  );
}
