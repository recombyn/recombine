/** Regular polygon / star / stroke (line·arrow) geometry helpers. */

export const DEFAULT_SHAPE_SIDES = 5;
export const MIN_SHAPE_SIDES = 3;
export const MAX_SHAPE_SIDES = 24;

/** Clamp polygon side count / star point count. */
export function clampShapeSides(n: unknown, fallback = DEFAULT_SHAPE_SIDES): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(MAX_SHAPE_SIDES, Math.max(MIN_SHAPE_SIDES, v));
}

/** Read sides from node attrs (polygon / star). */
export function sidesFromAttrs(attrs: Record<string, unknown> | null | undefined): number {
  return clampShapeSides(attrs?.sides, DEFAULT_SHAPE_SIDES);
}

export function starPoints(
  cx: number,
  cy: number,
  spikes: number,
  outerR: number,
  innerR: number
): Array<[number, number]> {
  const points: [number, number][] = [];
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes; i += 1) {
    points.push([cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR]);
    rot += step;
    points.push([cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR]);
    rot += step;
  }
  return points;
}

export function polygonPoints(
  cx: number,
  cy: number,
  sides: number,
  radius: number
): Array<[number, number]> {
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

/** Scale/translate points so their AABB exactly fills width × height. */
export function fitPointsToBox(
  points: Array<[number, number]>,
  width: number,
  height: number
): Array<[number, number]> {
  if (!points.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const bw = Math.max(1e-6, maxX - minX);
  const bh = Math.max(1e-6, maxY - minY);
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return points.map(([x, y]) => [((x - minX) / bw) * w, ((y - minY) / bh) * h]);
}

/** Uniform scale + center — keeps regular polygon / star proportions. */
export function fitPointsUniformToBox(
  points: Array<[number, number]>,
  width: number,
  height: number
): Array<[number, number]> {
  if (!points.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const bw = Math.max(1e-6, maxX - minX);
  const bh = Math.max(1e-6, maxY - minY);
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(w / bw, h / bh);
  const ox = (w - bw * scale) / 2;
  const oy = (h - bh * scale) / 2;
  return points.map(([x, y]) => [(x - minX) * scale + ox, (y - minY) * scale + oy]);
}

/** Local vertices for triangle / star / polygon, fitted to the node box. */
export function shapeVertexPoints(
  shapeType: string,
  width: number,
  height: number,
  sides: number = DEFAULT_SHAPE_SIDES
): Array<[number, number]> {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (shapeType === 'triangle') {
    return [
      [w / 2, 0],
      [w, h],
      [0, h],
    ];
  }
  const n = clampShapeSides(sides);
  if (shapeType === 'star') {
    return fitPointsUniformToBox(starPoints(0, 0, n, 1, 0.45), w, h);
  }
  if (shapeType === 'polygon') {
    return fitPointsUniformToBox(polygonPoints(0, 0, n, 1), w, h);
  }
  return [];
}

export function ptsAttr(pts: Array<[number, number]>) {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Fixed arrowhead length in local (pre-rotation) units. */
export const ARROW_HEAD = 14;

/** Hit/selection thickness for line & arrow nodes. */
export const STROKE_HIT = 16;

export type StrokeEndpoints = { x0: number; y0: number; x1: number; y1: number };

/** Build node placement for a free-angle line/arrow from two endpoints. */
export function strokeNodeFromEndpoints(ep: StrokeEndpoints) {
  const dx = ep.x1 - ep.x0;
  const dy = ep.y1 - ep.y0;
  const length = Math.max(1, Math.hypot(dx, dy));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (ep.x0 + ep.x1) / 2;
  const midY = (ep.y0 + ep.y1) / 2;
  const height = STROKE_HIT;
  return {
    x: midX - length / 2,
    y: midY - height / 2,
    width: length,
    height,
    angle: Number(angle.toFixed(2)),
  };
}

/** Local SVG path for an arrow: shaft + fixed-size head (does not scale with height). */
export function arrowLocalPath(width: number, height: number, head = ARROW_HEAD) {
  const w = Math.max(1, width);
  const mid = Math.max(1, height) / 2;
  const headLen = Math.min(head, w * 0.45);
  const shaftEnd = Math.max(0, w - headLen);
  const wing = headLen * 0.55;
  return [
    `M 0 ${mid}`,
    `L ${shaftEnd} ${mid}`,
    `M ${shaftEnd - wing * 0.15} ${mid - wing}`,
    `L ${w} ${mid}`,
    `L ${shaftEnd - wing * 0.15} ${mid + wing}`,
  ].join(' ');
}
