import type { ArtboardFrame } from '@/components/rcb/frames/types';
import {
  deflateSelectionBox,
  inflateBoxByTextSelectionPad,
  strokeBandGuideBoxes,
  type StrokeBandFace,
} from '@/components/rcb/scene/document/sceneEffects';
import { isNodeHidden } from '@/components/rcb/scene/document/sceneDocument';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import { applyAspectToHandle } from './resizeGeometry';

/**
 * Align / snap guides.
 * Stroke-band faces are tagged (outer / path / inner) and only snap to the same
 * face — cross-face snaps leave a visible ink gap (~stroke width at 800%).
 * Threshold is ~8 screen px / zoom.
 */

export type SceneBox = { left: number; top: number; width: number; height: number };

/** Scene box plus optional stroke-band face tag for same-face snapping. */
export type FacedSceneBox = SceneBox & { face?: StrokeBandFace | 'any' };

export type AlignGuide = {
  orient: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
  marks: number[];
  /** Equal-spacing gap indicator. */
  kind?: 'align' | 'gap' | 'size';
  /** Mid↔mid snap — draw × at marks (MasterGo center guides). */
  center?: boolean;
};

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** ~8 screen pixels, converted to scene units. */
export function getSnapThreshold(zoom: number) {
  return 8 / Math.max(0.05, zoom || 1);
}

/** Scene-unit grid step. Override via document.gridSize. */
export const DEFAULT_GRID_SIZE = 10;

export function getDocumentGridSize(doc: unknown): number {
  const n = Number((doc as { gridSize?: unknown } | null)?.gridSize);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRID_SIZE;
}

export function snapCoordToGrid(value: number, gridSize: number): number {
  if (!(gridSize > 0) || !Number.isFinite(value)) return value;
  return Math.round(value / gridSize) * gridSize;
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
    // Re-clamp mins after aspect (same anchors as independent snap).
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

export function guideEdges(box: SceneBox) {
  const midX = box.left + box.width / 2;
  const midY = box.top + box.height / 2;
  return {
    left: box.left,
    right: box.left + box.width,
    top: box.top,
    bottom: box.top + box.height,
    midX,
    midY,
  };
}

/** Outer / path / inner only match themselves; untagged / `any` match all. */
function facesCompatible(
  a: StrokeBandFace | 'any' | undefined,
  b: StrokeBandFace | 'any' | undefined
) {
  if (!a || !b || a === 'any' || b === 'any') return true;
  return a === b;
}

type GuideCandidate = {
  pos: number;
  face: StrokeBandFace | 'any';
  /** Perpendicular mark for snap-line endpoints (midY for X, midX for Y). */
  mark: number;
  /** True when this candidate is a box midline (midX / midY). */
  isMid?: boolean;
  /** Box extent on the perpendicular axis (left–right for Y, top–bottom for X). */
  span0: number;
  span1: number;
};

function uniqNums(values: number[]) {
  const out: number[] = [];
  values.forEach((v) => {
    if (out.some((u) => Math.abs(u - v) < 0.5)) return;
    out.push(v);
  });
  return out;
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
}

/** Gap between two 1D ranges (0 when they overlap). Used as a locality tie-break. */
function spanGap(a0: number, a1: number, b0: number, b1: number) {
  if (rangesOverlap(a0, a1, b0, b1)) return 0;
  if (a1 <= b0) return b0 - a1;
  return a0 - b1;
}

/**
 * Scene pad for neighbor collection (~24× snap threshold ≈ 192 screen px).
 * Keeps snaps local (nearby / same artboard) instead of scanning the whole canvas.
 */
export function getSnapNeighborPad(snapThreshold: number) {
  return Math.max(snapThreshold * 24, 64);
}

type Gap = {
  orient: 'h' | 'v';
  /** Distance between the two faces. */
  size: number;
  /** Start of the empty gap (left or top). */
  start: number;
  /** End of the empty gap (right or bottom). */
  end: number;
  /** Overlap span on the perpendicular axis. */
  breadth0: number;
  breadth1: number;
};

/** Collect gaps between non-overlapping neighbor boxes. */
function collectGaps(boxes: SceneBox[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = guideEdges(boxes[i]);
      const b = guideEdges(boxes[j]);
      if (rangesOverlap(a.top, a.bottom, b.top, b.bottom)) {
        if (a.right <= b.left) {
          gaps.push({
            orient: 'h',
            size: b.left - a.right,
            start: a.right,
            end: b.left,
            breadth0: Math.max(a.top, b.top),
            breadth1: Math.min(a.bottom, b.bottom),
          });
        } else if (b.right <= a.left) {
          gaps.push({
            orient: 'h',
            size: a.left - b.right,
            start: b.right,
            end: a.left,
            breadth0: Math.max(a.top, b.top),
            breadth1: Math.min(a.bottom, b.bottom),
          });
        }
      }
      if (rangesOverlap(a.left, a.right, b.left, b.right)) {
        if (a.bottom <= b.top) {
          gaps.push({
            orient: 'v',
            size: b.top - a.bottom,
            start: a.bottom,
            end: b.top,
            breadth0: Math.max(a.left, b.left),
            breadth1: Math.min(a.right, b.right),
          });
        } else if (b.bottom <= a.top) {
          gaps.push({
            orient: 'v',
            size: a.top - b.bottom,
            start: b.bottom,
            end: a.top,
            breadth0: Math.max(a.left, b.left),
            breadth1: Math.min(a.right, b.right),
          });
        }
      }
    }
  }
  return gaps.filter((g) => g.size > 0.5);
}

