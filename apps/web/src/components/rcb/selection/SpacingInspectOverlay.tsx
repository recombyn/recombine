import { useMemo } from 'react';
import { useRcbCamera } from '../camera/context';

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
 * Nearest-neighbor gaps on each side to sibling boxes that share a projection
 * overlap on the orthogonal axis (Figma-like). Do not fall back to off-axis
 * neighbors — that draws measure lines into empty-looking space.
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

  const pickNearest = (
    side: SpacingMeasure['side'],
    candidates: Array<{ d: number; edge: number; y1: number; y2: number; x1: number; x2: number }>
  ) => {
    if (!candidates.length) return;
    candidates.sort((a, b) => a.d - b.d);
    const best = candidates[0];
    out.push({
      side,
      distance: best.d,
      x1: best.x1,
      y1: best.y1,
      x2: best.x2,
      y2: best.y2,
      mx: mid(best.x1, best.x2),
      my: mid(best.y1, best.y2),
    });
  };

  // Left — only boxes whose vertical span overlaps the selection
  {
    const overlapped: Array<{ d: number; edge: number; y1: number; y2: number; x1: number; x2: number }> = [];
    for (const o of others) {
      const oR = o.left + o.width;
      if (oR > L + OVERLAP_EPS) continue;
      const d = L - oR;
      if (d < 0) continue;
      if (!overlaps1D(T, B, o.top, o.top + o.height)) continue;
      overlapped.push({ d, edge: oR, x1: oR, y1: cy, x2: L, y2: cy });
    }
    pickNearest('left', overlapped);
  }

  // Right
  {
    const overlapped: Array<{ d: number; edge: number; y1: number; y2: number; x1: number; x2: number }> = [];
    for (const o of others) {
      if (o.left < R - OVERLAP_EPS) continue;
      const d = o.left - R;
      if (d < 0) continue;
      if (!overlaps1D(T, B, o.top, o.top + o.height)) continue;
      overlapped.push({ d, edge: o.left, x1: R, y1: cy, x2: o.left, y2: cy });
    }
    pickNearest('right', overlapped);
  }

  // Top
  {
    const overlapped: Array<{ d: number; edge: number; y1: number; y2: number; x1: number; x2: number }> = [];
    for (const o of others) {
      const oB = o.top + o.height;
      if (oB > T + OVERLAP_EPS) continue;
      const d = T - oB;
      if (d < 0) continue;
      if (!overlaps1D(L, R, o.left, o.left + o.width)) continue;
      overlapped.push({ d, edge: oB, x1: cx, y1: oB, x2: cx, y2: T });
    }
    pickNearest('top', overlapped);
  }

  // Bottom
  {
    const overlapped: Array<{ d: number; edge: number; y1: number; y2: number; x1: number; x2: number }> = [];
    for (const o of others) {
      if (o.top < B - OVERLAP_EPS) continue;
      const d = o.top - B;
      if (d < 0) continue;
      if (!overlaps1D(L, R, o.left, o.left + o.width)) continue;
      overlapped.push({ d, edge: o.top, x1: cx, y1: B, x2: cx, y2: o.top });
    }
    pickNearest('bottom', overlapped);
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
 * Margins while dragging: nearest gap on each side to siblings OR artboard edges.
 * Every box edge counts (including when the selection straddles / sits just outside),
 * so canvas frames, shapes, and images all get the same pink tips.
 */
export function computeMoveMarginMeasures(
  box: SceneBox,
  others: SceneBox[],
  containers: SceneBox[] = []
): SpacingMeasure[] {
  const L = box.left;
  const T = box.top;
  const R = box.left + box.width;
  const B = box.top + box.height;
  const cx = mid(L, R);
  const cy = mid(T, B);
  const bySide = new Map<SpacingMeasure['side'], SpacingMeasure>();

  const consider = (side: SpacingMeasure['side'], next: SpacingMeasure) => {
    if (next.distance < 0.05) return;
    const prev = bySide.get(side);
    if (!prev || next.distance < prev.distance - OVERLAP_EPS) bySide.set(side, next);
  };

  for (const o of [...others, ...containers]) {
    const oL = o.left;
    const oT = o.top;
    const oR = o.left + o.width;
    const oB = o.top + o.height;
    const yHit = overlaps1D(T, B, oT, oB);
    const xHit = overlaps1D(L, R, oL, oR);

    if (yHit) {
      for (const edge of [oL, oR]) {
        if (edge <= L + OVERLAP_EPS) {
          consider('left', {
            side: 'left',
            distance: L - edge,
            x1: edge,
            y1: cy,
            x2: L,
            y2: cy,
            mx: mid(edge, L),
            my: cy,
          });
        } else if (edge >= R - OVERLAP_EPS) {
          consider('right', {
            side: 'right',
            distance: edge - R,
            x1: R,
            y1: cy,
            x2: edge,
            y2: cy,
            mx: mid(R, edge),
            my: cy,
          });
        }
      }
    }

    if (xHit) {
      for (const edge of [oT, oB]) {
        if (edge <= T + OVERLAP_EPS) {
          consider('top', {
            side: 'top',
            distance: T - edge,
            x1: cx,
            y1: edge,
            x2: cx,
            y2: T,
            mx: cx,
            my: mid(edge, T),
          });
        } else if (edge >= B - OVERLAP_EPS) {
          consider('bottom', {
            side: 'bottom',
            distance: edge - B,
            x1: cx,
            y1: B,
            x2: cx,
            y2: edge,
            mx: cx,
            my: mid(B, edge),
          });
        }
      }
    }

    // Inside a container: also measure to its inner edges when the selection
    // sits fully inside (common for artboard margins).
    if (yHit && xHit) {
      const dL = L - oL;
      const dR = oR - R;
      const dT = T - oT;
      const dB = oB - B;
      if (dL > OVERLAP_EPS) {
        consider('left', {
          side: 'left',
          distance: dL,
          x1: oL,
          y1: cy,
          x2: L,
          y2: cy,
          mx: mid(oL, L),
          my: cy,
        });
      }
      if (dR > OVERLAP_EPS) {
        consider('right', {
          side: 'right',
          distance: dR,
          x1: R,
          y1: cy,
          x2: oR,
          y2: cy,
          mx: mid(R, oR),
          my: cy,
        });
      }
      if (dT > OVERLAP_EPS) {
        consider('top', {
          side: 'top',
          distance: dT,
          x1: cx,
          y1: oT,
          x2: cx,
          y2: T,
          mx: cx,
          my: mid(oT, T),
        });
      }
      if (dB > OVERLAP_EPS) {
        consider('bottom', {
          side: 'bottom',
          distance: dB,
          x1: cx,
          y1: B,
          x2: cx,
          y2: oB,
          mx: cx,
          my: mid(B, oB),
        });
      }
    }
  }

  return Array.from(bySide.values());
}

/**
 * Spacing / margin lines in **camera world** (scene coords).
 * Screen-constant via page sizes `px / zoom` + SVG stroke.
 */
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
  const camera = useRcbCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / zoom;
  const stroke = 1 * inv;
  const tick = 7 * inv;
  const labelFont = 10 * inv;
  const badgeFont = 10 * inv;
  const badgeGap = 6 * inv;

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

  const sizeTransform =
    sizePlacement.mode === 'above'
      ? `translate(-50%, calc(-100% - ${badgeGap}px))`
      : sizePlacement.mode === 'below'
        ? `translate(-50%, ${badgeGap}px)`
        : `translate(${badgeGap + 2 * inv}px, -50%)`;

  return (
    <div className="pointer-events-none absolute inset-0 z-[26] overflow-visible">
      {measures.map((m) => {
        if (m.distance < 0.05) return null;
        let labelX = m.mx;

        if (
          showSizeBadge &&
          (m.side === 'top' || m.side === 'bottom') &&
          Math.abs(m.mx - cx) < 12 &&
          m.distance < 28
        ) {
          labelX = cx + Math.min(48, Math.max(24, box.width * 0.28));
          if (labelX > right - 8) labelX = cx - Math.min(48, Math.max(24, box.width * 0.28));
        }

        const horizontal = m.side === 'left' || m.side === 'right';
        const x = Math.min(m.x1, m.x2);
        const y = Math.min(m.y1, m.y2);
        const segLen = Math.max(stroke, horizontal ? Math.abs(m.x2 - m.x1) : Math.abs(m.y2 - m.y1));

        return (
          <div
            key={`${m.side}-${formatPx(m.distance)}-${Math.round(m.mx)}-${Math.round(m.my)}`}
            className="pointer-events-none absolute"
          >
            <svg
              className="absolute overflow-visible"
              width={horizontal ? segLen : Math.max(stroke * 2, 1)}
              height={horizontal ? Math.max(stroke * 2, 1) : segLen}
              style={{
                left: horizontal ? x : m.x1,
                top: horizontal ? m.y1 : y,
                transform: horizontal ? 'translateY(-50%)' : 'translateX(-50%)',
              }}
              aria-hidden
            >
              <line
                x1={horizontal ? 0 : '50%'}
                y1={horizontal ? '50%' : 0}
                x2={horizontal ? segLen : '50%'}
                y2={horizontal ? '50%' : segLen}
                stroke={color}
                strokeWidth={stroke}
              />
            </svg>
            <svg
              className="absolute overflow-visible"
              width={horizontal ? Math.max(stroke * 2, 1) : tick}
              height={horizontal ? tick : Math.max(stroke * 2, 1)}
              style={{
                left: m.x1,
                top: m.y1,
                transform: 'translate(-50%, -50%)',
              }}
              aria-hidden
            >
              <line
                x1={horizontal ? '50%' : 0}
                y1={horizontal ? 0 : '50%'}
                x2={horizontal ? '50%' : tick}
                y2={horizontal ? tick : '50%'}
                stroke={color}
                strokeWidth={stroke}
              />
            </svg>
            <svg
              className="absolute overflow-visible"
              width={horizontal ? Math.max(stroke * 2, 1) : tick}
              height={horizontal ? tick : Math.max(stroke * 2, 1)}
              style={{
                left: m.x2,
                top: m.y2,
                transform: 'translate(-50%, -50%)',
              }}
              aria-hidden
            >
              <line
                x1={horizontal ? '50%' : 0}
                y1={horizontal ? 0 : '50%'}
                x2={horizontal ? '50%' : tick}
                y2={horizontal ? tick : '50%'}
                stroke={color}
                strokeWidth={stroke}
              />
            </svg>
            <div
              className="absolute whitespace-nowrap rounded font-semibold tabular-nums text-white"
              style={{
                left: labelX,
                top: m.my,
                fontSize: labelFont,
                paddingInline: 4 * inv,
                paddingBlock: 1 * inv,
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
          className="pointer-events-none absolute z-[27] whitespace-nowrap rounded font-semibold tabular-nums text-white"
          style={{
            left: sizePlacement.x,
            top: sizePlacement.y,
            fontSize: badgeFont,
            paddingInline: 6 * inv,
            paddingBlock: 2 * inv,
            transform: sizeTransform,
            background: color,
            boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          }}
        >
          {formatPx(box.width)} × {formatPx(box.height)}
        </div>
      ) : null}
    </div>
  );
}
