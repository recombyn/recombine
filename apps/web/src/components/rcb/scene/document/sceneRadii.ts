/** Shared independent corner-radius helpers for scene nodes. */

import {
  clampShapeSides,
  DEFAULT_SHAPE_SIDES,
  sidesFromAttrs,
} from '@/components/rcb/scene/document/sceneShapes';

export type CornerRadii = { tl: number; tr: number; br: number; bl: number };
export type CornerKey = keyof CornerRadii;

/** Per-vertex editors stay usable; denser paths keep uniform R only. */
export const MAX_EDITABLE_CORNER_VERTICES = 16;

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function isRadiusLinked(attrs: Record<string, unknown> | null | undefined): boolean {
  return attrs?.radiusLinked !== false && attrs?.radiusLinked !== 'false';
}

/** Parse `radiusVertices` ("12,0,8,…" or number[]). */
export function parseRadiusVertices(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => Math.max(0, Math.round(Number(v) || 0)));
  }
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((v) => Math.max(0, Math.round(Number(v) || 0)));
}

export function serializeRadiusVertices(rs: number[]): string {
  return rs.map((v) => Math.max(0, Math.round(Number(v) || 0))).join(',');
}

/**
 * How many fillet-able corners a node has (rect=4, path=sharp verts only…).
 */
export function cornerVertexCount(node: any): number {
  if (!node) return 4;
  const key = String(node.key || '');
  const t = String(node.attrs?.shapeType || (key === 'path' ? 'path' : key) || 'rect');
  if (t === 'triangle') return 3;
  if (t === 'star') return clampShapeSides(sidesFromAttrs(node.attrs), DEFAULT_SHAPE_SIDES) * 2;
  if (t === 'polygon') return sidesFromAttrs(node.attrs);
  if (t === 'path' || t === 'pen' || key === 'path') {
    const rings = parseClosedPathRings(String(node.attrs?.path || node.attrs?.d || ''));
    if (!rings.length) return 4;
    let best = 0;
    for (const ring of rings) {
      const sharp = sharpCornerIndices(ring);
      best = Math.max(best, sharp.length > 0 ? sharp.length : ring.length);
    }
    return Math.max(1, best);
  }
  if (
    t === 'rect' ||
    t === 'roundRect' ||
    t === '' ||
    key === 'rect' ||
    key === 'image' ||
    key === 'video' ||
    key === 'audio'
  ) {
    return 4;
  }
  return 4;
}

/** Minimum turn (deg from straight) to treat a polyline vertex as a real corner. */
const SHARP_CORNER_MIN_DEG = 32;

/**
 * Turn away from a straight line at `curr` (0 = collinear, 90 = right angle).
 * Vectors are from the vertex toward its neighbors.
 */
export function vertexTurnDegrees(
  prev: [number, number],
  curr: [number, number],
  next: [number, number]
): number {
  const v1x = prev[0] - curr[0];
  const v1y = prev[1] - curr[1];
  const v2x = next[0] - curr[0];
  const v2y = next[1] - curr[1];
  const len1 = Math.hypot(v1x, v1y) || 1;
  const len2 = Math.hypot(v2x, v2y) || 1;
  const dot = (v1x / len1) * (v2x / len2) + (v1y / len1) * (v2y / len2);
  const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
  return ((Math.PI - ang) * 180) / Math.PI;
}

/**
 * Indices of real corners on a closed polyline.
 * Skips dense curve samples and line→arc joins (one long edge + one short
 * chord). Those joins used to get handles but barely move when R is large,
 * because fillet clamps to half the short edge — looking “stuck” while true
 * corners round a lot.
 */
export function sharpCornerIndices(points: Array<[number, number]>): number[] {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const edgeLens: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const [x, y] = points[i];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    const next = points[(i + 1) % n];
    edgeLens.push(Math.hypot(next[0] - x, next[1] - y));
  }
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
  const maxEdge = Math.max(...edgeLens, 1);
  // Both adjacent edges must be substantial (true polygon sides), not arc chords.
  const minCornerEdge = Math.max(diag * 0.02, maxEdge * 0.08);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const turn = vertexTurnDegrees(prev, curr, next);
    if (turn < SHARP_CORNER_MIN_DEG) continue;
    const len1 = edgeLens[(i - 1 + n) % n];
    const len2 = edgeLens[i];
    if (len1 < minCornerEdge || len2 < minCornerEdge) continue;
    out.push(i);
  }
  return out;
}

