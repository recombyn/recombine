import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineScissors } from 'react-icons/hi2';
import { BiExit } from 'react-icons/bi';
import type Player from 'video.js/dist/types/player';
import {
  RcbOverlayPortal,
  rcbSceneToScreen,
  rcbScreenPxToScene,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '@/components/rcb';
import { SELECTION_TOOLBAR_BELOW_BOX_GAP_PX } from '@/components/rcb/selection/SelectionToolbarShell';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import { ImageToolSep, imageToolBtn } from '@/components/editor/nodes/ImageNode/imageToolbarShared';
import { radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import { closeVideoToolPanel, setDocument } from '@/store/modules/editor';
import {
  captureVideoPosterFrame,
  normalizeDocument,
} from '@/components/rcb/scene/sceneDocument';
import { deleteUploadedFile, imageSrcToFile, uploadImageFile } from '@/utils/uploadImage';
import { message, Tooltip } from '@/components/base';
import VideoJsPlayer, {
  usePlayableVideoSrc,
} from '@/components/editor/nodes/VideoNode/VideoJsPlayer';
import { exportCroppedVideoBlob } from '@/components/editor/nodes/VideoNode/VideoDownloadButton';

type TrimRange = { start: number; end: number };

/** Reject NaN / Infinity — some MP4/WebM report duration=Infinity until probed. */
function saneDuration(value: unknown): number | null {
  const d = Number(value);
  if (!Number.isFinite(d) || d <= 0) return null;
  // Cap absurd lengths so seek math never blows up.
  if (d > 60 * 60 * 12) return null;
  return d;
}

function clampRange(start: number, end: number, duration: number): TrimRange {
  const d = saneDuration(duration) ?? 0.1;
  let a = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, d));
  let b = Math.max(0, Math.min(Number.isFinite(end) ? end : d, d));
  if (b - a < 0.1) {
    if (a + 0.1 <= d) b = a + 0.1;
    else a = Math.max(0, b - 0.1);
  }
  return { start: a, end: b };
}

function readCrop(attrs: any): { x: number; y: number; w: number; h: number } | null {
  const x = Number(attrs?.cropX);
  const y = Number(attrs?.cropY);
  const w = Number(attrs?.cropW);
  const h = Number(attrs?.cropH);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    return null;
  }
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

function plateTransform(angle: number, flipX: boolean, flipY: boolean) {
  const parts: string[] = [];
  if (Number.isFinite(angle) && Math.abs(angle) > 0.001) parts.push(`rotate(${angle}deg)`);
  if (flipX || flipY) parts.push(`scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`);
  return parts.length ? parts.join(' ') : undefined;
}

function safeSeek(video: HTMLVideoElement, time: number): boolean {
  if (!Number.isFinite(time) || time < 0) return false;
  try {
    video.currentTime = time;
    return true;
  } catch {
    return false;
  }
}

/** Force browsers that report duration=Infinity to resolve a finite length. */
async function resolveVideoDuration(video: HTMLVideoElement): Promise<number | null> {
  const first = saneDuration(video.duration);
  if (first) return first;
  try {
    const prev = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done);
      // Huge-but-finite seek; browser clamps to the real end.
      if (!safeSeek(video, 1e10)) resolve();
      window.setTimeout(done, 900);
    });
    const probed = saneDuration(video.currentTime);
    safeSeek(video, prev);
    if (probed) return probed;
  } catch {
    /* ignore */
  }
  return saneDuration(video.duration);
}

async function seekVideoFrame(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Number.isFinite(time) ? Math.max(0, time) : 0;
  if (!safeSeek(video, target)) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      video.onseeked = null;
      resolve();
    };
    video.onseeked = finish;
    window.setTimeout(finish, 600);
  });
}

/**
 * Pull filmstrip frames via authenticated blob URL so canvas isn't CORS-tainted
 * (same fetch path as before). Reports each frame as captured for progressive UI.
 */
