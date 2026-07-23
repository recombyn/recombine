import type { ArtboardFrame } from '@/components/rcb/frames/types';
import {
  deflateSelectionBox,
  inflateBoxByTextSelectionPad,
  strokeBandGuideBoxes,
  type StrokeBandFace,
} from '@/components/rcb/scene/sceneEffects';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';

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
};

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** ~8 screen pixels, converted to scene units. */
export function getSnapThreshold(zoom: number) {
  return 8 / Math.max(0.05, zoom || 1);
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

type GuideCandidate = { pos: number; face: StrokeBandFace | 'any' };

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
      { pos: e.left, face },
      { pos: e.midX, face: 'any' },
      { pos: e.right, face }
    );
    candidatesY.push(
      { pos: e.top, face },
      { pos: e.midY, face: 'any' },
      { pos: e.bottom, face }
    );
  };
  containers.forEach((b) => absorbBox(b, true));
  others.forEach((b) => absorbBox(b, false));
  return { candidatesX, candidatesY };
}

function buildAlignGuides(
  box: SceneBox,
  others: SceneBox[],
  containers: SceneBox[],
  candidatesX: GuideCandidate[],
  candidatesY: GuideCandidate[],
  movingExtras: SceneBox[] = []
): AlignGuide[] {
  const movers = [box, ...movingExtras];
  const allBoxes = [...movers, ...others, ...containers];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const isMover = (b: SceneBox) => movers.some((m) => m === b);
  const guides: AlignGuide[] = [];

  const pushV = (t: number) => {
    const hit = allBoxes.filter((b) => {
      const e = guideEdges(b);
      return near(e.left, t) || near(e.midX, t) || near(e.right, t);
    });
    if (hit.length < 2 || !hit.some(isMover)) return;
    let from = Infinity;
    let to = -Infinity;
    const marks: number[] = [];
    hit.forEach((b) => {
      const e = guideEdges(b);
      from = Math.min(from, e.top);
      to = Math.max(to, e.bottom);
      marks.push(e.top, e.bottom);
      if (near(e.midX, t)) marks.push(e.midY);
    });
    if (!Number.isFinite(from) || to - from < 1) return;
    guides.push({ orient: 'v', pos: t, from, to, marks: uniqNums(marks), kind: 'align' });
  };

  const pushH = (t: number) => {
    const hit = allBoxes.filter((b) => {
      const e = guideEdges(b);
      return near(e.top, t) || near(e.midY, t) || near(e.bottom, t);
    });
    if (hit.length < 2 || !hit.some(isMover)) return;
    let from = Infinity;
    let to = -Infinity;
    const marks: number[] = [];
    hit.forEach((b) => {
      const e = guideEdges(b);
      from = Math.min(from, e.left);
      to = Math.max(to, e.right);
      marks.push(e.left, e.right);
      if (near(e.midY, t)) marks.push(e.midX);
    });
    if (!Number.isFinite(from) || to - from < 1) return;
    guides.push({ orient: 'h', pos: t, from, to, marks: uniqNums(marks), kind: 'align' });
  };

  const anyMoverNearX = (t: number) =>
    movers.some((b) => {
      const e = guideEdges(b);
      return near(e.left, t) || near(e.midX, t) || near(e.right, t);
    });
  const anyMoverNearY = (t: number) =>
    movers.some((b) => {
      const e = guideEdges(b);
      return near(e.top, t) || near(e.midY, t) || near(e.bottom, t);
    });

  candidatesX.forEach((c) => {
    if (anyMoverNearX(c.pos)) pushV(c.pos);
  });
  candidatesY.forEach((c) => {
    if (anyMoverNearY(c.pos)) pushH(c.pos);
  });

  const seen = new Set<string>();
  return guides.filter((g) => {
    const k = `${g.kind || 'align'}:${g.orient}:${g.pos.toFixed(2)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
  let bestX = threshold + 1;
  let bestY = threshold + 1;

  const tryX = (source: number, sourceFace: StrokeBandFace | 'any' | undefined, target: GuideCandidate) => {
    if (!facesCompatible(sourceFace, target.face)) return;
    const d = target.pos - source;
    const ad = Math.abs(d);
    if (ad <= threshold && ad < bestX) {
      bestX = ad;
      dx = d;
    }
  };
  const tryY = (source: number, sourceFace: StrokeBandFace | 'any' | undefined, target: GuideCandidate) => {
    if (!facesCompatible(sourceFace, target.face)) return;
    const d = target.pos - source;
    const ad = Math.abs(d);
    if (ad <= threshold && ad < bestY) {
      bestY = ad;
      dy = d;
    }
  };

  candidatesX.forEach((t) => {
    edgeBoxes.forEach((b) => {
      const e = guideEdges(b);
      const face = b.face || 'outer';
      tryX(e.left, face, t);
      tryX(e.midX, 'any', t);
      tryX(e.right, face, t);
    });
  });
  candidatesY.forEach((t) => {
    edgeBoxes.forEach((b) => {
      const e = guideEdges(b);
      const face = b.face || 'outer';
      tryY(e.top, face, t);
      tryY(e.midY, 'any', t);
      tryY(e.bottom, face, t);
    });
  });

  const gap = bestGapNudge(moving, others, containers, threshold);
  if (gap.bestX < bestX) {
    bestX = gap.bestX;
    dx = gap.dx;
  }
  if (gap.bestY < bestY) {
    bestY = gap.bestY;
    dy = gap.dy;
  }

  const box = { ...moving, left: moving.left + dx, top: moving.top + dy };
  const movedEdges = edgeBoxes.map((b) => ({
    ...b,
    left: b.left + dx,
    top: b.top + dy,
  }));
  const alignGuides = buildAlignGuides(
    box,
    others,
    containers,
    candidatesX,
    candidatesY,
    movedEdges
  );
  const gapAfter = bestGapNudge(box, others, containers, 0.05);
  const guides = [...alignGuides, ...gapAfter.gapGuides];
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
  opts?: { edgeBoxes?: FacedSceneBox[] }
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
    sources: Array<{ pos: number; face: StrokeBandFace | 'any' | undefined }>,
    candidates: GuideCandidate[]
  ) => {
    let best = threshold + 1;
    let delta = 0;
    for (const source of sources) {
      for (const t of candidates) {
        if (!facesCompatible(source.face, t.face)) continue;
        const d = t.pos - source.pos;
        const ad = Math.abs(d);
        if (ad <= threshold && ad < best) {
          best = ad;
          delta = d;
        }
      }
    }
    return { delta, dist: best };
  };

  if (moveL && !moveR) {
    const edge = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.left, face: b.face || 'outer' })),
      candidatesX
    );
    const mid = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.left + b.width / 2, face: 'any' as const })),
      candidatesX
    );
    if (mid.dist < edge.dist) {
      left = left + mid.delta * 2;
      width = right0 - left;
    } else if (edge.dist <= threshold) {
      left = left + edge.delta;
      width = right0 - left;
    }
  } else if (moveR && !moveL) {
    const edge = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.left + b.width, face: b.face || 'outer' })),
      candidatesX
    );
    const mid = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.left + b.width / 2, face: 'any' as const })),
      candidatesX
    );
    if (mid.dist < edge.dist) {
      width = width + mid.delta * 2;
    } else if (edge.dist <= threshold) {
      width = width + edge.delta;
    }
  }

  if (moveT && !moveB) {
    const edgeY = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.top, face: b.face || 'outer' })),
      candidatesY
    );
    const midY = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.top + b.height / 2, face: 'any' as const })),
      candidatesY
    );
    if (midY.dist < edgeY.dist) {
      top = top + midY.delta * 2;
      height = bottom0 - top;
    } else if (edgeY.dist <= threshold) {
      top = top + edgeY.delta;
      height = bottom0 - top;
    }
  } else if (moveB && !moveT) {
    const edgeY = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.top + b.height, face: b.face || 'outer' })),
      candidatesY
    );
    const midY = bestEdgeSnap(
      edgeBoxes.map((b) => ({ pos: b.top + b.height / 2, face: 'any' as const })),
      candidatesY
    );
    if (midY.dist < edgeY.dist) {
      height = height + midY.delta * 2;
    } else if (edgeY.dist <= threshold) {
      height = height + edgeY.delta;
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

  const box = { left, top, width, height };
  const dx = left - resized.left;
  const dy = top - resized.top;
  const dw = width - resized.width;
  const dh = height - resized.height;
  const movedEdges = edgeBoxes.map((b) => {
    let bl = b.left;
    let bt = b.top;
    let bw = b.width;
    let bh = b.height;
    if (moveL && !moveR) {
      bl += dx;
      bw += -dx;
    } else if (moveR && !moveL) {
      bw += dw;
    }
    if (moveT && !moveB) {
      bt += dy;
      bh += -dy;
    } else if (moveB && !moveT) {
      bh += dh;
    }
    return { ...b, left: bl, top: bt, width: Math.max(1, bw), height: Math.max(1, bh) };
  });
  return {
    box,
    guides: [
      ...buildAlignGuides(box, others, containers, candidatesX, candidatesY, movedEdges),
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
    if (id === 'ROOT' || exclude.has(id)) continue;
    const node = delta[id];
    if (!node || typeof node !== 'object') continue;
    const w = Number(node.width);
    const h = Number(node.height);
    if (!(w > 0) || !(h > 0)) continue;
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
  return out;
}

/** Chrome (inflated) box → stroke-band faces used while dragging that selection. */
export function chromeBandGuideBoxes(chrome: SceneBox, node: any): FacedSceneBox[] {
  if (!node) return [{ ...chrome, face: 'outer' }];
  return strokeBandGuideBoxes(deflateSelectionBox(chrome, node), node);
}