export type SharpCornerSite = {
  /** Index in the sharp-corner list (maps to radiusVertices[i]). */
  sharpIndex: number;
  /** Index in the polyline ring. */
  ringIndex: number;
  x: number;
  y: number;
  /** Inward unit (angle bisector) in local path space. */
  ix: number;
  iy: number;
};

function unitEdgeBisector(
  prev: [number, number],
  curr: [number, number],
  next: [number, number]
): { ix: number; iy: number } {
  const v1x = prev[0] - curr[0];
  const v1y = prev[1] - curr[1];
  const v2x = next[0] - curr[0];
  const v2y = next[1] - curr[1];
  const len1 = Math.hypot(v1x, v1y) || 1;
  const len2 = Math.hypot(v2x, v2y) || 1;
  let ix = v1x / len1 + v2x / len2;
  let iy = v1y / len1 + v2y / len2;
  const len = Math.hypot(ix, iy);
  if (len < 1e-6) return { ix: 1, iy: 0 };
  return { ix: ix / len, iy: iy / len };
}

/**
 * Sharp corner handle sites for closed path nodes (local path coords).
 * Returns null for rect-like shapes that should keep AABB corner handles.
 */
export function sharpCornerSitesForNode(node: any): SharpCornerSite[] | null {
  if (!node) return null;
  const key = String(node.key || '');
  const t = String(node.attrs?.shapeType || (key === 'path' ? 'path' : key) || 'rect');
  if (!(t === 'path' || key === 'path')) return null;
  const rings = parseClosedPathRings(String(node.attrs?.path || node.attrs?.d || ''));
  if (!rings.length) return null;
  // Largest ring drives UI (boolean holes are secondary).
  let ring = rings[0];
  for (const r of rings) {
    if (r.length > ring.length) ring = r;
  }
  const sharp = sharpCornerIndices(ring);
  if (!sharp.length) return null;
  const n = ring.length;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  return sharp.map((ringIndex, sharpIndex) => {
    const prev = ring[(ringIndex - 1 + n) % n];
    const curr = ring[ringIndex];
    const next = ring[(ringIndex + 1) % n];
    let { ix, iy } = unitEdgeBisector(prev, curr, next);
    // Bisector should point into the fill (toward centroid).
    if (ix * (cx - curr[0]) + iy * (cy - curr[1]) < 0) {
      ix = -ix;
      iy = -iy;
    }
    return {
      sharpIndex,
      ringIndex,
      x: curr[0],
      y: curr[1],
      ix,
      iy,
    };
  });
}

/**
 * Expand sharp-corner radii onto a full polyline (soft verts → 0).
 */
export function radiiForPolylineRing(
  attrs: Record<string, unknown> | null | undefined,
  ring: Array<[number, number]>,
  fallbackCorners?: CornerRadii
): number[] {
  const sharp = sharpCornerIndices(ring);
  const full = ring.map(() => 0);
  const effective =
    attrs ||
    (fallbackCorners
      ? {
          radiusTL: fallbackCorners.tl,
          radiusTR: fallbackCorners.tr,
          radiusBR: fallbackCorners.br,
          radiusBL: fallbackCorners.bl,
          radiusLinked: 'true',
        }
      : null);
  if (!sharp.length) {
    return vertexRadiiFromAttrs(effective, ring.length, 'path');
  }
  const sharpRadii = vertexRadiiFromAttrs(effective, sharp.length, 'path');
  for (let i = 0; i < sharp.length; i += 1) {
    full[sharp[i]] = sharpRadii[i] ?? 0;
  }
  return full;
}

/**
 * Per-vertex radii for polygon / path fillet.
 * Prefers `radiusVertices` when present; otherwise maps the 4 rect corners.
 */
