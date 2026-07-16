import {
  brushPad,
  findPencilBrush,
  parseSimplePathPoints,
} from '@/components/editor/nodes/ShapeNode/pencilBrushes';

export type ErasePt = { x: number; y: number };

function distPointToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Min distance from point to eraser polyline (scene coords). */
export function distToEraseStroke(px: number, py: number, erase: ErasePt[]) {
  if (!erase.length) return Infinity;
  if (erase.length === 1) return Math.hypot(px - erase[0].x, py - erase[0].y);
  let min = Infinity;
  for (let i = 1; i < erase.length; i += 1) {
    const a = erase[i - 1];
    const b = erase[i];
    min = Math.min(min, distPointToSeg(px, py, a.x, a.y, b.x, b.y));
  }
  return min;
}

/**
 * Carve a pencil centerline with an eraser stroke.
 * Returns remaining contiguous segments in local coords (may be empty).
 */
export function eraseCenterlineSegments(
  localPts: ErasePt[],
  nodeLeft: number,
  nodeTop: number,
  eraseScene: ErasePt[],
  hitRadius: number
): ErasePt[][] {
  if (localPts.length < 2 || eraseScene.length < 1 || hitRadius <= 0) {
    return localPts.length >= 2 ? [localPts.map((p) => ({ ...p }))] : [];
  }

  const keep = localPts.map((p) => {
    const sx = p.x + nodeLeft;
    const sy = p.y + nodeTop;
    return distToEraseStroke(sx, sy, eraseScene) > hitRadius;
  });

  const segments: ErasePt[][] = [];
  let run: ErasePt[] = [];
  for (let i = 0; i < localPts.length; i += 1) {
    if (keep[i]) {
      run.push({ x: localPts[i].x, y: localPts[i].y });
    } else if (run.length) {
      if (run.length >= 2) segments.push(run);
      run = [];
    }
  }
  if (run.length >= 2) segments.push(run);
  return segments;
}

export function centerlineToPathD(pts: ErasePt[]) {
  if (pts.length < 2) return '';
  return pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

export function boundsOfPoints(pts: ErasePt[], pad = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    left: minX - pad,
    top: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}

/**
 * Apply eraser to one pencil node.
 * Returns `null` when the stroke is untouched; `[]` when fully erased;
 * otherwise replacement fragments in scene space.
 */
export function erasePencilNode(opts: {
  pathD: string;
  left: number;
  top: number;
  strokeWidth: number;
  brushId?: string;
  eraseScene: ErasePt[];
  eraseRadius: number;
}): Array<{
  pathD: string;
  left: number;
  top: number;
  width: number;
  height: number;
}> | null {
  const local = parseSimplePathPoints(String(opts.pathD || ''));
  if (local.length < 2) return null;

  const brush = findPencilBrush(opts.brushId || 'solid');
  const inkHalf = Math.max(1, (opts.strokeWidth * (brush.sizeFactor || 1)) / 2);
  const hitRadius = Math.max(2, opts.eraseRadius) + inkHalf;

  const segments = eraseCenterlineSegments(
    local,
    opts.left,
    opts.top,
    opts.eraseScene,
    hitRadius
  );

  // Untouched — keep original node as-is.
  if (
    segments.length === 1 &&
    segments[0].length === local.length &&
    segments[0].every((p, i) => p.x === local[i].x && p.y === local[i].y)
  ) {
    return null;
  }

  const pad = brushPad(brush, opts.strokeWidth);
  const out: Array<{
    pathD: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }> = [];

  for (const seg of segments) {
    // Rebase to a tight local box for the surviving fragment.
    const scenePts = seg.map((p) => ({ x: p.x + opts.left, y: p.y + opts.top }));
    const box = boundsOfPoints(scenePts, pad);
    const localSeg = scenePts.map((p) => ({
      x: p.x - box.left,
      y: p.y - box.top,
    }));
    const d = centerlineToPathD(localSeg);
    if (!d) continue;
    out.push({
      pathD: d,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    });
  }
  return out;
}
