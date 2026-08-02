import {
  useRcbScreenToScene,
  useRcbViewportEl,
} from '../camera/context';
import {
  rcbResolveViewportEl,
  rcbViewportMetrics,
} from '../core/math';
import { useEffect, useRef, useState, type ReactNode, memo } from 'react';
import { ARROW_HEAD, ptsAttr, shapeVertexPoints } from '@/components/rcb/scene/document/sceneShapes';

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
};

/** Drag-to-create shapes ? preview matches committed geometry. */
function ShapeDrawFeature({
  enabled,
  shapeKind,
  artboard,
  paperEl,
  stageEl = null,
  onCreate,
}: ShapeDrawFeatureProps) {
  const toScene = useRcbScreenToScene();
  const viewportEl = useRcbViewportEl();
  const toSceneRef = useRef(toScene);
  const onCreateRef = useRef(onCreate);
  const shapeKindRef = useRef(shapeKind);
  toSceneRef.current = toScene;
  onCreateRef.current = onCreate;
  shapeKindRef.current = shapeKind;
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
      shiftKey: boolean
    ) => {
      const p = pointerScene(clientX, clientY);
      const end = applyStrokeEnd(s.x0, s.y0, p.x, p.y, shiftKey);
      s.currentClientX = clientX;
      s.currentClientY = clientY;
      s.rawX1 = p.x;
      s.rawY1 = p.y;
      s.shift = shiftKey;
      s.x1 = end.x1;
      s.y1 = end.y1;
      return { p, end };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = pointerScene(e.clientX, e.clientY);
      const metrics = rcbViewportMetrics(hitEl);
      session.current = {
        x0: p.x,
        y0: p.y,
        x1: p.x,
        y1: p.y,
        clientX0: e.clientX,
        clientY0: e.clientY,
        currentClientX: e.clientX,
        currentClientY: e.clientY,
        scaleX: metrics.scaleX,
        scaleY: metrics.scaleY,
        rawX1: p.x,
        rawY1: p.y,
        shift: e.shiftKey,
        pointerId: e.pointerId,
      };
      setPreview({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      hitEl.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e: PointerEvent) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      // Position state only updates from move (and down). End events may report 0,0.
      const { end } = applyPointerToSession(s, e.clientX, e.clientY, e.shiftKey);
      setPreview({ x0: s.x0, y0: s.y0, x1: end.x1, y1: end.y1 });
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
      const end = applyStrokeEnd(s.x0, s.y0, s.rawX1, s.rawY1, s.shift);
      const x0 = s.x0;
      const y0 = s.y0;
      const x1 = end.x1;
      const y1 = end.y1;
      const box = normalizeBox(x0, y0, x1, y1);
      session.current = null;
      setPreview(null);
      releaseCapture(e.pointerId);

      if (isStroke) {
        if (Math.hypot(x1 - x0, y1 - y0) < 3) return;
        onCreateRef.current(kind, { ...box, x0, y0, x1, y1 });
        return;
      }
      let next = box;
      if (next.width < 3 && next.height < 3) return;
      if (locksSquareAspect(kind)) next = squareLockedBox(next);
      onCreateRef.current(kind, next);
    };

    // Move on window so current point stays fresh even outside the stage.
    // Up/cancel both finish from session current — not from end-event coords.
    hitEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finishSession);
    window.addEventListener('pointercancel', finishSession);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || !session.current) return;
      const { x0, y0, rawX1, rawY1 } = session.current;
      const kind = shapeKindRef.current || 'rect';
      if (kind !== 'line' && kind !== 'arrow') return;
      const shift = e.type === 'keydown';
      const end = snapStrokeAxis(x0, y0, rawX1, rawY1, shift);
      session.current.shift = shift;
      session.current.x1 = end.x1;
      session.current.y1 = end.y1;
      setPreview({ x0, y0, x1: end.x1, y1: end.y1 });
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

  const fill = isStroke ? 'none' : 'rgba(255,255,255,0.85)';
  const stroke = '#333333';
  const strokeW = isStroke ? 2 : 1.5;

  if (isStroke) {
    // Preview in scene space: line from start→end (may tilt).
    const pad = 8;
    const left = Math.min(x0, x1) - pad;
    const top = Math.min(y0, y1) - pad;
    const vw = Math.max(1, Math.abs(x1 - x0) + pad * 2);
    const vh = Math.max(1, Math.abs(y1 - y0) + pad * 2);
    const lx0 = x0 - left;
    const ly0 = y0 - top;
    const lx1 = x1 - left;
    const ly1 = y1 - top;
    let arrowExtra: ReactNode = null;
    if (kind === 'arrow' && len >= 3) {
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      const head = Math.min(ARROW_HEAD, len * 0.45);
      const bx = x1 - ux * head;
      const by = y1 - uy * head;
      const nx = -uy;
      const ny = ux;
      const wing = head * 0.55;
      arrowExtra = (
        <path
          d={`M ${bx - left + nx * wing} ${by - top + ny * wing} L ${lx1} ${ly1} L ${bx - left - nx * wing} ${by - top - ny * wing}`}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    return (
      <div
        data-shape-draw-preview
        className="pointer-events-none absolute z-20"
        style={{ left, top, width: vw, height: vh }}
      >
        <svg className="overflow-visible" width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`}>
          <line
            x1={lx0}
            y1={ly0}
            x2={lx1}
            y2={ly1}
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
          {arrowExtra}
        </svg>
        {showSize ? (
          <div className="absolute left-0 top-[-18px] whitespace-nowrap text-[10px] font-medium text-[var(--muted)]">
            {Math.round(len)}
          </div>
        ) : null}
      </div>
    );
  }

  // Circle / polygon / star lock to square (same as commit).
  let drawW = w;
  let drawH = h;
  let drawLeft = box.left;
  let drawTop = box.top;
  if (locksSquareAspect(kind)) {
    const locked = squareLockedBox(box);
    drawW = locked.width;
    drawH = locked.height;
    drawLeft = locked.left;
    drawTop = locked.top;
  }

  let body: ReactNode = null;
  if (kind === 'circle') {
    body = (
      <ellipse
        cx={drawW / 2}
        cy={drawH / 2}
        rx={drawW / 2}
        ry={drawH / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeW}
      />
    );
  } else if (kind === 'triangle' || kind === 'star' || kind === 'polygon') {
    const pts = shapeVertexPoints(kind, drawW, drawH);
    body = (
      <polygon points={ptsAttr(pts)} fill={fill} stroke={stroke} strokeWidth={strokeW} />
    );
  } else {
    body = (
      <rect
        x={0.5}
        y={0.5}
        width={Math.max(1, w - 1)}
        height={Math.max(1, h - 1)}
        rx={0}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeW}
      />
    );
  }

  const displayW = locksSquareAspect(kind) ? drawW : w;
  const displayH = locksSquareAspect(kind) ? drawH : h;

  return (
    <div
      data-shape-draw-preview
      className="pointer-events-none absolute z-20"
      style={{
        left: drawLeft,
        top: drawTop,
        width: displayW,
        height: displayH,
      }}
    >
      <svg
        className="overflow-visible"
        width={displayW}
        height={displayH}
        viewBox={`0 0 ${displayW} ${displayH}`}
      >
        {body}
      </svg>
      {showSize ? (
        <div className="absolute left-0 top-[-18px] whitespace-nowrap text-[10px] font-medium text-[var(--muted)]">
          {Math.round(displayW)}
          {' × '}
          {Math.round(displayH)}
        </div>
      ) : null}
    </div>
  );
}

export default memo(ShapeDrawFeature);