export function vertexRadiiFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
  pointCount: number,
  shapeHint?: string
): number[] {
  if (pointCount <= 0) return [];
  const corners = radiiFromAttrs(attrs);
  const linked = isRadiusLinked(attrs);
  const stored = parseRadiusVertices(attrs?.radiusVertices);

  if (linked) {
    const u = stored.length
      ? stored.reduce((a, b) => a + b, 0) / stored.length
      : (corners.tl + corners.tr + corners.br + corners.bl) / 4;
    const v = Math.max(0, Math.round(u));
    return Array.from({ length: pointCount }, () => v);
  }

  if (stored.length === pointCount) {
    return stored.map((v) => Math.max(0, v));
  }
  if (stored.length > 0) {
    return Array.from({ length: pointCount }, (_, i) =>
      Math.max(0, stored[i] ?? stored[stored.length - 1] ?? 0)
    );
  }
  return polygonRadiiFromCorners(pointCount, corners, shapeHint);
}

export function radiiFromAttrs(attrs: Record<string, unknown> | null | undefined): CornerRadii {
  const linked = isRadiusLinked(attrs);
  const hasCornerAttrs =
    attrs?.radiusTL != null ||
    attrs?.radiusTR != null ||
    attrs?.radiusBR != null ||
    attrs?.radiusBL != null;
  // Uniform legacy keys: `radius`, agent/import `cornerRadius`, SVG `rx`/`ry`.
  const uniform = num(
    attrs?.radius ?? attrs?.cornerRadius ?? attrs?.rx ?? attrs?.ry,
    NaN
  );
  const stored = parseRadiusVertices(attrs?.radiusVertices);
  // Prefer per-corner attrs whenever present (toolbar / stroke panel).
  // Fall back to uniform `radius` only for legacy nodes without corner keys.
  if (hasCornerAttrs || !linked || !Number.isFinite(uniform)) {
    const fallback = Number.isFinite(uniform)
      ? uniform
      : stored.length
        ? stored.reduce((a, b) => a + b, 0) / stored.length
        : 0;
    return {
      tl: Math.max(0, num(attrs?.radiusTL, stored[0] ?? fallback)),
      tr: Math.max(0, num(attrs?.radiusTR, stored[1] ?? fallback)),
      br: Math.max(0, num(attrs?.radiusBR, stored[2] ?? fallback)),
      bl: Math.max(0, num(attrs?.radiusBL, stored[3] ?? fallback)),
    };
  }
  return { tl: uniform, tr: uniform, br: uniform, bl: uniform };
}

export function clampCornerRadii(r: CornerRadii, width: number, height: number): CornerRadii {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const maxR = Math.min(w, h) / 2;
  return {
    tl: Math.min(Math.max(0, r.tl), maxR),
    tr: Math.min(Math.max(0, r.tr), maxR),
    br: Math.min(Math.max(0, r.br), maxR),
    bl: Math.min(Math.max(0, r.bl), maxR),
  };
}

/** SVG path for a rect with independent corner radii (local 0,0). */
export function roundedRectPath(w: number, h: number, r: CornerRadii) {
  const width = Math.max(w, 1);
  const height = Math.max(h, 1);
  const c = clampCornerRadii(r, width, height);
  const { tl, tr, br, bl } = c;
  return [
    `M ${tl} 0`,
    `H ${width - tr}`,
    tr ? `A ${tr} ${tr} 0 0 1 ${width} ${tr}` : `L ${width} 0`,
    `V ${height - br}`,
    br ? `A ${br} ${br} 0 0 1 ${width - br} ${height}` : `L ${width} ${height}`,
    `H ${bl}`,
    bl ? `A ${bl} ${bl} 0 0 1 0 ${height - bl}` : `L 0 ${height}`,
    `V ${tl}`,
    tl ? `A ${tl} ${tl} 0 0 1 ${tl} 0` : `L 0 0`,
    'Z',
  ].join(' ');
}

export function radiiEqual(r: CornerRadii, epsilon = 0.5) {
  return (
    Math.abs(r.tl - r.tr) <= epsilon &&
    Math.abs(r.tr - r.br) <= epsilon &&
    Math.abs(r.br - r.bl) <= epsilon
  );
}

