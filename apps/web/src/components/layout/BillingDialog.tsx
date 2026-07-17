import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '@/components/base';
import { Table, type TableColumn } from '@/components/base/table';
import { formatTokens, type LedgerEntry, type LedgerKind } from '@/store/modules/wallet';
import { cn } from '@/utils/classnames';
import RedeemDialog from '@/components/layout/RedeemDialog';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Filter = 'all' | LedgerKind;

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

export default function BillingDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const tokens = useSelector((state: any) => state.wallet?.tokens ?? 0);
  const ledger = useSelector((state: any) => state.wallet?.ledger ?? []) as LedgerEntry[];
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [redeemOpen, setRedeemOpen] = useState(false);

  const rows = useMemo(() => {
    if (filter === 'all') return ledger;
    return ledger.filter((e) => e.kind === filter);
  }, [ledger, filter]);

  useEffect(() => {
    if (open) setPage(1);
  }, [open, filter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [rows.length, page]);

  const columns = useMemo<TableColumn[]>(
    () => [
      {
        title: t('wallet.colTime'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 148,
        render: (value) => (
          <span className="whitespace-nowrap text-[12px]">{formatTime(Number(value))}</span>
        ),
      },
      {
        title: t('wallet.colType'),
        dataIndex: 'kind',
        key: 'kind',
        width: 80,
        render: (value) => {
          if (value === 'redeem') return t('wallet.typeRedeem');
          if (value === 'recharge') return t('wallet.typeRecharge');
          if (value === 'plan') return t('wallet.typePlan');
          return t('wallet.typeSpend');
        },
      },
      {
        title: t('wallet.colDetail'),
        key: 'detail',
        render: (_value, record) => {
          const row = record as LedgerEntry;
          if (row.kind === 'redeem') {
            return (
              <span className="text-[12px] text-[var(--ink)]">
                {row.detail || t('wallet.typeRedeem')}
              </span>
            );
          }
          return (
            <div className="min-w-0 py-0.5">
              <div className="truncate text-[12px] font-medium text-[var(--ink)]">
                {row.model || t('wallet.modelUnknown')}
              </div>
              <div className="truncate text-[11px] text-[var(--muted)]">
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
          );
        },
      },
      {
        title: t('wallet.colAmount'),
        dataIndex: 'amount',
        key: 'amount',
        align: 'right',
        width: 100,
        render: (value, record) => {
          const n = Number(value);
          const text = formatTokens(n);
          const kind = (record as LedgerEntry).kind;
          const positive = kind === 'redeem' || kind === 'recharge' || kind === 'plan';
          return (
            <span
              className={cn(
                'font-medium tabular-nums',
                positive ? 'text-[var(--ink)]' : 'text-red-500'
              )}
            >
              {positive ? `+${text}` : `-${text}`}
            </span>
          );
        },
      },
      {
        title: t('wallet.colBalance'),
        dataIndex: 'balanceAfter',
        key: 'balanceAfter',
        align: 'right',
        width: 100,
        render: (value) => (
          <span className="tabular-nums text-[var(--ink)]">{formatTokens(Number(value))}</span>
        ),
      },
    ],
    [t]
  );

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('wallet.filterAll') },
    { id: 'redeem', label: t('wallet.typeRedeem') },
    { id: 'spend', label: t('wallet.typeSpend') },
  ];

  return (
    <>
      <Dialog
        show={open}
        onClose={onClose}
        width={760}
        title={t('wallet.billingTitle')}
        titleClassName="!text-[16px] !font-semibold !pb-1"
        bodyClassName="pt-2"
        className="!w-full !bg-[var(--surface)] !p-6"
        footer={
          <>
            <Button size="small" type="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button size="small" type="primary" onClick={() => setRedeemOpen(true)}>
              {t('wallet.redeem')}
            </Button>
          </>
        }
      >
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="min-w-0 text-[var(--muted)]">{t('wallet.billingHint')}</span>
          <span className="max-w-full shrink truncate font-medium tabular-nums text-[var(--ink)]">
            {t('wallet.tokensLeft', { count: formatTokens(tokens) })}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {filters.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] transition',
                filter === id
                  ? 'bg-[var(--accent)] font-medium text-[var(--on-brand)]'
                  : 'bg-[var(--canvas)] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Table
          size="small"
          bordered
          rowKey="id"
          dataSource={rows as unknown as Record<string, unknown>[]}
          columns={columns}
          emptyText={t('wallet.billingEmpty')}
          scroll={{ y: 360 }}
          pagination={
            rows.length === 0
              ? false
              : {
                  current: page,
                  pageSize: PAGE_SIZE,
                  total: rows.length,
                  showSizeChanger: false,
                  onChange: (next) => setPage(next),
                }
          }
          className="rounded-lg bg-[var(--surface)]"
        />
      </Dialog>

      <RedeemDialog open={redeemOpen} onClose={() => setRedeemOpen(false)} />
    </>
  );
}
