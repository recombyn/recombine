/**
 * Shared user AI-asset card — Me profile Assets tab + editor Assets dock.
 * Natural aspect (plaza-style waterfall); title + time on the card; Tooltip
 * shows the full title when truncated.
 *
 * Structure: top-of-file helpers + named subcomponents (no satellite modules).
 */
import {
  memo,
  useEffect,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlinePhoto, HiOutlinePlay, HiOutlineTrash, HiOutlineXMark } from 'react-icons/hi2';
import { LuAudioLines, LuFilm } from 'react-icons/lu';
import lottie, { type AnimationItem } from 'lottie-web';
import Image from '@/components/base/image';
import Tooltip from '@/components/base/tooltip';
import { VideoFullscreenPreview } from '@/components/editor/nodes/VideoNode/VideoFullscreenPreviewButton';
import type { UserAsset } from '@/apis/assets';
import { FLOW_ITEM_CLASS, FLOW_SKELETON_COUNT } from '@/components/home/FlowScrollSection';
import { parseLottieAnimationData } from '@/components/rcb/scene/document/sceneDocument';
import { cn } from '@/utils/classnames';
import { imageSrcToFile, mediaSrcNeedsAuthFetch } from '@/utils/uploadImage';

/** Varied aspects for flow skeletons (same rhythm as plaza). */
const ASSET_SKELETON_RATIOS = ['3 / 4', '4 / 5', '1 / 1', '4 / 3', '5 / 6', '2 / 3', '5 / 4'] as const;

// ─── pure helpers ───────────────────────────────────────────────────────────