async function extractFilmstrip(
  src: string,
  count: number,
  uploadKey?: string | null,
  opts?: {
    onDuration?: (duration: number) => void;
    onFrame?: (index: number, dataUrl: string, total: number) => void;
    isCancelled?: () => boolean;
  }
): Promise<{ frames: string[]; duration: number }> {
  const file = await imageSrcToFile(src, 'trim.mp4', { uploadKey });
  if (opts?.isCancelled?.()) return { frames: [], duration: 0 };
  const blobUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  // Do NOT set crossOrigin on blob: — it taints / blocks canvas.drawImage.
  video.src = blobUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('video load failed'));
    });
    if (opts?.isCancelled?.()) return { frames: [], duration: 0 };

    const resolved = await resolveVideoDuration(video);
    const duration = saneDuration(resolved) ?? 0.1;
    opts?.onDuration?.(duration);

    const frames: string[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { frames, duration };

    const n = Math.max(1, count);
    for (let i = 0; i < n; i++) {
      if (opts?.isCancelled?.()) break;
      const ratio = n <= 1 ? 0 : i / (n - 1);
      const t = Math.min(Math.max(0, duration - 0.05), duration * ratio);
      await seekVideoFrame(video, t);
      if (opts?.isCancelled?.()) break;
      const w = Math.max(1, video.videoWidth || 160);
      const h = Math.max(1, video.videoHeight || 90);
      canvas.width = 80;
      canvas.height = Math.max(1, Math.round((80 * h) / w));
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        frames[i] = dataUrl;
        opts?.onFrame?.(i, dataUrl, n);
      } catch {
        /* skip tainted / empty frames */
      }
    }
    return { frames, duration };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Apply a re-encoded trim result onto the same video node.
 * Clears trimStart/trimEnd — the new file is already cut.
 */
function applyTrimmedVideoToDocument(
  doc: any,
  nodeId: string,
  opts: { src: string; poster?: string; uploadKey?: string | null }
) {
  if (!doc || !nodeId || !opts.src) return doc;
  const next = normalizeDocument(doc);
  const node = next.deltaSetLike?.[nodeId];
  if (!node || node.key !== 'video') return doc;
  const attrs = { ...(node.attrs || {}) };
  attrs.src = opts.src;
  if (opts.poster) attrs.poster = opts.poster;
  if (opts.uploadKey) attrs.uploadKey = opts.uploadKey;
  else delete attrs.uploadKey;
  delete attrs.trimStart;
  delete attrs.trimEnd;
  node.attrs = attrs;
  return next;
}

/**
 * Video trim session: theme-aware FloatingToolbar + filmstrip track.
 * Confirm re-encodes the selected range into a new video file on the same node.
 */