function collectGuideCandidates(others: FacedSceneBox[], containers: FacedSceneBox[]) {
  const candidatesX: GuideCandidate[] = [];
  const candidatesY: GuideCandidate[] = [];
  const absorbBox = (b: FacedSceneBox, asFrame = false) => {
    const e = guideEdges(b);
    const face = asFrame ? 'any' : b.face || 'any';
    // Edge faces keep their tag; midlines match any source face.
    candidatesX.push(
      { pos: e.left, face, mark: e.midY, isMid: false, span0: e.top, span1: e.bottom },
      { pos: e.midX, face: 'any', mark: e.midY, isMid: true, span0: e.top, span1: e.bottom },
      { pos: e.right, face, mark: e.midY, isMid: false, span0: e.top, span1: e.bottom }
    );
    candidatesY.push(
      { pos: e.top, face, mark: e.midX, isMid: false, span0: e.left, span1: e.right },
      { pos: e.midY, face: 'any', mark: e.midX, isMid: true, span0: e.left, span1: e.right },
      { pos: e.bottom, face, mark: e.midX, isMid: false, span0: e.left, span1: e.right }
    );
  };
  containers.forEach((b) => absorbBox(b, true));
  others.forEach((b) => absorbBox(b, false));
  return { candidatesX, candidatesY };
}

/** Round to avoid float jitter when comparing snap distances. */
function roundSnap(n: number) {
  return Math.round(n * 1e8) / 1e8;
}

type SnapPair = {
  thisPoint: { x: number; y: number };
  otherPoint: { x: number; y: number };
  nudge: number;
  /** Mid↔mid — center align (draw × at marks). */
  center?: boolean;
  /** Source stroke-band face (prefer outer for display). */
  face?: StrokeBandFace | 'any';
  /** Perpendicular span of the moving box on the align line. */
  thisSpan?: [number, number];
  /** Perpendicular span of the target box on the align line. */
  otherSpan?: [number, number];
};

/** Collapse stroke-band / equal-height duplicate snaps to one MasterGo-style guide per axis. */
function selectDisplaySnaps(pairs: SnapPair[], axis: 'x' | 'y'): SnapPair[] {
  if (!pairs.length) return pairs;
  const getPos = (p: SnapPair) => (axis === 'x' ? p.otherPoint.x : p.otherPoint.y);

  // Prefer edge over center when both win (equal height → top+mid+bottom all d=0).
  const hasEdge = pairs.some((p) => !p.center);
  let preferred = hasEdge ? pairs.filter((p) => !p.center) : pairs;
  if (!preferred.length) preferred = pairs;

  // Prefer outer / any faces so path/inner don't draw a second parallel line.
  const outerish = preferred.filter(
    (p) => !p.face || p.face === 'outer' || p.face === 'any'
  );
  if (outerish.length) preferred = outerish;

  // Cluster near-duplicate positions (outer vs path tops differ by ~stroke/2).
  const CLUSTER = 6;
  type Cluster = { pos: number; pairs: SnapPair[] };
  const clusters: Cluster[] = [];
  for (const p of preferred) {
    const pos = getPos(p);
    const hit = clusters.find((c) => Math.abs(c.pos - pos) <= CLUSTER);
    if (hit) {
      hit.pairs.push(p);
      continue;
    }
    clusters.push({ pos, pairs: [p] });
  }
  if (clusters.length <= 1) return preferred;

  // One primary cluster: most pairs wins; tie → first (top/left appear first).
  clusters.sort((a, b) => b.pairs.length - a.pairs.length);
  return clusters[0].pairs;
}

/**
 * Winning snap pairs → align guides.
 * Edge: one continuous line spanning box extents, × at corners (MasterGo top-edge style).
 * Center: line between centers, × at mids. Coincident nested center still emits × only.
 */
