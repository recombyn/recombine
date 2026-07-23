import {
  difference,
  intersection,
  union,
  xor,
  type MultiPolygon,
  type Ring,
} from 'polygon-clipping';
import { shapeVertexPoints } from '@/components/rcb/scene/sceneShapes';

export type ShapeBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  shapeType: string;
  /** Local SVG path for path / pen shapes (coords relative to node box). */
  path?: string;
  /** Degrees; vertices are rotated around the box center. */
  angle?: number;
  /** Polygon side count / star point count. */
  sides?: number;
};

export type BoolMode = 'union' | 'subtract' | 'intersect' | 'exclude';

export type BoolResult = {
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fillRule: 'nonzero' | 'evenodd';
};

const ELLIPSE_SEGMENTS = 48;

function rectRing(b: ShapeBox): Ring {
  const { left, top, width, height } = b;
  return [
    [left, top],
    [left + width, top],
    [left + width, top + height],
    [left, top + height],
    [left, top],
  ];
}

function ellipseRing(b: ShapeBox): Ring {
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  const rx = b.width / 2;
  const ry = b.height / 2;
  const ring: Ring = [];
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Parse M/L(/H/V/Z) style paths used by scene nodes into absolute points. */
function parsePathLocalPoints(d: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const tokens = String(d || '')
    .replace(/,/g, ' ')
    .replace(/([MmLlHhVvZz])/g, ' $1 ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let i = 0;
  let cmd = 'M';
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  const readNum = () => {
    const n = Number(tokens[i]);
    i += 1;
    return Number.isFinite(n) ? n : 0;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        if (pts.length && (pts[0][0] !== cx || pts[0][1] !== cy)) {
          pts.push([startX, startY]);
        }
        cx = startX;
        cy = startY;
        continue;
      }
    }

    if (cmd === 'M' || cmd === 'L') {
      const x = readNum();
      const y = readNum();
      cx = x;
      cy = y;
      if (cmd === 'M') {
        startX = x;
        startY = y;
      }
      pts.push([x, y]);
      cmd = cmd === 'M' ? 'L' : cmd;
      continue;
    }
    if (cmd === 'm' || cmd === 'l') {
      const x = cx + readNum();
      const y = cy + readNum();
      cx = x;
      cy = y;
      if (cmd === 'm') {
        startX = x;
        startY = y;
      }
      pts.push([x, y]);
      cmd = cmd === 'm' ? 'l' : cmd;
      continue;
    }
    if (cmd === 'H') {
      cx = readNum();
      pts.push([cx, cy]);
      continue;
    }
    if (cmd === 'h') {
      cx += readNum();
      pts.push([cx, cy]);
      continue;
    }
    if (cmd === 'V') {
      cy = readNum();
      pts.push([cx, cy]);
      continue;
    }
    if (cmd === 'v') {
      cy += readNum();
      pts.push([cx, cy]);
      continue;
    }
    // Unsupported command — skip token to avoid infinite loop.
    i += 1;
  }

  return pts;
}

function closeRing(pts: Array<[number, number]>): Ring {
  if (pts.length < 3) return pts as Ring;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return pts as Ring;
  return [...pts, [first[0], first[1]]] as Ring;
}

function rotateRing(ring: Ring, cx: number, cy: number, angleDeg: number): Ring {
  if (!angleDeg || !Number.isFinite(angleDeg)) return ring;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return ring.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as [number, number];
  });
}

/**
 * Convert a scene shape into a world-space outer ring for polygon-clipping.
 * Uses real geometry (triangle / star / polygon / path), not just the AABB.
 */