export function maxRadius(r: CornerRadii) {
  return Math.max(r.tl, r.tr, r.br, r.bl, 0);
}

/**
 * Parse closed M/L(/H/V)Z path(s) into rings (local coords).
 * Used for boolean results and other polyline paths.
 */
export function parseClosedPathRings(d: string): Array<Array<[number, number]>> {
  const rings: Array<Array<[number, number]>> = [];
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
  let ring: Array<[number, number]> = [];

  const readNum = () => {
    const n = Number(tokens[i]);
    i += 1;
    return Number.isFinite(n) ? n : 0;
  };

  const pushRing = () => {
    if (ring.length < 2) {
      ring = [];
      return;
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      ring = ring.slice(0, -1);
    }
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        pushRing();
        cx = startX;
        cy = startY;
        continue;
      }
      if ((cmd === 'M' || cmd === 'm') && ring.length) {
        pushRing();
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
      ring.push([x, y]);
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
      ring.push([x, y]);
      cmd = cmd === 'm' ? 'l' : cmd;
      continue;
    }
    if (cmd === 'H') {
      cx = readNum();
      ring.push([cx, cy]);
      continue;
    }
    if (cmd === 'h') {
      cx += readNum();
      ring.push([cx, cy]);
      continue;
    }
    if (cmd === 'V') {
      cy = readNum();
      ring.push([cx, cy]);
      continue;
    }
    if (cmd === 'v') {
      cy += readNum();
      ring.push([cx, cy]);
      continue;
    }
    // Unsupported command — abort so caller keeps the original path.
    return [];
  }
  if (ring.length >= 3) pushRing();
  return rings;
}

/**
 * Fillet sharp corners of a closed polyline path. Falls back to `d` when
 * the path cannot be parsed (curves, etc.).
 * Pass `attrs` so multi-corner paths can use per-vertex `radiusVertices`.
 * Only real corners are filleted — arc / curve samples stay smooth.
 */
