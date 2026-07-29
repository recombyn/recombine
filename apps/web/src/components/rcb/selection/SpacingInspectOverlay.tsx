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
  /**
   * MasterGo-style dashed extensions at the measured edges
   * (vertical stubs for a horizontal gap, etc.).
   */
  dashes?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
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

/** Figma-style measure: orange distance tags + arrowheads. */
export const SPACING_MEASURE_COLOR = '#FF6A00';
const MEASURE = SPACING_MEASURE_COLOR;
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

type SpacingDash = { x1: number; y1: number; x2: number; y2: number };

/**
 * MasterGo-style endpoint guides for a gap measure:
 * - Overlap: dashed stubs on both facing edges spanning the overlap band
 * - Off-axis: dashed projection from the neighbor corner to the measure line
 */
function dashesForGapMeasure(
  m: Omit<SpacingMeasure, 'dashes'>,
  sel: SceneBox,
  other: SceneBox
): SpacingDash[] {
  const dashes: SpacingDash[] = [];
  const sT = sel.top;
  const sB = sel.top + sel.height;
  const sL = sel.left;
  const sR = sel.left + sel.width;
  const oT = other.top;
  const oB = other.top + other.height;
  const oL = other.left;
  const oR = other.left + other.width;

  if (m.side === 'left' || m.side === 'right') {
    const xL = Math.min(m.x1, m.x2);
    const xR = Math.max(m.x1, m.x2);
    const overlapT = Math.max(oT, sT);
    const overlapB = Math.min(oB, sB);
    if (overlapB > overlapT + OVERLAP_EPS) {
      dashes.push(
        { x1: xL, y1: overlapT, x2: xL, y2: overlapB },
        { x1: xR, y1: overlapT, x2: xR, y2: overlapB }
      );
      return dashes;
    }
    // No vertical overlap — project neighbor edge to the measure Y.
    const oEdgeX = m.side === 'left' ? xL : xR;
    const sEdgeX = m.side === 'left' ? xR : xL;
    if (oB < m.my - OVERLAP_EPS) {
      dashes.push({ x1: oEdgeX, y1: oB, x2: oEdgeX, y2: m.my });
    } else if (oT > m.my + OVERLAP_EPS) {
      dashes.push({ x1: oEdgeX, y1: oT, x2: oEdgeX, y2: m.my });
    }
    // Selection-side stub: solid-looking short dash along facing edge to measure.
    if (sT < m.my - OVERLAP_EPS) {
      dashes.push({ x1: sEdgeX, y1: sT, x2: sEdgeX, y2: m.my });
    } else if (sB > m.my + OVERLAP_EPS) {
      dashes.push({ x1: sEdgeX, y1: m.my, x2: sEdgeX, y2: sB });
    }
    return dashes;
  }

  const yT = Math.min(m.y1, m.y2);
  const yB = Math.max(m.y1, m.y2);
  const overlapL = Math.max(oL, sL);
  const overlapR = Math.min(oR, sR);
  if (overlapR > overlapL + OVERLAP_EPS) {
    dashes.push(
      { x1: overlapL, y1: yT, x2: overlapR, y2: yT },
      { x1: overlapL, y1: yB, x2: overlapR, y2: yB }
    );
    return dashes;
  }
  const oEdgeY = m.side === 'top' ? yT : yB;
  const sEdgeY = m.side === 'top' ? yB : yT;
  if (oR < m.mx - OVERLAP_EPS) {
    dashes.push({ x1: oR, y1: oEdgeY, x2: m.mx, y2: oEdgeY });
  } else if (oL > m.mx + OVERLAP_EPS) {
    dashes.push({ x1: oL, y1: oEdgeY, x2: m.mx, y2: oEdgeY });
  }
  if (sL < m.mx - OVERLAP_EPS) {
    dashes.push({ x1: sL, y1: sEdgeY, x2: m.mx, y2: sEdgeY });
  } else if (sR > m.mx + OVERLAP_EPS) {
    dashes.push({ x1: m.mx, y1: sEdgeY, x2: sR, y2: sEdgeY });
  }
  return dashes;
}

