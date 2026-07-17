import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineClipboardDocument, HiOutlineInformationCircle } from 'react-icons/hi2';
import { Button, Dialog, Input, Tooltip, message } from '@/components/base';
import { Table, type TableColumn } from '@/components/base/table';
import {
  fetchAdminCardKeys,
  generateCardKeys,
  type AdminCardKeyDto,
} from '@/apis/wallet';
import {
  TOKENS_PER_CNY,
  TOKENS_PER_CNY_AT_COST,
  formatPriceInput,
  tokensFromPriceCny,
} from '@/lib/cardKeyPricing';
import { formatTokens } from '@/store/modules/wallet';
import { cn } from '@/utils/classnames';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Filter = 'all' | 'unused' | 'used';

type Row = AdminCardKeyDto & { code?: string | null };

const PAGE_SIZE = 15;

function formatTime(ts: number) {
  try {
    return new Date(ts * (ts < 1e12 ? 1000 : 1)).toLocaleString(undefined, {
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

/** Admin dialog — mint card keys and list inventory (BillingDialog-style table). */
export default function AdminCardKeysDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [plaintextById, setPlaintextById] = useState<Record<string, string>>({});
  const [count, setCount] = useState('10');
  /** Sell price in CNY (Xianyu listing) — tokens are derived from this. */
  const [priceCny, setPriceCny] = useState('9.9');

  const tokens = useMemo(() => {
    const n = Number(priceCny);
    return tokensFromPriceCny(Number.isFinite(n) ? n : 0);
  }, [priceCny]);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminCardKeys(filter === 'all' ? 'all' : filter);
      setRows(res.keys || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setPlaintextById({});
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open/filter only
  }, [open, filter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [rows.length, page]);

  const displayRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        code: plaintextById[r.id] || r.code || null,
      })),
    [rows, plaintextById]
  );

  const copyText = async (text: string, okKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t(okKey));
    } catch {
      message.error(t('adminKeys.copyFailed'));
    }
  };

  const onGenerate = async () => {
    const n = Math.floor(Number(count));
    const price = Number(priceCny);
    const tok = tokens;
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      message.error(t('adminKeys.invalidCount'));
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      message.error(t('adminKeys.invalidPrice'));
      return;
    }
    if (!Number.isFinite(tok) || tok < 1) {
      message.error(t('adminKeys.invalidTokens'));
      return;
    }
    setBusy(true);
    try {
      const res = await generateCardKeys({ count: n, tokens: tok, expiresDays: 0 });
      const minted = res.keys || [];
      const nextMap: Record<string, string> = {};
      for (const k of minted) {
        if (k.id && k.code) nextMap[k.id] = k.code;
      }
      setPlaintextById((prev) => ({ ...prev, ...nextMap }));
      setFilter('unused');
      message.success(t('adminKeys.generated', { count: minted.length }));
      const list = await fetchAdminCardKeys('unused');
      setRows(list.keys || []);
      setPage(1);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || t('adminKeys.failed');
      message.error(typeof detail === 'string' ? detail : t('adminKeys.failed'));
    } finally {
      setBusy(false);
    }
  };

  const copyVisiblePlain = async () => {
    const codes = displayRows.map((r) => r.code).filter(Boolean) as string[];
    if (!codes.length) {
      message.warning(t('adminKeys.noPlaintext'));
      return;
    }
    await copyText(codes.join('\n'), 'adminKeys.copiedAll');
  };

  const exportJson = () => {
    if (!displayRows.length) {
      message.warning(t('adminKeys.empty'));
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      filter,
      count: displayRows.length,
      keys: displayRows.map((r) => ({
        id: r.id,
        code: r.code || null,
        tokens: r.tokens,
        status: r.status,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt ?? null,
        redeemedAt: r.redeemedAt ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `recombyn-card-keys-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('adminKeys.exportedJson'));
  };

  const columns = useMemo<TableColumn[]>(
    () => [
      {
        title: t('adminKeys.colTime'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 148,
        render: (value) => (
          <span className="whitespace-nowrap text-[12px]">{formatTime(Number(value))}</span>
        ),
      },
      {
        title: t('adminKeys.colStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 88,
        render: (value) => {
          if (value === 'used') return t('adminKeys.statusUsed');
          if (value === 'revoked') return t('adminKeys.statusRevoked');
          return t('adminKeys.statusUnused');
        },
      },
      {
        title: t('adminKeys.colTokens'),
        dataIndex: 'tokens',
        key: 'tokens',
        align: 'right',
        width: 100,
        render: (value) => (
          <span className="tabular-nums text-[var(--ink)]">{formatTokens(Number(value))}</span>
        ),
      },
      {
        title: t('adminKeys.colCode'),
        dataIndex: 'code',
        key: 'code',
        render: (value) => {
          const code = value ? String(value) : '';
          if (!code) {
            return <span className="text-[12px] text-[var(--muted)]">—</span>;
          }
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <code className="min-w-0 truncate font-mono text-[12px] tracking-wider text-[var(--ink)]">
                {code}
              </code>
              <button
                type="button"
                aria-label={t('adminKeys.copyOne')}
                onClick={() => void copyText(code, 'adminKeys.copiedOne')}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <HiOutlineClipboardDocument className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    [t]
  );

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('adminKeys.filterAll') },
    { id: 'unused', label: t('adminKeys.statusUnused') },
    { id: 'used', label: t('adminKeys.statusUsed') },
  ];

  return (
    <Dialog
      show={open}
      onClose={onClose}
      width={760}
      title={t('adminKeys.title')}
      titleClassName="!text-[16px] !font-semibold !pb-1"
      bodyClassName="pt-2"
      className="!w-full !bg-[var(--surface)] !p-6"
      footer={
        <>
          <Button size="small" type="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="small" type="default" onClick={exportJson}>
            {t('adminKeys.exportJson')}
          </Button>
          <Button size="small" type="default" onClick={() => void copyVisiblePlain()}>
            {t('adminKeys.copyAll')}
          </Button>
          <Button size="small" type="primary" loading={busy} onClick={() => void onGenerate()}>
            {t('adminKeys.generate')}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="min-w-0 text-[var(--muted)]">{t('adminKeys.hint')}</span>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[88px]">
          <span className="mb-1 block text-[11px] text-[var(--muted)]">{t('adminKeys.count')}</span>
          <Input
            value={count}
            onChange={(e: any) => setCount(String(e.target.value || ''))}
            className="!h-8 !w-[88px]"
          />
        </label>
        <label className="min-w-[120px]">
          <span className="mb-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
            {t('adminKeys.priceCny')}
            <Tooltip
              title={t('adminKeys.priceTip', {
                perCny: formatTokens(TOKENS_PER_CNY),
                atCost: formatTokens(TOKENS_PER_CNY_AT_COST),
              })}
              placement="top"
              popupClassName="!max-w-[280px] !whitespace-normal !text-left !leading-relaxed"
            >
              <span
                className="inline-flex cursor-help text-[var(--muted)] transition hover:text-[var(--ink)]"
                aria-label={t('adminKeys.priceTipAria')}
              >
                <HiOutlineInformationCircle className="h-3.5 w-3.5" />
              </span>
            </Tooltip>
          </span>
          <Input
            value={priceCny}
            onChange={(e: any) => setPriceCny(formatPriceInput(String(e.target.value || '')))}
            placeholder="9.9"
            className="!h-8 !w-[120px]"
          />
        </label>
        <div className="min-w-[140px]">
          <span className="mb-1 block text-[11px] text-[var(--muted)]">
            {t('adminKeys.tokensPerKey')}
          </span>
          <div className="flex h-8 items-center rounded-md bg-[var(--canvas)] px-2.5 text-[13px] font-medium tabular-nums text-[var(--ink)] ring-1 ring-[var(--line)]">
            {tokens > 0 ? formatTokens(tokens) : '—'}
          </div>
        </div>
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
        loading={loading}
        dataSource={displayRows as unknown as Record<string, unknown>[]}
        columns={columns}
        emptyText={t('adminKeys.empty')}
        scroll={{ y: 360 }}
        pagination={
          displayRows.length === 0
            ? false
            : {
                current: page,
                pageSize: PAGE_SIZE,
                total: displayRows.length,
                showSizeChanger: false,
                onChange: (next) => setPage(next),
              }
        }
        className="rounded-lg bg-[var(--surface)]"
      />
    </Dialog>
  );
}
