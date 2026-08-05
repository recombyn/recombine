import {
  useRcbCamera,
  useRcbDevicePixelRatio,
  useRcbScreenToScene,
  useRcbViewportEl,
} from '../camera/context';
import {
  rcbResolveViewportEl,
  rcbViewportMetrics,
} from '../core/math';
import { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import { ARROW_HEAD, shapeVertexPoints, fillCachedPath2D, strokeCachedPath2D } from '@/components/rcb/scene/document/sceneShapes';
import { getShapeBaselineD } from '@/components/rcb/core/geometry';
import { snapBoxEdgesToGrid, snapCoordToGrid } from '../selection/alignGuides';

function normalizeBox(x0: number, y0: number, x1: number, y1: number) {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    left,
    top,
    width: Math.max(1, Math.abs(x1 - x0)),
    height: Math.max(1, Math.abs(y1 - y0)),
  };
}

type ShapeDrawSession = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  clientX0: number;
  clientY0: number;
  /** Continuously updated from pointerdown/move — never from pointerup/cancel. */
  currentClientX: number;
  currentClientY: number;
  scaleX: number;
  scaleY: number;
  /** Last pointer position before axis snap (for Shift toggle mid-drag). */
  rawX1: number;
  rawY1: number;
  shift: boolean;
  /** Ctrl/Cmd held — skip grid snap for this gesture. */
  skipGrid: boolean;
  pointerId: number;
};

/**
 * Shift+drag line/arrow: lock to the dominant axis (horizontal or vertical).
 * Prefer horizontal when |dx| >= |dy|.
 */
function snapStrokeAxis(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  shiftKey: boolean
): { x1: number; y1: number } {
  if (!shiftKey) return { x1, y1 };
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x1, y1: y0 };
  }
  return { x1: x0, y1 };
}

/** Circle / regular polygon / star stay square while dragging. */
function locksSquareAspect(kind: string) {
  return kind === 'circle' || kind === 'polygon' || kind === 'star';
}

function squareLockedBox(box: { left: number; top: number; width: number; height: number }) {
  const size = Math.max(3, Math.max(box.width, box.height));
  return {
    left: box.left + (box.width - size) / 2,
    top: box.top + (box.height - size) / 2,
    width: size,
    height: size,
  };
}

export type ShapeDrawCommit = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Free-angle stroke endpoints (scene coords). */
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
};

type ShapeDrawFeatureProps = {
  enabled: boolean;
  shapeKind: string;
  artboard: { width: number; height: number };
  paperEl: HTMLElement | null;
  stageEl?: HTMLElement | null;
  onCreate: (kind: string, box: ShapeDrawCommit) => void;
  /**
   * Snap draw corners to document grid (default 1px).
   * Hold Ctrl/Cmd to draw free (integer px still via createShapeNode).
   */
  gridSnap?: boolean;
  gridSize?: number;
};

