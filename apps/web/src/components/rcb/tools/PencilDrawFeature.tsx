import { useEffect, useRef, memo } from 'react';
import {
  brushPad,
  brushSize,
  findPencilBrush,
  isStampBrush,
  polylinePathD,
  samplePolyline,
  serializePathPressures,
  stampSizeForBrush,
  stampSpacingForBrush,
  type PencilBrushId,
} from './pencilBrushes';
import { getTintedStampSrc } from './stampTint';
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
import RcbSceneOverlayCanvas, {
  type RcbSceneOverlayCanvasHandle,
  type SceneOverlayBox,
} from '../canvas/RcbSceneOverlayCanvas';
import pencilCursorUrl from '@/assets/svg/editor/cursor_pencil.svg?url';
import eraserCursorUrl from '@/assets/svg/editor/cursor_eraser.svg?url';
import penCursorUrl from '@/assets/svg/editor/cursor_pen.svg?url';
import bucketCursorUrl from '@/assets/svg/editor/cursor_bucket.svg?url';

/** CSS cursors — icons in `assets/svg/editor/cursor_*.svg` (hotspot = tip). */
export const PENCIL_CURSOR = `url("${pencilCursorUrl}") 2 13, crosshair`;
export const ERASER_CURSOR = `url("${eraserCursorUrl}") 3 15, crosshair`;
export const PEN_CURSOR = `url("${penCursorUrl}") 2 2, crosshair`;
export const BUCKET_CURSOR = `url("${bucketCursorUrl}") 15 18, cell`;

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

