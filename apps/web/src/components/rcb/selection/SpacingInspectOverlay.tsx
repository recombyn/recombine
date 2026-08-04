import { useMemo, memo } from 'react';
import { useRcbCamera } from '../camera/context';
import { toDomPrecision } from '../core/dpr';

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
   * `gap` (default): clearance between facing edges — double-headed arrow.
   * `offset`: edge misalignment (e.g. top delta while H-gapped) — dashed, no arrows.
   */
  kind?: 'gap' | 'offset';
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

/** Gap / offset measure color (fig.1 orange). */
export const SPACING_MEASURE_COLOR = '#FF6A00';
/** Selected size badge (fig.1 blue). */
export const SPACING_SIZE_BADGE_COLOR = '#3388FF';
const MEASURE = SPACING_MEASURE_COLOR;
const OVERLAP_EPS = 0.5;
const DASH_CLEAR_PAD = OVERLAP_EPS * 4;
/**
 * Skip spacing rails when the gap (or shaft) is longer than this on screen.
 * Far pairs like 1500px clearance only add clutter.
 */
const MAX_SPACING_GAP_SCREEN_PX = 400;

/** Drop measures that span too far in screen space (distance tip or shaft length). */
function filterFarSpacingMeasures(
  measures: SpacingMeasure[],
  zoom: number
): SpacingMeasure[] {
  const maxScene = MAX_SPACING_GAP_SCREEN_PX / Math.max(0.05, zoom);
  return measures.filter((m) => {
    if (m.distance > maxScene) return false;
    const span = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
    return span <= maxScene;
  });
}

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
type SpacingSide = SpacingMeasure['side'];

type BoxEdges = {
  L: number;
  T: number;
  R: number;
  B: number;
  cx: number;
  cy: number;
};

function boxEdges(b: SceneBox): BoxEdges {
  const L = b.left;
  const T = b.top;
  const R = b.left + b.width;
  const B = b.top + b.height;
  return { L, T, R, B, cx: mid(L, R), cy: mid(T, B) };
}

function boxKey(b: SceneBox) {
  return `${b.left},${b.top},${b.width},${b.height}`;
}

