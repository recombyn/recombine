import {
  difference,
  intersection,
  union,
  xor,
  type MultiPolygon,
  type Polygon,
  type Ring,
} from 'polygon-clipping';
import { getShapeBaselineD } from '@/components/rcb/core/geometry';

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
  /**
   * Full node attrs (radii, starInnerRatio, ellipse arc/inner, …).
   * Boolean rings are sampled from the painted baseline so round corners survive.
   */
  attrs?: Record<string, unknown>;
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

/**
 * Curve sample spacing. Was 1.25 → hundreds of verts on long paths, and boolean
 * kept every clip vertex with no RDP (path-edit looked like a bead string).
 */
const SAMPLE_STEP_PX = 2.5;
const MIN_SAMPLE_POINTS = 16;
const FALLBACK_ELLIPSE_SEGMENTS = 64;
/** Post-boolean path-edit budget per ring. */
const BOOL_RING_MAX_PTS = 72;
const BOOL_RING_EPS = 0.85;

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

function ellipseRingFallback(b: ShapeBox): Ring {
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  const rx = b.width / 2;
  const ry = b.height / 2;
  const ring: Ring = [];
  for (let i = 0; i < FALLBACK_ELLIPSE_SEGMENTS; i++) {
    const angle = (i / FALLBACK_ELLIPSE_SEGMENTS) * Math.PI * 2;
    ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  ring.push(ring[0]);
  return ring;
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

function translateRing(ring: Ring, dx: number, dy: number): Ring {
  return ring.map(([x, y]) => [x + dx, y + dy] as [number, number]);
}

function ringAbsArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

function dedupeRingPts(pts: Array<[number, number]>, eps = 0.05): Array<[number, number]> {
  if (pts.length < 2) return pts;
  const out: Array<[number, number]> = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const prev = out[out.length - 1];
    const p = pts[i];
    if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= eps) out.push(p);
  }
  return out;
}

/** Corner verts of an M/L/H/V polyline — skip densify (outlined strokes are already L). */
function linearPathCornerVerts(d: string): Array<[number, number]> | null {
  const raw = String(d || '').trim();
  if (!raw || /[AaCcQqSsTt]/.test(raw)) return null;
  const tokens = raw
    .replace(/,/g, ' ')
    .replace(/([MmLlHhVvZz])/g, ' $1 ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;

  const pts: Array<[number, number]> = [];
  let i = 0;
  let cmd = 'M';
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  const readNum = (): number | null => {
    if (i >= tokens.length) return null;
    const n = Number(tokens[i]);
    if (!Number.isFinite(n)) return null;
    i += 1;
    return n;
  };
  const push = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last[0] - x, last[1] - y) < 1e-4) return;
    pts.push([x, y]);
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        cx = startX;
        cy = startY;
        continue;
      }
    }
    if (cmd === 'M' || cmd === 'L') {
      const x = readNum();
      const y = readNum();
      if (x == null || y == null) break;
      cx = x;
      cy = y;
      if (cmd === 'M') {
        startX = cx;
        startY = cy;
      }
      push(cx, cy);
      if (cmd === 'M') cmd = 'L';
    } else if (cmd === 'm' || cmd === 'l') {
      const x = readNum();
      const y = readNum();
      if (x == null || y == null) break;
      cx += x;
      cy += y;
      if (cmd === 'm') {
        startX = cx;
        startY = cy;
      }
      push(cx, cy);
      if (cmd === 'm') cmd = 'l';
    } else if (cmd === 'H') {
      const x = readNum();
      if (x == null) break;
      cx = x;
      push(cx, cy);
    } else if (cmd === 'h') {
      const x = readNum();
      if (x == null) break;
      cx += x;
      push(cx, cy);
    } else if (cmd === 'V') {
      const y = readNum();
      if (y == null) break;
      cy = y;
      push(cx, cy);
    } else if (cmd === 'v') {
      const y = readNum();
      if (y == null) break;
      cy += y;
      push(cx, cy);
    } else {
      break;
    }
  }
  return pts.length >= 2 ? pts : null;
}

function simplifyRdp(pts: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (pts.length <= 2) return pts.slice();
  const sq = epsilon * epsilon;
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s0, e0] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = s0;
    const ax = pts[s0][0];
    const ay = pts[s0][1];
    const bx = pts[e0][0];
    const by = pts[e0][1];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    for (let i = s0 + 1; i < e0; i += 1) {
      const px = pts[i][0];
      const py = pts[i][1];
      let dist: number;
      if (lenSq < 1e-12) {
        dist = (px - ax) * (px - ax) + (py - ay) * (py - ay);
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx;
        const qy = ay + t * dy;
        dist = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > sq) {
      keep[maxIdx] = true;
      if (maxIdx - s0 > 1) stack.push([s0, maxIdx]);
      if (e0 - maxIdx > 1) stack.push([maxIdx, e0]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** RDP + drop least-turny verts so boolean results stay path-edit friendly. */
function sparsifyClosedRing(
  ringIn: Ring,
  epsilon = BOOL_RING_EPS,
  maxPts = BOOL_RING_MAX_PTS
): Ring {
  let pts = ringIn.map(([x, y]) => [x, y] as [number, number]);
  if (pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) pts = pts.slice(0, -1);
  }
  if (pts.length < 3) return closeRing(pts);

  let out = simplifyRdp(pts.concat([pts[0]]), epsilon);
  if (out.length >= 2) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) out = out.slice(0, -1);
  }
  if (out.length > maxPts) {
    const turnMag = (idx: number) => {
      const n = out.length;
      const prev = out[(idx - 1 + n) % n];
      const curr = out[idx];
      const next = out[(idx + 1) % n];
      const ax = curr[0] - prev[0];
      const ay = curr[1] - prev[1];
      const bx = next[0] - curr[0];
      const by = next[1] - curr[1];
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      const dot = Math.max(-1, Math.min(1, (ax / la) * (bx / lb) + (ay / la) * (by / lb)));
      return Math.acos(dot);
    };
    while (out.length > maxPts && out.length > 3) {
      let minI = 0;
      let minTurn = Infinity;
      for (let i = 0; i < out.length; i += 1) {
        const t = turnMag(i);
        if (t < minTurn) {
          minTurn = t;
          minI = i;
        }
      }
      out = out.filter((_, i) => i !== minI);
    }
  }
  return closeRing(out.length >= 3 ? out : pts);
}