/** Drag-to-create shapes ? preview matches committed geometry. */
function ShapeDrawFeature({
  enabled,
  shapeKind,
  artboard,
  paperEl,
  stageEl = null,
  onCreate,
  gridSnap = true,
  gridSize = 10,
}: ShapeDrawFeatureProps) {
  const toScene = useRcbScreenToScene();
  const viewportEl = useRcbViewportEl();
  const toSceneRef = useRef(toScene);
  const onCreateRef = useRef(onCreate);
  const shapeKindRef = useRef(shapeKind);
  const gridSnapRef = useRef(gridSnap);
  const gridSizeRef = useRef(gridSize);
  toSceneRef.current = toScene;
  onCreateRef.current = onCreate;
  shapeKindRef.current = shapeKind;
  gridSnapRef.current = gridSnap;
  gridSizeRef.current = gridSize;
  const session = useRef<ShapeDrawSession | null>(null);
  const [preview, setPreview] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  useEffect(() => {
    const hitEl = rcbResolveViewportEl(viewportEl, stageEl, paperEl);
    if (!enabled || !hitEl) return undefined;

    const applyStrokeEnd = (
      x0: number,
      y0: number,
      rawX1: number,
      rawY1: number,
      shiftKey: boolean
    ) => {
      const kind = shapeKindRef.current || 'rect';
      const isStroke = kind === 'line' || kind === 'arrow';
      if (!isStroke) return { x1: rawX1, y1: rawY1 };
      return snapStrokeAxis(x0, y0, rawX1, rawY1, shiftKey);
    };

    const snapPoint = (x: number, y: number, skipGrid: boolean) => {
      const g = gridSizeRef.current;
      if (!gridSnapRef.current || skipGrid || !(g > 0)) return { x, y };
      return { x: snapCoordToGrid(x, g), y: snapCoordToGrid(y, g) };
    };

    const pointerScene = (clientX: number, clientY: number) =>
      toSceneRef.current(clientX, clientY);

    const releaseCapture = (pointerId: number) => {
      try {
        hitEl.releasePointerCapture?.(pointerId);
      } catch {
        /* ignore */
      }
    };

    const applyPointerToSession = (
      s: ShapeDrawSession,
      clientX: number,
      clientY: number,
      shiftKey: boolean,
      skipGrid: boolean
    ) => {
      const p = pointerScene(clientX, clientY);
      const endRaw = applyStrokeEnd(s.x0, s.y0, p.x, p.y, shiftKey);
      const end = snapPoint(endRaw.x1, endRaw.y1, skipGrid);
      s.currentClientX = clientX;
      s.currentClientY = clientY;
      s.rawX1 = p.x;
      s.rawY1 = p.y;
      s.shift = shiftKey;
      s.skipGrid = skipGrid;
      s.x1 = end.x;
      s.y1 = end.y;
      return { p, end };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const skipGrid = e.ctrlKey || e.metaKey;
      const p = pointerScene(e.clientX, e.clientY);
      const origin = snapPoint(p.x, p.y, skipGrid);
      const metrics = rcbViewportMetrics(hitEl);
      session.current = {
        x0: origin.x,
        y0: origin.y,
        x1: origin.x,
        y1: origin.y,
        clientX0: e.clientX,
        clientY0: e.clientY,
        currentClientX: e.clientX,
        currentClientY: e.clientY,
        scaleX: metrics.scaleX,
        scaleY: metrics.scaleY,
        rawX1: p.x,
        rawY1: p.y,
        shift: e.shiftKey,
        skipGrid,
        pointerId: e.pointerId,
      };
      setPreview({ x0: origin.x, y0: origin.y, x1: origin.x, y1: origin.y });
      hitEl.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e: PointerEvent) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      // Position state only updates from move (and down). End events may report 0,0.
      const skipGrid = e.ctrlKey || e.metaKey;
      const { end } = applyPointerToSession(s, e.clientX, e.clientY, e.shiftKey, skipGrid);
      setPreview({ x0: s.x0, y0: s.y0, x1: end.x, y1: end.y });
    };

    /**
     * End events are a lifecycle signal only. Commit geometry from the session's
     * current point (last down/move). End-event clientX/Y are unreliable on
     * narrow / touch / device-mode viewports (often 0,0).
     */
    const finishSession = (e: PointerEvent) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const kind = shapeKindRef.current || 'rect';
      const isStroke = kind === 'line' || kind === 'arrow';
      const endRaw = applyStrokeEnd(s.x0, s.y0, s.rawX1, s.rawY1, s.shift);
      const end = snapPoint(endRaw.x1, endRaw.y1, s.skipGrid);
      const x0 = s.x0;
      const y0 = s.y0;
      const x1 = end.x;
      const y1 = end.y;
      const box = normalizeBox(x0, y0, x1, y1);
      session.current = null;
      setPreview(null);
      releaseCapture(e.pointerId);

      if (isStroke) {
        if (Math.hypot(x1 - x0, y1 - y0) < 3) return;
        onCreateRef.current(kind, { ...box, x0, y0, x1, y1 });
        return;
      }
      // Soft click: do not create a full grid cell from snap expansion alone.
      const clientDist = Math.hypot(s.currentClientX - s.clientX0, s.currentClientY - s.clientY0);
      if (clientDist < 4 && box.width < 3 && box.height < 3) return;
      let next = box;
      if (locksSquareAspect(kind)) next = squareLockedBox(next);
      onCreateRef.current(kind, finalizeDrawBox(next, gridSnapRef.current && !s.skipGrid, gridSizeRef.current));
    };

    // Move on window so current point stays fresh even outside the stage.
    // Up/cancel both finish from session current — not from end-event coords.
    hitEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finishSession);
    window.addEventListener('pointercancel', finishSession);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || !session.current) return;
      const { x0, y0, rawX1, rawY1, skipGrid } = session.current;
      const kind = shapeKindRef.current || 'rect';
      if (kind !== 'line' && kind !== 'arrow') return;
      const shift = e.type === 'keydown';
      const endRaw = snapStrokeAxis(x0, y0, rawX1, rawY1, shift);
      const end = snapPoint(endRaw.x1, endRaw.y1, skipGrid);
      session.current.shift = shift;
      session.current.x1 = end.x;
      session.current.y1 = end.y;
      setPreview({ x0, y0, x1: end.x, y1: end.y });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    return () => {
      hitEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finishSession);
      window.removeEventListener('pointercancel', finishSession);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
    // Intentionally omit toScene/onCreate/shapeKind — read via refs so a parent
    // re-render cannot tear down listeners mid-drag.
  }, [enabled, paperEl, stageEl, viewportEl]);

  if (!enabled || !preview) return null;

  const kind = shapeKind || 'rect';
  const { x0, y0, x1, y1 } = preview;
  const isStroke = kind === 'line' || kind === 'arrow';
  const box = normalizeBox(x0, y0, x1, y1);
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const showSize = isStroke ? len >= 3 : w >= 3 || h >= 3;

  let drawW = w;
  let drawH = h;
  let drawLeft = box.left;
  let drawTop = box.top;
  if (!isStroke && locksSquareAspect(kind)) {
    const locked = squareLockedBox(box);
    drawW = locked.width;
    drawH = locked.height;
    drawLeft = locked.left;
    drawTop = locked.top;
  }
  // Live snap: grid when enabled, else integer scene px (createShapeNode).
  if (!isStroke) {
    const snapped = finalizeDrawBox(
      { left: drawLeft, top: drawTop, width: drawW, height: drawH },
      gridSnap && !(session.current?.skipGrid),
      gridSize
    );
    drawLeft = snapped.left;
    drawTop = snapped.top;
    drawW = snapped.width;
    drawH = snapped.height;
  }

  const displayW = isStroke ? Math.max(1, Math.abs(x1 - x0)) : drawW;
  const displayH = isStroke ? Math.max(1, Math.abs(y1 - y0)) : drawH;
  const sizeLabel = isStroke
    ? String(Math.round(len))
    : `${displayW} × ${displayH}`;

  return (
    <ShapeDrawPreviewCanvas
      kind={kind}
      x0={x0}
      y0={y0}
      x1={x1}
      y1={y1}
      drawLeft={isStroke ? Math.min(x0, x1) : drawLeft}
      drawTop={isStroke ? Math.min(y0, y1) : drawTop}
      drawW={isStroke ? displayW : drawW}
      drawH={isStroke ? displayH : drawH}
      showSize={showSize}
      sizeLabel={sizeLabel}
    />
  );
}