function boxesEqual(a: SceneBox, b: SceneBox) {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function measureSeg(
  side: SpacingSide,
  distance: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dashes?: SpacingDash[]
): SpacingMeasure {
  const m: SpacingMeasure = {
    side,
    distance,
    x1,
    y1,
    x2,
    y2,
    mx: mid(x1, x2),
    my: mid(y1, y2),
  };
  if (dashes?.length) m.dashes = dashes;
  return m;
}

/** Overlap mid on an axis, else the selection face toward the neighbor. */
function overlapBandOrFace(
  sel0: number,
  sel1: number,
  oth0: number,
  oth1: number,
  faceLo: number,
  faceHi: number
) {
  const lo = Math.max(sel0, oth0);
  const hi = Math.min(sel1, oth1);
  if (hi > lo + OVERLAP_EPS) return mid(lo, hi);
  if (oth1 <= sel0 + OVERLAP_EPS) return faceLo;
  return faceHi;
}

function hMeasureY(sel: SceneBox, other: SceneBox) {
  const s = boxEdges(sel);
  const o = boxEdges(other);
  return overlapBandOrFace(s.T, s.B, o.T, o.B, s.T, s.B);
}

function vMeasureX(sel: SceneBox, other: SceneBox) {
  const s = boxEdges(sel);
  const o = boxEdges(other);
  return overlapBandOrFace(s.L, s.R, o.L, o.R, s.L, s.R);
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
  const s = boxEdges(box);
  const out: SpacingMeasure[] = [];

  type Cand = { d: number; x1: number; y1: number; x2: number; y2: number };
  const pickNearest = (side: SpacingSide, candidates: Cand[]) => {
    if (!candidates.length) return;
    candidates.sort((a, b) => a.d - b.d);
    const best = candidates[0];
    out.push(measureSeg(side, best.d, best.x1, best.y1, best.x2, best.y2));
  };

  const left: Cand[] = [];
  const right: Cand[] = [];
  const top: Cand[] = [];
  const bottom: Cand[] = [];

  for (const o of others) {
    const e = boxEdges(o);
    if (e.R <= s.L + OVERLAP_EPS && overlaps1D(s.T, s.B, e.T, e.B)) {
      const d = s.L - e.R;
      if (d >= 0) left.push({ d, x1: e.R, y1: s.cy, x2: s.L, y2: s.cy });
    }
    if (e.L >= s.R - OVERLAP_EPS && overlaps1D(s.T, s.B, e.T, e.B)) {
      const d = e.L - s.R;
      if (d >= 0) right.push({ d, x1: s.R, y1: s.cy, x2: e.L, y2: s.cy });
    }
    if (e.B <= s.T + OVERLAP_EPS && overlaps1D(s.L, s.R, e.L, e.R)) {
      const d = s.T - e.B;
      if (d >= 0) top.push({ d, x1: s.cx, y1: e.B, x2: s.cx, y2: s.T });
    }
    if (e.T >= s.B - OVERLAP_EPS && overlaps1D(s.L, s.R, e.L, e.R)) {
      const d = e.T - s.B;
      if (d >= 0) bottom.push({ d, x1: s.cx, y1: s.B, x2: s.cx, y2: e.T });
    }
  }

  pickNearest('left', left);
  pickNearest('right', right);
  pickNearest('top', top);
  pickNearest('bottom', bottom);
  return out;
}

type Seg2 = { x1: number; y1: number; x2: number; y2: number };

function segIsHorizontal(s: Seg2) {
  return Math.abs(s.y2 - s.y1) <= Math.abs(s.x2 - s.x1);
}

/** True when dash shares the solid's axis and their spans overlap (same drawn rail). */
function dashOverlapsSolid(dash: Seg2, solid: Seg2, pad: number): boolean {
  const dH = segIsHorizontal(dash);
  const sH = segIsHorizontal(solid);
  if (dH !== sH) return false;
  if (dH) {
    if (Math.abs(dash.y1 - solid.y1) > pad && Math.abs(dash.y1 - solid.y2) > pad) return false;
    const d0 = Math.min(dash.x1, dash.x2);
    const d1 = Math.max(dash.x1, dash.x2);
    const s0 = Math.min(solid.x1, solid.x2) - pad;
    const s1 = Math.max(solid.x1, solid.x2) + pad;
    return d0 < s1 && d1 > s0;
  }
  if (Math.abs(dash.x1 - solid.x1) > pad && Math.abs(dash.x1 - solid.x2) > pad) return false;
  const d0 = Math.min(dash.y1, dash.y2);
  const d1 = Math.max(dash.y1, dash.y2);
  const s0 = Math.min(solid.y1, solid.y2) - pad;
  const s1 = Math.max(solid.y1, solid.y2) + pad;
  return d0 < s1 && d1 > s0;
}

/** Drop projection dashes that sit on top of any solid measure shaft. */
function pruneOverlappingDashes(measures: SpacingMeasure[]): SpacingMeasure[] {
  const solids: Seg2[] = measures.map((m) => ({
    x1: m.x1,
    y1: m.y1,
    x2: m.x2,
    y2: m.y2,
  }));
  // Also treat other measures' remaining dashes as occupied rails once kept.
  const keptRails: Seg2[] = [...solids];
  return measures.map((m) => {
    if (!m.dashes?.length) return m;
    const next: SpacingDash[] = [];
    for (const d of m.dashes) {
      const hit = keptRails.some((s) => dashOverlapsSolid(d, s, DASH_CLEAR_PAD));
      if (hit) continue;
      next.push(d);
      keptRails.push(d);
    }
    return next.length === m.dashes.length ? m : { ...m, dashes: next };
  });
}

/**
 * Pick a clearance Y inside [lo, hi] that stays clear of avoidYs (edge-offset rails).
 */
function pickClearanceAlong(
  lo: number,
  hi: number,
  avoid: number[],
  minClear: number
): number {
  const span = hi - lo;
  if (span <= OVERLAP_EPS) return mid(lo, hi);
  const candidates = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85].map((t) => lo + span * t);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const y of candidates) {
    let score = Math.min(...avoid.map((a) => Math.abs(y - a)), span);
    // Prefer middle of band slightly.
    score -= Math.abs(y - mid(lo, hi)) * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = y;
    }
  }
  // If still glued to an avoid rail in a thin band, keep mid — prune will drop the dash.
  if (bestScore < minClear && span > minClear * 2) {
    /* keep best */
  }
  return best;
}