function guidesFromSnapPairs(pairsX: SnapPair[], pairsY: SnapPair[]): AlignGuide[] {
  const xPairs = selectDisplaySnaps(pairsX, 'x');
  const yPairs = selectDisplaySnaps(pairsY, 'y');

  type Group = {
    marks: number[];
    spans: number[];
    center: boolean;
  };
  const groupsX = new Map<number, Group>();
  for (const p of xPairs) {
    const x = roundSnap(p.otherPoint.x);
    const g = groupsX.get(x) || { marks: [], spans: [], center: false };
    if (p.center) {
      g.center = true;
      g.marks.push(p.thisPoint.y, p.otherPoint.y);
    } else {
      if (p.thisSpan) g.spans.push(p.thisSpan[0], p.thisSpan[1]);
      if (p.otherSpan) g.spans.push(p.otherSpan[0], p.otherSpan[1]);
      // Fallback if spans missing: mid marks.
      if (!p.thisSpan && !p.otherSpan) g.marks.push(p.thisPoint.y, p.otherPoint.y);
    }
    groupsX.set(x, g);
  }
  const groupsY = new Map<number, Group>();
  for (const p of yPairs) {
    const y = roundSnap(p.otherPoint.y);
    const g = groupsY.get(y) || { marks: [], spans: [], center: false };
    if (p.center) {
      g.center = true;
      g.marks.push(p.thisPoint.x, p.otherPoint.x);
    } else {
      if (p.thisSpan) g.spans.push(p.thisSpan[0], p.thisSpan[1]);
      if (p.otherSpan) g.spans.push(p.otherSpan[0], p.otherSpan[1]);
      if (!p.thisSpan && !p.otherSpan) g.marks.push(p.thisPoint.x, p.otherPoint.x);
    }
    groupsY.set(y, g);
  }

  const guides: AlignGuide[] = [];
  const pushGroup = (orient: 'v' | 'h', pos: number, g: Group) => {
    if (g.center) {
      const uniq = uniqNums(g.marks);
      if (!uniq.length) return;
      const from = Math.min(...uniq);
      const to = Math.max(...uniq);
      if (uniq.length < 2 && to - from < 1) {
        // Coincident centers — × only.
        guides.push({
          orient,
          pos,
          from,
          to,
          marks: uniq,
          kind: 'align',
          center: true,
        });
        return;
      }
      if (to - from < 1 && uniq.length < 2) return;
      guides.push({
        orient,
        pos,
        from,
        to,
        marks: uniq,
        kind: 'align',
        center: true,
      });
      return;
    }
    // Edge: span full AABB of participants; × at every corner on the line.
    const corners = uniqNums(g.spans.length ? g.spans : g.marks);
    if (corners.length < 2) return;
    const from = Math.min(...corners);
    const to = Math.max(...corners);
    if (to - from < 1) return;
    guides.push({
      orient,
      pos,
      from,
      to,
      marks: corners,
      kind: 'align',
      center: false,
    });
  };

  groupsX.forEach((g, pos) => pushGroup('v', pos, g));
  groupsY.forEach((g, pos) => pushGroup('h', pos, g));
  return guides;
}

/**
 * Try gap snaps: center in a gap, or duplicate an adjacent gap.
 * Returns nudge dx/dy if better than current bests.
 */
