import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fetchWalletLedger,
  type WalletLedgerDto,
  type WalletLedgerKindFilter,
} from '@/apis/wallet';
import PlansDialog from '@/components/layout/PlansDialog';
import RedeemDialog from '@/components/layout/RedeemDialog';
import { syncFromServer } from '@/store/modules/wallet';
import {
  PLAN_CATALOG,
  formatTokens,
  planLabelKey,
  type LedgerEntry,
  type PlanId,
} from '@/utils/wallet';
import { cn } from '@/utils/classnames';

type Filter = WalletLedgerKindFilter;

const PAGE_SIZE = 15;

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return String(ts);
  }
}

function toLedgerEntry(row: WalletLedgerDto): LedgerEntry {
  return {
    id: row.id,
    kind: row.kind as LedgerEntry['kind'],
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    detail: row.detail || '',
    createdAt: row.createdAt,
  };
}

function kindLabel(kind: LedgerEntry['kind'], t: (key: string) => string) {
  if (kind === 'redeem') return t('wallet.typeRedeem');
  if (kind === 'recharge') return t('wallet.typeRecharge');
  if (kind === 'plan') return t('wallet.typePlan');
  return t('wallet.typeSpend');
}

function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-[var(--account-card)] ring-1 ring-[var(--line)]',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Usage & billing — Free / Plus / Pro / Ultra + card-key redeem,
 * laid out in Cursor billing style (plan card → included credits → redeem → ledger).
 */