/** Prefer the nearer misaligned edge pair; null when gaps-only or aligned. */
function preferEdgeSide(
  gapsOnly: boolean,
  primary: { side: SpacingSide; d: number },
  secondary: { side: SpacingSide; d: number }
): SpacingSide | null {
  if (gapsOnly) return null;
  const primaryOk = primary.d > OVERLAP_EPS;
  const secondaryOk = secondary.d > OVERLAP_EPS;
  if (!primaryOk && !secondaryOk) return null;
  if (primaryOk && (!secondaryOk || primary.d <= secondary.d)) return primary.side;
  if (secondaryOk) return secondary.side;
  return null;
}

type EdgePair = { side: SpacingSide; d: number; a: number; b: number };

/**
 * Axis-aligned pair clearance + optional one edge-offset rail in the gap.
 * `horizontal`: solid gap along X (facing left/right); else along Y.
 */
function pushAxisAlignedClearance(
  out: SpacingMeasure[],
  opts: {
    gapsOnly: boolean;
    horizontal: boolean;
    nearIsA: boolean;
    faceNear: number;
    faceFar: number;
    overlapLo: number;
    overlapHi: number;
    sep: number;
    gapSide: SpacingSide;
    primary: EdgePair;
    secondary: EdgePair;
  }
) {
  const {
    gapsOnly,
    horizontal,
    nearIsA,
    faceNear,
    faceFar,
    overlapLo,
    overlapHi,
    sep,
    gapSide,
    primary,
    secondary,
  } = opts;

  const showEdge = preferEdgeSide(gapsOnly, primary, secondary);
  let edgeA: number | null = null;
  let edgeB: number | null = null;
  if (showEdge === primary.side) {
    edgeA = primary.a;
    edgeB = primary.b;
  } else if (showEdge === secondary.side) {
    edgeA = secondary.a;
    edgeB = secondary.b;
  }

  const avoid = [edgeA, edgeB].filter((v): v is number => v != null);
  const along = pickClearanceAlong(overlapLo, overlapHi, avoid, 12);
  const gapMid = mid(faceNear, faceFar);

  out.push(
    horizontal
      ? measureSeg(gapSide, sep, faceNear, along, faceFar, along)
      : measureSeg(gapSide, sep, along, faceNear, along, faceFar)
  );

  if (!showEdge || edgeA == null || edgeB == null) return;

  const e0 = Math.min(edgeA, edgeB);
  const e1 = Math.max(edgeA, edgeB);
  const nearEdge = nearIsA ? edgeA : edgeB;
  const farEdge = nearIsA ? edgeB : edgeA;
  const dashes: SpacingDash[] = [];
  if (Math.abs(nearEdge - along) > DASH_CLEAR_PAD) {
    dashes.push(
      horizontal
        ? { x1: faceNear, y1: nearEdge, x2: gapMid, y2: nearEdge }
        : { x1: nearEdge, y1: faceNear, x2: nearEdge, y2: gapMid }
    );
  }
  if (Math.abs(farEdge - along) > DASH_CLEAR_PAD) {
    dashes.push(
      horizontal
        ? { x1: faceFar, y1: farEdge, x2: gapMid, y2: farEdge }
        : { x1: farEdge, y1: faceFar, x2: farEdge, y2: gapMid }
    );
  }
  const dist = showEdge === primary.side ? primary.d : secondary.d;
  out.push(
    horizontal
      ? measureSeg(showEdge, dist, gapMid, e0, gapMid, e1, dashes)
      : measureSeg(showEdge, dist, e0, gapMid, e1, gapMid, dashes)
  );
}