function formatUserAssetRelativeTime(
  ms: number | null | undefined,
  locale: string
): string {
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

function assetKindLabelKey(kind: string): string {
  if (kind === 'video') return 'me.assetKindVideo';
  if (kind === 'audio') return 'me.assetKindAudio';
  if (kind === 'lottie') return 'me.assetKindLottie';
  return 'me.assetKindImage';
}

function aspectFromAsset(asset: UserAsset): string | null {
  const w = Number(asset.width);
  const h = Number(asset.height);
  if (w > 0 && h > 0) return `${w} / ${h}`;
  return null;
}

function defaultFrameAspect(kind: string): string {
  return kind === 'audio' || kind === 'lottie' ? '1 / 1' : '3 / 4';
}

function assetDurationSeconds(asset: UserAsset): number | undefined {
  const fromMeta = Number((asset.meta as { duration?: unknown } | null)?.duration);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  return undefined;
}

function resolveAssetTitle(
  asset: UserAsset,
  t: (key: string, opts?: { defaultValue?: string }) => string
): string {
  const prompt = String(asset.prompt || '').trim();
  if (prompt) return prompt;
  const kind = String(asset.kind || 'image');
  return t(assetKindLabelKey(kind), { defaultValue: kind });
}

function cloneLottieData(data: Record<string, unknown>): Record<string, unknown> {
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

function lottieHostHasInk(host: HTMLElement): boolean {
  return host.querySelectorAll('path, ellipse, circle, rect, polygon').length > 0;
}

function markAssetCardDragging(el: HTMLElement | null) {
  const card = el?.closest('[data-asset-card]');
  if (!(card instanceof HTMLElement)) return;
  card.setAttribute('data-dragging', '');
  void card.offsetWidth;
}

function clearAssetCardDragging(el: HTMLElement | null) {
  const card = el?.closest('[data-asset-card]');
  if (card instanceof HTMLElement) card.removeAttribute('data-dragging');
}

/** Load Bodymovin JSON from asset url / auth upload key. */
async function loadAssetLottieData(
  src: string,
  uploadKey?: string | null
): Promise<Record<string, unknown> | null> {
  const url = String(src || '').trim();
  if (!url) return null;
  try {
    const file = await imageSrcToFile(url, 'asset-lottie.json', {
      uploadKey,
      fallbackMime: 'application/json',
    });
    return parseLottieAnimationData(await file.text());
  } catch {
    return null;
  }
}

function mountLottieOnHost(
  host: HTMLElement,
  data: Record<string, unknown>
): AnimationItem {
  host.innerHTML = '';
  return lottie.loadAnimation({
    container: host,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: cloneLottieData(data),
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  });
}

// ─── hooks ──────────────────────────────────────────────────────────────────

/** Auth-gated local URLs → blob; public / data URLs pass through. */
function useAuthMediaSrc(
  url: string,
  uploadKey: string | undefined,
  fileName: string,
  enabled = true
): string {
  const [src, setSrc] = useState(() =>
    enabled && url && !mediaSrcNeedsAuthFetch(url) ? url : ''
  );

  useEffect(() => {
    if (!enabled || !url) {
      setSrc('');
      return;
    }
    if (!mediaSrcNeedsAuthFetch(url)) {
      setSrc(url);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    void imageSrcToFile(url, fileName, { uploadKey })
      .then((file) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(file);
        setSrc(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [enabled, url, uploadKey, fileName]);

  return src;
}

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

// ─── thumbnails ─────────────────────────────────────────────────────────────

function PlaceholderThumb({ kind }: { kind: string }): ReactNode {
  if (kind === 'audio') return <LuAudioLines className="h-6 w-6" strokeWidth={1.75} />;
  if (kind === 'video') return <LuFilm className="h-6 w-6" strokeWidth={1.75} />;
  return <HiOutlinePhoto className="h-6 w-6" strokeWidth={1.75} />;
}

function ImageThumb({
  src,
  onNatural,
}: {
  src: string;
  onNatural: (w: number, h: number) => void;
}): ReactNode {
  return (
    <img
      src={src}
      alt=""
      className="pointer-events-none h-full w-full object-cover"
      loading="lazy"
      draggable={false}
      onLoad={(e) => {
        const img = e.currentTarget;
        onNatural(img.naturalWidth, img.naturalHeight);
      }}
    />
  );
}

function VideoThumb({
  src,
  onNatural,
}: {
  src: string;
  onNatural: (w: number, h: number) => void;
}): ReactNode {
  return (
    <span className="pointer-events-none relative block h-full w-full">
      <video
        src={src}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        draggable={false}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          onNatural(v.videoWidth, v.videoHeight);
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white shadow-sm ring-1 ring-white/25">
          <HiOutlinePlay className="h-4 w-4 translate-x-[1px]" strokeWidth={2} />
        </span>
      </span>
    </span>
  );
}

function LottieAssetThumb({
  asset,
  onNaturalAspect,
}: {
  asset: UserAsset;
  onNaturalAspect?: (aspect: string) => void;
}): ReactNode {
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const url = String(asset.url || '').trim();
  const uploadKey = String(asset.objectKey || '').trim() || undefined;

  useEffect(() => {
    const aspect = aspectFromAsset(asset);
    if (aspect) onNaturalAspect?.(aspect);
  }, [asset.width, asset.height, onNaturalAspect]);

  useEffect(() => {
    if (!hostEl || !url) {
      setFailed(!url);
      return undefined;
    }
    let cancelled = false;
    let anim: AnimationItem | null = null;
    setFailed(false);
    void (async () => {
      const data = await loadAssetLottieData(url, uploadKey);
      if (cancelled) return;
      if (!data) {
        setFailed(true);
        return;
      }
      const aw = Number(data.w);
      const ah = Number(data.h);
      if (aw > 0 && ah > 0) onNaturalAspect?.(`${aw} / ${ah}`);
      try {
        anim = mountLottieOnHost(hostEl, data);
        requestAnimationFrame(() => {
          if (cancelled || !hostEl.isConnected) return;
          if (!lottieHostHasInk(hostEl)) setFailed(true);
        });
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      anim?.destroy();
      hostEl.innerHTML = '';
    };
  }, [hostEl, url, uploadKey, onNaturalAspect]);

  return (
    <div className="relative h-full w-full bg-transparent" aria-hidden>
      <div ref={setHostEl} className="pointer-events-none h-full w-full bg-transparent" />
      {failed ? (
        <span className="pointer-events-none absolute inset-0 inline-flex items-center justify-center bg-[var(--canvas)] text-[var(--muted)]">
          <LuFilm className="h-6 w-6" strokeWidth={1.75} />
        </span>
      ) : null}
    </div>
  );
}

function UserAssetThumb({
  asset,
  onNaturalAspect,
}: {
  asset: UserAsset;
  onNaturalAspect?: (aspect: string) => void;
}): ReactNode {
  const url = String(asset.url || '').trim();
  const uploadKey = String(asset.objectKey || '').trim() || undefined;
  const thumbSrc = useAuthMediaSrc(url, uploadKey, 'user-asset-thumb.bin');

  const reportNatural = (w: number, h: number) => {
    if (w > 0 && h > 0) onNaturalAspect?.(`${w} / ${h}`);
  };

  if (asset.kind === 'lottie') {
    return <LottieAssetThumb asset={asset} onNaturalAspect={onNaturalAspect} />;
  }
  if (asset.kind === 'image' && thumbSrc) {
    return <ImageThumb src={thumbSrc} onNatural={reportNatural} />;
  }
  if (asset.kind === 'video' && thumbSrc) {
    return <VideoThumb src={thumbSrc} onNatural={reportNatural} />;
  }
  return (
    <span className="inline-flex h-full w-full items-center justify-center text-[var(--muted)]">
      <PlaceholderThumb kind={String(asset.kind || 'image')} />
    </span>
  );
}

// ─── card chrome ────────────────────────────────────────────────────────────

function AssetCardMetaOverlay({
  title,
  when,
  dense,
}: {
  title: string;
  when: string;
  dense: boolean;
}): ReactNode {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0',
        'bg-gradient-to-t from-black/70 via-black/35 to-transparent',
        'group-data-[dragging]:!opacity-0 group-data-[dragging]:!transition-none',
        dense ? 'px-1.5 pb-1.5 pt-6' : 'px-2 pb-2 pt-8'
      )}
    >
      <p
        className={cn(
          'truncate font-medium leading-snug text-white',
          dense ? 'text-[11px]' : 'text-[12px]'
        )}
      >
        {title}
      </p>
      {when ? (
        <p
          className={cn(
            'mt-0.5 truncate text-white/75',
            dense ? 'text-[10px]' : 'text-[11px]'
          )}
        >
          {when}
        </p>
      ) : null}
    </div>
  );
}

function UserAssetCardSkeleton({
  index = 0,
  dense = false,
}: {
  index?: number;
  dense?: boolean;
}): ReactNode {
  const ratio = ASSET_SKELETON_RATIOS[index % ASSET_SKELETON_RATIOS.length];
  return (
    <div
      className={cn(dense ? 'mb-1.5 min-w-0 break-inside-avoid' : FLOW_ITEM_CLASS)}
      aria-busy="true"
      aria-hidden
    >
      <div
        className="rcb-skeleton-bone block w-full rounded-xl shadow-none"
        style={{ aspectRatio: ratio }}
      />
    </div>
  );
}

type UserAssetCardProps = {
  asset: UserAsset;
  locale: string;
  /** Editor dock — tighter overlay + grab cursor when draggable. */
  dense?: boolean;
  deleteBusy?: boolean;
  onActivate: (asset: UserAsset) => void;
  onDelete?: (asset: UserAsset) => void;
  /** When set, card body is HTML5-draggable (Assets → canvas). */
  onDragStart?: (e: ReactDragEvent<HTMLDivElement>, asset: UserAsset) => void;
  onDragEnd?: () => void;
};

function handleAssetCardActivate(
  asset: UserAsset,
  url: string,
  onActivate: (asset: UserAsset) => void
) {
  if (!url && asset.kind !== 'audio') return;
  onActivate(asset);
}

function handleAssetCardKeyDown(
  e: ReactKeyboardEvent,
  asset: UserAsset,
  url: string,
  onActivate: (asset: UserAsset) => void
) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  handleAssetCardActivate(asset, url, onActivate);
}

function UserAssetCard({
  asset,
  locale,
  dense = false,
  deleteBusy = false,
  onActivate,
  onDelete,
  onDragStart,
  onDragEnd,
}: UserAssetCardProps): ReactNode {
  const { t } = useTranslation();
  const url = String(asset.url || '').trim();
  const when = formatUserAssetRelativeTime(asset.createdAt, locale);
  const title = resolveAssetTitle(asset, t);
  const canDrag = Boolean(onDragStart && url);
  const [naturalAspect, setNaturalAspect] = useState<string | null>(() =>
    aspectFromAsset(asset)
  );

  useEffect(() => {
    setNaturalAspect(aspectFromAsset(asset));
  }, [asset.id, asset.width, asset.height]);

  const frameStyle: CSSProperties = {
    aspectRatio: naturalAspect || defaultFrameAspect(String(asset.kind || '')),
  };

  const onBodyDragStart = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!canDrag) return;
    markAssetCardDragging(e.currentTarget);
    onDragStart?.(e, asset);
  };

  const onBodyDragEnd = (e: ReactDragEvent<HTMLDivElement>) => {
    clearAssetCardDragging(e.currentTarget);
    onDragEnd?.();
  };

  const onDeleteClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    onDelete?.(asset);
  };

  return (
    <div
      data-asset-card
      className={cn(
        // Dock: CSS columns waterfall — keep break-inside + column gap via mb.
        dense ? 'mb-1.5 min-w-0 break-inside-avoid' : FLOW_ITEM_CLASS,
        'group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--rail)]'
        // Do NOT set pointer-events-none while dragging — that cancels HTML5 drag.
      )}
    >
      <Tooltip
        tip={title}
        placement="top"
        asChild={false}
        triggerClassName="block w-full"
        // Long prompt tips: wrap + modest radius (base Tooltip is single-line pill).
        popupClassName="!h-auto !max-w-[14rem] !whitespace-normal !break-words !rounded-md !py-1.5 !leading-snug !items-start !justify-start text-left"
      >
        <div
          role={canDrag ? undefined : 'button'}
          tabIndex={canDrag ? undefined : 0}
          draggable={canDrag}
          onDragStart={canDrag ? onBodyDragStart : undefined}
          onDragEnd={onBodyDragEnd}
          onClick={() => handleAssetCardActivate(asset, url, onActivate)}
          onKeyDown={
            canDrag
              ? undefined
              : (e) => handleAssetCardKeyDown(e, asset, url, onActivate)
          }
          className={cn(
            'relative block w-full text-left',
            canDrag && 'cursor-grab active:cursor-grabbing'
          )}
        >
          <div className="relative w-full overflow-hidden bg-[var(--canvas)]" style={frameStyle}>
            <div className="absolute inset-0">
              <UserAssetThumb asset={asset} onNaturalAspect={setNaturalAspect} />
            </div>
            <AssetCardMetaOverlay title={title} when={when} dense={dense} />
          </div>
        </div>
      </Tooltip>
      {onDelete ? (
        <button
          type="button"
          disabled={deleteBusy}
          aria-label={t('me.deleteAsset', { defaultValue: '删除' })}
          onClick={onDeleteClick}
          className={cn(
            'absolute z-20 inline-flex items-center justify-center rounded-full',
            'bg-[var(--surface)] text-[var(--ink)] shadow-md ring-1 ring-black/10',
            'opacity-0 transition hover:bg-[var(--canvas)] group-hover:opacity-100 disabled:opacity-40',
            'group-data-[dragging]:!pointer-events-none group-data-[dragging]:!opacity-0 group-data-[dragging]:!transition-none',
            dense ? 'right-1.5 top-1.5 h-7 w-7' : 'right-2 top-2 h-8 w-8'
          )}
        >
          <HiOutlineTrash className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

const MemoizedUserAssetCard = memo(UserAssetCard);
const MemoizedUserAssetCardSkeleton = memo(UserAssetCardSkeleton);

// ─── previews ───────────────────────────────────────────────────────────────

function ImageAssetLightbox({
  asset,
  onClose,
}: {
  asset: UserAsset;
  onClose: () => void;
}): ReactNode {
  const url = String(asset.url || '').trim();
  const uploadKey = String(asset.objectKey || '').trim() || undefined;
  const src = useAuthMediaSrc(url, uploadKey, 'user-asset-preview.bin');
  if (!src) return null;
  return (
    <Image
      src={src}
      alt=""
      lazy={false}
      preview={{
        open: true,
        onOpenChange: (open) => {
          if (!open) onClose();
        },
        previewOnClick: false,
      }}
      className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
      imgClassName="!hidden"
    />
  );
}

function stopBubble(e: SyntheticEvent) {
  e.stopPropagation();
}

function AudioAssetPreview({
  open,
  src,
  uploadKey,
  title,
  onClose,
}: {
  open: boolean;
  src: string;
  uploadKey?: string | null;
  title: string;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const playSrc = useAuthMediaSrc(
    src,
    uploadKey || undefined,
    'asset-audio.bin',
    open
  );
  useEscapeToClose(open, onClose);

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
        onClick={stopBubble}
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
        {playSrc ? <audio src={playSrc} controls autoPlay className="w-full" /> : null}
      </div>
    </div>,
    document.body
  );
}

function LottieAssetPreview({
  open,
  src,
  uploadKey,
  onClose,
}: {
  open: boolean;
  src: string;
  uploadKey?: string | null;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  useEscapeToClose(open, onClose);

  useEffect(() => {
    if (!open || !src || !hostEl) return undefined;
    let cancelled = false;
    let anim: AnimationItem | null = null;
    void (async () => {
      const data = await loadAssetLottieData(src, uploadKey);
      if (cancelled || !data) return;
      try {
        anim = mountLottieOnHost(hostEl, data);
      } catch {
        /* empty */
      }
    })();
    return () => {
      cancelled = true;
      anim?.destroy();
      hostEl.innerHTML = '';
    };
  }, [open, src, uploadKey, hostEl]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[800] flex items-center justify-center bg-black/45 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('editor.assets.preview', { defaultValue: '预览' })}
    >
      <button
        type="button"
        aria-label={t('common.close', { defaultValue: '关闭' })}
        onClick={onClose}
        className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <HiOutlineXMark className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <div
        className="relative flex h-[min(72vh,560px)] w-[min(72vw,560px)] items-center justify-center overflow-hidden bg-transparent"
        onClick={stopBubble}
      >
        <div ref={setHostEl} className="h-full w-full bg-transparent" />
      </div>
    </div>,
    document.body
  );
}

/** Image lightbox / video fullscreen / audio / lottie dialog — Me + editor Assets. */
function UserAssetMediaPreview({
  asset,
  onClose,
}: {
  asset: UserAsset | null;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  if (!asset) return null;

  const url = String(asset.url || '').trim();
  const title = resolveAssetTitle(asset, t);

  return (
    <>
      {asset.kind === 'image' && (
        <ImageAssetLightbox asset={asset} onClose={onClose} />
      )}
      <VideoFullscreenPreview
        open={asset.kind === 'video' && Boolean(url)}
        onClose={onClose}
        src={url}
        uploadKey={asset.objectKey}
        aspectWidth={asset.width || undefined}
        aspectHeight={asset.height || undefined}
        duration={assetDurationSeconds(asset)}
      />
      <AudioAssetPreview
        open={asset.kind === 'audio' && Boolean(url)}
        src={url}
        uploadKey={asset.objectKey}
        title={title}
        onClose={onClose}
      />
      <LottieAssetPreview
        open={asset.kind === 'lottie' && Boolean(url)}
        src={url}
        uploadKey={asset.objectKey}
        onClose={onClose}
      />
    </>
  );
}

const MemoizedUserAssetMediaPreview = memo(UserAssetMediaPreview);

export {
  MemoizedUserAssetCard as UserAssetCard,
  MemoizedUserAssetCardSkeleton as UserAssetCardSkeleton,
  MemoizedUserAssetMediaPreview as UserAssetMediaPreview,
  FLOW_SKELETON_COUNT as USER_ASSET_SKELETON_COUNT,
};
