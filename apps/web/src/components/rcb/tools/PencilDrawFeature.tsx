import { useEffect, useRef, useState, memo } from 'react';
import {
  brushPad,
  brushSize,
  findPencilBrush,
  interpolateStrokeGaps,
  isStampBrush,
  outlinePathFromPoints,
  paintStampDabs,
  pencilSampleMinStep,
  polylinePathD,
  serializePathPressures,
  STAMP_MAX_DABS_LIVE,
  STROKE_GAP_INTERP,
  streamlinePencilPoints,
  emptyStampLiveWalk,
  extendStampLiveWalk,
  normalizeStampPressures,
  type PencilBrushId,
  type StampDab,
  type StampLiveWalk,
} from './pencilBrushes';
import { getTintedStampSrc, preloadStampSrc, STAMP_TINT_READY_EVENT } from './stampTint';
import {
  rcbCameraCssZoom,
  rcbCameraScreenOffset,
  rcbClientDeltaToScene,
  rcbResolveViewportEl,
  rcbScreenToScene,
  rcbViewportMetrics,
} from '../core/math';
import {
  useRcbCamera,
  useRcbViewportEl,
} from '../camera/context';
import {
  type RcbCamera as CanvasCamera,
} from '../core/types';
import { sceneSurfaceSvgProps } from '@/components/rcb/scene/paint/sceneToSvg';
import { readDevicePixelRatio } from '@/components/rcb/core/dpr';

type SceneBox = { left: number; top: number; width: number; height: number };

type PencilPreview =
  | {
      box: SceneBox;
      mode: 'erase';
      trailD: string;
      tip: { x: number; y: number } | null;
      tipR: number;
      trailW: number;
      tipStroke: number;
      tipDash: string;
    }
  | {
      box: SceneBox;
      mode: 'ink';
      pathD: string;
      color: string;
      opacity: number;
    }
  | {
      box: SceneBox;
      mode: 'stamp';
      opacity: number;
    };

import pencilCursorUrl from '@/assets/svg/editor/cursor_pencil.svg?url';
import eraserCursorUrl from '@/assets/svg/editor/cursor_eraser.svg?url';
import penCursorUrl from '@/assets/svg/editor/cursor_pen.svg?url';
import bucketCursorUrl from '@/assets/svg/editor/cursor_bucket.svg?url';

/** CSS cursors — icons in `assets/svg/editor/cursor_*.svg` (hotspot = tip). */
export const PENCIL_CURSOR = `url("${pencilCursorUrl}") 2 13, crosshair`;
export const ERASER_CURSOR = `url("${eraserCursorUrl}") 3 15, crosshair`;
/** Pen nib is at viewBox (2,2) on 24→18 CSS: hotspot ≈ (1.5,1.5) → use 2 2 was ~0.5px late; 1 1 tracks the tip. */
export const PEN_CURSOR = `url("${penCursorUrl}") 1 1, crosshair`;
export const BUCKET_CURSOR = `url("${bucketCursorUrl}") 15 18, fill`;

/** Cap live tip bitmap edge (device px). Full-viewport @2× needs ~3–4k. */
const STAMP_PREVIEW_MAX_PX = 4096;

const tipImageCache = new Map<string, HTMLImageElement>();

function tipImageForSrc(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = tipImageCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = src;
    tipImageCache.set(src, img);
  }
  if (img.complete && (img.naturalWidth || img.width)) return img;
  return null;
}

type StampLiveBlit = {
  boxKey: string;
  /** Device pixels per scene unit used for the bitmap. */
  scale: number;
  painted: number;
  tipKey: string;
};

/**
 * Paint tip stamps onto the live canvas — no toDataURL (that was the draw lag).
 * Bitmap density tracks camera zoom × DPR so preview isn't soft while drawing.
 */