export default function VideoTrimSessionHost({ document }: { document: any }): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const camera = useRcbCamera();
  const { zoom } = camera;
  const panel = useSelector(
    (s: any) => s.editor.videoToolPanel as null | { nodeId: string; kind: string }
  );
  const selectedNodeIds = useSelector((s: any) => (s.editor.selectedNodeIds || []) as string[]);
  const open = panel?.kind === 'trim';
  const nodeId = open ? panel!.nodeId : '';
  const node = nodeId ? document?.deltaSetLike?.[nodeId] : null;
  const src = String(node?.attrs?.src || '').trim();
  const uploadKey = String(node?.attrs?.uploadKey || node?.attrs?.key || '').trim() || null;
  const playSrc = usePlayableVideoSrc(src, uploadKey);

  const playerRef = useRef<Player | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const durationRef = useRef(0);
  const rangeRef = useRef<TrimRange>({ start: 0, end: 1 });
  const [duration, setDuration] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [range, setRange] = useState<TrimRange>({ start: 0, end: 1 });
  const dragRef = useRef<null | {
    edge: 'start' | 'end' | 'move';
    originX: number;
    orig: TrimRange;
    pointerId: number;
  }>(null);
  durationRef.current = duration;
  rangeRef.current = range;

  const seekPlayer = (time: number) => {
    const p = playerRef.current;
    if (!p || p.isDisposed() || !Number.isFinite(time) || time < 0) return;
    try {
      p.currentTime(time);
    } catch {
      /* ignore non-seekable */
    }
  };

  /** Seed / clamp range from node attrs — never while a drag is active. */
  const applyDurationAndAttrs = (raw: number) => {
    const d = saneDuration(raw);
    if (!d) return;
    setDuration(d);
    durationRef.current = d;
    if (dragRef.current) {
      setRange((prev) => clampRange(prev.start, prev.end, d));
      return;
    }
    const start = Number(node?.attrs?.trimStart);
    const end = Number(node?.attrs?.trimEnd);
    let next: TrimRange;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      next = clampRange(start, end, d);
    } else {
      next = { start: 0, end: d };
    }
    setRange(next);
    seekPlayer(next.start);
  };

  const close = () => dispatch(closeVideoToolPanel());

  useEffect(() => {
    if (!open) return;
    if (!node || node.key !== 'video' || !src) {
      close();
      return;
    }
    // Keep session open while dragging handles (canvas may briefly steal selection).
    if (dragRef.current) return;
    if (selectedNodeIds.length !== 1 || selectedNodeIds[0] !== nodeId) {
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nodeId, node, src, selectedNodeIds]);

  useEffect(() => {
    if (!open || !src) return;
    let cancelled = false;
    const total = 12;
    setFrames(Array.from({ length: total }, () => ''));
    setDuration(0);
    setRange({ start: 0, end: 1 });

    void extractFilmstrip(src, total, uploadKey, {
      isCancelled: () => cancelled,
      onDuration: (d) => {
        if (!cancelled && saneDuration(d)) applyDurationAndAttrs(d);
      },
      onFrame: (index, dataUrl, n) => {
        if (cancelled) return;
        setFrames((prev) => {
          const next =
            prev.length === n ? [...prev] : Array.from({ length: n }, (_, i) => prev[i] || '');
          next[index] = dataUrl;
          return next;
        });
      },
    })
      .catch((err) => {
        console.warn('[video trim filmstrip]', err);
        if (!cancelled) setFrames(Array.from({ length: total }, () => ''));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, src, nodeId, uploadKey]);

  const { left, top } = node ? nodeLeftTop(document, node) : { left: 0, top: 0 };
  const width = Math.max(1, Number(node?.width) || 1);
  const height = Math.max(1, Number(node?.height) || 1);
  const angle = Number(node?.attrs?.angle) || 0;
  const flipX = node?.attrs?.flipX === true || node?.attrs?.flipX === 'true';
  const flipY = node?.attrs?.flipY === true || node?.attrs?.flipY === 'true';
  const crop = readCrop(node?.attrs);
  const radii = radiiFromAttrs(node?.attrs || {});
  const z = Math.max(0.05, zoom || 1);
  const origin = rcbSceneToScreen(camera, left, top);

  const toolbarStyle = useRcbScreenToolbarStyle({
    left: left + width / 2,
    top:
      top +
      height +
      rcbScreenPxToScene(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX + 5, zoom),
    anchor: 'top',
  });
  const plateStyle: CSSProperties = {
    left: origin.x,
    top: origin.y,
    width: width * z,
    height: height * z,
    borderRadius: `${radii.tl * z}px ${radii.tr * z}px ${radii.br * z}px ${radii.bl * z}px`,
    transform: plateTransform(angle, flipX, flipY),
    transformOrigin: 'center center',
    overflow: 'hidden',
  };

  const scrubPreviewTo = (time: number) => {
    const p = playerRef.current;
    if (!p || p.isDisposed() || !Number.isFinite(time) || time < 0) return;
    // Pause while scrubbing so the frame sticks on the dragged edge.
    if (!p.paused()) p.pause();
    seekPlayer(time);
  };

  const onPlayerReady = (player: Player) => {
    playerRef.current = player;
    const seedFromPlayer = () => {
      const next = saneDuration(player.duration());
      // Only seed once — don't snap handles back to attrs after the user edits.
      if (next && !saneDuration(durationRef.current)) applyDurationAndAttrs(next);
      else seekPlayer(rangeRef.current.start);
    };
    seedFromPlayer();
    player.on('loadedmetadata', seedFromPlayer);
    player.on('durationchange', seedFromPlayer);
  };

  const startDrag = (
    edge: 'start' | 'end' | 'move',
    clientX: number,
    target: HTMLElement,
    pointerId: number
  ) => {
    if (!saneDuration(durationRef.current)) return;
    dragRef.current = {
      edge,
      originX: clientX,
      orig: { ...rangeRef.current },
      pointerId,
    };
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  };

  const applyDrag = (clientX: number) => {
    const drag = dragRef.current;
    const strip = stripRef.current;
    const d = saneDuration(durationRef.current);
    if (!drag || !strip || !d) return;
    const rect = strip.getBoundingClientRect();
    if (rect.width <= 0) return;
    const dx = ((clientX - drag.originX) / rect.width) * d;
    if (drag.edge === 'start') {
      const next = clampRange(drag.orig.start + dx, drag.orig.end, d);
      setRange(next);
      scrubPreviewTo(next.start);
      return;
    }
    if (drag.edge === 'end') {
      const next = clampRange(drag.orig.start, drag.orig.end + dx, d);
      setRange(next);
      // Show the end frame (slightly before so the last frame paints).
      scrubPreviewTo(Math.max(next.start, next.end - 0.04));
      return;
    }
    const span = drag.orig.end - drag.orig.start;
    let nextStart = drag.orig.start + dx;
    nextStart = Math.max(0, Math.min(nextStart, d - span));
    const next = { start: nextStart, end: nextStart + span };
    setRange(next);
    scrubPreviewTo(next.start);
  };

  const endDrag = (target?: HTMLElement | null, pointerId?: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const id = pointerId ?? drag.pointerId;
    if (target) {
      try {
        if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
      } catch {
        /* ignore */
      }
    }
  };

  // Listen on window.document in capture phase — survives setPointerCapture
  // retargeting. (Prop `document` is the scene doc and shadows the DOM global.)
  useEffect(() => {
    if (!open) return;
    const root = window.document;
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      applyDrag(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
      endDrag(e.target as HTMLElement | null, e.pointerId);
    };
    root.addEventListener('pointermove', onMove, { capture: true, passive: false });
    root.addEventListener('pointerup', onUp, { capture: true });
    root.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      root.removeEventListener('pointermove', onMove, true);
      root.removeEventListener('pointerup', onUp, true);
      root.removeEventListener('pointercancel', onUp, true);
    };
  }, [open]);

  const confirm = () => {
    if (!nodeId || !src || confirmBusy) return;
    const d = saneDuration(duration);
    const next = d ? clampRange(range.start, range.end, d) : range;
    if (!Number.isFinite(next.start) || !Number.isFinite(next.end)) return;
    if (next.end - next.start < 0.05) {
      message.warning(
        t('editor.videoToolbar.trimTooShort', { defaultValue: '剪辑区间太短' })
      );
      return;
    }

    // Full-length selection → no re-encode; just clear any prior trim attrs.
    const isFull =
      Boolean(d) && next.start <= 0.02 && next.end >= (d as number) - 0.02;
    if (isFull) {
      dispatch(
        setDocument(
          applyTrimmedVideoToDocument(document, nodeId, {
            src,
            poster: String(node?.attrs?.poster || '').trim() || undefined,
            uploadKey,
          })
        )
      );
      close();
      return;
    }

    setConfirmBusy(true);
    const hideLoading = message.loading(
      t('editor.videoToolbar.trimEncoding', { defaultValue: '正在生成剪辑视频…' }),
      0
    );
    void (async () => {
      const oldKey = uploadKey;
      try {
        const file = await imageSrcToFile(src, 'trim-src.mp4', { uploadKey: oldKey });
        const { blob, ext } = await exportCroppedVideoBlob({
          file,
          crop: null,
          trimStart: next.start,
          trimEnd: next.end,
        });
        const outFile = new File([blob], `video-trim.${ext}`, {
          type: blob.type || `video/${ext}`,
        });
        const uploaded = await uploadImageFile(outFile);
        const remoteUrl = String(uploaded.url || '').trim();
        if (!remoteUrl) throw new Error('upload returned no url');
        const key = String(uploaded.key || '').trim() || null;
        // Prefer public http(s); local `/api/v1/uploads/…` is resolved via uploadKey on play.
        const displaySrc =
          remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://')
            ? remoteUrl
            : remoteUrl;

        let poster = '';
        try {
          const posterSrc = URL.createObjectURL(blob);
          try {
            poster = await captureVideoPosterFrame(posterSrc);
          } finally {
            URL.revokeObjectURL(posterSrc);
          }
        } catch {
          /* poster optional */
        }

        dispatch(
          setDocument(
            applyTrimmedVideoToDocument(document, nodeId, {
              src: displaySrc,
              poster: poster || undefined,
              uploadKey: key,
            })
          )
        );
        if (oldKey && key && oldKey !== key) {
          void deleteUploadedFile(oldKey).catch(() => {});
        }
        close();
      } catch (err: any) {
        console.warn('[video trim confirm]', err);
        message.error(
          err?.message ||
            t('editor.videoToolbar.trimFail', { defaultValue: '剪辑失败，请重试' })
        );
      } finally {
        hideLoading();
        setConfirmBusy(false);
      }
    })();
  };

  if (!open || !node || !src) return null;

  const dSafe = saneDuration(duration);
  const startPct = dSafe ? (range.start / dSafe) * 100 : 0;
  const endPct = dSafe ? (range.end / dSafe) * 100 : 100;
  const spanSec = Number.isFinite(range.end - range.start)
    ? Math.max(0, range.end - range.start)
    : 0;
  const handlesReady = Boolean(dSafe);

  return (
    <RcbOverlayPortal>
      {/* Same Video.js chrome as hover playback. */}
      <div className="pointer-events-none absolute z-[37] overflow-hidden" style={plateStyle}>
        <div className="absolute inset-0 overflow-hidden">
          {playSrc ? (
            <VideoJsPlayer
              src={playSrc}
              poster={String(node.attrs?.poster || '').trim() || undefined}
              layout="fill"
              controlsMode="hover"
              controlsVisible
              muted
              videoPointerNone
              crop={crop}
              trimStart={range.start}
              trimEnd={range.end}
              onReady={onPlayerReady}
              className="h-full w-full"
            />
          ) : null}
        </div>
      </div>

      {/* Bottom trim toolbar — filmstrip + confirm only. */}
      <div
        data-video-trim-toolbar
        data-sel-toolbar
        className="pointer-events-auto absolute z-[38]"
        style={toolbarStyle}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
      >
        <FloatingToolbar className="relative gap-1 py-1.5 pl-[15px] pr-2.5">
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 text-[12px] font-medium text-[var(--ink)]">
            <HiOutlineScissors className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('editor.videoToolbar.trim', { defaultValue: '剪辑' })}</span>
          </span>

          <ImageToolSep />

          <div
            ref={stripRef}
            className="relative h-14 w-[min(420px,52vw)] shrink-0 touch-none select-none overflow-visible rounded-xl bg-[#1a1a1a]"
          >
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <div className="flex h-full w-full">
                {(frames.length ? frames : Array.from({ length: 12 }, () => '')).map((url, i) => (
                  <div key={i} className="h-full min-w-0 flex-1 bg-[#2a2a2a]">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        className="pointer-events-none h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="h-full w-full animate-pulse bg-[#333]" />
                    )}
                  </div>
                ))}
              </div>
              {/* Dim unselected regions. */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-black/55"
                style={{ width: `${Math.max(0, Math.min(100, startPct))}%` }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-black/55"
                style={{ width: `${Math.max(0, Math.min(100, 100 - endPct))}%` }}
              />
            </div>
            {/*
              White selection: top/bottom rails meet handles at sharp corners;
              only the outer face of each handle is lightly rounded (CapCut-style).
            */}
            <div
              role="slider"
              aria-valuemin={0}
              aria-valuemax={Math.round(dSafe || 0)}
              aria-valuenow={Math.round(spanSec)}
              tabIndex={0}
              className="absolute inset-y-0 z-[1] cursor-grab active:cursor-grabbing"
              style={{
                left: `${Math.max(0, Math.min(100, startPct))}%`,
                width: `${Math.max(2, Math.min(100, endPct - startPct))}%`,
              }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement | null)?.closest?.('[data-trim-handle]')) return;
                e.preventDefault();
                e.stopPropagation();
                (e.nativeEvent as any).stopImmediatePropagation?.();
                startDrag('move', e.clientX, e.currentTarget, e.pointerId);
              }}
            >
              {/* Top / bottom rails — inset to handle width so joins stay square. */}
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 z-[1] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ left: 10, right: 10, height: 3 }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-0 z-[1] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ left: 10, right: 10, height: 3 }}
              />
              <span className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white shadow-sm">
                {handlesReady ? `${spanSec.toFixed(2)} s` : '…'}
              </span>
            </div>
            {/* Edge grips — outer corners rounded, inner (rail join) square. */}
            <div
              data-trim-handle="start"
              role="separator"
              aria-label="Trim start"
              className="absolute inset-y-0 z-[3] flex w-5 cursor-ew-resize touch-none items-center justify-start"
              style={{ left: `${Math.max(0, Math.min(100, startPct))}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.nativeEvent as any).stopImmediatePropagation?.();
                startDrag('start', e.clientX, e.currentTarget, e.pointerId);
              }}
            >
              <span
                className="pointer-events-none flex h-full w-[10px] items-center justify-center bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ borderRadius: '6px 0 0 6px' }}
              >
                <span className="h-4 w-[2px] rounded-full bg-black/85" />
              </span>
            </div>
            <div
              data-trim-handle="end"
              role="separator"
              aria-label="Trim end"
              className="absolute inset-y-0 z-[3] flex w-5 -translate-x-full cursor-ew-resize touch-none items-center justify-end"
              style={{ left: `${Math.max(0, Math.min(100, endPct))}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.nativeEvent as any).stopImmediatePropagation?.();
                startDrag('end', e.clientX, e.currentTarget, e.pointerId);
              }}
            >
              <span
                className="pointer-events-none flex h-full w-[10px] items-center justify-center bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ borderRadius: '0 6px 6px 0' }}
              >
                <span className="h-4 w-[2px] rounded-full bg-black/85" />
              </span>
            </div>
          </div>

          <ImageToolSep />

          <button
            type="button"
            disabled={!handlesReady || confirmBusy}
            className="ml-1 inline-flex h-7 min-w-[52px] items-center justify-center gap-1 rounded-xl px-2.5 text-[12px] font-medium bg-[var(--ink)] text-[var(--on-brand)] transition hover:opacity-90 disabled:opacity-50"
            onClick={confirm}
          >
            {confirmBusy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              t('editor.videoToolbar.confirm', { defaultValue: '确认' })
            )}
          </button>

          <Tooltip tip={t('editor.videoToolbar.cancel', { defaultValue: '退出' })} placement="top">
            <button
              type="button"
              aria-label={t('editor.videoToolbar.cancel', { defaultValue: '退出' })}
              disabled={confirmBusy}
              className={imageToolBtn}
              onClick={close}
            >
              <BiExit className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
        </FloatingToolbar>
      </div>
    </RcbOverlayPortal>
  );
}