function shapeToRing(b: ShapeBox): Ring {
  const t = String(b.shapeType || 'rect');
  let local: Array<[number, number]> = [];

  if (t === 'circle') {
    const ring = ellipseRing(b);
    return rotateRing(ring, b.left + b.width / 2, b.top + b.height / 2, b.angle || 0);
  }

  if (t === 'triangle' || t === 'star' || t === 'polygon') {
    local = shapeVertexPoints(t, b.width, b.height, b.sides);
  } else if (t === 'path' || t === 'pen') {
    local = parsePathLocalPoints(b.path || '');
    if (local.length < 3) {
      // Degenerate path — fall back to bounds so ops still do something.
      return rotateRing(rectRing(b), b.left + b.width / 2, b.top + b.height / 2, b.angle || 0);
    }
  } else {
    // rect / rounded rect approximation (corner radii ignored for boolean)
    return rotateRing(rectRing(b), b.left + b.width / 2, b.top + b.height / 2, b.angle || 0);
  }

  const world = local.map(([x, y]) => [b.left + x, b.top + y] as [number, number]);
  const ring = closeRing(world);
  return rotateRing(ring, b.left + b.width / 2, b.top + b.height / 2, b.angle || 0);
}

function multipolygonBounds(mp: MultiPolygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of mp) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function ringToPath(ring: Ring, originX: number, originY: number): string {
  if (ring.length < 2) return '';
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const pts = closed ? ring.slice(0, -1) : ring;
  if (!pts.length) return '';

  const fmt = (x: number, y: number) =>
    `${Math.round((x - originX) * 1000) / 1000} ${Math.round((y - originY) * 1000) / 1000}`;
  let d = `M${fmt(pts[0][0], pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${fmt(pts[i][0], pts[i][1])}`;
  }
  return `${d}Z`;
}

function multipolygonToPath(mp: MultiPolygon, originX: number, originY: number): string {
  let d = '';
  for (const poly of mp) {
    for (const ring of poly) {
      d += ringToPath(ring, originX, originY);
    }
  }
  return d;
}

function runClipping(boxes: ShapeBox[], mode: BoolMode): MultiPolygon | null {
  const polygons = boxes.map((b) => {
    const ring = shapeToRing(b);
    if (ring.length < 4) return null;
    return [ring];
  });
  if (polygons.some((p) => !p)) return null;
  const polys = polygons as MultiPolygon;

  try {
    if (mode === 'union') {
      const [first, ...rest] = polys;
      return union(first, ...rest);
    }
    if (mode === 'subtract') {
      const [base, ...rest] = polys;
      return difference(base, ...rest);
    }
    if (mode === 'intersect') {
      const [first, ...rest] = polys;
      return intersection(first, ...rest);
    }
    const [first, ...rest] = polys;
    return xor(first, ...rest);
  } catch {
    return null;
  }
}

/** Rect-only fallback when polygon-clipping is unavailable or fails. */
function rectOnlyFallback(boxes: ShapeBox[], mode: BoolMode): BoolResult | null {
  if (boxes.length < 2) return null;

  const originL = Math.min(...boxes.map((b) => b.left));
  const originT = Math.min(...boxes.map((b) => b.top));
  const originR = Math.max(...boxes.map((b) => b.left + b.width));
  const originB = Math.max(...boxes.map((b) => b.top + b.height));

  const localRect = (b: ShapeBox, reverse = false) => {
    const x = b.left - originL;
    const y = b.top - originT;
    if (reverse) {
      return `M${x} ${y + b.height}v${-b.height}h${b.width}v${b.height}h${-b.width}Z`;
    }
    return `M${x} ${y}h${b.width}v${b.height}h${-b.width}Z`;
  };

  let path = '';
  let outL = originL;
  let outT = originT;
  let outW = originR - originL;
  let outH = originB - originT;
  let fillRule: 'nonzero' | 'evenodd' = 'nonzero';

  if (mode === 'union') {
    path = boxes.map((b) => localRect(b)).join('');
  } else if (mode === 'subtract') {
    const [base, ...rest] = boxes;
    path = localRect(base) + rest.map((b) => localRect(b, true)).join('');
  } else if (mode === 'exclude') {
    fillRule = 'evenodd';
    path = boxes.map((b) => localRect(b)).join('');
  } else {
    let hit: { left: number; top: number; width: number; height: number } | null = {
      left: boxes[0].left,
      top: boxes[0].top,
      width: boxes[0].width,
      height: boxes[0].height,
    };
    for (let i = 1; i < boxes.length; i++) {
      const b = boxes[i];
      const left = Math.max(hit.left, b.left);
      const top = Math.max(hit.top, b.top);
      const right = Math.min(hit.left + hit.width, b.left + b.width);
      const bottom = Math.min(hit.top + hit.height, b.top + b.height);
      if (right <= left || bottom <= top) {
        hit = null;
        break;
      }
      hit = { left, top, width: right - left, height: bottom - top };
    }
    if (!hit) return null;
    outL = hit.left;
    outT = hit.top;
    outW = hit.width;
    outH = hit.height;
    path = `M0 0h${outW}v${outH}h${-outW}Z`;
  }

  return { path, x: outL, y: outT, width: outW, height: outH, fillRule };
}

