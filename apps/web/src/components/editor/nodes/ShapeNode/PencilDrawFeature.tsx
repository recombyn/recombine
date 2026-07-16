import { useEffect, useRef } from 'react';
import {
  brushPad,
  findPencilBrush,
  isStampBrush,
  outlinePathFromPoints,
  samplePolyline,
  stampSizeForBrush,
  stampSpacingForBrush,
  type PencilBrushId,
} from '@/components/editor/nodes/ShapeNode/pencilBrushes';
import { getTintedStampSrc } from '@/components/editor/nodes/ShapeNode/stampTint';

function clientToScene(
  paperEl: HTMLElement | null,
  artboard: { width: number; height: number },
  clientX: number,
  clientY: number
) {
  if (!paperEl) return { x: 0, y: 0 };
  const rect = paperEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const w = Math.max(1, artboard.width);
  const h = Math.max(1, artboard.height);
  return {
    x: ((clientX - rect.left) / rect.width) * w,
    y: ((clientY - rect.top) / rect.height) * h,
  };
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
  strokeColor?: string;
  strokeWidth?: number;
  brushId?: PencilBrushId | string;
  /** Erase ink under the brush instead of drawing. */
  eraseMode?: boolean;
  eraseTargets?: PencilEraseTarget[];
  onCommit: (pathD: string, box: { left: number; top: number; width: number; height: number }) => void;
  onErase?: (stroke: PencilEraseStroke) => void;
};

