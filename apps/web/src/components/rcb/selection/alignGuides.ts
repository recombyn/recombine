import { applyAspectToHandle } from './resizeGeometry';
import type { ResizeHandle, SceneBox } from './resizeGeometry';

export type { ResizeHandle, SceneBox };

/** Pixel snap step. Override via document.gridSize. */
export const DEFAULT_GRID_SIZE = 1;

/** Screen-px threshold for object-to-object smart guides. */
export const SMART_SNAP_PX = 8;

/** Alignment + spacing guide color. */
export const SMART_GUIDE_COLOR = '#FF6B35';

/** Vertical (`axis: 'x'`) or horizontal (`axis: 'y'`) align guide. */
export type SmartGuideAlign = {
  kind: 'align';
  axis: 'x' | 'y';
  /** Scene x (vertical line) or y (horizontal line). */
  at: number;
  from: number;
  to: number;
  /** Path keypoints on this guide (corners + edge midpoints). */
  marks?: Array<{ x: number; y: number }>;
};

/** Spacing measure between two boxes. */
export type SmartGuideGap = {
  kind: 'gap';
  axis: 'x' | 'y';
  from: number;
  to: number;
  at: number;
  dist: number;
  /** Dashed extension rails (perpendicular to the measure), usually one per box edge. */
  rails?: Array<{ from: number; to: number; at: number }>;
};

export type SmartGuideLine = SmartGuideAlign | SmartGuideGap;

/**
 * Scene snap radius — screen pixels converted by zoom so magnet feel
 * stays constant (8 CSS px at every zoom, including 5%).
 */
export function smartSnapThreshold(zoom: number): number {
  const z = Math.max(0.05, Number(zoom) || 1);
  return SMART_SNAP_PX / z;
}

type AxisMark = { value: number; role: 'min' | 'mid' | 'max' };

function boxXMarks(box: SceneBox): AxisMark[] {
  return [
    { value: box.left, role: 'min' },
    { value: box.left + box.width / 2, role: 'mid' },
    { value: box.left + box.width, role: 'max' },
  ];
}

function boxYMarks(box: SceneBox): AxisMark[] {
  return [
    { value: box.top, role: 'min' },
    { value: box.top + box.height / 2, role: 'mid' },
    { value: box.top + box.height, role: 'max' },
  ];
}

function mergeGuideExtent(a0: number, a1: number, b0: number, b1: number): { from: number; to: number } {
  return { from: Math.min(a0, a1, b0, b1), to: Math.max(a0, a1, b0, b1) };
}

function mergeMarks(
  prev: Array<{ x: number; y: number }> | undefined,
  next: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  const out = prev ? [...prev] : [];
  for (const m of next) {
    if (out.some((p) => Math.abs(p.x - m.x) < 0.25 && Math.abs(p.y - m.y) < 0.25)) continue;
    out.push(m);
  }
  return out;
}

/** Path keypoints on an align guide: corners + edge midpoints (上中/下中/左中/右中). */
function pathMarksForAlign(
  box: SceneBox,
  axis: 'x' | 'y',
  at: number,
  eps: number
): Array<{ x: number; y: number }> {
  if (!(box.width > 0) || !(box.height > 0)) return [];
  const midX = box.left + box.width / 2;
  const midY = box.top + box.height / 2;
  const right = box.left + box.width;
  const bottom = box.top + box.height;

  if (axis === 'y') {
    const hit = boxYMarks(box).find((m) => Math.abs(m.value - at) <= eps);
    if (!hit) return [];
    const y = at;
    // Center line: only the box center. Edge line: L / mid / R (上中·下中).
    if (hit.role === 'mid') return [{ x: midX, y }];
    return [
      { x: box.left, y },
      { x: midX, y },
      { x: right, y },
    ];
  }
  const hit = boxXMarks(box).find((m) => Math.abs(m.value - at) <= eps);
  if (!hit) return [];
  const x = at;
  // Center line: only the box center. Edge line: T / mid / B (左中·右中).
  if (hit.role === 'mid') return [{ x, y: midY }];
  return [
    { x, y: box.top },
    { x, y: midY },
    { x, y: bottom },
  ];
}