/** Drag-to-create shapes — preview must match createShapeNode paint (width + joins). */
function defaultShapeBorderWidth(kind: string) {
  if (kind === 'line' || kind === 'arrow' || kind === 'pen' || kind === 'pencil') return 2;
  return 1;
}

/** Same integer scene snap as createShapeNode — avoids 800% preview→commit jump. */
function snapSceneBox(box: { left: number; top: number; width: number; height: number }) {
  return {
    left: Math.round(box.left),
    top: Math.round(box.top),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  };
}

/** Finalize draw box: grid lattice by default; integer px when gridSnap is off / Ctrl. */
function finalizeDrawBox(
  box: { left: number; top: number; width: number; height: number },
  useGrid: boolean,
  gridSize: number
) {
  if (useGrid && gridSize > 0) {
    const g = snapBoxEdgesToGrid(box, gridSize, 1);
    return {
      left: g.left,
      top: g.top,
      width: Math.max(gridSize, g.width),
      height: Math.max(gridSize, g.height),
    };
  }
  return snapSceneBox(box);
}

function ShapeDrawPreviewCanvas({
  kind,
  x0,
  y0,
  x1,
  y1,
  drawLeft,
  drawTop,
  drawW,
  drawH,
  showSize,
  sizeLabel,
}: {
  kind: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  drawLeft: number;
  drawTop: number;
  drawW: number;
  drawH: number;
  showSize: boolean;
  sizeLabel: string;
}) {
  const camera = useRcbCamera();
  const dpr = useRcbDevicePixelRatio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isStroke = kind === 'line' || kind === 'arrow';
  const z = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / z;
  const fill = isStroke ? null : 'rgba(255,255,255,0.85)';
  const stroke = '#333333';
  // Match createShapeNode defaults — preview 1.5 vs commit 1 looked like a size jump at 800%.
  const strokeW = defaultShapeBorderWidth(kind);
  // Miter joins stick past stroke/2 on sharp polygon tips (SVG default = miter).
  const pad =
    Math.ceil(strokeW * 2) + (kind === 'arrow' ? Math.ceil(ARROW_HEAD) : 2);
  const left = drawLeft - pad;
  const top = drawTop - pad;
  const cssW = Math.max(1, drawW + pad * 2);
  const cssH = Math.max(1, drawH + pad * 2);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = z * Math.max(1, dpr || 1);
    canvas.width = Math.max(1, Math.round(cssW * scale));
    canvas.height = Math.max(1, Math.round(cssH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    // Match SVG applyElementStroke defaults (butt / miter).
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.translate(pad, pad);

    if (isStroke) {
      const lx0 = x0 - drawLeft;
      const ly0 = y0 - drawTop;
      const lx1 = x1 - drawLeft;
      const ly1 = y1 - drawTop;
      ctx.beginPath();
      ctx.moveTo(lx0, ly0);
      ctx.lineTo(lx1, ly1);
      ctx.stroke();
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (kind === 'arrow' && len >= 3) {
        const ux = (x1 - x0) / len;
        const uy = (y1 - y0) / len;
        const head = Math.min(ARROW_HEAD, len * 0.45);
        const bx = lx1 - ux * head;
        const by = ly1 - uy * head;
        const nx = -uy;
        const ny = ux;
        const wing = head * 0.55;
        ctx.beginPath();
        ctx.moveTo(bx + nx * wing, by + ny * wing);
        ctx.lineTo(lx1, ly1);
        ctx.lineTo(bx - nx * wing, by - ny * wing);
        ctx.stroke();
      }
      return;
    }

    // Same baseline path as sceneToSvg / getShapeBaseline — not an inset rect.
    const d =
      getShapeBaselineD(
        { key: 'shape', width: drawW, height: drawH, attrs: { shapeType: kind } },
        { width: drawW, height: drawH }
      ) || '';
    if (d) {
      if (fill) {
        fillCachedPath2D(ctx, d, { fillStyle: fill });
      }
      strokeCachedPath2D(ctx, d, {
        strokeStyle: stroke,
        lineWidth: strokeW,
        lineCap: 'butt',
        lineJoin: 'miter',
      });
      return;
    }

    if (kind === 'triangle' || kind === 'star' || kind === 'polygon') {
      const pts = shapeVertexPoints(kind, drawW, drawH);
      const path = new Path2D();
      if (pts.length) {
        path.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) path.lineTo(pts[i][0], pts[i][1]);
        path.closePath();
      }
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      ctx.stroke(path);
      return;
    }

    const path = new Path2D();
    path.rect(0, 0, Math.max(1, drawW), Math.max(1, drawH));
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
    ctx.stroke(path);
  }, [
    kind,
    x0,
    y0,
    x1,
    y1,
    drawLeft,
    drawTop,
    drawW,
    drawH,
    cssW,
    cssH,
    pad,
    isStroke,
    fill,
    stroke,
    strokeW,
    z,
    dpr,
  ]);

  const labelFont = 10 * inv;
  const labelGap = 14 * inv;

  return (
    <div
      data-shape-draw-preview
      className="pointer-events-none absolute z-20 overflow-visible"
      style={{ left, top, width: cssW, height: cssH }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute left-0 top-0"
        style={{ width: cssW, height: cssH }}
        aria-hidden
      />
      {showSize ? (
        <div
          className="pointer-events-none absolute whitespace-nowrap font-medium text-[var(--muted)]"
          style={{
            left: pad + drawW / 2,
            top: pad - labelGap,
            fontSize: labelFont,
            lineHeight: 1.2,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {sizeLabel}
        </div>
      ) : null}
    </div>
  );
}

export default memo(ShapeDrawFeature);
