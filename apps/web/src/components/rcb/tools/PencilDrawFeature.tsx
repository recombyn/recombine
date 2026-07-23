import { useEffect, useRef } from 'react';
import {
  brushPad,
  brushSize,
  findPencilBrush,
  isStampBrush,
  outlinePathFromPoints,
  polylinePathD,
  samplePolyline,
  serializePathPressures,
  stampSizeForBrush,
  stampSpacingForBrush,
  type PencilBrushId,
} from './pencilBrushes';
import { getTintedStampSrc } from './stampTint';
import {
  rcbScreenToScene,
} from '../core/math';
import {
  useRcbCamera,
} from '../camera/context';
import {
  type RcbCamera as CanvasCamera,
} from '../core/types';
import RcbSceneOverlaySvg from '../canvas/RcbSceneOverlaySvg';

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
  // Prefer the full viewport stage so drawing works outside the finite SVG paper.
  if (opts.stageEl) return rcbScreenToScene(opts.camera, opts.stageEl, clientX, clientY);
  return clientToPaperScene(opts.paperEl, opts.artboard, clientX, clientY);
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
  // Pad by tip + a little slack so thick ink near the AABB edge still qualifies.
  const pad = Math.max(radius * 2, radius + 8);
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
export default function PencilDrawFeature({
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
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const pts = useRef<{ x: number; y: number; pressure?: number }[]>([]);
  const drawing = useRef(false);
  const previewPathRef = useRef<SVGPathElement | null>(null);
  const previewStampsRef = useRef<SVGGElement | null>(null);
  const tipCursorRef = useRef<SVGCircleElement | null>(null);
  const eraseTrailRef = useRef<SVGPathElement | null>(null);
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

  const toScene = (clientX: number, clientY: number) =>
    clientToDrawScene(
      { stageEl, paperEl, artboard, camera: cameraRef.current },
      clientX,
      clientY
    );

  /** World-space tip diameter — matches painted ink (brush sizeFactor / stamp size). */
  const tipDiameter = () => {
    const w = Math.max(1, Number(widthRef.current) || 1);
    if (eraseModeRef.current) return Math.max(8, w);
    const brush = findPencilBrush(brushRef.current);
    if (isStampBrush(brush.id, brush.stampSrc)) return stampSizeForBrush(brush, w);
    return brushSize(brush, w);
  };
  const tipRadius = () => tipDiameter() / 2;

  /** Eraser tip — same diameter for trail and commit. */
  const eraseTipDiameter = () => Math.max(8, Number(widthRef.current) || 1);
  const eraseTipRadius = () => eraseTipDiameter() / 2;

  const paintTipCursor = (p: { x: number; y: number } | null) => {
    const el = tipCursorRef.current;
    if (!el) return;
    if (!p) {
      el.setAttribute('visibility', 'hidden');
      return;
    }
    const zoom = Math.max(0.05, cameraRef.current.zoom || 1);
    const r = tipRadius();
    // Radius tracks brush size in world space; ring stroke stays ~1px on screen.
    el.setAttribute('cx', String(p.x));
    el.setAttribute('cy', String(p.y));
    el.setAttribute('r', String(r));
    el.setAttribute('stroke-width', String(1.25 / zoom));
    el.setAttribute('stroke-dasharray', `${3 / zoom} ${2 / zoom}`);
    el.setAttribute('visibility', 'visible');
  };

  const clearStampPreview = () => {
    const g = previewStampsRef.current;
    if (g) while (g.firstChild) g.removeChild(g.firstChild);
  };

  const paintPreview = (points: { x: number; y: number; pressure?: number }[]) => {
    const path = previewPathRef.current;
    if (!path) return;
    if (eraseModeRef.current) {
      path.setAttribute('d', '');
      clearStampPreview();
      return;
    }
    const brush = findPencilBrush(brushRef.current);
    if (isStampBrush(brush.id, brush.stampSrc) && brush.stampSrc && points.length >= 2) {
      path.setAttribute('d', '');
      const g = previewStampsRef.current;
      if (!g) return;
      clearStampPreview();
      const size = stampSizeForBrush(brush, widthRef.current);
      const spacing = stampSpacingForBrush(brush, widthRef.current);
      const samples = samplePolyline(points, spacing);
      const tip = getTintedStampSrc(brush.stampSrc, colorRef.current);
      const ns = 'http://www.w3.org/2000/svg';
      for (const p of samples) {
        const img = document.createElementNS(ns, 'image');
        img.setAttribute('href', tip);
        img.setAttribute('x', String(p.x - size / 2));
        img.setAttribute('y', String(p.y - size / 2));
        img.setAttribute('width', String(size));
        img.setAttribute('height', String(size));
        img.setAttribute('opacity', String(opacityRef.current));
        img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        g.appendChild(img);
      }
      return;
    }
    clearStampPreview();
    if (points.length < 2) {
      path.setAttribute('d', '');
      return;
    }
    const pressures = points.map((p) => p.pressure);
    const hasPressure = pressures.some((p) => typeof p === 'number' && p > 0);
    const d = outlinePathFromPoints(points, widthRef.current, brush.id, {
      pressureEnabled: pressureRef.current,
      pressures: hasPressure
        ? pressures.map((p) => (typeof p === 'number' && p > 0 ? p : 0.5))
        : undefined,
    });
    path.setAttribute('d', d);
    path.setAttribute('fill', colorRef.current);
    path.setAttribute('fill-opacity', String(opacityRef.current));
    path.setAttribute('stroke', 'none');
  };

  const paintEraseTrail = (points: { x: number; y: number }[]) => {
    const el = eraseTrailRef.current;
    if (!el) return;
    if (!eraseModeRef.current || points.length < 2) {
      el.setAttribute('d', '');
      return;
    }
    const d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
    el.setAttribute('d', d);
    el.setAttribute('stroke-width', String(eraseTipDiameter()));
  };

  useEffect(() => {
    const hitEl = stageEl || paperEl;
    if (!enabled || !hitEl) return undefined;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Ignore chrome / overlays outside the canvas stage content.
      const t = e.target as Element | null;
      if (t?.closest?.('[data-sel-toolbar],[data-frame-toolbar],[data-ctx-menu],[data-image-tool-panel],[data-shape-style-panel]')) {
        return;
      }
      const p = toScene(e.clientX, e.clientY);
      const pressure = pressureRef.current ? pointerPressure(e) : undefined;
      drawing.current = true;
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

    const onMove = (e: PointerEvent) => {
      if (!drawing.current) {
        paintTipCursor(toScene(e.clientX, e.clientY));
        return;
      }
      const p = toScene(e.clientX, e.clientY);
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
      try {
        hitEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      const pathEl = previewPathRef.current;
      if (pathEl) pathEl.setAttribute('d', '');
      clearStampPreview();
      paintEraseTrail([]);
      const wasErase = eraseModeRef.current;
      const points = pts.current;
      pts.current = [];
      paintTipCursor(toScene(e.clientX, e.clientY));
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
  }, [enabled, stageEl, paperEl, artboard, onCommit]);

  useEffect(() => {
    if (!eraseMode) {
      paintEraseTrail([]);
    }
  }, [eraseMode]);

  // Refresh tip radius when slider / brush changes (even if pointer is idle).
  useEffect(() => {
    const el = tipCursorRef.current;
    if (!el || el.getAttribute('visibility') === 'hidden') return;
    const zoom = Math.max(0.05, camera.zoom || 1);
    el.setAttribute('r', String(tipRadius()));
    el.setAttribute('stroke-width', String(1.25 / zoom));
    el.setAttribute('stroke-dasharray', `${3 / zoom} ${2 / zoom}`);
  }, [strokeWidth, brushId, eraseMode, camera.zoom]);

  useEffect(() => {
    const hitEl = stageEl || paperEl;
    if (!enabled || !hitEl) return undefined;
    const prev = hitEl.style.cursor;
    hitEl.style.cursor = 'none';
    return () => {
      hitEl.style.cursor = prev;
    };
  }, [enabled, stageEl, paperEl]);

  if (!enabled) return null;

  return (
    <RcbSceneOverlaySvg>
      <path
        ref={previewPathRef}
        fill={strokeColor}
        fillOpacity={Math.min(1, Math.max(0, strokeOpacity))}
        stroke="none"
      />
      <g ref={previewStampsRef} opacity={Math.min(1, Math.max(0, strokeOpacity))} />
      <path
        ref={eraseTrailRef}
        fill="none"
        stroke="rgba(148,163,184,0.35)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        ref={tipCursorRef}
        visibility="hidden"
        fill="rgba(148,163,184,0.25)"
        stroke="rgba(71,85,105,0.85)"
        strokeWidth={1.25}
        strokeDasharray="3 2"
      />
    </RcbSceneOverlaySvg>
  );
}