/**
 * Pair spacing (select + hover).
 *
 * Diagonal (fig.2): from the hover box's facing corner, dashed stubs reach the
 * selection's facing edges; solid arrows sit on those selection edges only —
 * no mid-gap crossing L.
 * Axis-aligned: facing clearance arrow; optional one edge-offset link.
 * `gapsOnly`: skip edge-offset rails (used while dragging to avoid clutter).
 * Dashes that would coincide with a solid shaft are pruned.
 */
export function computePairSpacingMeasures(
  a: SceneBox,
  b: SceneBox,
  opts?: { gapsOnly?: boolean }
): SpacingMeasure[] {
  // a = selection, b = hover / pair
  const gapsOnly = Boolean(opts?.gapsOnly);
  const A = boxEdges(a);
  const B = boxEdges(b);

  const xOverlap = Math.min(A.R, B.R) - Math.max(A.L, B.L);
  const yOverlap = Math.min(A.B, B.B) - Math.max(A.T, B.T);
  const hSep = xOverlap <= OVERLAP_EPS ? Math.max(B.L - A.R, A.L - B.R) : 0;
  const vSep = yOverlap <= OVERLAP_EPS ? Math.max(B.T - A.B, A.T - B.B) : 0;

  const out: SpacingMeasure[] = [];

  // —— Diagonal: MasterGo corner projection (fig.2) ——
  if (hSep > OVERLAP_EPS && vSep > OVERLAP_EPS) {
    const otherLeft = B.R <= A.L + OVERLAP_EPS;
    const otherAbove = B.B <= A.T + OVERLAP_EPS;
    const ox = otherLeft ? B.R : B.L;
    const oy = otherAbove ? B.B : B.T;
    const sx = otherLeft ? A.L : A.R;
    const sy = otherAbove ? A.T : A.B;

    const x0 = Math.min(ox, sx);
    const x1 = Math.max(ox, sx);
    // gapsOnly: just the two clearance shafts (no corner projection dashes).
    const hDashes = gapsOnly ? undefined : [{ x1: ox, y1: oy, x2: ox, y2: sy }];
    out.push(measureSeg(otherLeft ? 'left' : 'right', hSep, x0, sy, x1, sy, hDashes));

    const y0 = Math.min(oy, sy);
    const y1 = Math.max(oy, sy);
    const vDashes = gapsOnly ? undefined : [{ x1: ox, y1: oy, x2: sx, y2: oy }];
    out.push(measureSeg(otherAbove ? 'top' : 'bottom', vSep, sx, y0, sx, y1, vDashes));
    return gapsOnly ? out : pruneOverlappingDashes(out);
  }

  // —— Horizontal clearance (Y overlaps) ——
  if (hSep > OVERLAP_EPS) {
    const nearIsA = A.R <= B.L + OVERLAP_EPS;
    const leftBox = nearIsA ? A : B;
    const rightBox = nearIsA ? B : A;
    pushAxisAlignedClearance(out, {
      gapsOnly,
      horizontal: true,
      nearIsA,
      faceNear: leftBox.R,
      faceFar: rightBox.L,
      overlapLo: Math.max(A.T, B.T),
      overlapHi: Math.min(A.B, B.B),
      sep: hSep,
      gapSide: A.L >= B.R - OVERLAP_EPS ? 'left' : 'right',
      primary: { side: 'bottom', d: Math.abs(A.B - B.B), a: A.B, b: B.B },
      secondary: { side: 'top', d: Math.abs(A.T - B.T), a: A.T, b: B.T },
    });
  }

  // —— Vertical clearance (X overlaps) ——
  if (vSep > OVERLAP_EPS) {
    const nearIsA = A.B <= B.T + OVERLAP_EPS;
    const topBox = nearIsA ? A : B;
    const bottomBox = nearIsA ? B : A;
    pushAxisAlignedClearance(out, {
      gapsOnly,
      horizontal: false,
      nearIsA,
      faceNear: topBox.B,
      faceFar: bottomBox.T,
      overlapLo: Math.max(A.L, B.L),
      overlapHi: Math.min(A.R, B.R),
      sep: vSep,
      gapSide: A.T >= B.B - OVERLAP_EPS ? 'top' : 'bottom',
      primary: { side: 'right', d: Math.abs(A.R - B.R), a: A.R, b: B.R },
      secondary: { side: 'left', d: Math.abs(A.L - B.L), a: A.L, b: B.L },
    });
  }

  return pruneOverlappingDashes(out);
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
  const s = boxEdges(box);
  const bySide = new Map<
    SpacingSide,
    { measure: SpacingMeasure; source: SceneBox | null }
  >();

  const consider = (
    side: SpacingSide,
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
    const e = boxEdges(o);
    const yHit = overlaps1D(s.T, s.B, e.T, e.B);
    const xHit = overlaps1D(s.L, s.R, e.L, e.R);
    const my = hMeasureY(box, o);
    const mx = vMeasureX(box, o);

    // Horizontal gaps: allow off-axis neighbors (MasterGo projects with dashes).
    for (const edge of [e.L, e.R]) {
      if (edge <= s.L + OVERLAP_EPS) {
        if (!yHit && xHit) continue;
        if (!yHit && e.R > s.L - OVERLAP_EPS) continue;
        consider('left', measureSeg('left', s.L - edge, edge, my, s.L, my), o);
      } else if (edge >= s.R - OVERLAP_EPS) {
        if (!yHit && xHit) continue;
        if (!yHit && e.L < s.R + OVERLAP_EPS) continue;
        consider('right', measureSeg('right', edge - s.R, s.R, my, edge, my), o);
      }
    }

    // Vertical gaps: allow off-axis with projection dashes.
    for (const edge of [e.T, e.B]) {
      if (edge <= s.T + OVERLAP_EPS) {
        if (!xHit && yHit) continue;
        if (!xHit && e.B > s.T - OVERLAP_EPS) continue;
        consider('top', measureSeg('top', s.T - edge, mx, edge, mx, s.T), o);
      } else if (edge >= s.B - OVERLAP_EPS) {
        if (!xHit && yHit) continue;
        if (!xHit && e.T < s.B + OVERLAP_EPS) continue;
        consider('bottom', measureSeg('bottom', edge - s.B, mx, s.B, mx, edge), o);
      }
    }

    // Inside a container: measure to inner edges when selection sits inside.
    if (yHit && xHit) {
      const dL = s.L - e.L;
      const dR = e.R - s.R;
      const dT = s.T - e.T;
      const dB = e.B - s.B;
      if (dL > OVERLAP_EPS) {
        consider('left', measureSeg('left', dL, e.L, s.cy, s.L, s.cy), o);
      }
      if (dR > OVERLAP_EPS) {
        consider('right', measureSeg('right', dR, s.R, s.cy, e.R, s.cy), o);
      }
      if (dT > OVERLAP_EPS) {
        consider('top', measureSeg('top', dT, s.cx, e.T, s.cx, s.T), o);
      }
      if (dB > OVERLAP_EPS) {
        consider('bottom', measureSeg('bottom', dB, s.cx, s.B, s.cx, e.B), o);
      }
    }
  }

  const measures: SpacingMeasure[] = [];
  const highlights: SceneBox[] = [];
  const seen = new Set<string>();
  const pairedKeys = new Set<string>();

  const isContainer = (c: SceneBox) =>
    containers.some((x) => x === c || boxesEqual(x, c));

  // Sibling winners → gap rails only (no edge-offset clutter while dragging).
  for (const { source } of bySide.values()) {
    if (!source || isContainer(source)) continue;
    const key = boxKey(source);
    if (pairedKeys.has(key)) continue;
    pairedKeys.add(key);
    measures.push(...computePairSpacingMeasures(box, source, { gapsOnly: true }));
    if (!seen.has(key)) {
      seen.add(key);
      highlights.push(source);
    }
  }

  // Container / artboard inner margins (pair algorithm does not cover "inside").
  for (const { measure, source } of bySide.values()) {
    if (source && pairedKeys.has(boxKey(source))) continue;
    measures.push(measure);
    if (!source || isContainer(source)) continue;
    const key = boxKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    highlights.push(source);
  }

  // At most one rail per side (nearest). Stops 3× horizontal stacks from multi-neighbors.
  const nearestBySide = new Map<SpacingSide, SpacingMeasure>();
  for (const m of pruneOverlappingDashes(measures)) {
    if (m.distance < 0.05) continue;
    const prev = nearestBySide.get(m.side);
    if (!prev || m.distance < prev.distance - OVERLAP_EPS) {
      nearestBySide.set(m.side, m);
    }
  }

  return { measures: [...nearestBySide.values()], highlights };
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
 * Prefer the path-sized box when faced duplicates remain (never outer ink).
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

  // Drop near-duplicate faced boxes (same center); keep the smaller = path.
  const unique: SceneBox[] = [];
  for (const b of candidates) {
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const idx = unique.findIndex((u) => {
      const ux = u.left + u.width / 2;
      const uy = u.top + u.height / 2;
      return Math.abs(ux - cx) <= eps && Math.abs(uy - cy) <= eps;
    });
    if (idx >= 0) {
      if (b.width * b.height < unique[idx].width * unique[idx].height) {
        unique[idx] = b;
      }
      continue;
    }
    unique.push(b);
  }

  for (const b of unique) {
    const e = boxEdges(b);
    const key = boxKey(b);
    if (seen.has(key)) continue;

    const hit = guides.some((g) => {
      if (g.kind === 'gap' || g.kind === 'size') {
        if (g.orient === 'h') {
          return (
            near(e.R, g.from) ||
            near(e.L, g.to) ||
            near(e.L, g.from) ||
            near(e.R, g.to)
          );
        }
        return (
          near(e.B, g.from) ||
          near(e.T, g.to) ||
          near(e.T, g.from) ||
          near(e.B, g.to)
        );
      }
      const marks = g.marks?.length ? g.marks : [g.from, g.to];
      if (g.orient === 'v') {
        const onX = near(e.L, g.pos) || near(e.R, g.pos) || near(e.cx, g.pos);
        if (!onX) return false;
        return marks.some((m) => near(e.T, m) || near(e.B, m) || near(e.cy, m));
      }
      const onY = near(e.T, g.pos) || near(e.B, g.pos) || near(e.cy, g.pos);
      if (!onY) return false;
      return marks.some((m) => near(e.L, m) || near(e.R, m) || near(e.cx, m));
    });

    if (!hit) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

/** Open chevron double-headed measure in scene coords (no CSS translate). */
function measureArrowScenePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  arrow: number,
  stroke: number
): { shaft: string; headA: string; headB: string } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.05)) return null;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const head = Math.min(arrow, Math.max(stroke * 2, Math.min(len * 0.28, arrow)));
  const wing = head * 0.55;
  if (horizontal) {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const y = (y1 + y2) / 2;
    return {
      shaft: `M${left} ${y} L${right} ${y}`,
      headA: `M${left + head} ${y - wing} L${left} ${y} L${left + head} ${y + wing}`,
      headB: `M${right - head} ${y - wing} L${right} ${y} L${right - head} ${y + wing}`,
    };
  }
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const x = (x1 + x2) / 2;
  return {
    shaft: `M${x} ${top} L${x} ${bottom}`,
    headA: `M${x - wing} ${top + head} L${x} ${top} L${x + wing} ${top + head}`,
    headB: `M${x - wing} ${bottom - head} L${x} ${bottom} L${x + wing} ${bottom - head}`,
  };
}

