/**
 * Left assets dock — AI-generated image / video / audio from GET /api/v1/assets.
 * Click previews; drag onto canvas places via placeMediaAsset (same drop path as chat images).
 */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlinePhoto,
  HiOutlineTrash,
  HiOutlineArrowPath,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { LuAudioLines, LuFilm, LuPanelLeft } from 'react-icons/lu';
import Tooltip from '@/components/base/tooltip';
import { message } from '@/components/base';
import Image from '@/components/base/image';
import { VideoFullscreenPreview } from '@/components/editor/nodes/VideoNode/VideoFullscreenPreviewButton';
import { deleteAsset, listAssets, type UserAsset } from '@/apis/assets';
import { setMediaAssetDragData } from '@/utils/chatImageDrag';
import { cn } from '@/utils/classnames';

const ASSET_DOCK_WIDTH_KEY = 'asset-dock-width';
const ASSET_DOCK_MIN_W = 200;
const ASSET_DOCK_MAX_W = 420;
const ASSET_DOCK_DEFAULT_W = 240;
const PAGE_SIZE = 30;

function clampAssetDockWidth(width: number): number {
  const viewportCap =
    typeof window !== 'undefined'
      ? Math.max(ASSET_DOCK_MIN_W, window.innerWidth - 360)
      : ASSET_DOCK_MAX_W;
  return Math.min(
    ASSET_DOCK_MAX_W,
    viewportCap,
    Math.max(ASSET_DOCK_MIN_W, Math.round(width))
  );
}

function readStoredAssetDockWidth(): number {
  try {
    const raw = localStorage.getItem(ASSET_DOCK_WIDTH_KEY);
    if (!raw) return ASSET_DOCK_DEFAULT_W;
    const n = Number(raw);
    if (!Number.isFinite(n)) return ASSET_DOCK_DEFAULT_W;
    return clampAssetDockWidth(n);
  } catch {
    return ASSET_DOCK_DEFAULT_W;
  }
}

function isMediaKind(kind: string): kind is 'image' | 'video' | 'audio' {
  return kind === 'image' || kind === 'video' || kind === 'audio';
}

function formatRelativeTime(ms: number | null | undefined, locale: string): string {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return '';
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 60) return locale.startsWith('zh') ? '刚刚' : 'just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return locale.startsWith('zh') ? `${m} 分钟前` : `${m}m ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return locale.startsWith('zh') ? `${h} 小时前` : `${h}h ago`;
  }
  const d = Math.floor(diffSec / 86400);
  return locale.startsWith('zh') ? `${d} 天前` : `${d}d ago`;
}

function assetDurationSeconds(asset: UserAsset): number | undefined {
  const fromMeta = Number((asset.meta as { duration?: unknown } | null)?.duration);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  return undefined;
}

function AssetThumb({ asset }: { asset: UserAsset }): ReactNode {
  const url = String(asset.url || '').trim();
  if (asset.kind === 'image' && url) {
    return (
      <img
        src={url}
        alt=""
        className="pointer-events-none h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
    );
  }
  if (asset.kind === 'video' && url) {
    return (
      <video
        src={url}
        className="pointer-events-none h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        draggable={false}
      />
    );
  }
  return (
    <span className="inline-flex h-full w-full items-center justify-center text-[var(--muted)]">
      {asset.kind === 'audio' ? (
        <LuAudioLines className="h-6 w-6" strokeWidth={1.75} />
      ) : asset.kind === 'video' ? (
        <LuFilm className="h-6 w-6" strokeWidth={1.75} />
      ) : (
        <HiOutlinePhoto className="h-6 w-6" strokeWidth={1.75} />
      )}
    </span>
  );
}

function AudioAssetPreview({
  open,
  src,
  title,
  onClose,
}: {
  open: boolean;
  src: string;
  title: string;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[800] flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('editor.assets.preview', { defaultValue: '预览' })}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-[var(--surface)] p-5 shadow-[0_18px_48px_rgba(12,12,13,0.28)] ring-1 ring-[var(--line)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t('common.close', { defaultValue: '关闭' })}
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
        >
          <HiOutlineXMark className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <div className="mb-4 flex items-center gap-3 pr-8">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--rail)] text-[var(--ink)]">
            <LuAudioLines className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <p className="min-w-0 truncate text-[14px] font-medium text-[var(--ink)]">
            {title}
          </p>
        </div>
        <audio src={src} controls autoPlay className="w-full" />
      </div>
    </div>,
    document.body
  );
}