function bestGapNudge(
  moving: SceneBox,
  others: SceneBox[],
  containers: SceneBox[],
  threshold: number
): { dx: number; dy: number; bestX: number; bestY: number; gapGuides: AlignGuide[] } {
  const targets = [...others, ...containers];
  const gaps = collectGaps(targets);
  const m = guideEdges(moving);
  let dx = 0;
  let dy = 0;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  const gapGuides: AlignGuide[] = [];

  const tryX = (nudge: number, guide?: AlignGuide) => {
    const ad = Math.abs(nudge);
    if (ad <= threshold && ad < bestX) {
      bestX = ad;
      dx = nudge;
      if (guide) {
        gapGuides.length = 0;
        gapGuides.push(guide);
      }
    }
  };
  const tryY = (nudge: number, guide?: AlignGuide) => {
    const ad = Math.abs(nudge);
    if (ad <= threshold && ad < bestY) {
      bestY = ad;
      dy = nudge;
      if (guide) {
        gapGuides.length = 0;
        gapGuides.push(guide);
      }
    }
  };

  // Center selection inside a gap larger than itself.
  for (const g of gaps) {
    if (g.orient === 'h' && g.size >= moving.width) {
      const center = (g.start + g.end) / 2;
      const nudge = center - m.midX;
      tryX(nudge, {
        orient: 'h',
        pos: (m.top + m.bottom) / 2,
        from: g.start,
        to: g.end,
        marks: [g.start, g.end],
        kind: 'gap',
      });
    }
    if (g.orient === 'v' && g.size >= moving.height) {
      const center = (g.start + g.end) / 2;
      const nudge = center - m.midY;
      tryY(nudge, {
        orient: 'v',
        pos: (m.left + m.right) / 2,
        from: g.start,
        to: g.end,
        marks: [g.start, g.end],
        kind: 'gap',
      });
    }
  }

  // Duplicate an existing gap on the opposite side of a neighbor.
  for (const t of targets) {
    const e = guideEdges(t);
    for (const g of gaps) {
      if (g.orient === 'h' && g.size > 0.5) {
        // Place to the right of t with same gap
        if (rangesOverlap(m.top, m.bottom, e.top, e.bottom)) {
          tryX(e.right + g.size - m.left, {
            orient: 'h',
            pos: (Math.max(m.top, e.top) + Math.min(m.bottom, e.bottom)) / 2,
            from: e.right,
            to: e.right + g.size,
            marks: [e.right, e.right + g.size],
            kind: 'gap',
          });
          tryX(e.left - g.size - m.right, {
            orient: 'h',
            pos: (Math.max(m.top, e.top) + Math.min(m.bottom, e.bottom)) / 2,
            from: e.left - g.size,
            to: e.left,
            marks: [e.left - g.size, e.left],
            kind: 'gap',
          });
        }
      }
      if (g.orient === 'v' && g.size > 0.5) {
        if (rangesOverlap(m.left, m.right, e.left, e.right)) {
          tryY(e.bottom + g.size - m.top, {
            orient: 'v',
            pos: (Math.max(m.left, e.left) + Math.min(m.right, e.right)) / 2,
            from: e.bottom,
            to: e.bottom + g.size,
            marks: [e.bottom, e.bottom + g.size],
            kind: 'gap',
          });
          tryY(e.top - g.size - m.bottom, {
            orient: 'v',
            pos: (Math.max(m.left, e.left) + Math.min(m.right, e.right)) / 2,
            from: e.top - g.size,
            to: e.top,
            marks: [e.top - g.size, e.top],
            kind: 'gap',
          });
        }
      }
    }
  }

  return { dx, dy, bestX, bestY, gapGuides };
}

/**
 * Snap a moving chrome-box to edges / centers / gaps of siblings and frames.
 * Optional `edgeBoxes` are stroke-band faces; each only snaps to the same face
 * (outer→outer, path→path) so cross-face snaps cannot leave an ink gap.
 */
