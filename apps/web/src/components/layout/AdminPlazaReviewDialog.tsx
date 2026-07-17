import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Input, message } from '@/components/base';
import { Table, type TableColumn } from '@/components/base/table';
import {
  approvePlazaSubmission,
  fetchAdminPlazaList,
  rejectPlazaSubmission,
  type PlazaStatus,
  type PlazaSubmissionDto,
} from '@/apis/plaza';
import { cn } from '@/utils/classnames';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Filter = 'all' | PlazaStatus;

const PAGE_SIZE = 12;

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

/** Admin dialog — review plaza submissions (approve / reject). */
export default function AdminPlazaReviewDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('pending');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState<PlazaSubmissionDto[]>([]);
  const [rejectTarget, setRejectTarget] = useState<PlazaSubmissionDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminPlazaList(filter === 'all' ? 'all' : filter);
      setRows(res.items || []);
    } catch {
      setRows([]);
      message.error(t('plaza.adminLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPage(1);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open/filter
  }, [open, filter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [rows.length, page]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  const onApprove = async (row: PlazaSubmissionDto) => {
    setBusyId(row.id);
    try {
      await approvePlazaSubmission(row.id);
      message.success(t('plaza.adminApproved'));
      await reload();
    } catch {
      message.error(t('plaza.adminActionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onRejectConfirm = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await rejectPlazaSubmission(rejectTarget.id, rejectReason.trim() || undefined);
      message.success(t('plaza.adminRejected'));
      setRejectTarget(null);
      setRejectReason('');
      await reload();
    } catch {
      message.error(t('plaza.adminActionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'pending', label: t('plaza.filterPending') },
    { id: 'approved', label: t('plaza.filterApproved') },
    { id: 'rejected', label: t('plaza.filterRejected') },
    { id: 'all', label: t('plaza.filterAll') },
  ];

  const columns: TableColumn<PlazaSubmissionDto>[] = [
    {
      key: 'title',
      dataIndex: 'title',
      title: t('plaza.colTitle'),
      render: (_value, row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--ink)]">{row.title}</div>
          <div className="truncate text-[11px] text-[var(--muted)]">
            {row.authorName}
            {row.userId ? ` · ${row.userId}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      dataIndex: 'status',
      title: t('plaza.colStatus'),
      width: 96,
      render: (_value, row) => (
        <span
          className={cn(
            'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium',
            row.status === 'pending' && 'bg-amber-50 text-amber-800',
            row.status === 'approved' && 'bg-emerald-50 text-emerald-800',
            row.status === 'rejected' && 'bg-red-50 text-red-700'
          )}
        >
          {t(
            row.status === 'pending'
              ? 'plaza.statusPending'
              : row.status === 'approved'
                ? 'plaza.statusApproved'
                : 'plaza.statusRejected'
          )}
        </span>
      ),
    },
    {
      key: 'time',
      dataIndex: 'updatedAt',
      title: t('plaza.colTime'),
      width: 140,
      render: (_value, row) => (
        <span className="text-[12px] tabular-nums text-[var(--muted)]">
          {formatTime(row.updatedAt || row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: t('plaza.colActions'),
      width: 160,
      render: (_value, row) => (
        <div className="flex items-center gap-1.5">
          <Button
            size="small"
            type="primary"
            disabled={row.status === 'approved' || busyId === row.id}
            loading={busyId === row.id}
            onClick={() => void onApprove(row)}
          >
            {t('plaza.approve')}
          </Button>
          <Button
            size="small"
            type="default"
            disabled={row.status === 'rejected' || busyId === row.id}
            onClick={() => {
              setRejectTarget(row);
              setRejectReason('');
            }}
          >
            {t('plaza.reject')}
          </Button>
        </div>
      ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);

  return (
    <>
      <Dialog
        show={open}
        onClose={onClose}
        width={820}
        title={t('plaza.adminTitle')}
        titleClassName="!text-[16px] !font-semibold !pb-2"
        className="!bg-[var(--surface)] !p-5"
        footer={
          <Button size="small" type="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        }
      >
        <p className="mb-3 text-[12px] text-[var(--muted)]">{t('plaza.adminHint')}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] transition',
                filter === f.id
                  ? 'bg-[var(--accent)] text-[var(--on-brand)]'
                  : 'bg-[var(--canvas)] text-[var(--muted)] hover:text-[var(--ink)]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={pageRows}
          loading={loading}
          emptyText={t('plaza.adminEmpty')}
        />
        {rows.length > PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-[12px] text-[var(--muted)]">
            <button
              type="button"
              disabled={page <= 1}
              className="disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('home.cases.prev')}
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              className="disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('home.cases.next')}
            </button>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        show={Boolean(rejectTarget)}
        onClose={() => !busyId && setRejectTarget(null)}
        width={400}
        title={t('plaza.reject')}
        titleClassName="!text-[16px] !font-semibold !pb-2"
        className="!bg-[var(--surface)] !p-5"
        footer={
          <>
            <Button size="small" type="default" disabled={!!busyId} onClick={() => setRejectTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="small"
              type="primary"
              className="!border-red-500 !bg-red-500 hover:!bg-red-600"
              loading={!!busyId}
              onClick={() => void onRejectConfirm()}
            >
              {t('plaza.rejectConfirm')}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-[13px] text-[var(--muted)]">{t('plaza.rejectHint')}</p>
        <Input
          size="middle"
          type="filled"
          value={rejectReason}
          placeholder={t('plaza.rejectPlaceholder')}
          onChange={(e) => setRejectReason(e.target.value)}
          className="!rounded-md"
        />
      </Dialog>
    </>
  );
}