export function computeShapeBoolean(
  boxes: ShapeBox[],
  mode: BoolMode
): { result: BoolResult | null; usedFallback: boolean; hasNonRect: boolean } {
  if (boxes.length < 2) {
    return { result: null, usedFallback: false, hasNonRect: false };
  }

  const hasNonRect = boxes.some((b) => {
    const t = String(b.shapeType || 'rect');
    return t !== 'rect';
  });
  const mp = runClipping(boxes, mode);

  if (!mp || mp.length === 0) {
    const fallback = rectOnlyFallback(boxes, mode);
    return { result: fallback, usedFallback: Boolean(fallback), hasNonRect };
  }

  const { minX, minY, maxX, maxY } = multipolygonBounds(mp);
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    const fallback = rectOnlyFallback(boxes, mode);
    return { result: fallback, usedFallback: Boolean(fallback), hasNonRect };
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const path = multipolygonToPath(mp, minX, minY);
  if (!path) {
    const fallback = rectOnlyFallback(boxes, mode);
    return { result: fallback, usedFallback: Boolean(fallback), hasNonRect };
  }

  return {
    result: {
      path,
      x: minX,
      y: minY,
      width,
      height,
      fillRule: 'nonzero',
    },
    usedFallback: false,
    hasNonRect,
  };
}

/**
 * Apply the primary operand's fill + stroke onto a boolean result path node.
 * Uses center stroke — outside underlays often disappear on tight path AABBs.
 */
export function applyBooleanResultPaint(
  attrs: Record<string, unknown>,
  sampleAttrs: Record<string, unknown> | null | undefined,
  fallback: { stroke: string; borderWidth: number }
) {
  const src =
    sampleAttrs && typeof sampleAttrs === 'object' ? sampleAttrs : ({} as Record<string, unknown>);
  for (const key of Object.keys(src)) {
    if (
      key.startsWith('fill') ||
      key.startsWith('stroke') ||
      key.startsWith('border') ||
      key === 'opacity' ||
      key === 'blendMode' ||
      key.startsWith('gradient') ||
      key.startsWith('mesh')
    ) {
      attrs[key] = src[key];
    }
  }

  const enabled = src['stroke-enabled'];
  const visible = src['stroke-visible'];
  const strokeOff =
    enabled === false ||
    enabled === 'false' ||
    visible === false ||
    visible === 'false';
  if (strokeOff) {
    attrs['stroke-enabled'] = 'false';
    attrs['stroke-visible'] = 'false';
    return;
  }

  const bw = parseFloat(String(attrs['border-width'] ?? fallback.borderWidth));
  attrs['stroke-enabled'] = 'true';
  attrs['stroke-visible'] = 'true';
  attrs['border-color'] = String(
    attrs['border-color'] || attrs.stroke || fallback.stroke || '#333333'
  );
  attrs['border-width'] =
    Number.isFinite(bw) && bw > 0 ? bw : Math.max(1, Number(fallback.borderWidth) || 1);
  attrs.strokeAlign = 'center';
  attrs['stroke-align'] = 'center';
}