function AssetCard({
  asset,
  busy,
  locale,
  onPreview,
  onDelete,
}: {
  asset: UserAsset;
  busy: boolean;
  locale: string;
  onPreview: (asset: UserAsset) => void;
  onDelete: (asset: UserAsset) => void;
}): ReactNode {
  const { t } = useTranslation();
  const draggedRef = useRef(false);
  const url = String(asset.url || '').trim();
  const prompt = String(asset.prompt || '').trim();
  const when = formatRelativeTime(asset.createdAt, locale);
  const canDrag = isMediaKind(asset.kind) && Boolean(url);

  const onDragStart = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!canDrag || !isMediaKind(asset.kind)) {
      e.preventDefault();
      return;
    }
    draggedRef.current = true;
    setMediaAssetDragData(e.dataTransfer, {
      kind: asset.kind,
      src: url,
      uploadKey: asset.objectKey || undefined,
      width: asset.width,
      height: asset.height,
      prompt: prompt || undefined,
      name: prompt.slice(0, 40) || undefined,
      duration: assetDurationSeconds(asset),
    });
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--rail)]">
      <div
        draggable={canDrag}
        onDragStart={onDragStart}
        onDragEnd={() => {
          window.setTimeout(() => {
            draggedRef.current = false;
          }, 0);
        }}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          if (!url) return;
          onPreview(asset);
        }}
        className={cn(
          'block w-full text-left',
          canDrag && 'cursor-grab active:cursor-grabbing'
        )}
        title={
          prompt ||
          t('editor.assets.placeHint', {
            defaultValue: '点击预览，拖到画布添加',
          })
        }
      >
        <div className="aspect-square w-full overflow-hidden bg-[var(--canvas)]">
          <AssetThumb asset={asset} />
        </div>
        <div className="space-y-0.5 px-2 py-1.5">
          <p className="truncate text-[11px] font-medium text-[var(--ink)]">
            {prompt ||
              t(`editor.assets.kind.${asset.kind}`, {
                defaultValue: asset.kind,
              })}
          </p>
          {when ? (
            <p className="truncate text-[10px] text-[var(--muted)]">{when}</p>
          ) : null}
        </div>
      </div>
      <Tooltip tip={t('editor.assets.delete', { defaultValue: '删除' })} placement="top">
        <button
          type="button"
          disabled={busy}
          aria-label={t('editor.assets.delete', { defaultValue: '删除' })}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(asset);
          }}
          className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)]/90 text-[var(--muted)] opacity-0 shadow-sm ring-1 ring-[var(--line)] transition hover:text-[var(--ink)] group-hover:opacity-100 disabled:opacity-40"
        >
          <HiOutlineTrash className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </Tooltip>
    </div>
  );
}