export default function WalletLedgerPanel() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const tokens = useSelector((state: any) => state.wallet?.tokens ?? 0);
  const planId = useSelector((state: any) => state.wallet?.planId ?? 'free') as PlanId;
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  /** PlansDialog → /account?tab=usage&redeem=1 opens Redeem card key. */
  useEffect(() => {
    const flag = (searchParams.get('redeem') || '').trim();
    if (!flag || flag === '0' || flag.toLowerCase() === 'false') return;
    setRedeemOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('redeem');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const plan = PLAN_CATALOG[planId] || PLAN_CATALOG.free;
  const planLabel = t(planLabelKey(planId));
  const planBlurb = t(`wallet.planBlurb.${planId}`);
  const priceLabel =
    plan.priceCny === 0
      ? t('wallet.priceFree')
      : t('wallet.priceMonthly', { price: plan.priceCny });
  const creditCap = Math.max(1, plan.creditsIncluded);
  const balance = Math.max(0, Number(tokens) || 0);
  /** Against monthly allotment only (extra card-key credits sit above the bar). */
  const planRemaining = Math.min(balance, creditCap);
  const planUsed = Math.max(0, creditCap - planRemaining);
  const usedPct = Math.min(100, Math.round((planUsed / creditCap) * 100));
  const remainPct = 100 - usedPct;
  const hasExtra = balance > creditCap;

  const load = useCallback(
    async (nextFilter: Filter, nextPage: number, signal?: { cancelled: boolean }) => {
      if (!signal?.cancelled) setLoading(true);
      try {
        const res = await fetchWalletLedger({
          page: nextPage,
          pageSize: PAGE_SIZE,
          kind: nextFilter,
        });
        if (signal?.cancelled) return;
        setRows((res.items || []).map(toLedgerEntry));
        setTotal(Number(res.total) || 0);
        setPage(Number(res.page) || nextPage);
        if (typeof res.tokens === 'number') {
          dispatch(syncFromServer({ tokens: res.tokens }));
        }
      } catch {
        if (signal?.cancelled) return;
        setRows([]);
        setTotal(0);
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [dispatch]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    setPage(1);
    void load(filter, 1, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [filter, load]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('wallet.filterAll') },
    { id: 'redeem', label: t('wallet.typeRedeem') },
    { id: 'spend', label: t('wallet.typeSpend') },
  ];

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const canPrev = page > 1;
  const canNext = page < pageCount;

  const goPage = (next: number) => {
    setPage(next);
    void load(filter, next);
  };

  const ghostBtn =
    'shrink-0 rounded-lg border border-[var(--line)] bg-[var(--account-card)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] transition hover:bg-[var(--accent-soft)]';
  const primaryBtn =
    'shrink-0 rounded-lg bg-[var(--ink)] px-3 py-1.5 text-[13px] font-medium text-[var(--on-brand)] transition hover:opacity-90';

  return (
    <>
      <div className="space-y-4">
        {/* Current plan — Free / Plus / Pro / Ultra */}
        <Card className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
          <div className="min-w-0 space-y-1">
            <div className="text-[15px] font-medium text-[var(--ink)]">{planLabel}</div>
            <div className="text-[13px] text-[var(--muted)]">
              {priceLabel}
              <span className="mx-1.5 text-[var(--line)]">·</span>
              {t('wallet.creditsIncluded', { count: formatTokens(plan.creditsIncluded) })}
            </div>
            <p className="pt-1 text-[13px] leading-relaxed text-[var(--muted)]">{planBlurb}</p>
          </div>
          <button type="button" onClick={() => setPlansOpen(true)} className={ghostBtn}>
            {planId === 'ultra' ? t('wallet.adjustPlan') : t('wallet.upgrade')}
          </button>
        </Card>

        {/* Plan credits (included) */}
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-3.5">
            <h2 className="text-[15px] font-medium text-[var(--ink)]">
              {t('wallet.includedCreditsTitle')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">{t('wallet.creditsTip')}</p>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[12px] text-[var(--muted)]">{t('wallet.creditsBalanceItem')}</div>
                <div className="mt-1 text-[22px] font-medium tabular-nums tracking-tight text-[var(--ink)]">
                  {formatTokens(balance)}
                </div>
              </div>
              <div className="text-right text-[12px] text-[var(--muted)]">
                {t('wallet.creditsIncluded', { count: formatTokens(plan.creditsIncluded) })}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
                <span className="text-[var(--muted)]">
                  {t('wallet.creditsUsedLabel', { count: formatTokens(planUsed) })}
                </span>
                <span className="font-medium text-[var(--ink)]">
                  {t('wallet.creditsRemainLabel', { count: formatTokens(planRemaining) })}
                </span>
              </div>
              <div
                className="flex h-2.5 overflow-hidden rounded-full"
                role="img"
                aria-label={t('wallet.creditsBarAria', {
                  used: formatTokens(planUsed),
                  remain: formatTokens(planRemaining),
                  total: formatTokens(creditCap),
                })}
              >
                {/* Used vs remaining of monthly allotment — two explicit colors */}
                <div
                  className="h-full bg-[var(--ink)] transition-[width]"
                  style={{ width: `${usedPct}%` }}
                />
                <div
                  className="h-full bg-[color-mix(in_srgb,var(--ink)_22%,transparent)] transition-[width]"
                  style={{ width: `${remainPct}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                {hasExtra
                  ? t('wallet.creditsExtraHint', {
                      extra: formatTokens(balance - creditCap),
                    })
                  : t('wallet.creditsBarHint', {
                      total: formatTokens(creditCap),
                    })}
              </p>
            </div>
          </div>
        </Card>

        {/* Card-key redeem — our payment channel */}
        <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-[var(--ink)]">{t('wallet.redeemTitle')}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
              {t('wallet.redeemSectionHint')}
            </p>
          </div>
          <button type="button" onClick={() => setRedeemOpen(true)} className={primaryBtn}>
            {t('wallet.redeem')}
          </button>
        </Card>

        {/* Ledger */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
            <h2 className="text-[15px] font-medium text-[var(--ink)]">
              {t('wallet.usageActivityTitle')}
            </h2>
            <div className="flex flex-wrap gap-1">
              {filters.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px] transition',
                    filter === id
                      ? 'bg-[var(--ink)] font-medium text-[var(--on-brand)]'
                      : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="px-5 py-2.5 text-[12px] font-medium text-[var(--muted)]">
                    {t('wallet.colTime')}
                  </th>
                  <th className="px-5 py-2.5 text-[12px] font-medium text-[var(--muted)]">
                    {t('wallet.colType')}
                  </th>
                  <th className="px-5 py-2.5 text-[12px] font-medium text-[var(--muted)]">
                    {t('wallet.colDetail')}
                  </th>
                  <th className="px-5 py-2.5 text-right text-[12px] font-medium text-[var(--muted)]">
                    {t('wallet.colAmount')}
                  </th>
                  <th className="px-5 py-2.5 text-right text-[12px] font-medium text-[var(--muted)]">
                    {t('wallet.colBalance')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-[13px] text-[var(--muted)]"
                    >
                      …
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-[13px] text-[var(--muted)]"
                    >
                      {t('wallet.billingEmpty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const positive =
                      row.kind === 'redeem' || row.kind === 'recharge' || row.kind === 'plan';
                    const amountText = formatTokens(Math.abs(Number(row.amount) || 0));
                    return (
                      <tr key={row.id} className="border-b border-[var(--line)] last:border-b-0">
                        <td className="whitespace-nowrap px-5 py-3 text-[13px] text-[var(--ink)]">
                          {formatTime(row.createdAt)}
                        </td>
                        <td className="px-5 py-3 text-[13px] text-[var(--ink)]">
                          {kindLabel(row.kind, t)}
                        </td>
                        <td className="max-w-[300px] px-5 py-3">
                          {row.kind === 'redeem' ? (
                            <span className="text-[13px] text-[var(--ink)]">
                              {row.detail || t('wallet.typeRedeem')}
                            </span>
                          ) : (
                            <div className="min-w-0">
                              <div className="truncate text-[13px] text-[var(--ink)]">
                                {row.model || t('wallet.modelUnknown')}
                              </div>
                              <div className="truncate text-[12px] text-[var(--muted)]">
                                {[
                                  row.detail,
                                  row.usageTokens != null
                                    ? t('wallet.tokensCount', { count: row.usageTokens })
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </div>
                            </div>
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3 text-right text-[13px] tabular-nums',
                            positive ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
                          )}
                        >
                          {positive ? `+${amountText}` : `-${amountText}`}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] tabular-nums text-[var(--ink)]">
                          {formatTokens(row.balanceAfter)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3">
              <div className="text-[12px] text-[var(--muted)]">
                {t('wallet.ledgerShowing', {
                  start: rangeStart,
                  end: rangeEnd,
                  total,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canPrev}
                  onClick={() => goPage(page - 1)}
                  className="rounded-md border border-[var(--line)] px-3 py-1 text-[12px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('wallet.ledgerPrev')}
                </button>
                <span className="text-[12px] tabular-nums text-[var(--muted)]">
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => goPage(page + 1)}
                  className="rounded-md border border-[var(--line)] px-3 py-1 text-[12px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('wallet.ledgerNext')}
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <RedeemDialog
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        onRedeemed={() => void load(filter, 1)}
      />
      <PlansDialog open={plansOpen} onClose={() => setPlansOpen(false)} />
    </>
  );
}