function eraseTargetsNearStroke(
  points: { x: number; y: number }[],
  radius: number,
  targets: PencilEraseTarget[]
): boolean {
  if (!points.length || !targets.length) return false;
  for (const t of targets) {
    const pad = radius;
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

/** Freehand pencil → centerline path; outline rendered via perfect-freehand. */
export default function PencilDrawFeature({
  enabled,
  artboard,
  paperEl,
  strokeColor = '#333333',
  strokeWidth = 10,
  brushId = 'solid',
  eraseMode = false,
  eraseTargets = [],
  onCommit,
  onErase,
}: PencilDrawFeatureProps) {
  const pts = useRef<{ x: number; y: number }[]>([]);
  const drawing = useRef(false);
  const previewPathRef = useRef<SVGPathElement | null>(null);
  const previewStampsRef = useRef<SVGGElement | null>(null);
  const eraseCursorRef = useRef<SVGCircleElement | null>(null);
  const eraseTrailRef = useRef<SVGPathElement | null>(null);
  const brushRef = useRef(brushId);
  const widthRef = useRef(strokeWidth);
  const colorRef = useRef(strokeColor);
  const eraseModeRef = useRef(eraseMode);
  const eraseTargetsRef = useRef(eraseTargets);
  const onEraseRef = useRef(onErase);
  brushRef.current = brushId;
  widthRef.current = strokeWidth;
  colorRef.current = strokeColor;
  eraseModeRef.current = eraseMode;
  eraseTargetsRef.current = eraseTargets;
  onEraseRef.current = onErase;

  const clearStampPreview = () => {
    const g = previewStampsRef.current;
    if (g) while (g.firstChild) g.removeChild(g.firstChild);
  };

  const paintPreview = (points: { x: number; y: number }[]) => {
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
        img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        g.appendChild(img);
      }
      return;
    }
    clearStampPreview();
    const d = outlinePathFromPoints(points, widthRef.current, brushRef.current);
    path.setAttribute('d', d);
    path.setAttribute('fill', colorRef.current);
    path.setAttribute('stroke', 'none');
  };

  const paintEraseCursor = (p: { x: number; y: number } | null) => {
    const el = eraseCursorRef.current;
    if (!el) return;
    if (!p || !eraseModeRef.current) {
      el.setAttribute('visibility', 'hidden');
      return;
    }
    const r = Math.max(4, widthRef.current / 2);
    el.setAttribute('cx', String(p.x));
    el.setAttribute('cy', String(p.y));
    el.setAttribute('r', String(r));
    el.setAttribute('visibility', 'visible');
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
    el.setAttribute('stroke-width', String(Math.max(8, widthRef.current)));
  };

  useEffect(() => {
    if (!enabled || !paperEl) return undefined;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      drawing.current = true;
      pts.current = [p];
      if (eraseModeRef.current) {
        paintEraseCursor(p);
        paintEraseTrail(pts.current);
      } else {
        paintPreview(pts.current);
      }
      paperEl.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing.current) {
        if (eraseModeRef.current) {
          paintEraseCursor(clientToScene(paperEl, artboard, e.clientX, e.clientY));
        }
        return;
      }
      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      if (eraseModeRef.current) {
        const last = pts.current[pts.current.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) {
          paintEraseCursor(p);
          return;
        }
        pts.current.push(p);
        paintEraseCursor(p);
        paintEraseTrail(pts.current);
        return;
      }
      const last = pts.current[pts.current.length - 1];
      // Skip near-duplicates to keep streamline stable.
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.6) return;
      pts.current.push(p);
      paintPreview(pts.current);
    };

    const finishStroke = (e: PointerEvent, commit: boolean) => {
      if (!drawing.current) return;
      drawing.current = false;
      try {
        paperEl.releasePointerCapture?.(e.pointerId);
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
      if (wasErase) {
        paintEraseCursor(clientToScene(paperEl, artboard, e.clientX, e.clientY));
        if (
          commit &&
          points.length >= 1 &&
          eraseTargetsNearStroke(
            points,
            Math.max(4, widthRef.current / 2),
            eraseTargetsRef.current
          )
        ) {
          onEraseRef.current?.({
            points,
            radius: Math.max(4, widthRef.current / 2),
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
      const local = points.map((pt) => ({ x: pt.x - originX, y: pt.y - originY }));
      // Store centerline; sceneToSvg rebuilds the freehand outline from brushStyle + width.
      const d = local.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
      onCommit(d, {
        left: originX,
        top: originY,
        width: Math.max(1, maxX - minX + pad * 2),
        height: Math.max(1, maxY - minY + pad * 2),
      });
    };

    const onUp = (e: PointerEvent) => finishStroke(e, true);
    const onCancel = (e: PointerEvent) => finishStroke(e, false);
    const onLeave = () => {
      if (!drawing.current) paintEraseCursor(null);
    };

    paperEl.addEventListener('pointerdown', onDown);
    paperEl.addEventListener('pointermove', onMove);
    paperEl.addEventListener('pointerup', onUp);
    paperEl.addEventListener('pointercancel', onCancel);
    paperEl.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      paperEl.removeEventListener('pointerdown', onDown);
      paperEl.removeEventListener('pointermove', onMove);
      paperEl.removeEventListener('pointerup', onUp);
      paperEl.removeEventListener('pointercancel', onCancel);
      paperEl.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [enabled, paperEl, artboard, onCommit]);

  useEffect(() => {
    if (!eraseMode) {
      paintEraseCursor(null);
      paintEraseTrail([]);
    }
  }, [eraseMode]);

  useEffect(() => {
    if (!enabled || !paperEl || !eraseMode) return undefined;
    const prev = paperEl.style.cursor;
    paperEl.style.cursor = 'none';
    return () => {
      paperEl.style.cursor = prev;
    };
  }, [enabled, paperEl, eraseMode]);

  if (!enabled) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
      <path ref={previewPathRef} fill={strokeColor} stroke="none" />
      <g ref={previewStampsRef} />
      <path
        ref={eraseTrailRef}
        fill="none"
        stroke="rgba(148,163,184,0.35)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        ref={eraseCursorRef}
        visibility="hidden"
        fill="rgba(148,163,184,0.25)"
        stroke="rgba(71,85,105,0.85)"
        strokeWidth={1.25}
        strokeDasharray="3 2"
      />
    </svg>
  );
}