function spacingWorldViewport(
  box: SceneBox,
  measures: SpacingMeasure[],
  showSizeBadge: boolean,
  pad: number
): { minX: number; minY: number; w: number; h: number } {
  let minX = box.left;
  let minY = box.top;
  let maxX = box.left + box.width;
  let maxY = box.top + box.height;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const m of measures) {
    if (m.distance < 0.05) continue;
    grow(m.x1, m.y1);
    grow(m.x2, m.y2);
    grow(m.mx, m.my);
    for (const d of m.dashes || []) {
      grow(d.x1, d.y1);
      grow(d.x2, d.y2);
    }
  }
  if (showSizeBadge) {
    grow(box.left + box.width / 2, box.top + box.height);
    grow(box.left + box.width / 2, box.top);
    grow(box.left + box.width, box.top + box.height / 2);
  }
  return {
    minX: toDomPrecision(minX - pad),
    minY: toDomPrecision(minY - pad),
    w: toDomPrecision(Math.max(1, maxX - minX + pad * 2)),
    h: toDomPrecision(Math.max(1, maxY - minY + pad * 2)),
  };
}

/** Screen-constant pill in scene space (SVG — no CSS radius squash under camera scale). */
function spacingBadgeGeom(
  text: string,
  x: number,
  y: number,
  anchor: 'center' | 'below' | 'above' | 'right',
  inv: number,
  clearance = 0
) {
  const fontSize = 11 * inv;
  const padX = 5.5 * inv;
  const padY = 2.25 * inv;
  const radius = 4 * inv;
  const gap = Math.max(6 * inv, clearance);
  const tw = Math.max(14 * inv, String(text).length * fontSize * 0.62);
  const th = fontSize * 1.2;
  const w = tw + padX * 2;
  const h = th + padY * 2;
  let cx = x;
  let cy = y;
  if (anchor === 'below') cy = y + gap + h / 2;
  else if (anchor === 'above') cy = y - gap - h / 2;
  else if (anchor === 'right') cx = x + gap + w / 2;
  return {
    fontSize,
    radius,
    w,
    h,
    cx,
    cy,
    x: cx - w / 2,
    y: cy - h / 2,
  };
}