function blitStampLivePreview(
  canvas: HTMLCanvasElement,
  box: SceneBox,
  dabs: StampDab[],
  tip: HTMLImageElement,
  strokeOpacity: number,
  tipKey: string,
  state: StampLiveBlit,
  cameraZoom: number
): StampLiveBlit {
  const dpr = Math.max(1, readDevicePixelRatio());
  const zoom = Math.max(0.05, cameraZoom || 1);
  // Match on-screen density (scene → CSS zoom → device px).
  const want = dpr * zoom;
  const maxSide = STAMP_PREVIEW_MAX_PX;
  const scale = Math.min(want, maxSide / Math.max(box.width, box.height, 1));
  const cw = Math.max(1, Math.ceil(box.width * scale));
  const ch = Math.max(1, Math.ceil(box.height * scale));
  const boxKey = `${box.left}|${box.top}|${box.width}|${box.height}|${cw}x${ch}`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return state;

  const sameSurface =
    state.boxKey === boxKey &&
    state.tipKey === tipKey &&
    state.scale === scale &&
    canvas.width === cw &&
    canvas.height === ch;

  if (!sameSurface) {
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(scale, 0, 0, scale, -box.left * scale, -box.top * scale);
    paintStampDabs(ctx, dabs, tip, strokeOpacity, 0);
    return { boxKey, scale, painted: dabs.length, tipKey };
  }

  if (dabs.length <= state.painted) {
    return state;
  }
  ctx.setTransform(scale, 0, 0, scale, -box.left * scale, -box.top * scale);
  paintStampDabs(ctx, dabs, tip, strokeOpacity, state.painted);
  return { boxKey, scale, painted: dabs.length, tipKey };
}

function clientToPaperScene(
  paperEl: HTMLElement | null,
  artboard: { x?: number; y?: number; width: number; height: number },
  clientX: number,
  clientY: number
) {
  if (!paperEl) return { x: 0, y: 0 };
  const rect = paperEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const w = Math.max(1, artboard.width);
  const h = Math.max(1, artboard.height);
  const ox = Number(artboard.x) || 0;
  const oy = Number(artboard.y) || 0;
  return {
    x: ox + ((clientX - rect.left) / rect.width) * w,
    y: oy + ((clientY - rect.top) / rect.height) * h,
  };
}

function clientToDrawScene(
  opts: {
    stageEl: HTMLElement | null;
    paperEl: HTMLElement | null;
    artboard: { width: number; height: number };
    camera: CanvasCamera;
  },
  clientX: number,
  clientY: number
) {
  // Prefer a *connected* stage — prop can go stale after resize remounts.
  const stage = rcbResolveViewportEl(opts.stageEl);
  if (stage) return rcbScreenToScene(opts.camera, stage, clientX, clientY);
  return clientToPaperScene(opts.paperEl, opts.artboard, clientX, clientY);
}

/** Stable scene rect covering the current viewport (for stroke preview — avoids per-point shell resize jitter). */
function visibleSceneOverlayBox(
  camera: CanvasCamera,
  stageEl: HTMLElement | null
): SceneBox | null {
  const stage = rcbResolveViewportEl(stageEl);
  if (!stage) return null;
  const { clientWidth, clientHeight } = rcbViewportMetrics(stage);
  if (!(clientWidth > 0 && clientHeight > 0)) return null;
  const z = rcbCameraCssZoom(camera);
  const { x: camX, y: camY } = rcbCameraScreenOffset(camera);
  const pad = 48 / z;
  return {
    left: (-camX) / z - pad,
    top: (-camY) / z - pad,
    width: clientWidth / z + pad * 2,
    height: clientHeight / z + pad * 2,
  };
}