function marksAlongGuide(
  box: SceneBox,
  targets: SceneBox[],
  axis: 'x' | 'y',
  at: number,
  eps: number
): Array<{ x: number; y: number }> {
  let marks = pathMarksForAlign(box, axis, at, eps);
  for (const t of targets) {
    marks = mergeMarks(marks, pathMarksForAlign(t, axis, at, eps));
  }
  return marks;
}

function rangeOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function overlapMid(a0: number, a1: number, b0: number, b1: number): number | null {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  if (hi - lo <= 0) return null;
  return (lo + hi) / 2;
}

/** After snap: one line per axis `at` (path min / mid / max) + path × marks. */
function collectAlignGuides(box: SceneBox, targets: SceneBox[], epsilon: number): SmartGuideAlign[] {
  const eps = Math.max(0.5, epsilon);
  const byKey = new Map<string, SmartGuideAlign>();

  const mx = boxXMarks(box);
  const my = boxYMarks(box);
  for (const t of targets) {
    if (!(t.width > 0) || !(t.height > 0)) continue;
    for (const m of mx) {
      for (const tm of boxXMarks(t)) {
        if (Math.abs(tm.value - m.value) > eps) continue;
        const ext = mergeGuideExtent(box.top, box.top + box.height, t.top, t.top + t.height);
        const at = tm.value;
        const marks = mergeMarks(
          pathMarksForAlign(box, 'x', at, eps),
          pathMarksForAlign(t, 'x', at, eps)
        );
        const key = `x:${at.toFixed(2)}`;
        const prev = byKey.get(key);
        if (prev) {
          byKey.set(key, {
            ...prev,
            from: Math.min(prev.from, ext.from),
            to: Math.max(prev.to, ext.to),
            marks: mergeMarks(prev.marks, marks),
          });
        } else {
          byKey.set(key, {
            kind: 'align',
            axis: 'x',
            at,
            from: ext.from,
            to: ext.to,
            marks,
          });
        }
      }
    }
    for (const m of my) {
      for (const tm of boxYMarks(t)) {
        if (Math.abs(tm.value - m.value) > eps) continue;
        const ext = mergeGuideExtent(box.left, box.left + box.width, t.left, t.left + t.width);
        const at = tm.value;
        const marks = mergeMarks(
          pathMarksForAlign(box, 'y', at, eps),
          pathMarksForAlign(t, 'y', at, eps)
        );
        const key = `y:${at.toFixed(2)}`;
        const prev = byKey.get(key);
        if (prev) {
          byKey.set(key, {
            ...prev,
            from: Math.min(prev.from, ext.from),
            to: Math.max(prev.to, ext.to),
            marks: mergeMarks(prev.marks, marks),
          });
        } else {
          byKey.set(key, {
            kind: 'align',
            axis: 'y',
            at,
            from: ext.from,
            to: ext.to,
            marks,
          });
        }
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Idle select↔hover spacing — clear gaps, plus edge offsets when neighbors
 * share a cross-axis overlap (top/bottom for side-by-side, L/R when stacked).
 *
 * Measure line sits in the gap between boxes; dashed rails run on both edges
 * being compared out to that measure line (not a short stub on one side only).
 */
export function collectPairSpacingGuides(a: SceneBox, b: SceneBox): SmartGuideLine[] {
  if (!(a.width > 0) || !(a.height > 0) || !(b.width > 0) || !(b.height > 0)) return [];
  const gaps = collectGapGuides(a, [b]);
  const out: SmartGuideLine[] = [...gaps];
  const aR = a.left + a.width;
  const aB = a.top + a.height;
  const bR = b.left + b.width;
  const bB = b.top + b.height;
  const yOv = rangeOverlap(a.top, aB, b.top, bB);
  const xOv = rangeOverlap(a.left, aR, b.left, bR);
  const sideBySide = yOv > 0 && (aR <= b.left + 1e-6 || bR <= a.left + 1e-6);
  const stacked = xOv > 0 && (aB <= b.top + 1e-6 || bB <= a.top + 1e-6);

  const pushOffset = (
    axis: 'x' | 'y',
    edgeA: number,
    edgeB: number,
    at: number,
    rails: Array<{ from: number; to: number; at: number }>
  ) => {
    const dist = Math.abs(edgeB - edgeA);
    if (dist <= 0.5) return;
    out.push({
      kind: 'gap',
      axis,
      from: Math.min(edgeA, edgeB),
      to: Math.max(edgeA, edgeB),
      at,
      dist: Math.round(dist),
      rails: rails.filter((r) => Math.abs(r.to - r.from) > 0.5),
    });
  };

  /** Dashed stub from a box edge to the measure line (skip if measure cuts the box). */
  const railFromBoxToAt = (
    boxMin: number,
    boxMax: number,
    at: number,
    edgeAt: number
  ): { from: number; to: number; at: number } | null => {
    if (at < boxMin - 1e-6) return { from: at, to: boxMin, at: edgeAt };
    if (at > boxMax + 1e-6) return { from: boxMax, to: at, at: edgeAt };
    return null;
  };

  if (sideBySide) {
    // Vertical measure in the horizontal gap; rails on both tops (and bottoms if needed).
    const aFacing = aR <= b.left + 1e-6 ? aR : a.left;
    const bFacing = aR <= b.left + 1e-6 ? b.left : bR;
    const atX = (aFacing + bFacing) / 2;
    const topRails = [
      railFromBoxToAt(a.left, aR, atX, a.top),
      railFromBoxToAt(b.left, bR, atX, b.top),
    ].filter(Boolean) as Array<{ from: number; to: number; at: number }>;
    pushOffset('y', a.top, b.top, atX, topRails);
    // Bottom offset only when tops already match — otherwise top delta is enough
    // and a second rail pair reads as a stray "lower dashed" measure.
    if (Math.abs(a.top - b.top) <= 0.5) {
      const botRails = [
        railFromBoxToAt(a.left, aR, atX, aB),
        railFromBoxToAt(b.left, bR, atX, bB),
      ].filter(Boolean) as Array<{ from: number; to: number; at: number }>;
      pushOffset('y', aB, bB, atX, botRails);
    }
  } else if (stacked) {
    const aFacing = aB <= b.top + 1e-6 ? aB : a.top;
    const bFacing = aB <= b.top + 1e-6 ? b.top : bB;
    const atY = (aFacing + bFacing) / 2;
    const leftRails = [
      railFromBoxToAt(a.top, aB, atY, a.left),
      railFromBoxToAt(b.top, bB, atY, b.left),
    ].filter(Boolean) as Array<{ from: number; to: number; at: number }>;
    pushOffset('x', a.left, b.left, atY, leftRails);
    if (Math.abs(a.left - b.left) <= 0.5) {
      const rightRails = [
        railFromBoxToAt(a.top, aB, atY, aR),
        railFromBoxToAt(b.top, bB, atY, bR),
      ].filter(Boolean) as Array<{ from: number; to: number; at: number }>;
      pushOffset('x', aR, bR, atY, rightRails);
    }
  } else if (!gaps.length) {
    // Diagonal (no x/y overlap): still show both clearances — preview inspect
    // often picks a poster and a rect that sit corner-to-corner.
    const aLeftOfB = aR <= b.left + 1e-6;
    const bLeftOfA = bR <= a.left + 1e-6;
    if (aLeftOfB || bLeftOfA) {
      const leftBox = aLeftOfB ? a : b;
      const rightBox = aLeftOfB ? b : a;
      const from = leftBox.left + leftBox.width;
      const to = rightBox.left;
      const atY = Math.min(leftBox.top + leftBox.height, rightBox.top + rightBox.height);
      const hRails = [
        railFromBoxToAt(leftBox.top, leftBox.top + leftBox.height, atY, from),
        railFromBoxToAt(rightBox.top, rightBox.top + rightBox.height, atY, to),
      ].filter(Boolean) as Array<{ from: number; to: number; at: number }>;
      pushOffset('x', from, to, atY, hRails);
    }
    const aAboveB = aB <= b.top + 1e-6;
    const bAboveA = bB <= a.top + 1e-6;
    if (aAboveB || bAboveA) {
      const topBox = aAboveB ? a : b;
      const botBox = aAboveB ? b : a;
      const from = topBox.top + topBox.height;
      const to = botBox.top;
      const atX = Math.min(topBox.left + topBox.width, botBox.left + botBox.width);
      const vRails = [
        railFromBoxToAt(topBox.left, topBox.left + topBox.width, atX, from),
        railFromBoxToAt(botBox.left, botBox.left + botBox.width, atX, to),
      ].filter(Boolean) as Array<{ from: number; to: number; at: number }>;
      pushOffset('y', from, to, atX, vRails);
    }
  }

  return out;
}

/**
 * Nearest clear gap per cardinal direction when ranges overlap on the cross axis.
 * Does not require edge snap — spacing chrome appears while dragging beside a sibling.
 */
function collectGapGuides(box: SceneBox, targets: SceneBox[]): SmartGuideGap[] {
  const out: SmartGuideGap[] = [];
  type GapCand = { dist: number; from: number; to: number; at: number };
  let left: GapCand | null = null;
  let right: GapCand | null = null;
  let above: GapCand | null = null;
  let below: GapCand | null = null;

  const bR = box.left + box.width;
  const bB = box.top + box.height;

  for (const t of targets) {
    if (!(t.width > 0) || !(t.height > 0)) continue;
    const tR = t.left + t.width;
    const tB = t.top + t.height;

    // Horizontal gap: need vertical overlap (side-by-side).
    const yOv = rangeOverlap(box.top, bB, t.top, tB);
    if (yOv > 0) {
      const at = overlapMid(box.top, bB, t.top, tB);
      if (at != null) {
        if (tR <= box.left + 1e-6) {
          const dist = box.left - tR;
          if (dist > 0.5 && (!left || dist < left.dist)) {
            left = { dist, from: tR, to: box.left, at };
          }
        }
        if (t.left >= bR - 1e-6) {
          const dist = t.left - bR;
          if (dist > 0.5 && (!right || dist < right.dist)) {
            right = { dist, from: bR, to: t.left, at };
          }
        }
      }
    }

    // Vertical gap: need horizontal overlap (stacked).
    const xOv = rangeOverlap(box.left, bR, t.left, tR);
    if (xOv > 0) {
      const at = overlapMid(box.left, bR, t.left, tR);
      if (at != null) {
        if (tB <= box.top + 1e-6) {
          const dist = box.top - tB;
          if (dist > 0.5 && (!above || dist < above.dist)) {
            above = { dist, from: tB, to: box.top, at };
          }
        }
        if (t.top >= bB - 1e-6) {
          const dist = t.top - bB;
          if (dist > 0.5 && (!below || dist < below.dist)) {
            below = { dist, from: bB, to: t.top, at };
          }
        }
      }
    }
  }

  const pushGap = (axis: 'x' | 'y', c: GapCand | null) => {
    if (!c) return;
    out.push({
      kind: 'gap',
      axis,
      from: c.from,
      to: c.to,
      at: c.at,
      dist: Math.round(c.dist),
    });
  };
  pushGap('x', left);
  pushGap('x', right);
  pushGap('y', above);
  pushGap('y', below);
  return out;
}

/** Scene epsilon: path marks must nearly coincide (do not scale with zoom snap threshold). */
export const GUIDE_COINCIDE_EPS = 0.51;

function isOnGrid(value: number, gridSize: number): boolean {
  if (!(gridSize > 0) || !Number.isFinite(value)) return true;
  const q = Math.round(value / gridSize) * gridSize;
  return Math.abs(value - q) <= 1e-6;
}

/** After snap: coincide path marks (fixed scene epsilon). */
function finishSmartGuides(
  box: SceneBox,
  targets: SceneBox[],
  _threshold: number,
  snappedX: boolean,
  snappedY: boolean,
  primary?: { x?: SmartGuideAlign; y?: SmartGuideAlign }
): SmartGuideLine[] {
  void _threshold;
  const aligns: SmartGuideAlign[] = [];
  if (primary?.x) aligns.push(primary.x);
  if (primary?.y) aligns.push(primary.y);

  if (snappedX || snappedY || aligns.length) {
    for (const g of collectAlignGuides(box, targets, GUIDE_COINCIDE_EPS)) {
      if (g.axis === 'x' && !(snappedX || primary?.x)) continue;
      if (g.axis === 'y' && !(snappedY || primary?.y)) continue;
      const i = aligns.findIndex(
        (a) => a.axis === g.axis && Math.abs(a.at - g.at) < GUIDE_COINCIDE_EPS
      );
      if (i < 0) aligns.push(g);
      else {
        aligns[i] = {
          ...aligns[i],
          from: Math.min(aligns[i].from, g.from),
          to: Math.max(aligns[i].to, g.to),
          marks: mergeMarks(aligns[i].marks, g.marks || []),
        };
      }
    }
  }
  // Ensure primary guides carry × marks even when no sibling collect matched.
  for (let i = 0; i < aligns.length; i += 1) {
    const g = aligns[i];
    if (g.marks?.length) continue;
    aligns[i] = {
      ...g,
      marks: marksAlongGuide(box, targets, g.axis, g.at, GUIDE_COINCIDE_EPS),
    };
  }
  const gaps = collectGapGuides(box, targets);
  return [...aligns, ...gaps];
}

/**
 * Paint-only guides for the current box — gaps always; aligns when edges
 * coincide within `eps` (does not move the box).
 */
export function collectSmartGuidesAt(
  box: SceneBox,
  targets: SceneBox[],
  eps: number = GUIDE_COINCIDE_EPS
): SmartGuideLine[] {
  const coincide = Math.max(GUIDE_COINCIDE_EPS, Number(eps) || 0);
  const aligns = collectAlignGuides(box, targets, coincide).map((g) => ({
    ...g,
    marks: g.marks?.length
      ? g.marks
      : marksAlongGuide(box, targets, g.axis, g.at, GUIDE_COINCIDE_EPS),
  }));
  return [...aligns, ...collectGapGuides(box, targets)];
}

/** Snap a moving AABB to sibling path edges / centers. */
export function snapMoveToSmartGuides(opts: {
  box: SceneBox;
  targets: SceneBox[];
  threshold: number;
  /** Skip snaps that leave the box origin off the document grid. */
  gridSize?: number;
  /**
   * Prior frame guide positions (`at`). Prefer staying on the same guides so
   * nearby candidates (e.g. flush vs gap-4) do not flip-flop while dragging.
   */
  stickyAt?: { x?: number; y?: number } | null;
}): { box: SceneBox; guides: SmartGuideLine[]; stickyAt: { x?: number; y?: number } } {
  const { box, targets, threshold } = opts;
  const gridSize = opts.gridSize ?? 0;
  const stickyAt = opts.stickyAt || null;
  if (!(threshold > 0) || !targets.length) {
    return { box, guides: [], stickyAt: {} };
  }

  type Cand = {
    abs: number;
    score: number;
    delta: number;
    at: number;
    from: number;
    to: number;
    role: 'min' | 'mid' | 'max';
  };
  let bestX: Cand | null = null;
  let bestY: Cand | null = null;

  const roleRank = (r: AxisMark['role']) => (r === 'mid' ? 1 : 0);
  // Small scene sticky only — do NOT scale with snap threshold or low zoom
  // holds the wrong guide across dozens of cells and blocks the real magnet.
  const hysteresis = Math.max(gridSize > 0 ? gridSize : 1, 2);

  const mx = boxXMarks(box);
  const my = boxYMarks(box);

  for (const t of targets) {
    if (!(t.width > 0) || !(t.height > 0)) continue;
    const tx = boxXMarks(t);
    const ty = boxYMarks(t);
    for (const m of mx) {
      for (const tm of tx) {
        const delta = tm.value - m.value;
        const abs = Math.abs(delta);
        if (abs > threshold) continue;
        const nextLeft = box.left + delta;
        // Path control box / visual outer must stay on grid — reject snaps that leave it.
        if (gridSize > 0 && !isOnGrid(nextLeft, gridSize)) continue;
        let score = abs;
        if (stickyAt?.x != null && Math.abs(tm.value - stickyAt.x) <= 1e-6) {
          score = Math.max(0, score - hysteresis);
        }
        if (bestX && score > bestX.score + 1e-9) continue;
        if (
          bestX &&
          Math.abs(score - bestX.score) <= 1e-9 &&
          roleRank(tm.role) > roleRank(bestX.role)
        ) {
          continue;
        }
        if (
          bestX &&
          Math.abs(score - bestX.score) <= 1e-9 &&
          roleRank(tm.role) === roleRank(bestX.role) &&
          abs > bestX.abs + 1e-9
        ) {
          continue;
        }
        const ext = mergeGuideExtent(box.top, box.top + box.height, t.top, t.top + t.height);
        bestX = { abs, score, delta, at: tm.value, from: ext.from, to: ext.to, role: tm.role };
      }
    }
    for (const m of my) {
      for (const tm of ty) {
        const delta = tm.value - m.value;
        const abs = Math.abs(delta);
        if (abs > threshold) continue;
        const nextTop = box.top + delta;
        if (gridSize > 0 && !isOnGrid(nextTop, gridSize)) continue;
        let score = abs;
        if (stickyAt?.y != null && Math.abs(tm.value - stickyAt.y) <= 1e-6) {
          score = Math.max(0, score - hysteresis);
        }
        if (bestY && score > bestY.score + 1e-9) continue;
        if (
          bestY &&
          Math.abs(score - bestY.score) <= 1e-9 &&
          roleRank(tm.role) > roleRank(bestY.role)
        ) {
          continue;
        }
        if (
          bestY &&
          Math.abs(score - bestY.score) <= 1e-9 &&
          roleRank(tm.role) === roleRank(bestY.role) &&
          abs > bestY.abs + 1e-9
        ) {
          continue;
        }
        const ext = mergeGuideExtent(box.left, box.left + box.width, t.left, t.left + t.width);
        bestY = { abs, score, delta, at: tm.value, from: ext.from, to: ext.to, role: tm.role };
      }
    }
  }

  const next: SceneBox = {
    ...box,
    left: bestX ? box.left + bestX.delta : box.left,
    top: bestY ? box.top + bestY.delta : box.top,
  };
  return {
    box: next,
    guides: finishSmartGuides(next, targets, threshold, Boolean(bestX), Boolean(bestY), {
      x: bestX
        ? {
            kind: 'align',
            axis: 'x',
            at: bestX.at,
            from: bestX.from,
            to: bestX.to,
            marks: marksAlongGuide(next, targets, 'x', bestX.at, GUIDE_COINCIDE_EPS),
          }
        : undefined,
      y: bestY
        ? {
            kind: 'align',
            axis: 'y',
            at: bestY.at,
            from: bestY.from,
            to: bestY.to,
            marks: marksAlongGuide(next, targets, 'y', bestY.at, GUIDE_COINCIDE_EPS),
          }
        : undefined,
    }),
    stickyAt: {
      x: bestX?.at,
      y: bestY?.at,
    },
  };
}

/**
 * Snap edges moved by `handle` onto sibling edges / centers.
 */
export function snapResizeToSmartGuides(opts: {
  box: SceneBox;
  handle: ResizeHandle;
  targets: SceneBox[];
  threshold: number;
  min?: number;
  /** Skip target marks that are off the document grid. */
  gridSize?: number;
}): { box: SceneBox; guides: SmartGuideLine[] } {
  const { box, handle, targets, threshold } = opts;
  const gridSize = opts.gridSize ?? 0;
  const min = Math.max(1, opts.min ?? 1);
  if (!(threshold > 0) || !targets.length) return { box, guides: [] };

  const moveL = handle === 'w' || handle === 'nw' || handle === 'sw';
  const moveR = handle === 'e' || handle === 'ne' || handle === 'se';
  const moveT = handle === 'n' || handle === 'nw' || handle === 'ne';
  const moveB = handle === 's' || handle === 'sw' || handle === 'se';

  let left = box.left;
  let top = box.top;
  let right = box.left + box.width;
  let bottom = box.top + box.height;

  type EdgeCand = { abs: number; value: number; from: number; to: number; role: 'min' | 'mid' | 'max' };
  const roleRank = (r: AxisMark['role']) => (r === 'mid' ? 1 : 0);
  const pickEdge = (
    edge: number,
    targetsMarks: Array<{ value: number; box: SceneBox; role: AxisMark['role'] }>,
    extent: (t: SceneBox) => { from: number; to: number }
  ): EdgeCand | null => {
    let best: EdgeCand | null = null;
    for (const tm of targetsMarks) {
      const abs = Math.abs(tm.value - edge);
      if (abs > threshold) continue;
      if (gridSize > 0 && !isOnGrid(tm.value, gridSize)) continue;
      if (best && abs > best.abs + 1e-9) continue;
      if (best && Math.abs(abs - best.abs) <= 1e-9 && roleRank(tm.role) > roleRank(best.role)) {
        continue;
      }
      const ext = extent(tm.box);
      best = { abs, value: tm.value, from: ext.from, to: ext.to, role: tm.role };
    }
    return best;
  };

  const xMarks: Array<{ value: number; box: SceneBox; role: AxisMark['role'] }> = [];
  const yMarks: Array<{ value: number; box: SceneBox; role: AxisMark['role'] }> = [];
  for (const t of targets) {
    if (!(t.width > 0) || !(t.height > 0)) continue;
    for (const m of boxXMarks(t)) xMarks.push({ value: m.value, box: t, role: m.role });
    for (const m of boxYMarks(t)) yMarks.push({ value: m.value, box: t, role: m.role });
  }

  let snappedX = false;
  let snappedY = false;
  let primaryX: SmartGuideAlign | undefined;
  let primaryY: SmartGuideAlign | undefined;
  if (moveL) {
    const hit = pickEdge(left, xMarks, (t) =>
      mergeGuideExtent(top, bottom, t.top, t.top + t.height)
    );
    if (hit) {
      left = hit.value;
      snappedX = true;
      primaryX = { kind: 'align', axis: 'x', at: hit.value, from: hit.from, to: hit.to };
    }
  }
  if (moveR) {
    const hit = pickEdge(right, xMarks, (t) =>
      mergeGuideExtent(top, bottom, t.top, t.top + t.height)
    );
    if (hit) {
      right = hit.value;
      snappedX = true;
      primaryX = { kind: 'align', axis: 'x', at: hit.value, from: hit.from, to: hit.to };
    }
  }
  if (moveT) {
    const hit = pickEdge(top, yMarks, (t) =>
      mergeGuideExtent(left, right, t.left, t.left + t.width)
    );
    if (hit) {
      top = hit.value;
      snappedY = true;
      primaryY = { kind: 'align', axis: 'y', at: hit.value, from: hit.from, to: hit.to };
    }
  }
  if (moveB) {
    const hit = pickEdge(bottom, yMarks, (t) =>
      mergeGuideExtent(left, right, t.left, t.left + t.width)
    );
    if (hit) {
      bottom = hit.value;
      snappedY = true;
      primaryY = { kind: 'align', axis: 'y', at: hit.value, from: hit.from, to: hit.to };
    }
  }

  if (right - left < min) {
    if (moveL && !moveR) left = right - min;
    else right = left + min;
  }
  if (bottom - top < min) {
    if (moveT && !moveB) top = bottom - min;
    else bottom = top + min;
  }

  const next = { left, top, width: right - left, height: bottom - top };
  if (primaryX) {
    primaryX = {
      ...primaryX,
      marks: marksAlongGuide(next, targets, 'x', primaryX.at, GUIDE_COINCIDE_EPS),
    };
  }
  if (primaryY) {
    primaryY = {
      ...primaryY,
      marks: marksAlongGuide(next, targets, 'y', primaryY.at, GUIDE_COINCIDE_EPS),
    };
  }
  return {
    box: next,
    guides: finishSmartGuides(next, targets, threshold, snappedX, snappedY, {
      x: primaryX,
      y: primaryY,
    }),
  };
}

export function getDocumentGridSize(doc: unknown): number {
  const n = Number((doc as { gridSize?: unknown } | null)?.gridSize);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRID_SIZE;
}

/**
 * Min canvas zoom before the 1px cell grid appears.
 * Below ~800% a 1px lattice is dense, noisy, and costly.
 * Uses camera zoom only (not browser zoom / devicePixelRatio).
 */
export const PIXEL_GRID_MIN_ZOOM = 8;

/** Auto pixel-grid visibility — canvas zoom only, independent of browser zoom. */
export function shouldShowPixelGrid(zoom: number): boolean {
  const z = Math.max(0, Number(zoom) || 0);
  return z >= PIXEL_GRID_MIN_ZOOM - 1e-6;
}

export function snapCoordToGrid(value: number, gridSize: number): number {
  if (!(gridSize > 0) || !Number.isFinite(value)) return value;
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap all four edges to the grid (draw / place).
 * Collapsed edges expand by one cell so a soft drag still yields a grid tile.
 */
export function snapBoxEdgesToGrid(box: SceneBox, gridSize: number, minCells = 1): SceneBox {
  if (!(gridSize > 0)) return box;
  let left = snapCoordToGrid(box.left, gridSize);
  let top = snapCoordToGrid(box.top, gridSize);
  let right = snapCoordToGrid(box.left + box.width, gridSize);
  let bottom = snapCoordToGrid(box.top + box.height, gridSize);
  const min = Math.max(1, minCells) * gridSize;
  if (right - left < min) {
    right = left + min;
  }
  if (bottom - top < min) {
    bottom = top + min;
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** Snap box origin to grid; size unchanged (move / translate). */
export function snapBoxToGrid(box: SceneBox, gridSize: number): SceneBox {
  if (!(gridSize > 0)) return box;
  return {
    ...box,
    left: snapCoordToGrid(box.left, gridSize),
    top: snapCoordToGrid(box.top, gridSize),
  };
}

/**
 * Snap edges moved by `handle` onto the grid (resize).
 * Fixed edges stay put; moving edges round to gridSize.
 * When `lockAspect`, re-apply aspect after edge snap so ratio stays intact.
 */
export function snapResizeToGrid(
  resized: SceneBox,
  handle: ResizeHandle,
  gridSize: number,
  min = 1,
  opts?: { lockAspect?: boolean; aspectRatio?: number }
): SceneBox {
  if (!(gridSize > 0)) return resized;
  const moveL = handle === 'w' || handle === 'nw' || handle === 'sw';
  const moveR = handle === 'e' || handle === 'ne' || handle === 'se';
  const moveT = handle === 'n' || handle === 'nw' || handle === 'ne';
  const moveB = handle === 's' || handle === 'sw' || handle === 'se';

  let left = resized.left;
  let top = resized.top;
  let right = resized.left + resized.width;
  let bottom = resized.top + resized.height;

  if (moveL) left = snapCoordToGrid(left, gridSize);
  if (moveR) right = snapCoordToGrid(right, gridSize);
  if (moveT) top = snapCoordToGrid(top, gridSize);
  if (moveB) bottom = snapCoordToGrid(bottom, gridSize);

  let width = right - left;
  let height = bottom - top;
  if (width < min) {
    if (moveL && !moveR) left = right - min;
    else right = left + min;
    width = min;
  }
  if (height < min) {
    if (moveT && !moveB) top = bottom - min;
    else bottom = top + min;
    height = min;
  }

  let box: SceneBox = { left, top, width, height };
  if (opts?.lockAspect) {
    const ratio =
      opts.aspectRatio && Number.isFinite(opts.aspectRatio) && opts.aspectRatio > 0
        ? opts.aspectRatio
        : resized.width / Math.max(1, resized.height);
    box = applyAspectToHandle(handle, box.left, box.top, box.width, box.height, ratio);
    right = box.left + box.width;
    bottom = box.top + box.height;
    left = box.left;
    top = box.top;
    width = box.width;
    height = box.height;
    if (width < min) {
      if (moveL && !moveR) left = right - min;
      else right = left + min;
      width = min;
    }
    if (height < min) {
      if (moveT && !moveB) top = bottom - min;
      else bottom = top + min;
      height = min;
    }
    box = { left, top, width, height };
  }
  return box;
}