export function snapBoxToGuides(
  moving: SceneBox,
  others: FacedSceneBox[],
  containers: FacedSceneBox[] = [],
  threshold = 5,
  opts?: { edgeBoxes?: FacedSceneBox[] }
): { box: SceneBox; guides: AlignGuide[] } {
  const edgeBoxes: FacedSceneBox[] = opts?.edgeBoxes?.length
    ? opts.edgeBoxes
    : [{ ...moving, face: 'outer' }];
  const { candidatesX, candidatesY } = collectGuideCandidates(others, containers);

  let dx = 0;
  let dy = 0;
  let bestX = threshold;
  let bestY = threshold;
  /** Secondary score: prefer overlapping / nearby targets over distant ones. */
  let bestCrossX = Number.POSITIVE_INFINITY;
  let bestCrossY = Number.POSITIVE_INFINITY;
  let snapsX: SnapPair[] = [];
  let snapsY: SnapPair[] = [];
  let useGapX = false;
  let useGapY = false;

  // Keep ties at the nearest snap distance; among ties prefer smaller cross-axis gap
  // so a local artboard center beats a distant sibling with the same mid line.
  const tryX = (
    sourceX: number,
    sourceY: number,
    sourceFace: StrokeBandFace | 'any' | undefined,
    sourceIsMid: boolean,
    sourceSpan: [number, number],
    target: GuideCandidate
  ) => {
    if (!facesCompatible(sourceFace, target.face)) return;
    const d = target.pos - sourceX;
    const ad = Math.abs(d);
    const cross = spanGap(sourceSpan[0], sourceSpan[1], target.span0, target.span1);
    const rad = roundSnap(ad);
    const rBest = roundSnap(bestX);
    if (rad > rBest) return;
    if (rad < rBest) {
      snapsX = [];
      bestX = ad;
      bestCrossX = cross;
    } else if (roundSnap(cross) > roundSnap(bestCrossX)) {
      return;
    } else if (roundSnap(cross) < roundSnap(bestCrossX)) {
      snapsX = [];
      bestCrossX = cross;
    }
    dx = d;
    snapsX.push({
      thisPoint: { x: sourceX, y: sourceY },
      otherPoint: { x: target.pos, y: target.mark },
      nudge: d,
      center: sourceIsMid && !!target.isMid,
      face: sourceFace,
      thisSpan: sourceSpan,
      otherSpan: [target.span0, target.span1],
    });
  };
  const tryY = (
    sourceY: number,
    sourceX: number,
    sourceFace: StrokeBandFace | 'any' | undefined,
    sourceIsMid: boolean,
    sourceSpan: [number, number],
    target: GuideCandidate
  ) => {
    if (!facesCompatible(sourceFace, target.face)) return;
    const d = target.pos - sourceY;
    const ad = Math.abs(d);
    const cross = spanGap(sourceSpan[0], sourceSpan[1], target.span0, target.span1);
    const rad = roundSnap(ad);
    const rBest = roundSnap(bestY);
    if (rad > rBest) return;
    if (rad < rBest) {
      snapsY = [];
      bestY = ad;
      bestCrossY = cross;
    } else if (roundSnap(cross) > roundSnap(bestCrossY)) {
      return;
    } else if (roundSnap(cross) < roundSnap(bestCrossY)) {
      snapsY = [];
      bestCrossY = cross;
    }
    dy = d;
    snapsY.push({
      thisPoint: { x: sourceX, y: sourceY },
      otherPoint: { x: target.mark, y: target.pos },
      nudge: d,
      center: sourceIsMid && !!target.isMid,
      face: sourceFace,
      thisSpan: sourceSpan,
      otherSpan: [target.span0, target.span1],
    });
  };

  candidatesX.forEach((t) => {
    edgeBoxes.forEach((b) => {
      const e = guideEdges(b);
      const face = b.face || 'outer';
      const spanY: [number, number] = [e.top, e.bottom];
      tryX(e.left, e.midY, face, false, spanY, t);
      tryX(e.midX, e.midY, 'any', true, spanY, t);
      tryX(e.right, e.midY, face, false, spanY, t);
    });
  });
  candidatesY.forEach((t) => {
    edgeBoxes.forEach((b) => {
      const e = guideEdges(b);
      const face = b.face || 'outer';
      const spanX: [number, number] = [e.left, e.right];
      tryY(e.top, e.midX, face, false, spanX, t);
      tryY(e.midY, e.midX, 'any', true, spanX, t);
      tryY(e.bottom, e.midX, face, false, spanX, t);
    });
  });

  // No point snap accepted → best still equals threshold with empty snaps.
  if (!snapsX.length) {
    bestX = threshold + 1;
    dx = 0;
  }
  if (!snapsY.length) {
    bestY = threshold + 1;
    dy = 0;
  }

  const gap = bestGapNudge(moving, others, containers, threshold);
  // Gap competes with point snaps on the same axis.
  if (roundSnap(gap.bestX) < roundSnap(bestX)) {
    bestX = gap.bestX;
    dx = gap.dx;
    snapsX = [];
    useGapX = true;
  }
  if (roundSnap(gap.bestY) < roundSnap(bestY)) {
    bestY = gap.bestY;
    dy = gap.dy;
    snapsY = [];
    useGapY = true;
  }

  const box = { ...moving, left: moving.left + dx, top: moving.top + dy };

  // After nudge, shift mover points + spans (2nd pass — exact indicators only).
  const nudgedX = snapsX.map((p) => ({
    ...p,
    thisPoint: { x: p.thisPoint.x + dx, y: p.thisPoint.y + dy },
    thisSpan: p.thisSpan
      ? ([p.thisSpan[0] + dy, p.thisSpan[1] + dy] as [number, number])
      : undefined,
  }));
  const nudgedY = snapsY.map((p) => ({
    ...p,
    thisPoint: { x: p.thisPoint.x + dx, y: p.thisPoint.y + dy },
    thisSpan: p.thisSpan
      ? ([p.thisSpan[0] + dx, p.thisSpan[1] + dx] as [number, number])
      : undefined,
  }));

  const gapGuides: AlignGuide[] = [];
  if (useGapX || useGapY) {
    const gapAfter = bestGapNudge(box, others, containers, 0.05);
    if (useGapX) {
      gapGuides.push(...gapAfter.gapGuides.filter((g) => g.orient === 'h'));
    }
    if (useGapY) {
      gapGuides.push(...gapAfter.gapGuides.filter((g) => g.orient === 'v'));
    }
  }

  const guides = [...guidesFromSnapPairs(nudgedX, nudgedY), ...gapGuides];
  return { box, guides };
}

/**
 * Snap a resized chrome-box by adjusting only the edges moved by `handle`.
 * Stroke-band faces only pull same-face targets (see snapBoxToGuides).
 * Also snaps width/height to matching sibling sizes (equal-size guides).
 */