export function filletPathD(
  d: string,
  r: CornerRadii,
  attrs?: Record<string, unknown> | null
): string {
  const raw = String(d || '');
  if (!raw) return raw;
  const rings = parseClosedPathRings(raw);
  if (!rings.length) return raw;
  const effectiveAttrs: Record<string, unknown> = attrs
    ? { ...attrs }
    : {
        radiusTL: r.tl,
        radiusTR: r.tr,
        radiusBR: r.br,
        radiusBL: r.bl,
        radiusLinked: 'true',
      };
  let out = '';
  let anyFillet = false;
  for (const ring of rings) {
    const radii = radiiForPolylineRing(effectiveAttrs, ring, r);
    if (radii.some((v) => v >= 0.5)) {
      out += roundedPolygonPath(ring, radii);
      anyFillet = true;
    } else {
      out += `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
    }
  }
  return anyFillet ? out || raw : raw;
}

/**
 * Rounded polygon path. `radii[i]` fillets vertex `points[i]`.
 * Soft curve-sample vertices are forced to 0 even if radii says otherwise.
 * Radii are clamped so adjacent corners never consume more than an edge's length
 * (large R on short edges otherwise self-intersects — common after pen→polyline).
 */
export function roundedPolygonPath(
  points: Array<[number, number]>,
  radii: number[] | number
): string {
  const n = points.length;
  if (n < 3) return '';
  const sharp = new Set(sharpCornerIndices(points));
  let rs = points.map((_, i) => {
    const raw = Math.max(0, typeof radii === 'number' ? radii : Number(radii[i] ?? 0) || 0);
    // Path arc densification: never fillet non-corners.
    if (sharp.size > 0 && !sharp.has(i)) return 0;
    return raw;
  });
  if (rs.every((r) => r < 0.5)) {
    return `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  }

  // Per-vertex max from adjacent half-edges.
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const len1 = Math.hypot(prev[0] - curr[0], prev[1] - curr[1]) || 1;
    const len2 = Math.hypot(next[0] - curr[0], next[1] - curr[1]) || 1;
    rs[i] = Math.min(rs[i], len1 / 2, len2 / 2);
  }
  // Shared-edge budget: r[i] + r[i+1] must not exceed edge length.
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const edge = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ri = rs[i];
    const rj = rs[(i + 1) % n];
    if (ri + rj > edge && ri + rj > 1e-6) {
      const scale = edge / (ri + rj);
      rs[i] *= scale;
      rs[(i + 1) % n] *= scale;
    }
  }

  const parts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const v1x = prev[0] - curr[0];
    const v1y = prev[1] - curr[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = rs[i];
    const ux1 = v1x / len1;
    const uy1 = v1y / len1;
    const ux2 = v2x / len2;
    const uy2 = v2y / len2;
    const p1x = curr[0] + ux1 * r;
    const p1y = curr[1] + uy1 * r;
    const p2x = curr[0] + ux2 * r;
    const p2y = curr[1] + uy2 * r;

    if (i === 0) parts.push(`M ${p1x} ${p1y}`);
    else parts.push(`L ${p1x} ${p1y}`);

    if (r > 0.5) {
      // Unit inward bisector isn't needed — use signed cross for arc direction.
      // Prefer the short arc that stays near the vertex (avoid 360° flips on concave tips).
      const cross = v1x * v2y - v1y * v2x;
      const dot = ux1 * ux2 + uy1 * uy2;
      // Near-collinear: skip arc, keep sharp.
      if (dot > 0.999) {
        parts.push(`L ${curr[0]} ${curr[1]}`);
        parts.push(`L ${p2x} ${p2y}`);
      } else {
        const sweep = cross < 0 ? 1 : 0;
        parts.push(`A ${r} ${r} 0 0 ${sweep} ${p2x} ${p2y}`);
      }
    } else {
      parts.push(`L ${curr[0]} ${curr[1]}`);
      parts.push(`L ${p2x} ${p2y}`);
    }
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Map rect corner radii onto polygon vertices (best-effort). */
export function polygonRadiiFromCorners(
  pointCount: number,
  r: CornerRadii,
  shapeHint?: string
): number[] {
  const c = r;
  if (pointCount <= 0) return [];
  if (pointCount === 3 || shapeHint === 'triangle') {
    return [Math.max(c.tl, c.tr), c.br, c.bl];
  }
  if (pointCount === 4) {
    return [c.tl, c.tr, c.br, c.bl];
  }
  const u = (c.tl + c.tr + c.br + c.bl) / 4;
  return Array.from({ length: pointCount }, () => u);
}

/**
 * Live corner-radius while knob-dragging (DOM preview only — Redux stays idle
 * mid-drag to avoid remount ghosts). Toolbars subscribe for the compact R label.
 */
type LiveCornerRadiusPreview = { nodeId: string; display: number };

let liveCornerRadiusPreview: LiveCornerRadiusPreview | null = null;
const liveCornerRadiusListeners = new Set<() => void>();

export function cornerRadiusToolbarDisplay(
  attrs: Record<string, unknown> | null | undefined
): number {
  const r = radiiFromAttrs(attrs);
  if (isRadiusLinked(attrs)) return Math.round(r.tl);
  return Math.round(maxRadius(r));
}

export function cornerRadiusDisplayFromRadii(radii: CornerRadii, linked: boolean): number {
  if (linked) return Math.round(radii.tl);
  return Math.round(maxRadius(radii));
}

export function setLiveCornerRadiusPreview(next: LiveCornerRadiusPreview | null) {
  const prev = liveCornerRadiusPreview;
  if (prev?.nodeId === next?.nodeId && prev?.display === next?.display) return;
  if (prev == null && next == null) return;
  liveCornerRadiusPreview = next;
  liveCornerRadiusListeners.forEach((l) => l());
}

export function getLiveCornerRadiusPreview(nodeId: string): number | null {
  if (!nodeId || liveCornerRadiusPreview?.nodeId !== nodeId) return null;
  return liveCornerRadiusPreview.display;
}

export function subscribeLiveCornerRadiusPreview(onStoreChange: () => void): () => void {
  liveCornerRadiusListeners.add(onStoreChange);
  return () => {
    liveCornerRadiusListeners.delete(onStoreChange);
  };
}
