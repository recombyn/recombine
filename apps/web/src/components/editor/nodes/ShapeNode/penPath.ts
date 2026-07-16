/** Pen tool: cubic Bezier anchors → SVG path `d` (local coords). */

export type PenAnchor = {
  x: number;
  y: number;
  outX?: number;
  outY?: number;
  inX?: number;
  inY?: number;
};

export function mirrorHandle(x: number, y: number, hx: number, hy: number) {
  return { x: x * 2 - hx, y: y * 2 - hy };
}

export function withMirroredHandles(anchor: PenAnchor): PenAnchor {
  if (anchor.outX == null || anchor.outY == null) return { x: anchor.x, y: anchor.y };
  const mirrored = mirrorHandle(anchor.x, anchor.y, anchor.outX, anchor.outY);
  return {
    x: anchor.x,
    y: anchor.y,
    outX: anchor.outX,
    outY: anchor.outY,
    inX: mirrored.x,
    inY: mirrored.y,
  };
}

export function penAnchorsToD(anchors: PenAnchor[], closed = false) {
  if (anchors.length === 0) return '';
  const [first, ...rest] = anchors;
  let d = `M ${first.x} ${first.y}`;
  rest.forEach((curr, idx) => {
    const prev = anchors[idx];
    const hasCurve =
      (prev.outX != null && prev.outY != null) || (curr.inX != null && curr.inY != null);
    if (hasCurve) {
      const outX = prev.outX ?? prev.x;
      const outY = prev.outY ?? prev.y;
      const inX = curr.inX ?? curr.x;
      const inY = curr.inY ?? curr.y;
      d += ` C ${outX} ${outY} ${inX} ${inY} ${curr.x} ${curr.y}`;
    } else {
      d += ` L ${curr.x} ${curr.y}`;
    }
  });
  if (closed && anchors.length > 2) {
    const last = anchors[anchors.length - 1];
    const hasCurve =
      (last.outX != null && last.outY != null) || (first.inX != null && first.inY != null);
    if (hasCurve) {
      const outX = last.outX ?? last.x;
      const outY = last.outY ?? last.y;
      const inX = first.inX ?? first.x;
      const inY = first.inY ?? first.y;
      d += ` C ${outX} ${outY} ${inX} ${inY} ${first.x} ${first.y}`;
    } else {
      d += ` L ${first.x} ${first.y}`;
    }
    d += ' Z';
  }
  return d;
}

type Pt = { x: number; y: number };

function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/** Roots of quadratic at² + bt + c = 0 in (0, 1). */
function quadRoots01(a: number, b: number, c: number): number[] {
  const out: number[] = [];
  const push = (t: number) => {
    if (t > 1e-6 && t < 1 - 1e-6) out.push(t);
  };
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) push(-c / b);
    return out;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return out;
  const s = Math.sqrt(disc);
  push((-b + s) / (2 * a));
  push((-b - s) / (2 * a));
  return out;
}

/**
 * Tight AABB of a cubic Bezier — endpoints + extrema from B'(t)=0.
 * Control handles are NOT included (they lie off the visible curve).
 */
function boundsOfCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt) {
  let minX = Math.min(p0.x, p3.x);
  let minY = Math.min(p0.y, p3.y);
  let maxX = Math.max(p0.x, p3.x);
  let maxY = Math.max(p0.y, p3.y);

  // B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
  // → at² + bt + c = 0 for each axis
  const ax = 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x);
  const bx = 6 * (p0.x - 2 * p1.x + p2.x);
  const cx = 3 * (p1.x - p0.x);
  const ay = 3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y);
  const by = 6 * (p0.y - 2 * p1.y + p2.y);
  const cy = 3 * (p1.y - p0.y);

  for (const t of [...quadRoots01(ax, bx, cx), ...quadRoots01(ay, by, cy)]) {
    const p = cubicPoint(p0, p1, p2, p3, t);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, minY, maxX, maxY };
}

function segmentBounds(prev: PenAnchor, curr: PenAnchor) {
  const hasCurve =
    (prev.outX != null && prev.outY != null) || (curr.inX != null && curr.inY != null);
  if (!hasCurve) {
    return {
      minX: Math.min(prev.x, curr.x),
      minY: Math.min(prev.y, curr.y),
      maxX: Math.max(prev.x, curr.x),
      maxY: Math.max(prev.y, curr.y),
    };
  }
  const p0 = { x: prev.x, y: prev.y };
  const p1 = { x: prev.outX ?? prev.x, y: prev.outY ?? prev.y };
  const p2 = { x: curr.inX ?? curr.x, y: curr.inY ?? curr.y };
  const p3 = { x: curr.x, y: curr.y };
  return boundsOfCubic(p0, p1, p2, p3);
}

/**
 * Tight bounds of the visible pen path (curve geometry only).
 * Do not include Bezier control handles — they inflate the selection box.
 */
export function boundsOfAnchors(anchors: PenAnchor[], closed = false) {
  if (anchors.length === 0) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }
  if (anchors.length === 1) {
    return { left: anchors[0].x, top: anchors[0].y, width: 1, height: 1 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const absorb = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  };

  for (let i = 1; i < anchors.length; i += 1) {
    absorb(segmentBounds(anchors[i - 1], anchors[i]));
  }
  if (closed && anchors.length > 2) {
    absorb(segmentBounds(anchors[anchors.length - 1], anchors[0]));
  }

  if (!Number.isFinite(minX)) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }
  return {
    left: minX,
    top: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Shift anchors into local coords relative to bbox top-left. */
export function localizeAnchors(anchors: PenAnchor[], left: number, top: number): PenAnchor[] {
  const shift = (x?: number, y?: number) =>
    x == null || y == null ? undefined : { x: x - left, y: y - top };
  return anchors.map((a) => {
    const out = shift(a.outX, a.outY);
    const inn = shift(a.inX, a.inY);
    return {
      x: a.x - left,
      y: a.y - top,
      ...(out ? { outX: out.x, outY: out.y } : {}),
      ...(inn ? { inX: inn.x, inY: inn.y } : {}),
    };
  });
}

export const CLOSE_THRESHOLD = 10;