function SpacingBadgeSvg({
  text,
  x,
  y,
  anchor,
  fill,
  inv,
  clearance = 0,
}: {
  text: string;
  x: number;
  y: number;
  anchor: 'center' | 'below' | 'above' | 'right';
  fill: string;
  inv: number;
  clearance?: number;
}) {
  const g = spacingBadgeGeom(text, x, y, anchor, inv, clearance);
  return (
    <g pointerEvents="none">
      <rect
        x={g.x}
        y={g.y}
        width={g.w}
        height={g.h}
        rx={g.radius}
        ry={g.radius}
        fill={fill}
      />
      <text
        x={g.cx}
        y={g.cy}
        fill="#ffffff"
        fontSize={g.fontSize}
        fontWeight={600}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * Spacing / margin lines in **camera world** — same contract as path chrome /
 * SelectionChrome: one fitted SVG (`viewBox` === CSS `left/top/width/height`).
 * Badges are SVG too — HTML pills under `scale(zoom)` squash border-radius.
 */
function SpacingInspectOverlay({
  box,
  others,
  pairBox = null,
  showGaps = true,
  showSizeBadge = true,
  drawLines = true,
  color = MEASURE,
  sizeBadgeColor = SPACING_SIZE_BADGE_COLOR,
  measures: measuresProp,
}: SpacingInspectOverlayProps & {
  showSizeBadge?: boolean;
  /** When false, only badges (lines already host-injected). */
  drawLines?: boolean;
  color?: string;
  /** Selected W×H badge — blue in fig.1; gaps stay orange. */
  sizeBadgeColor?: string;
  /** When set, skip auto compute and render these measures. */
  measures?: SpacingMeasure[] | null;
}) {
  const camera = useRcbCamera();
  // Same as path control chrome: screen-constant under camera.zoom (not browser zoom).
  const zoom = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / zoom;
  const stroke = 1.5 * inv;
  const arrow = Math.max(stroke * 2, 3.5 * inv);
  const dashArr = `${stroke * 3.5} ${stroke * 3}`;
  const badgeGap = 6 * inv;
  const labelClearance = 8 * inv;

  const measures = useMemo(() => {
    const raw = (() => {
      if (measuresProp) return measuresProp;
      if (!showGaps) return [];
      if (pairBox) return computePairSpacingMeasures(box, pairBox, { gapsOnly: true });
      return computeSpacingMeasures(box, others);
    })();
    return filterFarSpacingMeasures(raw, zoom);
  }, [box, others, pairBox, showGaps, measuresProp, zoom]);

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

  const vpPad = Math.max(arrow, labelClearance, badgeGap) + 11 * inv * 2 + 8 * inv;
  const vp = spacingWorldViewport(box, measures, showSizeBadge, vpPad);
  const visibleMeasures = measures.filter((m) => m.distance >= 0.05);

  return (
    <div className="pointer-events-none absolute inset-0 z-[40] overflow-visible">
      <svg
        className="pointer-events-none absolute z-[40] overflow-visible"
        width={vp.w}
        height={vp.h}
        viewBox={`${vp.minX} ${vp.minY} ${vp.w} ${vp.h}`}
        style={{
          left: vp.minX,
          top: vp.minY,
          width: vp.w,
          height: vp.h,
          overflow: 'visible',
        }}
        aria-hidden
      >
        {drawLines
          ? visibleMeasures.map((m) => {
              const key = `${m.side}-${formatPx(m.distance)}-${Math.round(m.mx)}-${Math.round(m.my)}`;
              const isOffset = m.kind === 'offset';
              const arrowPaths = isOffset
                ? null
                : measureArrowScenePath(m.x1, m.y1, m.x2, m.y2, arrow, stroke);
              return (
                <g key={key}>
                  {(m.dashes || []).map((d, di) => (
                    <line
                      key={`dash-${di}`}
                      x1={d.x1}
                      y1={d.y1}
                      x2={d.x2}
                      y2={d.y2}
                      stroke={color}
                      strokeWidth={stroke}
                      strokeDasharray={dashArr}
                    />
                  ))}
                  {isOffset ? (
                    <line
                      x1={m.x1}
                      y1={m.y1}
                      x2={m.x2}
                      y2={m.y2}
                      stroke={color}
                      strokeWidth={stroke}
                      strokeDasharray={dashArr}
                    />
                  ) : arrowPaths ? (
                    <>
                      <path
                        d={arrowPaths.shaft}
                        fill="none"
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="butt"
                      />
                      <path
                        d={arrowPaths.headA}
                        fill="none"
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={arrowPaths.headB}
                        fill="none"
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  ) : null}
                </g>
              );
            })
          : null}

        {visibleMeasures.map((m) => {
          let labelX = m.mx;
          const horizontal = m.side === 'left' || m.side === 'right';
          if (
            showSizeBadge &&
            (m.side === 'top' || m.side === 'bottom') &&
            Math.abs(m.mx - cx) < 12 &&
            m.distance < 28
          ) {
            labelX = cx + Math.min(48, Math.max(24, box.width * 0.28));
            if (labelX > right - 8) labelX = cx - Math.min(48, Math.max(24, box.width * 0.28));
          }
          // Fig.2: sit beside the shaft (below H / right of V).
          return (
            <SpacingBadgeSvg
              key={`lbl-${m.side}-${formatPx(m.distance)}-${Math.round(m.mx)}-${Math.round(m.my)}`}
              text={formatPx(m.distance)}
              x={labelX}
              y={m.my}
              anchor={horizontal ? 'below' : 'right'}
              fill={color}
              inv={inv}
              clearance={labelClearance}
            />
          );
        })}

        {showSizeBadge ? (
          <SpacingBadgeSvg
            text={`${formatPx(box.width)} × ${formatPx(box.height)}`}
            x={sizePlacement.x}
            y={sizePlacement.y}
            anchor={sizePlacement.mode}
            fill={sizeBadgeColor}
            inv={inv}
            clearance={badgeGap}
          />
        ) : null}
      </svg>
    </div>
  );
}

export default memo(SpacingInspectOverlay);