function unionSceneOverlayBox(a: SceneBox, b: SceneBox): SceneBox {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export type PencilEraseTarget = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PencilEraseStroke = {
  /** Eraser centerline in scene/paper coords. */
  points: { x: number; y: number }[];
  /** Eraser brush radius (half of UI stroke width). */
  radius: number;
};

type PencilDrawFeatureProps = {
  enabled: boolean;
  artboard: { width: number; height: number };
  paperEl: HTMLElement | null;
  /** Full viewport stage — when set, drawing works anywhere on screen (not only SVG paper). */
  stageEl?: HTMLElement | null;
  strokeColor?: string;
  strokeWidth?: number;
  /** 0–1 preview opacity while painting. */
  strokeOpacity?: number;
  brushId?: PencilBrushId | string;
  /** Use stylus/touch pressure and brush speed simulation. */
  pressureEnabled?: boolean;
  /** Tip hardness 0–100. */
  hardness?: number;
  /** Erase ink under the brush instead of drawing. */
  eraseMode?: boolean;
  eraseTargets?: PencilEraseTarget[];
  onCommit: (
    pathD: string,
    box: { left: number; top: number; width: number; height: number },
    meta?: { pathPressure?: string; brushHardness?: number; brushStampSrc?: string }
  ) => void;
  onErase?: (stroke: PencilEraseStroke) => void;
};

function pointerPressure(e: PointerEvent): number | undefined {
  // Real hardware pressure only (pen / touch). Mouse always undefined → constant width.
  // Allow 0 (lightest) — do not invent speed-based pressure.
  if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return undefined;
  const p = Number(e.pressure);
  if (!Number.isFinite(p)) return undefined;
  return Math.min(1, Math.max(0, p));
}

function eraseTargetsNearStroke(
  points: { x: number; y: number }[],
  radius: number,
  targets: PencilEraseTarget[]
): boolean {
  if (!points.length || !targets.length) return false;
  // Pad by tip + slack so thick ink near the node AABB edge still qualifies.
  const pad = Math.max(radius * 2, radius + 24);
  for (const t of targets) {
    const l = t.left - pad;
    const r = t.left + t.width + pad;
    const top = t.top - pad;
    const b = t.top + t.height + pad;
    for (const p of points) {
      if (p.x >= l && p.x <= r && p.y >= top && p.y <= b) return true;
    }
  }
  return false;
}

/** Freehand pencil → store baseline centerline; paint filled ink centered on that path. */
function PencilDrawFeature({
  enabled,
  artboard,
  paperEl,
  stageEl = null,
  strokeColor = '#333333',
  strokeWidth = 10,
  strokeOpacity = 1,
  brushId = 'solid',
  pressureEnabled = true,
  hardness = 80,
  eraseMode = false,
  eraseTargets = [],
  onCommit,
  onErase,
}: PencilDrawFeatureProps) {
  const camera = useRcbCamera();
  const viewportEl = useRcbViewportEl();
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const pts = useRef<{ x: number; y: number; pressure?: number }[]>([]);
  const lastClientRef = useRef<{ x: number; y: number } | null>(null);
  const strokeScaleRef = useRef({ scaleX: 1, scaleY: 1 });
  const drawing = useRef(false);
  /** Locked overlay viewport for the active stroke — stops per-point shell resize jitter. */
  const strokeViewBoxRef = useRef<SceneBox | null>(null);
  const stampCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stampBlitRef = useRef<StampLiveBlit>({
    boxKey: '',
    scale: 1,
    painted: 0,
    tipKey: '',
  });
  const stampWalkRef = useRef<StampLiveWalk>(emptyStampLiveWalk());
  const redrawRafRef = useRef(0);
  const redrawOverlayRef = useRef<() => void>(() => {});
  const [preview, setPreview] = useState<PencilPreview | null>(null);
  const lastTipPosRef = useRef<{ x: number; y: number } | null>(null);
  const brushRef = useRef(brushId);
  const widthRef = useRef(strokeWidth);
  const colorRef = useRef(strokeColor);
  const opacityRef = useRef(strokeOpacity);
  const pressureRef = useRef(pressureEnabled);
  const hardnessRef = useRef(hardness);
  const eraseModeRef = useRef(eraseMode);
  const eraseTargetsRef = useRef(eraseTargets);
  const onEraseRef = useRef(onErase);
  brushRef.current = brushId;
  widthRef.current = strokeWidth;
  colorRef.current = strokeColor;
  opacityRef.current = Math.min(1, Math.max(0, strokeOpacity));
  pressureRef.current = pressureEnabled;
  hardnessRef.current = hardness;
  eraseModeRef.current = eraseMode;
  eraseTargetsRef.current = eraseTargets;
  onEraseRef.current = onErase;

  const liveStage = rcbResolveViewportEl(viewportEl, stageEl);
  const toScene = (clientX: number, clientY: number) =>
    clientToDrawScene(
      { stageEl: liveStage, paperEl, artboard, camera: cameraRef.current },
      clientX,
      clientY
    );

  /** Eraser tip — same diameter for cursor ring, trail, and commit (matches UI Px). */
  const eraseTipDiameter = () => Math.max(1, Number(widthRef.current) || 1);
  const eraseTipRadius = () => eraseTipDiameter() / 2;

  const pointsBounds = (
    points: Array<{ x: number; y: number }>,
    pad: number
  ) => {
    if (!points.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return {
      left: minX - pad,
      top: minY - pad,
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2),
    };
  };

  const redrawOverlay = () => {
    const zoom = Math.max(0.05, cameraRef.current.zoom || 1);
    const tip = lastTipPosRef.current;
    const points = pts.current;
    const pad = Math.max(
      eraseTipDiameter(),
      brushSize(findPencilBrush(brushRef.current), widthRef.current),
      8
    );
    const all: Array<{ x: number; y: number }> = [...points];
    if (tip) all.push(tip);
    const contentBox = pointsBounds(all, pad);
    if (!contentBox) {
      setPreview(null);
      strokeViewBoxRef.current = null;
      return;
    }
    let box = contentBox;
    if (drawing.current) {
      let view = strokeViewBoxRef.current;
      if (!view) {
        view =
          visibleSceneOverlayBox(cameraRef.current, liveStage) ||
          unionSceneOverlayBox(contentBox, {
            left: contentBox.left - 256,
            top: contentBox.top - 256,
            width: contentBox.width + 512,
            height: contentBox.height + 512,
          });
        strokeViewBoxRef.current = view;
      } else if (
        contentBox.left < view.left ||
        contentBox.top < view.top ||
        contentBox.left + contentBox.width > view.left + view.width ||
        contentBox.top + contentBox.height > view.top + view.height
      ) {
        view = unionSceneOverlayBox(view, contentBox);
        strokeViewBoxRef.current = view;
      }
      box = view;
    }

    if (eraseModeRef.current) {
      setPreview({
        box,
        mode: 'erase',
        trailD: points.length >= 2 ? polylinePathD(points) : '',
        tip,
        tipR: eraseTipRadius(),
        trailW: eraseTipDiameter(),
        tipStroke: 1.25 / zoom,
        tipDash: `${3 / zoom} ${2 / zoom}`,
      });
      return;
    }

    if (points.length < 2) {
      setPreview(null);
      return;
    }
    const brush = findPencilBrush(brushRef.current);
    // Tip brushes: paint onto a live <canvas> (no per-frame PNG encode).
    if (isStampBrush(brush.id, brush.stampSrc) && brush.stampSrc) {
      const tinted = getTintedStampSrc(
        brush.stampSrc,
        colorRef.current,
        hardnessRef.current
      );
      const tipImg = tipImageForSrc(tinted);
      if (!tipImg) {
        const pending = tipImageCache.get(tinted);
        pending?.addEventListener('load', () => redrawOverlayRef.current(), { once: true });
        return;
      }
      // Incremental dab walk — avoid rebuilding thousands of tips every frame.
      stampWalkRef.current = extendStampLiveWalk(
        stampWalkRef.current,
        points,
        brush,
        widthRef.current,
        {
          hardness: hardnessRef.current,
          pressureEnabled: pressureRef.current,
          maxDabs: STAMP_MAX_DABS_LIVE,
        }
      );
      const samples = stampWalkRef.current.dabs;
      if (!samples.length) return;
      const canvas = stampCanvasRef.current;
      if (canvas) {
        stampBlitRef.current = blitStampLivePreview(
          canvas,
          box,
          samples,
          tipImg,
          opacityRef.current,
          tinted,
          stampBlitRef.current,
          zoom
        );
      }
      setPreview((prev) => {
        if (
          prev?.mode === 'stamp' &&
          prev.box.left === box.left &&
          prev.box.top === box.top &&
          prev.box.width === box.width &&
          prev.box.height === box.height
        ) {
          return prev;
        }
        return { box, mode: 'stamp', opacity: 1 };
      });
      return;
    }

    const pressures = points.map((p) => p.pressure);
    const hasPressure = pressures.some((p) => typeof p === 'number' && Number.isFinite(p));
    const d = outlinePathFromPoints(points, widthRef.current, brush.id, {
      pressureEnabled: pressureRef.current,
      hardness: hardnessRef.current,
      pressures: hasPressure
        ? pressures.map((p) => (typeof p === 'number' && Number.isFinite(p) ? p : 0.5))
        : undefined,
    });
    setPreview({
      box,
      mode: 'ink',
      pathD: d,
      color: colorRef.current,
      opacity: opacityRef.current,
    });
  };
  redrawOverlayRef.current = redrawOverlay;

  const paintTipCursor = (p: { x: number; y: number } | null) => {
    if (!eraseModeRef.current) {
      if (!p) lastTipPosRef.current = null;
      redrawOverlay();
      return;
    }
    lastTipPosRef.current = p;
    redrawOverlay();
  };

  const paintPreview = (points: { x: number; y: number; pressure?: number }[]) => {
    pts.current = points;
    if (redrawRafRef.current) return;
    redrawRafRef.current = window.requestAnimationFrame(() => {
      redrawRafRef.current = 0;
      redrawOverlay();
    });
  };

  const paintEraseTrail = (points: { x: number; y: number }[]) => {
    // pts.current already holds erase points while drawing; force redraw.
    void points;
    redrawOverlay();
  };

  useEffect(() => {
    const hitEl = rcbResolveViewportEl(viewportEl, stageEl, paperEl);
    if (!enabled || !hitEl) return undefined;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Ignore chrome / overlays outside the canvas stage content.
      const t = e.target as Element | null;
      if (t?.closest?.('[data-sel-toolbar],[data-frame-toolbar],[data-ctx-menu],[data-image-tool-panel],[data-shape-style-panel]')) {
        return;
      }
      const metrics = rcbViewportMetrics(hitEl);
      strokeScaleRef.current = { scaleX: metrics.scaleX, scaleY: metrics.scaleY };
      const p = toScene(e.clientX, e.clientY);
      const pressure = pressureRef.current ? pointerPressure(e) : undefined;
      drawing.current = true;
      strokeViewBoxRef.current = null;
      stampBlitRef.current = { boxKey: '', scale: 1, painted: 0, tipKey: '' };
      stampWalkRef.current = emptyStampLiveWalk();
      lastClientRef.current = { x: e.clientX, y: e.clientY };
      pts.current = [pressure != null ? { ...p, pressure } : p];
      if (eraseModeRef.current) {
        paintTipCursor(p);
        paintEraseTrail(pts.current);
      } else {
        paintTipCursor(p);
        paintPreview(pts.current);
      }
      hitEl.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };

    const sampleScenePoint = (e: PointerEvent) => {
      const lastPt = pts.current[pts.current.length - 1];
      const lastClient = lastClientRef.current;
      if (drawing.current && lastPt && lastClient) {
        const { scaleX, scaleY } = strokeScaleRef.current;
        const d = rcbClientDeltaToScene(
          rcbCameraCssZoom(cameraRef.current),
          e.clientX - lastClient.x,
          e.clientY - lastClient.y,
          scaleX,
          scaleY
        );
        lastClientRef.current = { x: e.clientX, y: e.clientY };
        return { x: lastPt.x + d.x, y: lastPt.y + d.y };
      }
      lastClientRef.current = { x: e.clientX, y: e.clientY };
      return toScene(e.clientX, e.clientY);
    };

    const appendStrokePoint = (raw: {
      x: number;
      y: number;
      pressure?: number;
    }) => {
      const brush = findPencilBrush(brushRef.current);
      const minStep = pencilSampleMinStep(widthRef.current, brush);
      const last = pts.current[pts.current.length - 1];
      if (last && Math.hypot(raw.x - last.x, raw.y - last.y) < minStep) {
        return false;
      }
      const streamline = Number(brush.options?.streamline) || 0;
      let next = raw;
      if (last && streamline > 0) {
        const a = Math.min(0.92, Math.max(0, streamline));
        next = {
          x: last.x + (raw.x - last.x) * (1 - a),
          y: last.y + (raw.y - last.y) * (1 - a),
          ...(raw.pressure != null
            ? {
                pressure:
                  last.pressure != null
                    ? last.pressure + (raw.pressure - last.pressure) * (1 - a)
                    : raw.pressure,
              }
            : {}),
        };
        if (Math.hypot(next.x - last.x, next.y - last.y) < minStep * 0.5) {
          return false;
        }
      }
      // Gap fill so sparse tablet events still stamp continuously.
      if (last && Math.hypot(next.x - last.x, next.y - last.y) > STROKE_GAP_INTERP) {
        const filled = interpolateStrokeGaps([last, next], STROKE_GAP_INTERP);
        for (let i = 1; i < filled.length; i += 1) pts.current.push(filled[i]);
      } else {
        pts.current.push(next);
      }
      return true;
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing.current) {
        paintTipCursor(toScene(e.clientX, e.clientY));
        return;
      }
      const coalesced =
        typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const events = coalesced.length ? coalesced : [e];
      let changed = false;
      let tip = pts.current[pts.current.length - 1] || toScene(e.clientX, e.clientY);
      for (const ev of events) {
        const p = sampleScenePoint(ev);
        tip = p;
        const pressure = pressureRef.current ? pointerPressure(ev) : undefined;
        const pt = pressure != null ? { ...p, pressure } : p;
        if (eraseModeRef.current) {
          const last = pts.current[pts.current.length - 1];
          const minStep = Math.max(0.12, eraseTipRadius() * 0.15);
          if (last && Math.hypot(p.x - last.x, p.y - last.y) < minStep) {
            continue;
          }
          pts.current.push(pt);
          changed = true;
        } else if (appendStrokePoint(pt)) {
          changed = true;
        }
      }
      paintTipCursor(tip);
      if (!changed) return;
      if (eraseModeRef.current) paintEraseTrail(pts.current);
      else paintPreview(pts.current);
    };

    const onMoveWhileDrawing = (e: PointerEvent) => {
      if (!drawing.current) return;
      onMove(e);
    };

    const onMoveIdle = (e: PointerEvent) => {
      if (drawing.current) return;
      paintTipCursor(toScene(e.clientX, e.clientY));
    };

    const finishStroke = (e: PointerEvent, commit: boolean) => {
      if (!drawing.current) return;
      drawing.current = false;
      strokeViewBoxRef.current = null;
      lastClientRef.current = null;
      if (redrawRafRef.current) {
        window.cancelAnimationFrame(redrawRafRef.current);
        redrawRafRef.current = 0;
      }
      stampBlitRef.current = { boxKey: '', scale: 1, painted: 0, tipKey: '' };
      stampWalkRef.current = emptyStampLiveWalk();
      try {
        hitEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      setPreview(null);
      const stampEl = stampCanvasRef.current;
      if (stampEl) {
        const sctx = stampEl.getContext('2d');
        sctx?.setTransform(1, 0, 0, 1, 0, 0);
        sctx?.clearRect(0, 0, stampEl.width, stampEl.height);
      }
      const wasErase = eraseModeRef.current;
      // Pin the last sample to the real tip, then optional full-path polish.
      if (!wasErase && pts.current.length >= 1) {
        const tip = toScene(e.clientX, e.clientY);
        const pressure = pressureRef.current ? pointerPressure(e) : undefined;
        const last = pts.current[pts.current.length - 1];
        if (Math.hypot(tip.x - last.x, tip.y - last.y) > 0.05) {
          pts.current.push(
            pressure != null ? { ...tip, pressure } : tip
          );
        } else {
          pts.current[pts.current.length - 1] = {
            x: tip.x,
            y: tip.y,
            ...(pressure != null ? { pressure } : {}),
          };
        }
        const brush = findPencilBrush(brushRef.current);
        const streamline = Number(brush.options?.streamline) || 0;
        if (streamline > 0 && pts.current.length >= 3) {
          pts.current = streamlinePencilPoints(pts.current, streamline * 0.45);
        }
      }
      const points = pts.current;
      pts.current = [];
      if (!wasErase) paintTipCursor(null);
      else paintTipCursor(toScene(e.clientX, e.clientY));
      redrawOverlay();
      if (wasErase) {
        if (
          commit &&
          points.length >= 1 &&
          eraseTargetsNearStroke(points, eraseTipRadius(), eraseTargetsRef.current)
        ) {
          onEraseRef.current?.({
            points,
            radius: eraseTipRadius(),
          });
        }
        return;
      }
      if (!commit || points.length < 2) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      points.forEach((pt) => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
      const brush = findPencilBrush(brushRef.current);
      const pad = brushPad(brush, widthRef.current);
      const originX = minX - pad;
      const originY = minY - pad;
      let local = points.map((pt) => ({
        x: pt.x - originX,
        y: pt.y - originY,
        ...(pt.pressure != null ? { pressure: pt.pressure } : {}),
      }));
      if (pressureRef.current && isStampBrush(brush.id, brush.stampSrc)) {
        local = normalizeStampPressures(local);
      }
      // Store baseline centerline (+ optional pressure); sceneToSvg stamps / freehand ink.
      const d = polylinePathD(local);
      const pathPressure = pressureRef.current ? serializePathPressures(local) : undefined;
      onCommit(
        d,
        {
          left: originX,
          top: originY,
          width: Math.max(1, maxX - minX + pad * 2),
          height: Math.max(1, maxY - minY + pad * 2),
        },
        {
          ...(pathPressure ? { pathPressure } : {}),
          brushHardness: hardnessRef.current,
          ...(isStampBrush(brush.id, brush.stampSrc) && brush.stampSrc
            ? { brushStampSrc: brush.stampSrc }
            : {}),
        }
      );
    };

    const onUp = (e: PointerEvent) => finishStroke(e, true);
    const onCancel = (e: PointerEvent) => finishStroke(e, false);
    const onLeave = () => {
      if (!drawing.current) paintTipCursor(null);
    };

    hitEl.addEventListener('pointerdown', onDown, true);
    hitEl.addEventListener('pointermove', onMoveIdle);
    // Window move/up while drawing — stage-only move drops samples when the
    // pointer briefly leaves / is coalesced away (feels choppy / broken).
    window.addEventListener('pointermove', onMoveWhileDrawing);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    hitEl.addEventListener('pointerleave', onLeave);
    return () => {
      hitEl.removeEventListener('pointerdown', onDown, true);
      hitEl.removeEventListener('pointermove', onMoveIdle);
      window.removeEventListener('pointermove', onMoveWhileDrawing);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      hitEl.removeEventListener('pointerleave', onLeave);
      paintTipCursor(null);
    };
  }, [enabled, stageEl, paperEl, viewportEl, artboard, onCommit, liveStage]);

  useEffect(() => {
    if (!eraseMode) {
      lastTipPosRef.current = null;
      redrawOverlay();
    }
  }, [eraseMode]);

  // Tip tint finished loading — refresh live stamp bitmap.
  useEffect(() => {
    const onReady = () => {
      if (!drawing.current || pts.current.length < 2) return;
      // New tinted tip — rebuild walk + full blit.
      stampWalkRef.current = emptyStampLiveWalk();
      stampBlitRef.current = { boxKey: '', scale: 1, painted: 0, tipKey: '' };
      redrawOverlayRef.current();
    };
    window.addEventListener(STAMP_TINT_READY_EVENT, onReady);
    return () => window.removeEventListener(STAMP_TINT_READY_EVENT, onReady);
  }, []);

  // Warm tip decode so the first stroke isn't waiting on Image.load.
  useEffect(() => {
    const brush = findPencilBrush(brushId);
    if (!brush.stampSrc) return;
    preloadStampSrc(brush.stampSrc);
    const tinted = getTintedStampSrc(brush.stampSrc, strokeColor, hardness);
    tipImageForSrc(tinted);
  }, [brushId, strokeColor, hardness]);

  // Refresh tip radius / trail width when slider changes (even if pointer is idle).
  useEffect(() => {
    if (!eraseMode) return;
    redrawOverlay();
  }, [strokeWidth, eraseMode, camera.zoom]);

  if (!enabled) return null;

  const stampSurf =
    preview?.mode === 'stamp' ? sceneSurfaceSvgProps(preview.box, camera) : null;
  const svgPreview =
    preview && preview.mode !== 'stamp' ? preview : null;
  const svgSurf = svgPreview ? sceneSurfaceSvgProps(svgPreview.box, camera) : null;

  return (
    <>
      {svgPreview && svgSurf ? (
        <svg
          data-pencil-draw-preview
          data-rcb-infinite="1"
          className="pointer-events-none absolute z-20 overflow-visible"
          width={svgSurf.width}
          height={svgSurf.height}
          viewBox={svgSurf.viewBox}
          preserveAspectRatio="none"
          style={svgSurf.style}
          aria-hidden
        >
          {svgPreview.mode === 'erase' ? (
            <>
              {svgPreview.trailD ? (
                <path
                  d={svgPreview.trailD}
                  fill="none"
                  stroke="rgba(20,20,20,0.28)"
                  strokeWidth={svgPreview.trailW}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {svgPreview.tip ? (
                <circle
                  cx={svgPreview.tip.x}
                  cy={svgPreview.tip.y}
                  r={svgPreview.tipR}
                  fill="rgba(20,20,20,0.12)"
                  stroke="rgba(20,20,20,0.85)"
                  strokeWidth={svgPreview.tipStroke}
                  strokeDasharray={svgPreview.tipDash}
                />
              ) : null}
            </>
          ) : null}
          {svgPreview.mode === 'ink' ? (
            <path
              d={svgPreview.pathD}
              fill={svgPreview.color}
              fillOpacity={svgPreview.opacity}
              stroke="none"
            />
          ) : null}
        </svg>
      ) : null}
      <canvas
        ref={stampCanvasRef}
        data-pencil-stamp-preview
        data-rcb-infinite="1"
        className="pointer-events-none absolute z-20"
        aria-hidden
        style={{
          ...(stampSurf?.style || { left: 0, top: 0, width: 0, height: 0 }),
          display: preview?.mode === 'stamp' ? 'block' : 'none',
          opacity: preview?.mode === 'stamp' ? preview.opacity : 0,
        }}
      />
    </>
  );
}

export default memo(PencilDrawFeature);