export function snapResizeToGuides(
  resized: SceneBox,
  handle: ResizeHandle,
  others: FacedSceneBox[],
  containers: FacedSceneBox[] = [],
  threshold = 5,
  min = 8,
  opts?: {
    edgeBoxes?: FacedSceneBox[];
    lockAspect?: boolean;
    aspectRatio?: number;
  }
): { box: SceneBox; guides: AlignGuide[] } {
  const { candidatesX, candidatesY } = collectGuideCandidates(others, containers);
  const edgeBoxes: FacedSceneBox[] = opts?.edgeBoxes?.length
    ? opts.edgeBoxes
    : [{ ...resized, face: 'outer' }];
  const moveL = handle === 'w' || handle === 'nw' || handle === 'sw';
  const moveR = handle === 'e' || handle === 'ne' || handle === 'se';
  const moveT = handle === 'n' || handle === 'nw' || handle === 'ne';
  const moveB = handle === 's' || handle === 'sw' || handle === 'se';

  let left = resized.left;
  let top = resized.top;
  let width = resized.width;
  let height = resized.height;
  const right0 = left + width;
  const bottom0 = top + height;

  const bestEdgeSnap = (
    sources: Array<{
      pos: number;
      mark: number;
      face: StrokeBandFace | 'any' | undefined;
      isMid?: boolean;
      span0: number;
      span1: number;
    }>,
    candidates: GuideCandidate[],
    axis: 'x' | 'y'
  ) => {
    let best = threshold + 1;
    let bestCross = Number.POSITIVE_INFINITY;
    let delta = 0;
    const pairs: SnapPair[] = [];
    for (const source of sources) {
      for (const t of candidates) {
        if (!facesCompatible(source.face, t.face)) continue;
        const d = t.pos - source.pos;
        const ad = Math.abs(d);
        const cross = spanGap(source.span0, source.span1, t.span0, t.span1);
        const rad = roundSnap(ad);
        const rBest = roundSnap(best);
        if (rad > rBest) continue;
        if (rad < rBest) {
          pairs.length = 0;
          best = ad;
          bestCross = cross;
          delta = d;
        } else if (roundSnap(cross) > roundSnap(bestCross)) {
          continue;
        } else if (roundSnap(cross) < roundSnap(bestCross)) {
          pairs.length = 0;
          bestCross = cross;
          delta = d;
        }
        const center = !!source.isMid && !!t.isMid;
        const thisSpan: [number, number] = [source.span0, source.span1];
        const otherSpan: [number, number] = [t.span0, t.span1];
        pairs.push(
          axis === 'x'
            ? {
                thisPoint: { x: source.pos, y: source.mark },
                otherPoint: { x: t.pos, y: t.mark },
                nudge: d,
                center,
                face: source.face,
                thisSpan,
                otherSpan,
              }
            : {
                thisPoint: { x: source.mark, y: source.pos },
                otherPoint: { x: t.mark, y: t.pos },
                nudge: d,
                center,
                face: source.face,
                thisSpan,
                otherSpan,
              }
        );
      }
    }
    return { delta, dist: best, pairs };
  };

  let snapsX: SnapPair[] = [];
  let snapsY: SnapPair[] = [];

  if (moveL && !moveR) {
    const edge = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.left,
          mark: e.midY,
          face: b.face || 'outer',
          isMid: false,
          span0: e.top,
          span1: e.bottom,
        };
      }),
      candidatesX,
      'x'
    );
    const mid = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.midX,
          mark: e.midY,
          face: 'any' as const,
          isMid: true,
          span0: e.top,
          span1: e.bottom,
        };
      }),
      candidatesX,
      'x'
    );
    if (mid.dist < edge.dist) {
      left = left + mid.delta * 2;
      width = right0 - left;
      snapsX = mid.pairs;
    } else if (edge.dist <= threshold) {
      left = left + edge.delta;
      width = right0 - left;
      snapsX = edge.pairs;
    }
  } else if (moveR && !moveL) {
    const edge = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.right,
          mark: e.midY,
          face: b.face || 'outer',
          isMid: false,
          span0: e.top,
          span1: e.bottom,
        };
      }),
      candidatesX,
      'x'
    );
    const mid = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.midX,
          mark: e.midY,
          face: 'any' as const,
          isMid: true,
          span0: e.top,
          span1: e.bottom,
        };
      }),
      candidatesX,
      'x'
    );
    if (mid.dist < edge.dist) {
      width = width + mid.delta * 2;
      snapsX = mid.pairs;
    } else if (edge.dist <= threshold) {
      width = width + edge.delta;
      snapsX = edge.pairs;
    }
  }

  if (moveT && !moveB) {
    const edge = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.top,
          mark: e.midX,
          face: b.face || 'outer',
          isMid: false,
          span0: e.left,
          span1: e.right,
        };
      }),
      candidatesY,
      'y'
    );
    const mid = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.midY,
          mark: e.midX,
          face: 'any' as const,
          isMid: true,
          span0: e.left,
          span1: e.right,
        };
      }),
      candidatesY,
      'y'
    );
    if (mid.dist < edge.dist) {
      top = top + mid.delta * 2;
      height = bottom0 - top;
      snapsY = mid.pairs;
    } else if (edge.dist <= threshold) {
      top = top + edge.delta;
      height = bottom0 - top;
      snapsY = edge.pairs;
    }
  } else if (moveB && !moveT) {
    const edge = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.bottom,
          mark: e.midX,
          face: b.face || 'outer',
          isMid: false,
          span0: e.left,
          span1: e.right,
        };
      }),
      candidatesY,
      'y'
    );
    const mid = bestEdgeSnap(
      edgeBoxes.map((b) => {
        const e = guideEdges(b);
        return {
          pos: e.midY,
          mark: e.midX,
          face: 'any' as const,
          isMid: true,
          span0: e.left,
          span1: e.right,
        };
      }),
      candidatesY,
      'y'
    );
    if (mid.dist < edge.dist) {
      height = height + mid.delta * 2;
      snapsY = mid.pairs;
    } else if (edge.dist <= threshold) {
      height = height + edge.delta;
      snapsY = edge.pairs;
    }
  }

  // Equal-size snap: match sibling / frame width or height while dragging a side.
  const sizeTargets = collectSizeTargets(others, containers);
  if ((moveL || moveR) && !(moveL && moveR)) {
    const size = bestSizeSnap(width, sizeTargets.widths, threshold);
    if (size.dist <= threshold) {
      if (moveR) {
        width = size.value;
      } else {
        left = right0 - size.value;
        width = size.value;
      }
    }
  }
  if ((moveT || moveB) && !(moveT && moveB)) {
    const size = bestSizeSnap(height, sizeTargets.heights, threshold);
    if (size.dist <= threshold) {
      if (moveB) {
        height = size.value;
      } else {
        top = bottom0 - size.value;
        height = size.value;
      }
    }
  }

  if (width < min) {
    if (moveL && !moveR) left = right0 - min;
    width = min;
  }
  if (height < min) {
    if (moveT && !moveB) top = bottom0 - min;
    height = min;
  }

  let box: SceneBox = { left, top, width, height };
  if (opts?.lockAspect) {
    const ratio =
      opts.aspectRatio && Number.isFinite(opts.aspectRatio) && opts.aspectRatio > 0
        ? opts.aspectRatio
        : resized.width / Math.max(1, resized.height);
    box = applyAspectToHandle(handle, box.left, box.top, box.width, box.height, ratio);
    // Re-clamp mins after aspect (same anchors as independent snap).
    let right = box.left + box.width;
    let bottom = box.top + box.height;
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
    // Aspect again so min-clamp cannot leave a free-axis stretch.
    box = applyAspectToHandle(handle, left, top, width, height, ratio);
  }

  const dx = box.left - resized.left;
  const dy = box.top - resized.top;
  const finalE = guideEdges(box);
  const nudgedX = snapsX.map((p) => ({
    ...p,
    thisPoint: { x: p.thisPoint.x + dx, y: p.thisPoint.y + dy },
    thisSpan: p.center
      ? p.thisSpan
      : ([finalE.top, finalE.bottom] as [number, number]),
  }));
  const nudgedY = snapsY.map((p) => ({
    ...p,
    thisPoint: { x: p.thisPoint.x + dx, y: p.thisPoint.y + dy },
    thisSpan: p.center
      ? p.thisSpan
      : ([finalE.left, finalE.right] as [number, number]),
  }));
  return {
    box,
    guides: [
      ...guidesFromSnapPairs(nudgedX, nudgedY),
      ...buildSizeGuides(box, [...others, ...containers], {
        width: moveL || moveR,
        height: moveT || moveB,
      }),
    ],
  };
}

