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
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowPath } from 'react-icons/hi2';
import { LuImages, LuPanelLeft } from 'react-icons/lu';
import Tooltip from '@/components/base/tooltip';
import { Button, Dialog, message } from '@/components/base';
import { InfiniteScrollSection } from '@/components/home/InfiniteScroll';
import {
  UserAssetCard,
  UserAssetCardSkeleton,
  UserAssetMediaPreview,
  USER_ASSET_SKELETON_COUNT,
} from '@/components/home/UserAssetMediaCard';
import { deleteAsset, listAssets, type UserAsset } from '@/apis/assets';
import { setMediaAssetDragData, clearMediaAssetDragData } from '@/utils/chatImageDrag';
import { cn } from '@/utils/classnames';

const ASSET_DOCK_WIDTH_KEY = 'asset-dock-width';
const ASSET_DOCK_MIN_W = 200;
const ASSET_DOCK_MAX_W = 420;
const ASSET_DOCK_DEFAULT_W = 240;
const PAGE_SIZE = 30;
/** Plaza-style CSS columns waterfall (natural card heights — not CSS grid rows). */
const ASSET_DOCK_FLOW = 'w-full columns-2 gap-1.5';

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

function isMediaKind(kind: string): kind is 'image' | 'video' | 'audio' | 'lottie' {
  return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'lottie';
}

function isDraggableMediaKind(kind: string): kind is 'image' | 'video' | 'audio' | 'lottie' {
  return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'lottie';
}

function assetDurationSeconds(asset: UserAsset): number | undefined {
  const fromMeta = Number((asset.meta as { duration?: unknown } | null)?.duration);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  return undefined;
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dockWidth, setDockWidth] = useState(ASSET_DOCK_DEFAULT_W);
  const [preview, setPreview] = useState<UserAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAsset | null>(null);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const loadSeq = useRef(0);
  const draggedRef = useRef(false);

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
      if (replace) setLoading(true);
      else setLoadingMore(true);
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
        if (seq === loadSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
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
      setDeleteTarget(null);
      message.destructive(
        t('editor.assets.deleteOk', { defaultValue: '已删除' })
      );
    } catch (err) {
      console.warn('[assets] delete failed', err);
      message.error(
        t('editor.assets.deleteFail', { defaultValue: '删除失败' })
      );
    } finally {
      setBusyId(null);
    }
  };

  const onCardActivate = (asset: UserAsset) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const url = String(asset.url || '').trim();
    if (!url && asset.kind !== 'audio') return;
    setPreview(asset);
  };

  const onCardDragStart = (e: ReactDragEvent<HTMLDivElement>, asset: UserAsset) => {
    const url = String(asset.url || '').trim();
    if (!isDraggableMediaKind(asset.kind) || !url) {
      e.preventDefault();
      return;
    }
    draggedRef.current = true;
    const prompt = String(asset.prompt || '').trim();
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

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <InfiniteScrollSection
          loading={loading && items.length === 0}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={() => {
            if (loading || loadingMore || !hasMore) return;
            void loadPage(page + 1, false);
          }}
          isEmpty={items.length === 0}
          empty={
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <LuImages className="h-8 w-8 text-[var(--muted)]" strokeWidth={1.5} />
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                {t('editor.assets.empty')}
              </p>
            </div>
          }
          gridClassName={ASSET_DOCK_FLOW}
          skeleton={Array.from({ length: USER_ASSET_SKELETON_COUNT }, (_, i) => (
            <UserAssetCardSkeleton key={i} index={i} dense />
          ))}
        >
          {items.map((asset) => (
            <UserAssetCard
              key={asset.id}
              asset={asset}
              dense
              locale={i18n.language || 'zh'}
              deleteBusy={busyId === asset.id}
              onActivate={onCardActivate}
              onDelete={(a) => setDeleteTarget(a)}
              onDragStart={
                isDraggableMediaKind(asset.kind) ? onCardDragStart : undefined
              }
              onDragEnd={() => {
                // drop → dragend; defer clear so drop still sees pending payload.
                window.setTimeout(() => {
                  clearMediaAssetDragData();
                  draggedRef.current = false;
                }, 0);
              }}
            />
          ))}
        </InfiniteScrollSection>
      </div>

      <UserAssetMediaPreview asset={preview} onClose={() => setPreview(null)} />

      <Dialog
        show={Boolean(deleteTarget)}
        onClose={() => {
          if (busyId) return;
          setDeleteTarget(null);
        }}
        width={400}
        title={t('editor.assets.deleteConfirmTitle', {
          defaultValue: '删除资产？',
        })}
        titleClassName="!text-[16px] !font-semibold !pb-2"
        className="!bg-[var(--surface)] !p-5"
        footer={
          <>
            <Button
              size="small"
              type="default"
              disabled={Boolean(busyId)}
              onClick={() => setDeleteTarget(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="small"
              type="primary"
              destructive
              disabled={Boolean(busyId)}
              onClick={() => {
                if (deleteTarget) void onDelete(deleteTarget);
              }}
            >
              {t('editor.assets.delete', { defaultValue: '删除' })}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          {t('editor.assets.deleteConfirmBody', {
            defaultValue: '删除后无法恢复，确定删除该资产吗？',
          })}
        </p>
      </Dialog>
    </aside>
  );
}

export default memo(AssetPanel);
