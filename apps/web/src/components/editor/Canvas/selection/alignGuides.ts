import type { ArtboardFrame } from '@/store/modules/editor';
import { nodeLeftTop } from '@/store/scene/sceneToSvg';
import type { AlignGuide } from './AlignGuidesOverlay';

export type SceneBox = { left: number; top: number; width: number; height: number };

export type { AlignGuide };

const SNAP = 5;

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

function uniqNums(values: number[]) {
  const out: number[] = [];
  values.forEach((v) => {
    if (out.some((u) => Math.abs(u - v) < 0.5)) return;
    out.push(v);
  });
  return out;
}

/**
 * Snap a moving box to edges / centers of sibling nodes and container frames.
 * Returns the snapped box and segment guides for overlay drawing.
 */
export function snapBoxToGuides(
  moving: SceneBox,
  others: SceneBox[],
  /** Artboard frames (and similar) — snap + draw guides even when the element is outside. */
  containers: SceneBox[] = [],
  threshold = SNAP
): { box: SceneBox; guides: AlignGuide[] } {
  const m = guideEdges(moving);
  const { candidatesX, candidatesY } = collectGuideCandidates(others, containers);

  let dx = 0;
  let dy = 0;
  let bestX = threshold + 1;
  let bestY = threshold + 1;

  const tryX = (source: number, target: number) => {
    const d = target - source;
    const ad = Math.abs(d);
    if (ad <= threshold && ad < bestX) {
      bestX = ad;
      dx = d;
    }
  };
  const tryY = (source: number, target: number) => {
    const d = target - source;
    const ad = Math.abs(d);
    if (ad <= threshold && ad < bestY) {
      bestY = ad;
      dy = d;
    }
  };

  candidatesX.forEach((t) => {
    tryX(m.left, t);
    tryX(m.midX, t);
    tryX(m.right, t);
  });
  candidatesY.forEach((t) => {
    tryY(m.top, t);
    tryY(m.midY, t);
    tryY(m.bottom, t);
  });

  const box = { ...moving, left: moving.left + dx, top: moving.top + dy };
  return { box, guides: buildAlignGuides(box, others, containers, candidatesX, candidatesY) };
}

function collectGuideCandidates(others: SceneBox[], containers: SceneBox[]) {
  const candidatesX: number[] = [];
  const candidatesY: number[] = [];
  const absorbBox = (b: SceneBox) => {
    const e = guideEdges(b);
    candidatesX.push(e.left, e.midX, e.right);
    candidatesY.push(e.top, e.midY, e.bottom);
  };
  containers.forEach(absorbBox);
  others.forEach(absorbBox);
  return { candidatesX, candidatesY };
}

function buildAlignGuides(
  box: SceneBox,
  others: SceneBox[],
  containers: SceneBox[],
  candidatesX: number[],
  candidatesY: number[]
): AlignGuide[] {
  const s = guideEdges(box);
  const allBoxes = [box, ...others, ...containers];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const guides: AlignGuide[] = [];

  const pushV = (t: number) => {
    const hit = allBoxes.filter((b) => {
      const e = guideEdges(b);
      return near(e.left, t) || near(e.midX, t) || near(e.right, t);
    });
    if (hit.length < 2 || !hit.some((b) => b === box)) return;
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
    guides.push({
      orient: 'v',
      pos: t,
      from,
      to,
      marks: uniqNums(marks),
    });
  };

  const pushH = (t: number) => {
    const hit = allBoxes.filter((b) => {
      const e = guideEdges(b);
      return near(e.top, t) || near(e.midY, t) || near(e.bottom, t);
    });
    if (hit.length < 2 || !hit.some((b) => b === box)) return;
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
    guides.push({
      orient: 'h',
      pos: t,
      from,
      to,
      marks: uniqNums(marks),
    });
  };

  candidatesX.forEach((t) => {
    if (near(s.left, t) || near(s.midX, t) || near(s.right, t)) pushV(t);
  });
  candidatesY.forEach((t) => {
    if (near(s.top, t) || near(s.midY, t) || near(s.bottom, t)) pushH(t);
  });

  const seen = new Set<string>();
  return guides.filter((g) => {
    const k = `${g.orient}:${g.pos.toFixed(2)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Snap a resized box by adjusting only the edges moved by `handle`
 * (keeps the opposite edge fixed — unlike translate snap).
 */
export function snapResizeToGuides(
  resized: SceneBox,
  handle: ResizeHandle,
  others: SceneBox[],
  containers: SceneBox[] = [],
  threshold = SNAP,
  min = 8
): { box: SceneBox; guides: AlignGuide[] } {
  const { candidatesX, candidatesY } = collectGuideCandidates(others, containers);
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

  const bestSnap = (source: number, candidates: number[]) => {
    let best = threshold + 1;
    let target = source;
    for (const t of candidates) {
      const ad = Math.abs(t - source);
      if (ad <= threshold && ad < best) {
        best = ad;
        target = t;
      }
    }
    return { target, dist: best };
  };

  if (moveL && !moveR) {
    const edge = bestSnap(left, candidatesX);
    const mid = bestSnap(left + width / 2, candidatesX);
    if (mid.dist < edge.dist) {
      // Align center by moving the free (left) edge.
      left = mid.target * 2 - right0;
      width = right0 - left;
    } else if (edge.dist <= threshold) {
      left = edge.target;
      width = right0 - left;
    }
  } else if (moveR && !moveL) {
    const edge = bestSnap(right0, candidatesX);
    const mid = bestSnap(left + width / 2, candidatesX);
    if (mid.dist < edge.dist) {
      width = 2 * (mid.target - left);
    } else if (edge.dist <= threshold) {
      width = edge.target - left;
    }
  }

  if (moveT && !moveB) {
    const edge = bestSnap(top, candidatesY);
    const mid = bestSnap(top + height / 2, candidatesY);
    if (mid.dist < edge.dist) {
      top = mid.target * 2 - bottom0;
      height = bottom0 - top;
    } else if (edge.dist <= threshold) {
      top = edge.target;
      height = bottom0 - top;
    }
  } else if (moveB && !moveT) {
    const edge = bestSnap(bottom0, candidatesY);
    const mid = bestSnap(top + height / 2, candidatesY);
    if (mid.dist < edge.dist) {
      height = 2 * (mid.target - top);
    } else if (edge.dist <= threshold) {
      height = edge.target - top;
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
  return { box, guides: buildAlignGuides(box, others, containers, candidatesX, candidatesY) };
}

/** Scene boxes for HTML artboard frames (smart guides). */
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

/** Collect axis-aligned boxes for all scene nodes (for crop/expand snap targets). */
export function nodeGuideBoxes(
  document: any,
  opts?: { excludeIds?: string[] }
): SceneBox[] {
  const exclude = new Set(opts?.excludeIds || []);
  const delta = document?.deltaSetLike;
  if (!delta || typeof delta !== 'object') return [];
  const out: SceneBox[] = [];
  for (const id of Object.keys(delta)) {
    if (id === 'ROOT' || exclude.has(id)) continue;
    const node = delta[id];
    if (!node || typeof node !== 'object') continue;
    const w = Number(node.width);
    const h = Number(node.height);
    if (!(w > 0) || !(h > 0)) continue;
    const { left, top } = nodeLeftTop(document, node);
    out.push({
      left,
      top,
      width: Math.max(1, w),
      height: Math.max(1, h),
    });
  }
  return out;
}
