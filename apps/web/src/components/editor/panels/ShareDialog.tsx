import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineClipboardDocument, HiOutlineLink } from 'react-icons/hi2';
import { createShareApi, updateShareDocumentApi, type ShareDto } from '@/apis/shares';
import { Dialog, message } from '@/components/base';
import { copyText, shareCopyText, shareUrl, type SharePermission } from '@/utils/shareStorage';
import { cn } from '@/utils/classnames';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ShareDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const document = useSelector((s: any) => s.editor.document);
  const currentId = useSelector((s: any) => s.editor.currentId as string | null);
  const templates = useSelector((s: any) => s.editor.templates as Array<{ id: string; name?: string }>);
  const projectName =
    templates.find((tItem) => tItem.id === currentId)?.name ||
    String(document?.name || '') ||
    t('home.untitled', { defaultValue: '未命名作品' });

  const [permission, setPermission] = useState<SharePermission>('preview');
  const [record, setRecord] = useState<ShareDto | null>(null);
  const [busy, setBusy] = useState(false);

  // Create server share when dialog opens or permission switches.
  useEffect(() => {
    if (!open) {
      setRecord(null);
      return;
    }
    if (!document) {
      setRecord(null);
      message.warning(t('editor.shareNoDocument'));
      return;
    }
    let cancelled = false;
    setBusy(true);
    void createShareApi({
      document,
      name: projectName,
      permission,
      sourceProjectId: currentId || undefined,
    })
      .then((res) => {
        if (!cancelled) setRecord(res.share);
      })
      .catch(() => {
        if (!cancelled) {
          setRecord(null);
          message.error(t('editor.shareCopyFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // Snapshot only at open / permission change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, permission]);

  const url = useMemo(() => (record ? shareUrl(record.id) : ''), [record]);

  const ensureShare = async (): Promise<ShareDto | null> => {
    if (!document) {
      message.warning(t('editor.shareNoDocument'));
      return null;
    }
    if (record && record.permission === permission) {
      try {
        const res = await updateShareDocumentApi(record.id, document);
        setRecord(res.share);
        return res.share;
      } catch {
        return record;
      }
    }
    try {
      const res = await createShareApi({
        document,
        name: projectName,
        permission,
        sourceProjectId: currentId || undefined,
      });
      setRecord(res.share);
      return res.share;
    } catch {
      message.error(t('editor.shareCopyFailed'));
      return null;
    }
  };

  const onCopyLink = async () => {
    const next = await ensureShare();
    if (!next) return;
    try {
      await copyText(shareUrl(next.id));
      message.success(t('editor.shareLinkCopied'));
    } catch {
      message.error(t('editor.shareCopyFailed'));
    }
  };

  const onCopyText = async () => {
    const next = await ensureShare();
    if (!next) return;
    try {
      await copyText(
        shareCopyText(
          {
            id: next.id,
            name: next.name,
            permission: next.permission,
            document: next.document,
            createdAt: next.createdAt,
            updatedAt: next.updatedAt,
          },
          shareUrl(next.id)
        )
      );
      message.success(t('editor.shareTextCopied'));
    } catch {
      message.error(t('editor.shareCopyFailed'));
    }
  };

  return (
    <Dialog show={open} onClose={onClose} title={t('editor.shareTitle')} width={420}>
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">{t('editor.shareHint')}</p>

        <div>
          <div className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('editor.sharePermission')}</div>
          <div
            role="group"
            className="inline-flex h-9 items-center rounded-full bg-[var(--accent-soft)] p-0.5"
          >
            {(
              [
                { id: 'preview' as const, label: t('editor.sharePreview') },
                { id: 'edit' as const, label: t('editor.shareEdit') },
              ] as const
            ).map((opt) => {
              const active = permission === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPermission(opt.id)}
                  className={cn(
                    'inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium transition-colors',
                    active
                      ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('editor.shareLink')}</div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={busy && !url ? '…' : url || t('editor.shareLinkPlaceholder')}
              className="h-9 min-w-0 flex-1 rounded-lg bg-[var(--accent-soft)] px-3 text-[12px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              aria-label={t('editor.shareCopyLink')}
              disabled={!url || busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--surface)] px-2.5 text-[12px] font-medium text-[var(--ink)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
              onClick={() => void onCopyLink()}
            >
              <HiOutlineLink className="h-4 w-4" />
              {t('editor.shareCopyLink')}
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={!url || busy}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-soft)] text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--line)] disabled:opacity-50"
          onClick={() => void onCopyText()}
        >
          <HiOutlineClipboardDocument className="h-4 w-4" />
          {t('editor.shareCopyText')}
        </button>
      </div>
    </Dialog>
  );
}
