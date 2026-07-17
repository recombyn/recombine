/** Shared independent corner-radius helpers for scene nodes. */

export type CornerRadii = { tl: number; tr: number; br: number; bl: number };
export type CornerKey = keyof CornerRadii;

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function radiiFromAttrs(attrs: Record<string, unknown> | null | undefined): CornerRadii {
  const linked = attrs?.radiusLinked !== false && attrs?.radiusLinked !== 'false';
  const hasCornerAttrs =
    attrs?.radiusTL != null ||
    attrs?.radiusTR != null ||
    attrs?.radiusBR != null ||
    attrs?.radiusBL != null;
  const uniform = num(attrs?.radius, NaN);
  // Prefer per-corner attrs whenever present (toolbar / stroke panel).
  // Fall back to uniform `radius` only for legacy nodes without corner keys.
  if (hasCornerAttrs || !linked || !Number.isFinite(uniform)) {
    const fallback = Number.isFinite(uniform) ? uniform : 0;
    return {
      tl: Math.max(0, num(attrs?.radiusTL, fallback)),
      tr: Math.max(0, num(attrs?.radiusTR, fallback)),
      br: Math.max(0, num(attrs?.radiusBR, fallback)),
      bl: Math.max(0, num(attrs?.radiusBL, fallback)),
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
 */
export function filletPathD(d: string, r: CornerRadii): string {
  const raw = String(d || '');
  if (!raw || maxRadius(r) < 0.5) return raw;
  const rings = parseClosedPathRings(raw);
  if (!rings.length) return raw;
  let out = '';
  for (const ring of rings) {
    const radii = polygonRadiiFromCorners(ring.length, r, 'path');
    out += roundedPolygonPath(ring, radii);
  }
  return out || raw;
}

/**
 * Rounded polygon path. `radii[i]` fillets vertex `points[i]`.
 * Radii are clamped so adjacent corners never consume more than an edge's length
 * (large R on short edges otherwise self-intersects — common after pen→polyline).
 */
export function roundedPolygonPath(
  points: Array<[number, number]>,
  radii: number[] | number
): string {
  const n = points.length;
  if (n < 3) return '';
  let rs = points.map((_, i) =>
    Math.max(0, typeof radii === 'number' ? radii : Number(radii[i] ?? 0) || 0)
  );
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
