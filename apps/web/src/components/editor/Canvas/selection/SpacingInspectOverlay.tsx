import { useMemo } from 'react';
import {
  CameraOverlayPortal,
  useCamera,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';

type SceneBox = { left: number; top: number; width: number; height: number };

export type SpacingMeasure = {
  side: 'left' | 'right' | 'top' | 'bottom';
  distance: number;
  /** Midpoint of the measurement segment in scene space. */
  mx: number;
  my: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type SpacingInspectOverlayProps = {
  box: SceneBox;
  /** Sibling boxes (excluding primary). Used when pairBox is null. */
  others: SceneBox[];
  /** When set, only show gaps between box and pairBox (Figma select + hover). */
  pairBox?: SceneBox | null;
  /** When false, only the W×H badge is shown (e.g. rotated selection). */
  showGaps?: boolean;
};

/** Fig.3-style inspect: orange measure tags (not pink / blue). */
const MEASURE = '#FF6A00';
const OVERLAP_EPS = 0.5;

function overlaps1D(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 - OVERLAP_EPS && a1 > b0 + OVERLAP_EPS;
}

function mid(a: number, b: number) {
  return (a + b) / 2;
}

function formatPx(n: number) {
  return String(Math.round(n));
}

/**
 * Nearest-neighbor gaps on each side (element-to-element only; no canvas edges).
 */
export function computeSpacingMeasures(
  box: SceneBox,
  others: SceneBox[]
): SpacingMeasure[] {
  const L = box.left;
  const T = box.top;
  const R = box.left + box.width;
  const B = box.top + box.height;
  const cy = mid(T, B);
  const cx = mid(L, R);
  const out: SpacingMeasure[] = [];

  // Left
  {
    let best: { d: number; edge: number } | null = null;
    for (const o of others) {
      const oR = o.left + o.width;
      if (oR > L + OVERLAP_EPS) continue;
      if (!overlaps1D(T, B, o.top, o.top + o.height)) continue;
      const d = L - oR;
      if (d < 0) continue;
      if (!best || d < best.d) best = { d, edge: oR };
    }
    if (best && best.d >= 0) {
      out.push({
        side: 'left',
        distance: best.d,
        x1: best.edge,
        y1: cy,
        x2: L,
        y2: cy,
        mx: mid(best.edge, L),
        my: cy,
      });
    }
  }

  // Right
  {
    let best: { d: number; edge: number } | null = null;
    for (const o of others) {
      if (o.left < R - OVERLAP_EPS) continue;
      if (!overlaps1D(T, B, o.top, o.top + o.height)) continue;
      const d = o.left - R;
      if (d < 0) continue;
      if (!best || d < best.d) best = { d, edge: o.left };
    }
    if (best && best.d >= 0) {
      out.push({
        side: 'right',
        distance: best.d,
        x1: R,
        y1: cy,
        x2: best.edge,
        y2: cy,
        mx: mid(R, best.edge),
        my: cy,
      });
    }
  }

  // Top
  {
    let best: { d: number; edge: number } | null = null;
    for (const o of others) {
      const oB = o.top + o.height;
      if (oB > T + OVERLAP_EPS) continue;
      if (!overlaps1D(L, R, o.left, o.left + o.width)) continue;
      const d = T - oB;
      if (d < 0) continue;
      if (!best || d < best.d) best = { d, edge: oB };
    }
    if (best && best.d >= 0) {
      out.push({
        side: 'top',
        distance: best.d,
        x1: cx,
        y1: best.edge,
        x2: cx,
        y2: T,
        mx: cx,
        my: mid(best.edge, T),
      });
    }
  }

  // Bottom
  {
    let best: { d: number; edge: number } | null = null;
    for (const o of others) {
      if (o.top < B - OVERLAP_EPS) continue;
      if (!overlaps1D(L, R, o.left, o.left + o.width)) continue;
      const d = o.top - B;
      if (d < 0) continue;
      if (!best || d < best.d) best = { d, edge: o.top };
    }
    if (best && best.d >= 0) {
      out.push({
        side: 'bottom',
        distance: best.d,
        x1: cx,
        y1: B,
        x2: cx,
        y2: best.edge,
        mx: cx,
        my: mid(B, best.edge),
      });
    }
  }

  return out;
}

/** Figma-like gap between two specific nodes (select + hover / click). */
export function computePairSpacingMeasures(a: SceneBox, b: SceneBox): SpacingMeasure[] {
  const aL = a.left;
  const aT = a.top;
  const aR = a.left + a.width;
  const aB = a.top + a.height;
  const bL = b.left;
  const bT = b.top;
  const bR = b.left + b.width;
  const bB = b.top + b.height;

  const xOverlap = Math.min(aR, bR) - Math.max(aL, bL);
  const yOverlap = Math.min(aB, bB) - Math.max(aT, bT);
  const hSep = xOverlap <= OVERLAP_EPS ? Math.max(bL - aR, aL - bR) : 0;
  const vSep = yOverlap <= OVERLAP_EPS ? Math.max(bT - aB, aT - bB) : 0;

  const out: SpacingMeasure[] = [];

  if (hSep > OVERLAP_EPS) {
    const leftBox = aR <= bL + OVERLAP_EPS ? a : b;
    const rightBox = leftBox === a ? b : a;
    const y =
      yOverlap > OVERLAP_EPS
        ? mid(Math.max(aT, bT), Math.min(aB, bB))
        : mid(aT + a.height / 2, bT + b.height / 2);
    const x1 = leftBox.left + leftBox.width;
    const x2 = rightBox.left;
    out.push({
      side: 'right',
      distance: hSep,
      x1,
      y1: y,
      x2,
      y2: y,
      mx: mid(x1, x2),
      my: y,
    });
  }

  if (vSep > OVERLAP_EPS) {
    const topBox = aB <= bT + OVERLAP_EPS ? a : b;
    const bottomBox = topBox === a ? b : a;
    const x =
      xOverlap > OVERLAP_EPS
        ? mid(Math.max(aL, bL), Math.min(aR, bR))
        : mid(aL + a.width / 2, bL + b.width / 2);
    const y1 = topBox.top + topBox.height;
    const y2 = bottomBox.top;
    out.push({
      side: 'bottom',
      distance: vSep,
      x1: x,
      y1,
      x2: x,
      y2,
      mx: x,
      my: mid(y1, y2),
    });
  }

  return out;
}

/**
 * Margins while dragging: nearest sibling gaps + insets to containing frames.
 * Prefer the smaller distance on each side (Figma-like move feedback).
 */
export function computeMoveMarginMeasures(
  box: SceneBox,
  others: SceneBox[],
  containers: SceneBox[] = []
): SpacingMeasure[] {
  const bySide = new Map<SpacingMeasure['side'], SpacingMeasure>();
  for (const m of computeSpacingMeasures(box, others)) {
    bySide.set(m.side, m);
  }

  const L = box.left;
  const T = box.top;
  const R = box.left + box.width;
  const B = box.top + box.height;
  const cx = mid(L, R);
  const cy = mid(T, B);

  const consider = (side: SpacingMeasure['side'], next: SpacingMeasure) => {
    if (next.distance < 0.05) return;
    const prev = bySide.get(side);
    if (!prev || next.distance < prev.distance - OVERLAP_EPS) bySide.set(side, next);
  };

  for (const c of containers) {
    const cL = c.left;
    const cT = c.top;
    const cR = c.left + c.width;
    const cB = c.top + c.height;
    // Only when the selection overlaps the container in the orthogonal axis
    // and sits inside (or flush with) that side.
    if (overlaps1D(L, R, cL, cR)) {
      if (T >= cT - OVERLAP_EPS && T <= cB + OVERLAP_EPS) {
        consider('top', {
          side: 'top',
          distance: T - cT,
          x1: cx,
          y1: cT,
          x2: cx,
          y2: T,
          mx: cx,
          my: mid(cT, T),
        });
      }
      if (B <= cB + OVERLAP_EPS && B >= cT - OVERLAP_EPS) {
        consider('bottom', {
          side: 'bottom',
          distance: cB - B,
          x1: cx,
          y1: B,
          x2: cx,
          y2: cB,
          mx: cx,
          my: mid(B, cB),
        });
      }
    }
    if (overlaps1D(T, B, cT, cB)) {
      if (L >= cL - OVERLAP_EPS && L <= cR + OVERLAP_EPS) {
        consider('left', {
          side: 'left',
          distance: L - cL,
          x1: cL,
          y1: cy,
          x2: L,
          y2: cy,
          mx: mid(cL, L),
          my: cy,
        });
      }
      if (R <= cR + OVERLAP_EPS && R >= cL - OVERLAP_EPS) {
        consider('right', {
          side: 'right',
          distance: cR - R,
          x1: R,
          y1: cy,
          x2: cR,
          y2: cy,
          mx: mid(R, cR),
          my: cy,
        });
      }
    }
  }

  return Array.from(bySide.values());
}

/** Screen-space spacing / margin lines + labels (dev / inspect mode). */
export default function SpacingInspectOverlay({
  box,
  others,
  pairBox = null,
  showGaps = true,
  showSizeBadge = true,
  color = MEASURE,
  measures: measuresProp,
}: SpacingInspectOverlayProps & {
  showSizeBadge?: boolean;
  color?: string;
  /** When set, skip auto compute and render these measures. */
  measures?: SpacingMeasure[] | null;
}) {
  const camera = useCamera();
  const measures = useMemo(() => {
    if (measuresProp) return measuresProp;
    if (!showGaps) return [];
    if (pairBox) return computePairSpacingMeasures(box, pairBox);
    return computeSpacingMeasures(box, others);
  }, [box, others, pairBox, showGaps, measuresProp]);

  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const bottom = box.top + box.height;
  const right = box.left + box.width;

  // Keep W×H off gap labels: prefer below; flip above if bottom gap is busy; else right.
  const sizePlacement = useMemo(() => {
    const nearCenterX = (mx: number) => Math.abs(mx - cx) < Math.max(28, box.width * 0.4);
    const gapNearTop = measures.some(
      (m) =>
        m.distance >= 0.05 &&
        nearCenterX(m.mx) &&
        m.my >= box.top - 36 &&
        m.my <= box.top + 10
    );
    const gapNearBottom = measures.some(
      (m) =>
        m.distance >= 0.05 &&
        nearCenterX(m.mx) &&
        m.my >= bottom - 10 &&
        m.my <= bottom + 36
    );

    if (!gapNearBottom) {
      return { x: cx, y: bottom, mode: 'below' as const };
    }
    if (!gapNearTop) {
      return { x: cx, y: box.top, mode: 'above' as const };
    }
    return { x: right, y: cy, mode: 'right' as const };
  }, [box.top, box.width, bottom, cx, cy, measures, right]);

  if (box.width <= 0 || box.height <= 0) return null;

  const sizeAnchor = worldToStage(camera, sizePlacement.x, sizePlacement.y);
  const sizeTransform =
    sizePlacement.mode === 'above'
      ? 'translate(-50%, calc(-100% - 6px))'
      : sizePlacement.mode === 'below'
        ? 'translate(-50%, 6px)'
        : 'translate(8px, -50%)';

  return (
    <CameraOverlayPortal>
      {measures.map((m) => {
        if (m.distance < 0.05) return null;
        const a = worldToStage(camera, m.x1, m.y1);
        const b = worldToStage(camera, m.x2, m.y2);
        let labelX = m.mx;

        // Nudge short vertical gap labels off centerline so they don't sit under W×H.
        if (
          showSizeBadge &&
          (m.side === 'top' || m.side === 'bottom') &&
          Math.abs(m.mx - cx) < 12 &&
          m.distance < 28
        ) {
          labelX = cx + Math.min(48, Math.max(24, box.width * 0.28));
          if (labelX > right - 8) labelX = cx - Math.min(48, Math.max(24, box.width * 0.28));
        }

        const label = worldToStage(camera, labelX, m.my);
        const horizontal = m.side === 'left' || m.side === 'right';
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.max(1, Math.abs(b.x - a.x));
        const h = Math.max(1, Math.abs(b.y - a.y));

        return (
          <div
            key={`${m.side}-${formatPx(m.distance)}-${Math.round(m.mx)}-${Math.round(m.my)}`}
            className="pointer-events-none absolute z-[26]"
          >
            <div
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: horizontal ? w : 1,
                height: horizontal ? 1 : h,
                background: color,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: a.x,
                top: a.y,
                width: horizontal ? 1 : 7,
                height: horizontal ? 7 : 1,
                background: color,
                transform: 'translate(-50%, -50%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: b.x,
                top: b.y,
                width: horizontal ? 1 : 7,
                height: horizontal ? 7 : 1,
                background: color,
                transform: 'translate(-50%, -50%)',
              }}
            />
            <div
              className="absolute whitespace-nowrap rounded px-1 py-px text-[10px] font-semibold tabular-nums text-white"
              style={{
                left: label.x,
                top: label.y,
                transform: 'translate(-50%, -50%)',
                background: color,
                boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
              }}
            >
              {formatPx(m.distance)}
            </div>
          </div>
        );
      })}

      {showSizeBadge ? (
        <div
          className="pointer-events-none absolute z-[27] whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white"
          style={{
            left: sizeAnchor.x,
            top: sizeAnchor.y,
            transform: sizeTransform,
            background: color,
            boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          }}
        >
          {formatPx(box.width)} × {formatPx(box.height)}
        </div>
      ) : null}
    </CameraOverlayPortal>
  );
}

