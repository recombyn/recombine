import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheck } from 'react-icons/hi2';
import { Button, Dialog } from '@/components/base';
import { PLAN_CATALOG, PLAN_ORDER, type PlanId } from '@/utils/wallet';
import { cn } from '@/utils/classnames';

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Membership picker — free / plus / pro / ultra (monthly CNY only). */
export default function PlansDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const current = useSelector((state: any) => (state.wallet?.planId as PlanId) || 'free');
  const [picked, setPicked] = useState<PlanId>(current);

  useEffect(() => {
    if (open) setPicked(current);
  }, [open, current]);

  const rows = useMemo(
    () =>
      PLAN_ORDER.map((id) => {
        const def = PLAN_CATALOG[id];
        return {
          id,
          def,
          title: t(`wallet.plan.${id}`),
          blurb: t(`wallet.planBlurb.${id}`),
        };
      }),
    [t]
  );

  /** Paid checkout isn't live — open Usage in a new tab and auto-open redeem. */
  const submit = () => {
    onClose();
    window.open('/account?tab=usage&redeem=1', '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog
      show={open}
      onClose={onClose}
      width={520}
      title={t('wallet.plansTitle')}
      titleClassName="!text-[16px] !font-semibold"
      bodyClassName="pt-1"
      className="!w-full !bg-[var(--surface)] !p-6"
      footer={
        <>
          <Button size="small" type="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="small" type="primary" onClick={submit} disabled={picked === current}>
            {picked === current ? t('wallet.currentPlan') : t('wallet.switchPlan')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">{t('wallet.plansHint')}</p>

      <div className="flex flex-col gap-2">
        {rows.map(({ id, def, title, blurb }) => {
          const active = picked === id;
          const isCurrent = current === id;
          const priceLabel =
            def.priceCny === 0
              ? t('wallet.priceFree')
              : t('wallet.priceMonthly', { price: def.priceCny });
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPicked(id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition',
                active
                  ? 'border-[var(--ink)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line)] bg-[var(--canvas)] hover:border-[var(--muted)]'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  active
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--on-brand)]'
                    : 'border-[var(--line)]'
                )}
              >
                {active ? <HiOutlineCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[14px] font-semibold text-[var(--ink)]">{title}</span>
                  <span className="text-[12px] tabular-nums text-[var(--muted)]">{priceLabel}</span>
                  {def.recommended ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--ink)] ring-1 ring-[var(--ink)]/25">
                      {t('wallet.planRecommended')}
                    </span>
                  ) : null}
                  {isCurrent ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] ring-1 ring-[var(--line)]">
                      {t('wallet.currentPlan')}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-[var(--muted)]">
                  {blurb}
                </span>
                <span className="mt-1 block text-[11px] text-[var(--ink)]">
                  {t('wallet.creditsIncluded', { count: def.creditsIncluded })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
