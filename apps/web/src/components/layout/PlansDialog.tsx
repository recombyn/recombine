import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheck } from 'react-icons/hi2';
import { Button, Dialog, message } from '@/components/base';
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  setPlan,
  type PlanId,
} from '@/store/modules/wallet';
import { cn } from '@/utils/classnames';

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Cursor-like plan picker (Hobby / Pro / Pro+ / Ultra / Teams).
 * Kept for future restore — current product uses card-key Token redeem instead.
 */
export default function PlansDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const current = useSelector((state: any) => (state.wallet?.planId as PlanId) || 'hobby');
  const [picked, setPicked] = useState<PlanId>(current);

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

  const submit = () => {
    dispatch(setPlan({ planId: picked, refreshCredits: true }));
    message.success(t('wallet.planChanged', { plan: t(`wallet.plan.${picked}`) }));
    onClose();
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
                  <span className="text-[12px] tabular-nums text-[var(--muted)]">
                    {def.priceUsd === 0
                      ? t('wallet.priceFree')
                      : def.perSeat
                        ? t('wallet.pricePerSeat', { price: def.priceUsd })
                        : t('wallet.priceMonthly', { price: def.priceUsd })}
                    {def.priceAnnualUsd != null
                      ? ` · ${t('wallet.priceAnnual', { price: def.priceAnnualUsd })}`
                      : ''}
                  </span>
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