/** Place horizontal gap on the vertical overlap mid (MasterGo), not selection center. */
function hMeasureY(sel: SceneBox, other: SceneBox): number {
  const overlapT = Math.max(sel.top, other.top);
  const overlapB = Math.min(sel.top + sel.height, other.top + other.height);
  if (overlapB > overlapT + OVERLAP_EPS) return mid(overlapT, overlapB);
  // Off-axis: measure against the selection edge facing the neighbor.
  const oB = other.top + other.height;
  if (oB <= sel.top + OVERLAP_EPS) return sel.top;
  return sel.top + sel.height;
}

function vMeasureX(sel: SceneBox, other: SceneBox): number {
  const overlapL = Math.max(sel.left, other.left);
  const overlapR = Math.min(sel.left + sel.width, other.left + other.width);
  if (overlapR > overlapL + OVERLAP_EPS) return mid(overlapL, overlapR);
  const oR = other.left + other.width;
  if (oR <= sel.left + OVERLAP_EPS) return sel.left;
  return sel.left + sel.width;
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
 * Also returns highlight boxes for the neighbors that won each side (orange outline).
 */
export type MoveMarginResult = {
  measures: SpacingMeasure[];
  highlights: SceneBox[];
};

export function computeMoveMarginResult(
  box: SceneBox,
  others: SceneBox[],
  containers: SceneBox[] = []
): MoveMarginResult {
  const L = box.left;
  const T = box.top;
  const R = box.left + box.width;
  const B = box.top + box.height;
  const cx = mid(L, R);
  const cy = mid(T, B);
  const bySide = new Map<
    SpacingMeasure['side'],
    { measure: SpacingMeasure; source: SceneBox | null }
  >();

  const consider = (
    side: SpacingMeasure['side'],
    next: SpacingMeasure,
    source: SceneBox | null
  ) => {
    if (next.distance < 0.05) return;
    const prev = bySide.get(side);
    if (!prev || next.distance < prev.measure.distance - OVERLAP_EPS) {
      bySide.set(side, { measure: next, source });
    }
  };

  for (const o of [...others, ...containers]) {
    const oL = o.left;
    const oT = o.top;
    const oR = o.left + o.width;
    const oB = o.top + o.height;
    const yHit = overlaps1D(T, B, oT, oB);
    const xHit = overlaps1D(L, R, oL, oR);
    const my = hMeasureY(box, o);
    const mx = vMeasureX(box, o);

    // Horizontal gaps: allow off-axis neighbors (MasterGo projects with dashes).
    for (const edge of [oL, oR]) {
      if (edge <= L + OVERLAP_EPS) {
        const toLeft = edge;
        // Prefer overlapping; otherwise only if clearly to the left (no X overlap).
        if (!yHit && xHit) continue;
        if (!yHit && oR > L - OVERLAP_EPS) continue;
        consider(
          'left',
          {
            side: 'left',
            distance: L - toLeft,
            x1: toLeft,
            y1: my,
            x2: L,
            y2: my,
            mx: mid(toLeft, L),
            my,
          },
          o
        );
      } else if (edge >= R - OVERLAP_EPS) {
        if (!yHit && xHit) continue;
        if (!yHit && oL < R + OVERLAP_EPS) continue;
        consider(
          'right',
          {
            side: 'right',
            distance: edge - R,
            x1: R,
            y1: my,
            x2: edge,
            y2: my,
            mx: mid(R, edge),
            my,
          },
          o
        );
      }
    }

    // Vertical gaps: allow off-axis with projection dashes.
    for (const edge of [oT, oB]) {
      if (edge <= T + OVERLAP_EPS) {
        if (!xHit && yHit) continue;
        if (!xHit && oB > T - OVERLAP_EPS) continue;
        consider(
          'top',
          {
            side: 'top',
            distance: T - edge,
            x1: mx,
            y1: edge,
            x2: mx,
            y2: T,
            mx,
            my: mid(edge, T),
          },
          o
        );
      } else if (edge >= B - OVERLAP_EPS) {
        if (!xHit && yHit) continue;
        if (!xHit && oT < B + OVERLAP_EPS) continue;
        consider(
          'bottom',
          {
            side: 'bottom',
            distance: edge - B,
            x1: mx,
            y1: B,
            x2: mx,
            y2: edge,
            mx,
            my: mid(B, edge),
          },
          o
        );
      }
    }

    // Inside a container: measure to inner edges when selection sits inside.
    if (yHit && xHit) {
      const dL = L - oL;
      const dR = oR - R;
      const dT = T - oT;
      const dB = oB - B;
      if (dL > OVERLAP_EPS) {
        consider(
          'left',
          {
            side: 'left',
            distance: dL,
            x1: oL,
            y1: cy,
            x2: L,
            y2: cy,
            mx: mid(oL, L),
            my: cy,
          },
          o
        );
      }
      if (dR > OVERLAP_EPS) {
        consider(
          'right',
          {
            side: 'right',
            distance: dR,
            x1: R,
            y1: cy,
            x2: oR,
            y2: cy,
            mx: mid(R, oR),
            my: cy,
          },
          o
        );
      }
      if (dT > OVERLAP_EPS) {
        consider(
          'top',
          {
            side: 'top',
            distance: dT,
            x1: cx,
            y1: oT,
            x2: cx,
            y2: T,
            mx: cx,
            my: mid(oT, T),
          },
          o
        );
      }
      if (dB > OVERLAP_EPS) {
        consider(
          'bottom',
          {
            side: 'bottom',
            distance: dB,
            x1: cx,
            y1: B,
            x2: cx,
            y2: oB,
            mx: cx,
            my: mid(B, oB),
          },
          o
        );
      }
    }
  }

  const measures: SpacingMeasure[] = [];
  const highlights: SceneBox[] = [];
  const seen = new Set<string>();
  for (const { measure, source } of bySide.values()) {
    const withDash =
      source != null
        ? { ...measure, dashes: dashesForGapMeasure(measure, box, source) }
        : measure;
    measures.push(withDash);
    if (!source) continue;
    const key = `${source.left},${source.top},${source.width},${source.height}`;
    if (seen.has(key)) continue;
    // Skip huge artboard frames as outline noise — still keep the measure.
    if (containers.some((c) => c === source || boxesEqual(c, source))) continue;
    seen.add(key);
    highlights.push(source);
  }
  return { measures, highlights };
}

function boxesEqual(a: SceneBox, b: SceneBox) {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

export function computeMoveMarginMeasures(
  box: SceneBox,
  others: SceneBox[],
  containers: SceneBox[] = []
): SpacingMeasure[] {
  return computeMoveMarginResult(box, others, containers).measures;
}

/** Minimal guide shape for filtering measure targets (avoid AlignGuide import cycle). */
export type GuideTargetLike = {
  orient: 'h' | 'v';
  pos: number;
  from: number;
  to: number;
  marks?: number[];
  kind?: string;
};

/**
 * MasterGo-style: only objects that participate in the active align/gap guides.
 * Prevents distance tips + orange outlines on every nearby frame (图2 clutter).
 */
export function boxesInvolvedInGuides(
  guides: GuideTargetLike[],
  candidates: SceneBox[],
  eps = 1.5
): SceneBox[] {
  if (!guides.length || !candidates.length) return [];
  const near = (a: number, b: number) => Math.abs(a - b) <= eps;
  const out: SceneBox[] = [];
  const seen = new Set<string>();

  for (const b of candidates) {
    const L = b.left;
    const T = b.top;
    const R = b.left + b.width;
    const B = b.top + b.height;
    const midX = mid(L, R);
    const midY = mid(T, B);
    const key = `${L},${T},${b.width},${b.height}`;
    if (seen.has(key)) continue;

    const hit = guides.some((g) => {
      if (g.kind === 'gap' || g.kind === 'size') {
        if (g.orient === 'h') {
          return (
            near(R, g.from) ||
            near(L, g.to) ||
            near(L, g.from) ||
            near(R, g.to)
          );
        }
        return (
          near(B, g.from) ||
          near(T, g.to) ||
          near(T, g.from) ||
          near(B, g.to)
        );
      }
      const marks = g.marks?.length ? g.marks : [g.from, g.to];
      if (g.orient === 'v') {
        const onX = near(L, g.pos) || near(R, g.pos) || near(midX, g.pos);
        if (!onX) return false;
        return marks.some((m) => near(T, m) || near(B, m) || near(midY, m));
      }
      const onY = near(T, g.pos) || near(B, g.pos) || near(midY, g.pos);
      if (!onY) return false;
      return marks.some((m) => near(L, m) || near(R, m) || near(midX, m));
    });

    if (!hit) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

/** Double-headed measure segment (Figma-style arrowheads). */
function MeasureArrowLine({
  horizontal,
  length,
  stroke,
  color,
  arrow,
}: {
  horizontal: boolean;
  length: number;
  stroke: number;
  color: string;
  arrow: number;
}) {
  const ah = Math.min(arrow, Math.max(stroke * 2, length * 0.35));
  const tip = Math.max(stroke * 1.5, ah * 0.55);

  if (horizontal) {
    const h = Math.max(stroke * 2, tip * 2);
    const y = h / 2;
    const inner0 = Math.min(ah, length / 2);
    const inner1 = Math.max(length - ah, length / 2);
    return (
      <svg className="absolute overflow-visible" width={length} height={h} aria-hidden>
        <line
          x1={inner0}
          y1={y}
          x2={inner1}
          y2={y}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="butt"
        />
        <polygon points={`0,${y} ${inner0},${y - tip} ${inner0},${y + tip}`} fill={color} />
        <polygon
          points={`${length},${y} ${inner1},${y - tip} ${inner1},${y + tip}`}
          fill={color}
        />
      </svg>
    );
  }

  const w = Math.max(stroke * 2, tip * 2);
  const x = w / 2;
  const inner0 = Math.min(ah, length / 2);
  const inner1 = Math.max(length - ah, length / 2);
  return (
    <svg className="absolute overflow-visible" width={w} height={length} aria-hidden>
      <line
        x1={x}
        y1={inner0}
        x2={x}
        y2={inner1}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="butt"
      />
      <polygon points={`${x},0 ${x - tip},${inner0} ${x + tip},${inner0}`} fill={color} />
      <polygon
        points={`${x},${length} ${x - tip},${inner1} ${x + tip},${inner1}`}
        fill={color}
      />
    </svg>
  );
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
  const stroke = 1.5 * inv;
  const arrow = 8 * inv;
  const dashArr = `${5 * inv} ${4 * inv}`;
  const labelFont = 12 * inv;
  const badgeFont = 12 * inv;
  const badgeGap = 8 * inv;

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
            {(m.dashes || []).map((d, di) => {
              const dx = Math.min(d.x1, d.x2);
              const dy = Math.min(d.y1, d.y2);
              const dw = Math.max(stroke, Math.abs(d.x2 - d.x1));
              const dh = Math.max(stroke, Math.abs(d.y2 - d.y1));
              const vert = Math.abs(d.x2 - d.x1) <= Math.abs(d.y2 - d.y1);
              return (
                <svg
                  key={`dash-${di}`}
                  className="absolute overflow-visible"
                  width={vert ? Math.max(stroke * 2, 1) : dw}
                  height={vert ? dh : Math.max(stroke * 2, 1)}
                  style={{
                    left: vert ? d.x1 : dx,
                    top: vert ? dy : d.y1,
                    transform: vert ? 'translateX(-50%)' : 'translateY(-50%)',
                  }}
                  aria-hidden
                >
                  <line
                    x1={vert ? '50%' : 0}
                    y1={vert ? 0 : '50%'}
                    x2={vert ? '50%' : dw}
                    y2={vert ? dh : '50%'}
                    stroke={color}
                    strokeWidth={stroke}
                    strokeDasharray={dashArr}
                  />
                </svg>
              );
            })}
            <div
              className="absolute"
              style={{
                left: horizontal ? x : m.x1,
                top: horizontal ? m.y1 : y,
                transform: horizontal ? 'translateY(-50%)' : 'translateX(-50%)',
              }}
            >
              <MeasureArrowLine
                horizontal={horizontal}
                length={segLen}
                stroke={stroke}
                color={color}
                arrow={arrow}
              />
            </div>
            <div
              className="absolute whitespace-nowrap font-semibold tabular-nums text-white"
              style={{
                left: labelX,
                top: m.my,
                fontSize: labelFont,
                lineHeight: 1.2,
                minWidth: 18 * inv,
                paddingInline: 5 * inv,
                paddingBlock: 2 * inv,
                borderRadius: 3 * inv,
                textAlign: 'center',
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
          className="pointer-events-none absolute z-[27] whitespace-nowrap font-semibold tabular-nums text-white"
          style={{
            left: sizePlacement.x,
            top: sizePlacement.y,
            fontSize: badgeFont,
            lineHeight: 1.2,
            paddingInline: 7 * inv,
            paddingBlock: 3 * inv,
            borderRadius: 3 * inv,
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