/** Unique widths / heights from siblings (prefer outer faces when tagged). */
function collectSizeTargets(others: FacedSceneBox[], containers: FacedSceneBox[]) {
  const widths: number[] = [];
  const heights: number[] = [];
  const absorb = (b: FacedSceneBox) => {
    if (b.face && b.face !== 'outer' && b.face !== 'any') return;
    if (b.width > 1) widths.push(b.width);
    if (b.height > 1) heights.push(b.height);
  };
  others.forEach(absorb);
  containers.forEach(absorb);
  return { widths: uniqNums(widths), heights: uniqNums(heights) };
}

function bestSizeSnap(current: number, targets: number[], threshold: number) {
  let best = threshold + 1;
  let value = current;
  for (const t of targets) {
    const ad = Math.abs(t - current);
    if (ad <= threshold && ad < best) {
      best = ad;
      value = t;
    }
  }
  return { value, dist: best };
}

/** Dimension bars on the resizing box + any sibling with matching w/h. */
function buildSizeGuides(
  box: SceneBox,
  others: SceneBox[],
  opts: { width: boolean; height: boolean }
): AlignGuide[] {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.75;
  const guides: AlignGuide[] = [];
  if (opts.width && box.width > 1) {
    const matches = others.filter((o) => o.width > 1 && near(o.width, box.width));
    if (matches.length) {
      for (const m of [box, ...matches]) {
        const midY = m.top + m.height / 2;
        guides.push({
          orient: 'h',
          pos: midY,
          from: m.left,
          to: m.left + m.width,
          marks: [m.left, m.left + m.width],
          kind: 'size',
        });
      }
    }
  }
  if (opts.height && box.height > 1) {
    const matches = others.filter((o) => o.height > 1 && near(o.height, box.height));
    if (matches.length) {
      for (const m of [box, ...matches]) {
        const midX = m.left + m.width / 2;
        guides.push({
          orient: 'v',
          pos: midX,
          from: m.top,
          to: m.top + m.height,
          marks: [m.top, m.top + m.height],
          kind: 'size',
        });
      }
    }
  }
  const seen = new Set<string>();
  return guides.filter((g) => {
    const k = `size:${g.orient}:${g.pos.toFixed(1)}:${g.from.toFixed(1)}:${g.to.toFixed(1)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Scene boxes for artboard frames (path bounds). */
export function frameGuideBoxes(document: { frames?: ArtboardFrame[] } | null | undefined): SceneBox[] {
  const frames = Array.isArray(document?.frames) ? document.frames : [];
  return frames
    .filter((f) => f && Number(f.width) > 0 && Number(f.height) > 0)
    .map((f) => ({
      left: Number(f.x) || 0,
      top: Number(f.y) || 0,
      width: Math.max(1, Number(f.width) || 1),
      height: Math.max(1, Number(f.height) || 1),
    }));
}

type FrameGuideEntry = SceneBox & { id: string };

/** Artboard frames with ids (for containing-frame snap scoping). */
export function frameGuideEntries(
  document: { frames?: ArtboardFrame[] } | null | undefined
): FrameGuideEntry[] {
  const frames = Array.isArray(document?.frames) ? document.frames : [];
  return frames
    .filter((f) => f?.id && Number(f.width) > 0 && Number(f.height) > 0)
    .map((f) => ({
      id: String(f.id),
      left: Number(f.x) || 0,
      top: Number(f.y) || 0,
      width: Math.max(1, Number(f.width) || 1),
      height: Math.max(1, Number(f.height) || 1),
    }));
}

/** Frames whose bounds contain the box center (same-artboard snap scope). */
export function framesContainingBox(
  document: { frames?: ArtboardFrame[] } | null | undefined,
  box: SceneBox
): FrameGuideEntry[] {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return frameGuideEntries(document).filter(
    (f) =>
      cx >= f.left &&
      cx <= f.left + f.width &&
      cy >= f.top &&
      cy <= f.top + f.height
  );
}

function pushNodeGuideBoxes(
  document: any,
  id: string,
  exclude: Set<string>,
  out: FacedSceneBox[]
) {
  if (id === 'ROOT' || exclude.has(id)) return;
  const node = document?.deltaSetLike?.[id];
  if (!node || typeof node !== 'object') return;
  // Hidden layers stay out of snap / spacing — measuring to them looks like
  // phantom guides into empty canvas.
  if (isNodeHidden(node)) return;
  const w = Number(node.width);
  const h = Number(node.height);
  if (!(w > 0) || !(h > 0)) return;
  const { left, top } = nodeLeftTop(document, node);
  const geom = inflateBoxByTextSelectionPad(
    {
      left,
      top,
      width: Math.max(1, w),
      height: Math.max(1, h),
    },
    node
  );
  out.push(...strokeBandGuideBoxes(geom, node));
}

/**
 * Stroke-band face boxes for scene nodes (snap / guide targets).
 * Outside → path + outer; center → inner + path + outer; inside → inner + outer.
 * Faces are tagged so snap only pairs like with like.
 */
export function nodeGuideBoxes(
  document: any,
  opts?: { excludeIds?: string[] }
): FacedSceneBox[] {
  const exclude = new Set(opts?.excludeIds || []);
  const delta = document?.deltaSetLike;
  if (!delta || typeof delta !== 'object') return [];
  const out: FacedSceneBox[] = [];
  for (const id of Object.keys(delta)) {
    pushNodeGuideBoxes(document, id, exclude, out);
  }
  return out;
}

/**
 * Same as {@link nodeGuideBoxes}, but only for candidate ids (spatial prefilter).
 */
export function nodeGuideBoxesForIds(
  document: any,
  ids: string[],
  opts?: { excludeIds?: string[] }
): FacedSceneBox[] {
  const exclude = new Set(opts?.excludeIds || []);
  const out: FacedSceneBox[] = [];
  for (const id of ids) {
    pushNodeGuideBoxes(document, String(id), exclude, out);
  }
  return out;
}

/** Chrome (inflated) box → stroke-band faces used while dragging that selection. */
export function chromeBandGuideBoxes(chrome: SceneBox, node: any): FacedSceneBox[] {
  if (!node) return [{ ...chrome, face: 'outer' }];
  return strokeBandGuideBoxes(deflateSelectionBox(chrome, node), node);
}