/** Local-space painted silhouette `d` (includes corner radii / ellipse params). */
function localBaselinePathD(b: ShapeBox): string {
  const t = String(b.shapeType || 'rect');
  if (t === 'path' || t === 'pen') {
    return String(b.path || b.attrs?.path || b.attrs?.d || '').trim();
  }
  const attrs: Record<string, unknown> = {
    ...(b.attrs || {}),
    shapeType: t,
  };
  if (b.sides != null && attrs.sides == null) attrs.sides = b.sides;
  if (b.path && attrs.path == null) attrs.path = b.path;
  return (
    getShapeBaselineD({
      key: t === 'ellipse' ? 'ellipse' : 'shape',
      width: b.width,
      height: b.height,
      attrs,
    }) || ''
  );
}

/**
 * Sample each SVG subpath into a closed ring (browser Path API — keeps C/Q/A curves).
 * Largest ring first (outer), then holes.
 */
function sampleLocalPathToRings(d: string, stepPx = SAMPLE_STEP_PX): Ring[] {
  const raw = String(d || '').trim();
  if (!raw) return [];
  if (typeof document === 'undefined') return [];

  const chunks = raw
    .split(/(?=[Mm])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const rings: Ring[] = [];

  for (const chunk of chunks) {
    // Straight polylines (outlined strokes): keep corners only — densify made
    // boolean results a bead string of path-edit knobs.
    const linear = linearPathCornerVerts(chunk.replace(/[Zz]\s*$/i, ''));
    if (linear && linear.length >= 3) {
      rings.push(closeRing(dedupeRingPts(linear, 0.35)));
      continue;
    }
    try {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', chunk);
      const len = el.getTotalLength?.() ?? 0;
      if (!(len > 0)) continue;
      const n = Math.max(MIN_SAMPLE_POINTS, Math.ceil(len / Math.max(0.75, stepPx)));
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= n; i += 1) {
        const p = el.getPointAtLength((len * i) / n);
        pts.push([p.x, p.y]);
      }
      const cleaned = dedupeRingPts(pts, Math.max(0.35, stepPx * 0.35));
      if (cleaned.length < 3) continue;
      rings.push(closeRing(cleaned));
    } catch {
      /* skip bad subpath */
    }
  }

  if (rings.length <= 1) return rings;
  return rings.sort((a, b) => ringAbsArea(b) - ringAbsArea(a));
}

/**
 * Convert a scene shape into a world-space polygon (outer + holes) for clipping.
 * Uses painted baseline geometry so rounded corners / arcs are preserved.
 */
function shapeToPolygon(b: ShapeBox): Polygon | null {
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  const angle = b.angle || 0;
  const d = localBaselinePathD(b);
  const localRings = d ? sampleLocalPathToRings(d) : [];

  if (localRings.length) {
    const world = localRings.map((ring) =>
      rotateRing(translateRing(ring, b.left, b.top), cx, cy, angle)
    );
    if (world[0] && world[0].length >= 4) return world;
  }

  // DOM-less / empty baseline fallback (sharp AABB or dense ellipse).
  const t = String(b.shapeType || 'rect');
  if (t === 'circle' || t === 'ellipse') {
    const ring = rotateRing(ellipseRingFallback(b), cx, cy, angle);
    return ring.length >= 4 ? [ring] : null;
  }
  const ring = rotateRing(rectRing(b), cx, cy, angle);
  return ring.length >= 4 ? [ring] : null;
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
      // Clip libraries keep every sample — sparsify so path-edit is not a bead string.
      d += ringToPath(sparsifyClosedRing(ring), originX, originY);
    }
  }
  return d;
}

function multipolygonHasHoles(mp: MultiPolygon): boolean {
  return mp.some((poly) => poly.length > 1);
}

function runClipping(boxes: ShapeBox[], mode: BoolMode): MultiPolygon | null {
  const polygons: Polygon[] = [];
  for (const b of boxes) {
    const poly = shapeToPolygon(b);
    if (!poly || !poly[0] || poly[0].length < 4) return null;
    polygons.push(poly);
  }
  if (polygons.length < 2) return null;

  try {
    if (mode === 'union') {
      const [first, ...rest] = polygons;
      return union(first, ...rest);
    }
    if (mode === 'subtract') {
      const [base, ...rest] = polygons;
      return difference(base, ...rest);
    }
    if (mode === 'intersect') {
      const [first, ...rest] = polygons;
      return intersection(first, ...rest);
    }
    const [first, ...rest] = polygons;
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
      // Holes from subtract / donut operands need evenodd when windings are mixed.
      fillRule: multipolygonHasHoles(mp) || mode === 'exclude' ? 'evenodd' : 'nonzero',
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