/** Stable scene rect covering the current viewport (for stroke preview — avoids per-point canvas resize jitter). */
function visibleSceneOverlayBox(
  camera: CanvasCamera,
  stageEl: HTMLElement | null
): SceneOverlayBox | null {
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

function unionSceneOverlayBox(a: SceneOverlayBox, b: SceneOverlayBox): SceneOverlayBox {
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
  /** Erase ink under the brush instead of drawing. */
  eraseMode?: boolean;
  eraseTargets?: PencilEraseTarget[];
  onCommit: (
    pathD: string,
    box: { left: number; top: number; width: number; height: number },
    meta?: { pathPressure?: string }
  ) => void;
  onErase?: (stroke: PencilEraseStroke) => void;
};

function pointerPressure(e: PointerEvent): number | undefined {
  // Mouse often reports 0 or 0.5 — only trust real pen/touch pressure.
  if (e.pointerType === 'pen' || e.pointerType === 'touch') {
    const p = Number(e.pressure);
    if (Number.isFinite(p) && p > 0) return Math.min(1, Math.max(0.05, p));
  }
  return undefined;
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

/** Freehand pencil → baseline centerline; ink is SVG stroke along that path. */
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
  /** Locked overlay viewport for the active stroke — stops per-point canvas resize jitter. */
  const strokeViewBoxRef = useRef<SceneOverlayBox | null>(null);
  const overlayRef = useRef<RcbSceneOverlayCanvasHandle>(null);
  const stampImageRef = useRef<HTMLImageElement | null>(null);
  const lastTipPosRef = useRef<{ x: number; y: number } | null>(null);
  const brushRef = useRef(brushId);
  const widthRef = useRef(strokeWidth);
  const colorRef = useRef(strokeColor);
  const opacityRef = useRef(strokeOpacity);
  const pressureRef = useRef(pressureEnabled);
  const eraseModeRef = useRef(eraseMode);
  const eraseTargetsRef = useRef(eraseTargets);
  const onEraseRef = useRef(onErase);
  brushRef.current = brushId;
  widthRef.current = strokeWidth;
  colorRef.current = strokeColor;
  opacityRef.current = Math.min(1, Math.max(0, strokeOpacity));
  pressureRef.current = pressureEnabled;
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
    const handle = overlayRef.current;
    if (!handle) return;
    const zoom = Math.max(0.05, cameraRef.current.zoom || 1);
    const tip = lastTipPosRef.current;
    const points = pts.current;
    const pad = Math.max(
      eraseTipDiameter(),
      brushSize(findPencilBrush(brushRef.current), widthRef.current),
      stampSizeForBrush(findPencilBrush(brushRef.current), widthRef.current),
      8
    );
    const all: Array<{ x: number; y: number }> = [...points];
    if (tip) all.push(tip);
    const contentBox = pointsBounds(all, pad);
    if (!contentBox) {
      handle.clear();
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
    const ctx = handle.beginFrame(box);
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (eraseModeRef.current) {
      if (points.length >= 2) {
        ctx.strokeStyle = 'rgba(20,20,20,0.28)';
        ctx.lineWidth = eraseTipDiameter();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }
      if (tip) {
        const r = eraseTipRadius();
        ctx.fillStyle = 'rgba(20,20,20,0.12)';
        ctx.strokeStyle = 'rgba(20,20,20,0.85)';
        ctx.lineWidth = 1.25 / zoom;
        ctx.setLineDash([3 / zoom, 2 / zoom]);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
      return;
    }

    if (points.length < 2) return;
    const brush = findPencilBrush(brushRef.current);
    if (isStampBrush(brush.id, brush.stampSrc) && brush.stampSrc) {
      const size = stampSizeForBrush(brush, widthRef.current);
      const spacing = stampSpacingForBrush(brush, widthRef.current);
      const samples = samplePolyline(points, spacing);
      const tipSrc = getTintedStampSrc(brush.stampSrc, colorRef.current);
      let img = stampImageRef.current;
      if (!img || img.src !== tipSrc) {
        img = new Image();
        img.src = tipSrc;
        stampImageRef.current = img;
      }
      ctx.globalAlpha = opacityRef.current;
      for (const p of samples) {
        try {
          ctx.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
        } catch {
          /* decode pending */
        }
      }
      ctx.globalAlpha = 1;
      return;
    }

    // Match committed paint (sceneToSvg): centerline + stroke — same as pen.
    const inkW = brushSize(brush, widthRef.current);
    ctx.strokeStyle = colorRef.current;
    ctx.globalAlpha = opacityRef.current;
    ctx.lineWidth = inkW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const paintTipCursor = (p: { x: number; y: number } | null) => {
    if (!eraseModeRef.current || !p) {
      if (!p) lastTipPosRef.current = null;
      if (!eraseModeRef.current) {
        // Draw mode: no tip ring.
        redrawOverlay();
        return;
      }
      lastTipPosRef.current = null;
      redrawOverlay();
      return;
    }
    lastTipPosRef.current = p;
    redrawOverlay();
  };

  const paintPreview = (points: { x: number; y: number; pressure?: number }[]) => {
    pts.current = points;
    redrawOverlay();
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

    const onMove = (e: PointerEvent) => {
      if (!drawing.current) {
        paintTipCursor(toScene(e.clientX, e.clientY));
        return;
      }
      const p = sampleScenePoint(e);
      const pressure = pressureRef.current ? pointerPressure(e) : undefined;
      const pt = pressure != null ? { ...p, pressure } : p;
      if (eraseModeRef.current) {
        const last = pts.current[pts.current.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) {
          paintTipCursor(p);
          return;
        }
        pts.current.push(pt);
        paintTipCursor(p);
        paintEraseTrail(pts.current);
        return;
      }
      const last = pts.current[pts.current.length - 1];
      // Skip near-duplicates to keep streamline stable.
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.6) {
        paintTipCursor(p);
        return;
      }
      pts.current.push(pt);
      paintTipCursor(p);
      paintPreview(pts.current);
    };

    const finishStroke = (e: PointerEvent, commit: boolean) => {
      if (!drawing.current) return;
      drawing.current = false;
      strokeViewBoxRef.current = null;
      lastClientRef.current = null;
      try {
        hitEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      overlayRef.current?.clear();
      const wasErase = eraseModeRef.current;
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
      const local = points.map((pt) => ({
        x: pt.x - originX,
        y: pt.y - originY,
        ...(pt.pressure != null ? { pressure: pt.pressure } : {}),
      }));
      // Store baseline centerline (+ optional pressure); sceneToSvg builds freehand ink.
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
        pathPressure ? { pathPressure } : undefined
      );
    };

    const onUp = (e: PointerEvent) => finishStroke(e, true);
    const onCancel = (e: PointerEvent) => finishStroke(e, false);
    const onLeave = () => {
      if (!drawing.current) paintTipCursor(null);
    };

    hitEl.addEventListener('pointerdown', onDown, true);
    hitEl.addEventListener('pointermove', onMove);
    hitEl.addEventListener('pointerup', onUp);
    hitEl.addEventListener('pointercancel', onCancel);
    hitEl.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      hitEl.removeEventListener('pointerdown', onDown, true);
      hitEl.removeEventListener('pointermove', onMove);
      hitEl.removeEventListener('pointerup', onUp);
      hitEl.removeEventListener('pointercancel', onCancel);
      hitEl.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointercancel', onCancel);
      paintTipCursor(null);
    };
  }, [enabled, stageEl, paperEl, viewportEl, artboard, onCommit, liveStage]);

  useEffect(() => {
    if (!eraseMode) {
      lastTipPosRef.current = null;
      redrawOverlay();
    }
  }, [eraseMode]);

  // Refresh tip radius / trail width when slider changes (even if pointer is idle).
  useEffect(() => {
    if (!eraseMode) return;
    redrawOverlay();
  }, [strokeWidth, eraseMode, camera.zoom]);

  if (!enabled) return null;

  return <RcbSceneOverlayCanvas ref={overlayRef} zClass="z-20" />;
}

export default memo(PencilDrawFeature);