function AssetPanel({
  onClose,
  mobile = false,
}: {
  onClose?: () => void;
  mobile?: boolean;
} = {}): ReactNode {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<UserAsset[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dockWidth, setDockWidth] = useState(ASSET_DOCK_DEFAULT_W);
  const [preview, setPreview] = useState<UserAsset | null>(null);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    setDockWidth(readStoredAssetDockWidth());
  }, []);

  useEffect(() => {
    const onWinResize = () => setDockWidth((w) => clampAssetDockWidth(w));
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, []);

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      try {
        const res = await listAssets({
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        if (seq !== loadSeq.current) return;
        const media = (res.items || []).filter((a) => isMediaKind(String(a.kind || '')));
        setItems((prev) => (replace ? media : [...prev, ...media]));
        setPage(res.page || nextPage);
        setHasMore(Boolean(res.hasMore));
      } catch (err) {
        if (seq !== loadSeq.current) return;
        console.warn('[assets] list failed', err);
        message.error(
          t('editor.assets.loadFail', { defaultValue: '资产加载失败' })
        );
        if (replace) setItems([]);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  const persistDockWidth = (w: number) => {
    const next = clampAssetDockWidth(w);
    setDockWidth(next);
    try {
      localStorage.setItem(ASSET_DOCK_WIDTH_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const onDockResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeDragRef.current = { startX: e.clientX, startW: dockWidth };
    window.document.body.style.cursor = 'col-resize';
    window.document.body.style.userSelect = 'none';
  };

  const onDockResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    setDockWidth(clampAssetDockWidth(drag.startW + (e.clientX - drag.startX)));
  };

  const endDockResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    window.document.body.style.cursor = '';
    window.document.body.style.userSelect = '';
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    persistDockWidth(dockWidth);
  };

  const onDelete = async (asset: UserAsset) => {
    const id = String(asset.id || '').trim();
    if (!id || busyId) return;
    setBusyId(id);
    try {
      await deleteAsset(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
      if (preview?.id === id) setPreview(null);
    } catch (err) {
      console.warn('[assets] delete failed', err);
      message.error(
        t('editor.assets.deleteFail', { defaultValue: '删除失败' })
      );
    } finally {
      setBusyId(null);
    }
  };

  const previewUrl = String(preview?.url || '').trim();
  const previewTitle =
    String(preview?.prompt || '').trim() ||
    (preview
      ? t(`editor.assets.kind.${preview.kind}`, { defaultValue: preview.kind })
      : '');

  return (
    <aside
      style={mobile ? { width: 'min(20rem, 82vw)' } : { width: dockWidth }}
      className={cn(
        'relative flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--surface)]',
        mobile && 'shadow-[0_18px_48px_rgba(12,12,13,0.24)]'
      )}
      data-asset-panel
    >
      {!mobile ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('editor.assets.resizeDock', { defaultValue: '调整资产栏宽度' })}
          className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40"
          onPointerDown={onDockResizePointerDown}
          onPointerMove={onDockResizePointerMove}
          onPointerUp={endDockResize}
          onPointerCancel={endDockResize}
          onDoubleClick={() => persistDockWidth(ASSET_DOCK_DEFAULT_W)}
        />
      ) : null}

      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-3">
        <span className="text-[14px] font-semibold text-[var(--ink)]">
          {t('editor.assets.title', { defaultValue: '资产' })}
        </span>
        <div className="flex items-center gap-0.5">
          <Tooltip tip={t('editor.assets.refresh', { defaultValue: '刷新' })} placement="bottom">
            <button
              type="button"
              aria-label={t('editor.assets.refresh', { defaultValue: '刷新' })}
              disabled={loading}
              onClick={() => void loadPage(1, true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40"
            >
              <HiOutlineArrowPath
                className={cn('h-4 w-4', loading && 'animate-spin')}
                strokeWidth={1.75}
              />
            </button>
          </Tooltip>
          {onClose ? (
            <Tooltip tip={t('editor.closePanel')} placement="bottom">
              <button
                type="button"
                aria-label={t('editor.closePanel')}
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <LuPanelLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!loading && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <HiOutlinePhoto className="h-8 w-8 text-[var(--muted)]" strokeWidth={1.5} />
            <p className="text-[12px] leading-relaxed text-[var(--muted)]">
              {t('editor.assets.empty')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                busy={busyId === asset.id}
                locale={i18n.language || 'zh'}
                onPreview={setPreview}
                onDelete={(a) => void onDelete(a)}
              />
            ))}
          </div>
        )}
        {hasMore ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadPage(page + 1, false)}
            className="mt-3 flex h-8 w-full items-center justify-center rounded-lg text-[12px] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            {loading
              ? t('editor.assets.loading', { defaultValue: '加载中…' })
              : t('editor.assets.loadMore', { defaultValue: '加载更多' })}
          </button>
        ) : null}
      </div>

      {preview?.kind === 'image' && previewUrl ? (
        <Image
          src={previewUrl}
          alt=""
          lazy={false}
          preview={{
            open: true,
            onOpenChange: (open) => {
              if (!open) setPreview(null);
            },
            previewOnClick: false,
          }}
          className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
          imgClassName="!hidden"
        />
      ) : null}

      <VideoFullscreenPreview
        open={preview?.kind === 'video' && Boolean(previewUrl)}
        onClose={() => setPreview(null)}
        src={previewUrl}
        uploadKey={preview?.objectKey}
        aspectWidth={preview?.width || undefined}
        aspectHeight={preview?.height || undefined}
        duration={preview ? assetDurationSeconds(preview) : undefined}
      />

      <AudioAssetPreview
        open={preview?.kind === 'audio' && Boolean(previewUrl)}
        src={previewUrl}
        title={previewTitle}
        onClose={() => setPreview(null)}
      />
    </aside>
  );
}

export default memo(AssetPanel);
