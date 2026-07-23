/**
 * Convert geometric shapes / text / pencil into editable SVG path `d` (M/L/C/Z).
 * Used by 轮廓化 — result is a closed (or open stroke) `shapeType: 'path'` node.
 */

import {
  clampCornerRadii,
  polygonRadiiFromCorners,
  radiiFromAttrs,
  roundedPolygonPath,
  roundedRectPath,
} from '@/components/rcb/scene/sceneRadii';
import {
  clampShapeSides,
  DEFAULT_SHAPE_SIDES,
  shapeVertexPoints,
  sidesFromAttrs,
} from '@/components/rcb/scene/sceneShapes';
import { parseNodeText, parseNodeTextStyle } from '@/components/rcb/scene/sceneText';
import {
  brushSize,
  findPencilBrush,
  isStampBrush,
  outlinePathFromPoints,
  parseSimplePathPoints,
  polylinePathD,
} from '@/components/rcb/tools/pencilBrushes';
import { getShapeBaselineD, PathBuilder } from '@/components/rcb/geometry';
import { computeShapeBoolean, type ShapeBox } from '@/components/rcb/selection/shapeBoolean';

export type OutlineResult = {
  pathD: string;
  closed: boolean;
  /** Fill color to keep after outlining (text → shape fill). */
  fillColor?: string;
  /** SVG fill-rule — text glyphs need evenodd for counters/holes. */
  fillRule?: 'nonzero' | 'evenodd';
  /** Tight local bounds of pathD (before any node translation). */
  bounds?: { minX: number; minY: number; width: number; height: number };
};

/** Shapes / text / stroke tools that can become an editable filled path. */
export function canOutlineNode(node: any): boolean {
  if (!node) return false;
  if (node.key === 'text') return Boolean(parseNodeText(node.attrs || {}).trim());
  if (node.key === 'rect' || node.key === 'ellipse') return true;
  if (node.key === 'path') {
    // Already a free path — outlining is a no-op (still editable via dblclick).
    return false;
  }
  if (node.key !== 'shape') return false;
  const t = String(node.attrs?.shapeType || 'rect');
  if (t === 'path') return false;
  // Pen / pencil / line: outline the painted SVG stroke (keep visual silhouette).
  if (t === 'pen' || t === 'pencil') {
    return Boolean(String(node.attrs?.path || node.attrs?.d || '').trim());
  }
  if (t === 'line' || t === 'arrow') return true;
  return ['rect', 'roundRect', 'circle', 'triangle', 'star', 'polygon', ''].includes(t);
}

/** Already an editable path (pen / boolean / outlined). */
export function isEditablePathNode(node: any): boolean {
  if (!node) return false;
  if (node.key === 'path') {
    return Boolean(String(node.attrs?.path || node.attrs?.d || '').trim());
  }
  if (node.key !== 'shape') return false;
  const t = String(node.attrs?.shapeType || '');
  if (t === 'pen' || t === 'path') {
    return Boolean(String(node.attrs?.path || node.attrs?.d || '').trim());
  }
  return false;
}

/**
 * Vector baseline path in local space — delegates to geometry kernel (SoT).
 */
export function geometryIndicatorPathD(
  node: any,
  opts?: { width?: number; height?: number }
): string | null {
  return getShapeBaselineD(node, opts);
}

/** Unit circle as 4 cubic Bézier segments in box [0,w]×[0,h]. */
export function ellipsePathD(w: number, h: number): string {
  return PathBuilder.ellipse(w, h).toD();
}

/**
 * Convert SVG arc / quadratic / shorthand to line segments so penSubpathsFromD can parse.
 * Uses dense sampling — sparse steps turn stroke outlines into jagged ribbons.
 */
export function normalizePathDForEdit(d: string, sampleStep?: number): string {
  const raw = String(d || '').trim();
  if (!raw) return '';
  if (typeof document === 'undefined') return raw;
  // Already cubic/line only — keep (preserves multi-contour M…Z rings for text).
  if (!/[Aa]/.test(raw) && !/[QqSsTt]/.test(raw)) return raw;

  // Multi-contour: normalize each subpath alone so getTotalLength does not
  // stitch glyph rings into one polyline (that caused filled “triangles”).
  const chunks = raw.split(/(?=[Mm])/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length > 1) {
    return chunks
      .map((c) => normalizePathDForEdit(c, sampleStep))
      .filter(Boolean)
      .join(' ');
  }

  try {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', raw);
    const len = el.getTotalLength?.() ?? 0;
    if (!(len > 0)) return raw;
    // Default ~1.25px along path (was len/48 → very jagged on long strokes).
    const step = Math.max(0.75, Math.min(2.5, sampleStep ?? len / 400));
    const pts: Array<[number, number]> = [];
    for (let t = 0; t <= len; t += step) {
      const p = el.getPointAtLength(t);
      pts.push([p.x, p.y]);
    }
    const end = el.getPointAtLength(len);
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last[0] - end.x, last[1] - end.y) > 0.35) {
      pts.push([end.x, end.y]);
    }
    const closed = /z\s*$/i.test(raw);
    if (pts.length < 2) return raw;
    let out = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 1; i < pts.length; i += 1) {
      out += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
    }
    if (closed) out += ' Z';
    return out;
  } catch {
    return raw;
  }
}

/** AABB of an SVG path `d` in local coordinates. */
export function pathDBounds(d: string): { minX: number; minY: number; width: number; height: number } | null {
  const raw = String(d || '').trim();
  if (!raw || typeof document === 'undefined') return null;
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.visibility = 'hidden';
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', raw);
    svg.appendChild(el);
    document.body.appendChild(svg);
    const bb = el.getBBox();
    document.body.removeChild(svg);
    if (!(bb.width > 0 || bb.height > 0)) return null;
    return {
      minX: bb.x,
      minY: bb.y,
      width: Math.max(1, bb.width),
      height: Math.max(1, bb.height),
    };
  } catch {
    return null;
  }
}

/**
 * Translate absolute-coordinate path so its top-left sits at origin.
 * Relative commands are left unchanged (caller should skip geometry fit).
 */
function translatePathD(d: string, dx: number, dy: number): string | null {
  if (!dx && !dy) return d;
  // Relative cmds only (lowercase). Do NOT use /i — that also matches absolute M/L/C
  // and made every stroked outline fail after the SVG-stroke outline rewrite.
  if (/[mlhvcsqta]/.test(d)) return null;
  return d.replace(
    /(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*,?\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi,
    (_, a: string, b: string) =>
      `${(parseFloat(a) - dx).toFixed(2)} ${(parseFloat(b) - dy).toFixed(2)}`
  );
}

/**
 * Rasterize an SVG stroke (same paint as canvas) and vectorize the silhouette.
 * Pencil/pen are drawn as centerline + strokeWidth — not perfect-freehand — so
 * outline must match that, or the ribbon looks jagged / wrong-width (fig.1).
 */
function outlineFromSvgStroke(opts: {
  pathD: string;
  strokeWidth: number;
  linecap?: CanvasLineCap;
  linejoin?: CanvasLineJoin;
  fillColor: string;
}): OutlineResult | null {
  if (typeof document === 'undefined') return null;
  const raw = String(opts.pathD || '').trim();
  const sw = Math.max(0.5, Number(opts.strokeWidth) || 1);
  if (!raw) return null;

  const bb = pathDBounds(raw);
  if (!bb) return null;
  const pad = sw / 2 + 3;
  const scale = 4;
  const localW = bb.width + pad * 2;
  const localH = bb.height + pad * 2;
  const cw = Math.max(8, Math.ceil(localW * scale));
  const ch = Math.max(8, Math.ceil(localH * scale));
  // Cap raster size — very long strokes still outline, just slightly coarser.
  const maxSide = 4096;
  const scaleX = cw > maxSide ? maxSide / cw : 1;
  const scaleY = ch > maxSide ? maxSide / ch : 1;
  const fit = Math.min(scaleX, scaleY);
  const rw = Math.max(8, Math.ceil(cw * fit));
  const rh = Math.max(8, Math.ceil(ch * fit));
  const rasterScale = scale * fit;

  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, rw, rh);
  ctx.save();
  ctx.scale(rasterScale, rasterScale);
  // Draw in pad-shifted space without rewriting path `d` (supports relative cmds).
  ctx.translate(-(bb.minX - pad), -(bb.minY - pad));
  ctx.strokeStyle = '#000';
  ctx.fillStyle = 'transparent';
  ctx.lineWidth = sw;
  ctx.lineCap = opts.linecap || 'round';
  ctx.lineJoin = opts.linejoin || 'round';
  ctx.miterLimit = 10;
  try {
    ctx.stroke(new Path2D(raw));
  } catch {
    ctx.restore();
    return null;
  }
  ctx.restore();

  const { data } = ctx.getImageData(0, 0, rw, rh);
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= rw || y >= rh) return false;
    return data[(y * rw + x) * 4 + 3] > 24;
  };

  const outside = markOutsideEmpty(solid, rw, rh);
  const outer = traceContoursInRegion(solid, rw, rh);
  const hole = traceContoursInRegion(
    (x, y) => {
      if (x < 0 || y < 0 || x >= rw || y >= rh) return false;
      return !solid(x, y) && !outside[y * rw + x];
    },
    rw,
    rh
  );
  const contours = [...outer, ...hole];
  if (!contours.length) return null;

  // Keep editable outlines sparse — raster Moore traces are extremely dense.
  const maxPts = 72;
  const epsilon = Math.max(0.75, sw * 0.15);

  const parts: string[] = [];
  for (const pts of contours) {
    const world: Array<[number, number]> = [];
    for (const [px, py] of pts) {
      world.push([px / rasterScale - pad + bb.minX, py / rasterScale - pad + bb.minY]);
    }
    let simplified = simplifyClosedPolyline(world, epsilon, maxPts);
    if (simplified.length < 3) continue;
    parts.push(
      `M ${simplified.map(([a, b]) => `${a.toFixed(2)} ${b.toFixed(2)}`).join(' L ')} Z`
    );
  }
  if (!parts.length) return null;

  return {
    pathD: parts.join(' '),
    closed: true,
    fillColor: opts.fillColor,
    fillRule: hole.length ? 'evenodd' : 'nonzero',
  };
}

function readStrokeLinecap(attrs: Record<string, unknown> | undefined): CanvasLineCap {
  const v = String(attrs?.strokeLinecap ?? attrs?.['stroke-linecap'] ?? 'round').toLowerCase();
  if (v === 'butt' || v === 'square' || v === 'round') return v;
  return 'round';
}

function readStrokeLinejoin(attrs: Record<string, unknown> | undefined): CanvasLineJoin {
  const v = String(attrs?.strokeLinejoin ?? attrs?.['stroke-linejoin'] ?? 'round').toLowerCase();
  if (v === 'bevel' || v === 'miter' || v === 'round') return v;
  return 'round';
}

function distPointToSeg(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.hypot(ex, ey);
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker polyline simplify (open). */
function simplifyRdp(pts: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (pts.length <= 2) return pts.slice();
  let maxDist = 0;
  let maxIdx = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = distPointToSeg(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = simplifyRdp(pts.slice(0, maxIdx + 1), epsilon);
  const right = simplifyRdp(pts.slice(maxIdx), epsilon);
  return left.slice(0, -1).concat(right);
}

/** Simplify a closed contour and hard-cap vertex count for path-edit UX. */
function simplifyClosedPolyline(
  pts: Array<[number, number]>,
  epsilon: number,
  maxPts: number
): Array<[number, number]> {
  if (pts.length < 3) return pts.slice();
  let ring = pts;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) {
    ring = ring.slice(0, -1);
  }
  if (ring.length < 3) return pts.slice();

  let out = simplifyRdp(ring.concat([ring[0]]), epsilon);
  if (out.length >= 2) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) out = out.slice(0, -1);
  }
  if (out.length > maxPts) {
    const stride = Math.ceil(out.length / maxPts);
    const capped: Array<[number, number]> = [];
    for (let i = 0; i < out.length; i += stride) capped.push(out[i]);
    if (capped[capped.length - 1] !== out[out.length - 1]) {
      capped.push(out[out.length - 1]);
    }
    out = capped;
  }
  return out.length >= 3 ? out : ring.slice(0, Math.min(ring.length, maxPts));
}

function outlineResultToShapeBox(o: OutlineResult): ShapeBox | null {
  if (!o.pathD) return null;
  const bb = o.bounds ?? pathDBounds(o.pathD);
  if (!bb) return null;
  let path = o.pathD;
  if (Math.abs(bb.minX) > 0.01 || Math.abs(bb.minY) > 0.01) {
    const shifted = translatePathD(path, -bb.minX, -bb.minY);
    if (shifted) path = shifted;
  }
  return {
    left: bb.minX,
    top: bb.minY,
    width: Math.max(1, bb.width),
    height: Math.max(1, bb.height),
    shapeType: 'path',
    path,
  };
}

function unionOutlineResults(parts: OutlineResult[], fillColor: string): OutlineResult | null {
  const boxes = parts.map(outlineResultToShapeBox).filter(Boolean) as ShapeBox[];
  if (!boxes.length) return null;
  if (boxes.length === 1) return parts[0];
  const { result } = computeShapeBoolean(boxes, 'union');
  if (!result?.path) return parts[0];
  return {
    pathD: result.path,
    closed: true,
    fillColor,
    fillRule: result.fillRule,
    bounds: {
      minX: result.x,
      minY: result.y,
      width: result.width,
      height: result.height,
    },
  };
}

/** Open centerline + width → closed fill path (path-edit boolean union). */
export function strokeCenterlineToFilledOutline(
  pathD: string,
  strokeWidth: number,
  attrs?: Record<string, unknown>
): OutlineResult | null {
  const raw = String(pathD || '').trim();
  if (!raw) return null;
  return outlineFromSvgStroke({
    pathD: raw,
    strokeWidth,
    linecap: readStrokeLinecap(attrs),
    linejoin: readStrokeLinejoin(attrs),
    fillColor: '#000000',
  });
}

function outlinePencilLocal(node: any): OutlineResult | null {
  const raw = String(node.attrs?.path || node.attrs?.d || '').trim();
  if (!raw) return null;
  const sw = Math.max(
    1,
    Number(node.attrs?.['border-width'] ?? node.attrs?.borderWidth ?? 10) || 10
  );
  const brushId = String(node.attrs?.brushStyle || 'solid');
  const brush = findPencilBrush(brushId);
  const stampSrc = node.attrs?.brushStampSrc != null ? String(node.attrs.brushStampSrc) : '';
  const ink = String(node.attrs?.['border-color'] || node.attrs?.stroke || '#333333');
  const inkW = brushSize(brush, sw);
  const linecap = readStrokeLinecap(node.attrs);
  const linejoin = readStrokeLinejoin(node.attrs);

  // Stamp brushes have no single SVG stroke — fall back to freehand silhouette.
  if (isStampBrush(brushId, stampSrc || brush.stampSrc)) {
    const pts = parseSimplePathPoints(raw);
    if (pts.length < 2) return null;
    const outlineD = outlinePathFromPoints(pts, sw, brushId, { linecap });
    if (!outlineD.trim()) return null;
    return {
      pathD: normalizePathDForEdit(outlineD) || outlineD,
      closed: true,
      fillColor: ink,
    };
  }

  // Match sceneToSvg: pencil ink is a stroked centerline, not freehand fill.
  const pts = parseSimplePathPoints(raw);
  const centerline = pts.length >= 2 ? polylinePathD(pts) : raw;
  return outlineFromSvgStroke({
    pathD: centerline,
    strokeWidth: inkW,
    linecap,
    linejoin,
    fillColor: ink,
  });
}

function outlinePenLocal(node: any): OutlineResult | null {
  const raw = String(node.attrs?.path || node.attrs?.d || '').trim();
  if (!raw) return null;
  const sw = Math.max(
    1,
    Number(node.attrs?.['border-width'] ?? node.attrs?.borderWidth ?? 2) || 2
  );
  const ink = String(node.attrs?.['border-color'] || node.attrs?.stroke || '#333333');
  return outlineFromSvgStroke({
    pathD: raw,
    strokeWidth: sw,
    linecap: readStrokeLinecap(node.attrs),
    linejoin: readStrokeLinejoin(node.attrs),
    fillColor: ink,
  });
}

function outlineLineOrArrowLocal(node: any, shapeType: string): OutlineResult | null {
  const w = Math.max(1, Number(node.width) || 1);
  const h = Math.max(1, Number(node.height) || 1);
  const sw = Math.max(
    1,
    Number(node.attrs?.['border-width'] ?? node.attrs?.borderWidth ?? 2) || 2
  );
  const ink = String(node.attrs?.['border-color'] || node.attrs?.stroke || '#333333');
  if (shapeType === 'line') {
    const mid = h / 2;
    return outlineFromSvgStroke({
      pathD: `M 0 ${mid} L ${w} ${mid}`,
      strokeWidth: sw,
      linecap: readStrokeLinecap(node.attrs),
      linejoin: readStrokeLinejoin(node.attrs),
      fillColor: ink,
    });
  }
  const d = getShapeBaselineD({
    key: 'shape',
    width: w,
    height: h,
    attrs: { ...(node.attrs || {}), shapeType: 'arrow' },
  });
  if (!d) return null;
  return outlineFromSvgStroke({
    pathD: d,
    strokeWidth: sw,
    linecap: readStrokeLinecap(node.attrs),
    linejoin: readStrokeLinejoin(node.attrs),
    fillColor: ink,
  });
}

function outlineShapeLocal(node: any): OutlineResult | null {
  const w = Math.max(1, Number(node.width) || 1);
  const h = Math.max(1, Number(node.height) || 1);
  const key = node.key;
  const shapeType =
    key === 'ellipse'
      ? 'circle'
      : key === 'rect'
        ? 'rect'
        : String(node.attrs?.shapeType || 'rect');

  if (shapeType === 'pencil') {
    return outlinePencilLocal(node);
  }
  if (shapeType === 'pen') {
    return outlinePenLocal(node);
  }
  if (shapeType === 'line' || shapeType === 'arrow') {
    return outlineLineOrArrowLocal(node, shapeType);
  }

  if (shapeType === 'circle') {
    return { pathD: ellipsePathD(w, h), closed: true };
  }

  if (shapeType === 'rect' || shapeType === 'roundRect' || shapeType === '') {
    // Fill geometry only — keep SVG stroke on the node (see outlineNodePatch).
    // Baking stroke into fill used to wipe stroke color when fill ≠ border.
    const r = clampCornerRadii(radiiFromAttrs(node.attrs), w, h);
    const fillD = normalizePathDForEdit(roundedRectPath(w, h, r));
    const fillColor = String(node.attrs?.['fill-color'] || node.attrs?.fill || '#FFFFFF');
    return { pathD: fillD, closed: true, fillColor };
  }

  if (shapeType === 'triangle' || shapeType === 'star' || shapeType === 'polygon') {
    const sides = sidesFromAttrs(node.attrs) || DEFAULT_SHAPE_SIDES;
    const pts = shapeVertexPoints(shapeType, w, h, clampShapeSides(sides));
    if (pts.length < 3) return null;
    const corner = radiiFromAttrs(node.attrs);
    const vertexRadii = polygonRadiiFromCorners(pts.length, corner, shapeType);
    const d = normalizePathDForEdit(roundedPolygonPath(pts, vertexRadii));
    return { pathD: d || `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`, closed: true };
  }

  return null;
}

/**
 * Moore-neighborhood contour walker for a binary mask.
 * `region` is true for pixels that belong to the component being traced.
 */
function traceContoursInRegion(
  region: (x: number, y: number) => boolean,
  cw: number,
  ch: number
): Array<Array<[number, number]>> {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  const visited = new Uint8Array(cw * ch);
  const contours: Array<Array<[number, number]>> = [];

  const floodMark = (sx: number, sy: number) => {
    const stack: Array<[number, number]> = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      const i = y * cw + x;
      if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
      if (visited[i] || !region(x, y)) continue;
      visited[i] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  };

  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const i = y * cw + x;
      // Left edge of a region component.
      if (visited[i] || !region(x, y) || region(x - 1, y)) continue;

      const sx = x;
      const sy = y;
      const pts: Array<[number, number]> = [];
      let cx = sx;
      let cy = sy;
      let dir = 0;
      const maxSteps = cw * ch * 2;
      for (let step = 0; step < maxSteps; step += 1) {
        pts.push([cx, cy]);
        let found = false;
        for (let k = 0; k < 8; k += 1) {
          const nd = (dir + 6 + k) % 8;
          const nx = cx + dx[nd];
          const ny = cy + dy[nd];
          if (region(nx, ny)) {
            cx = nx;
            cy = ny;
            dir = nd;
            found = true;
            break;
          }
        }
        if (!found) break;
        if (cx === sx && cy === sy && pts.length > 8) break;
      }

      floodMark(sx, sy);
      if (pts.length >= 8) contours.push(pts);
    }
  }

  return contours;
}

/** Mark empty pixels connected to the canvas border (outside / background). */
function markOutsideEmpty(
  solid: (x: number, y: number) => boolean,
  cw: number,
  ch: number
): Uint8Array {
  const outside = new Uint8Array(cw * ch);
  const stack: Array<[number, number]> = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cw || y >= ch) return;
    const i = y * cw + x;
    if (outside[i] || solid(x, y)) return;
    outside[i] = 1;
    stack.push([x, y]);
  };
  for (let x = 0; x < cw; x += 1) {
    push(x, 0);
    push(x, ch - 1);
  }
  for (let y = 0; y < ch; y += 1) {
    push(0, y);
    push(cw - 1, y);
  }
  while (stack.length) {
    const [x, y] = stack.pop()!;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return outside;
}

/**
 * Approximate text glyphs as closed paths via canvas alpha contour.
 * Fallback when the font file is unavailable — prefer `outlineTextFromFont` (fontkit).
 * Traces each character separately so adjacent CJK glyphs do not merge / cancel.
 */
function outlineTextLocal(node: any): OutlineResult | null {
  if (typeof document === 'undefined') return null;
  const plain = parseNodeText(node.attrs || {}).trim();
  if (!plain) return null;
  const style = parseNodeTextStyle(node.attrs || {});
  const boxW = Math.max(1, Math.round(Number(node.width) || 1));
  const pad = 4;
  const scale = 6;
  const fontSize = Math.max(1, style.fontSize) * scale;
  const lh = Math.max(0.8, style.lineHeight || 1.2) * fontSize;
  const letterSpacing = (Number(style.letterSpacing) || 0) * scale;
  const align = String(style.textAlign || 'left');
  const lines = plain.split(/\n/);
  const fontCss = `${style.fontWeight || 400} ${fontSize}px ${style.fontFamily || 'sans-serif'}`;

  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return null;
  measureCtx.font = fontCss;

  const measureLine = (line: string) => {
    if (!letterSpacing) return measureCtx.measureText(line || ' ').width;
    let total = 0;
    const chars = Array.from(line);
    chars.forEach((ch, i) => {
      total += measureCtx.measureText(ch).width;
      if (i < chars.length - 1) total += letterSpacing;
    });
    return total || measureCtx.measureText(' ').width;
  };

  const parts: string[] = [];

  const traceChar = (ch: string, destX: number, destY: number) => {
    if (!ch.trim()) return;
    const metrics = measureCtx.measureText(ch);
    const gw = Math.ceil(Math.max(metrics.width, fontSize * 0.4) + pad * 2 * scale);
    const gh = Math.ceil(fontSize * 1.35 + pad * 2 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, gw);
    canvas.height = Math.max(8, gh);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    ctx.font = fontCss;
    ctx.fillText(ch, pad * scale, pad * scale);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const solid = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
      return data[(y * canvas.width + x) * 4 + 3] > 20;
    };
    const outside = markOutsideEmpty(solid, canvas.width, canvas.height);
    const outer = traceContoursInRegion(solid, canvas.width, canvas.height);
    const hole = traceContoursInRegion(
      (x, y) => {
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
        return !solid(x, y) && !outside[y * canvas.width + x];
      },
      canvas.width,
      canvas.height
    );
    for (const pts of [...outer, ...hole]) {
      const world: Array<[number, number]> = pts.map(([px, py]) => [
        px / scale - pad + destX,
        py / scale - pad + destY,
      ]);
      const simplified = simplifyClosedPolyline(world, 0.85, 64);
      if (simplified.length < 3) continue;
      parts.push(
        `M ${simplified.map(([a, b]) => `${a.toFixed(2)} ${b.toFixed(2)}`).join(' L ')} Z`
      );
    }
  };

  lines.forEach((line, lineIdx) => {
    const lineW = measureLine(line) / scale;
    let x = 0;
    if (align === 'center') x = (boxW - lineW) / 2;
    else if (align === 'right') x = boxW - lineW;
    const y = (lineIdx * lh) / scale;
    if (!letterSpacing) {
      // Still walk chars so contours stay isolated.
      let cx = x;
      const chars: string[] = Array.from(line);
      for (const ch of chars) {
        const cw = measureCtx.measureText(ch).width / scale;
        traceChar(ch, cx, y);
        cx += cw;
      }
      return;
    }
    let cx = x;
    const chars: string[] = Array.from(line);
    for (const ch of chars) {
      const cw = measureCtx.measureText(ch).width / scale;
      traceChar(ch, cx, y);
      cx += cw + letterSpacing / scale;
    }
  });

  if (!parts.length) return null;

  return {
    pathD: parts.join(' '),
    closed: true,
    fillColor: String(style.fill || '#333333'),
    fillRule: 'evenodd',
  };
}

/** Normalize outline into node-local top-left space + tight bounds. */
function fitOutlineResult(result: OutlineResult): OutlineResult | null {
  if (!result?.pathD) return null;
  const bounds = pathDBounds(result.pathD);
  if (!bounds) return result;
  const needShift = Math.abs(bounds.minX) > 0.01 || Math.abs(bounds.minY) > 0.01;
  const shifted = needShift
    ? translatePathD(result.pathD, bounds.minX, bounds.minY)
    : result.pathD;
  if (shifted != null) {
    return {
      ...result,
      pathD: shifted,
      bounds: {
        minX: bounds.minX,
        minY: bounds.minY,
        width: bounds.width,
        height: bounds.height,
      },
    };
  }
  return {
    ...result,
    bounds: {
      minX: 0,
      minY: 0,
      width: Math.max(bounds.width + bounds.minX, 1),
      height: Math.max(bounds.height + bounds.minY, 1),
    },
  };
}

/** Build local-space outline path for a node (sync; text uses canvas fallback). */
export function buildOutlinePath(node: any): OutlineResult | null {
  if (!canOutlineNode(node)) return null;
  let result: OutlineResult | null = null;
  if (node.key === 'text') result = outlineTextLocal(node);
  else result = outlineShapeLocal(node);
  return fitOutlineResult(result as OutlineResult);
}

/**
 * Prefer fontkit glyph outlines for text (complete Chinese counters, no missing strokes).
 * Falls back to canvas contour when the face has no downloadable font file.
 */
export async function buildOutlinePathAsync(node: any): Promise<OutlineResult | null> {
  if (!canOutlineNode(node)) return null;
  if (node.key === 'text') {
    try {
      const { outlineTextFromFont } = await import('@/components/rcb/scene/outlineTextFont');
      const fromFont = await outlineTextFromFont(node);
      if (fromFont?.pathD) return fitOutlineResult(fromFont);
    } catch (err) {
      console.warn('[outline] fontkit outline failed, using canvas fallback', err);
    }
    return fitOutlineResult(outlineTextLocal(node) as OutlineResult);
  }
  try {
    return fitOutlineResult(outlineShapeLocal(node) as OutlineResult);
  } catch (err) {
    console.warn('[outline] shape outline failed', err);
    return null;
  }
}

/** Attrs + geometry patch after outline — keeps paint, switches to editable path. */
export function outlineNodePatch(node: any, outline: OutlineResult) {
  const prev = { ...(node.attrs || {}) };
  const fill =
    outline.fillColor ||
    String(prev['fill-color'] || prev.fill || '#FFFFFF');
  delete prev.sides;
  delete prev.ORIGIN_DATA;
  delete prev.DATA;
  delete prev.markdown;
  delete prev.brushStyle;
  delete prev.brushStampSrc;

  const b = outline.bounds;
  const left = Number(node.x ?? node.left ?? 0) + (b?.minX ?? 0);
  const top = Number(node.y ?? node.top ?? 0) + (b?.minY ?? 0);
  const width = b ? Math.max(1, b.width) : Math.max(1, Number(node.width) || 1);
  const height = b ? Math.max(1, b.height) : Math.max(1, Number(node.height) || 1);

  const shapeType = String(node.attrs?.shapeType || node.key || 'rect');
  // Stroke-ink tools bake the ribbon into fill — disable SVG stroke to avoid a
  // double outline. Filled shapes (rect / polygon / …) keep their border paint.
  const strokeBakedIntoFill =
    shapeType === 'pen' ||
    shapeType === 'pencil' ||
    shapeType === 'line' ||
    shapeType === 'arrow' ||
    node.key === 'text';
  if (strokeBakedIntoFill) {
    prev['stroke-enabled'] = 'false';
    prev['border-width'] = 0;
  } else {
    // Keep original stroke state — don't invent a border after outlining.
    const prevStrokeOn = String(prev['stroke-enabled'] ?? 'true') !== 'false';
    const prevBw = Number(prev['border-width'] ?? prev.strokeWidth ?? 0);
    if (!prevStrokeOn || !(prevBw > 0)) {
      prev['stroke-enabled'] = 'false';
      prev['stroke-visible'] = 'false';
      prev['border-width'] = 0;
    } else {
      // Path AABB is tight; outside stroke underlays often clip (esp. left edge).
      prev.strokeAlign = 'center';
      prev['stroke-align'] = 'center';
    }
  }
  const fillNone =
    !fill ||
    fill === 'transparent' ||
    fill === 'none' ||
    fill === 'rgba(0,0,0,0)';
  if (fillNone) {
    prev['fill-enabled'] = 'false';
    prev['fill-visible'] = 'false';
  }
  if (outline.fillRule) {
    prev['fill-rule'] = outline.fillRule;
  }

  return {
    key: 'shape' as const,
    x: left,
    y: top,
    width,
    height,
    attrs: {
      ...prev,
      shapeType: 'path',
      path: outline.pathD,
      d: outline.pathD,
      closed: outline.closed ? 'true' : 'false',
      'fill-color': fillNone ? 'transparent' : fill,
      'fill-type': String(prev['fill-type'] || 'solid'),
      'fill-enabled': fillNone ? 'false' : 'true',
      'fill-visible': fillNone ? 'false' : 'true',
    },
  };
}

/** Fire after outline so canvas can open path-edit chrome. */
export function requestEnterPathEdit(nodeId: string) {
  if (typeof window === 'undefined' || !nodeId) return;
  queueMicrotask(() => {
    window.dispatchEvent(
      new CustomEvent('resume:enter-path-edit', { detail: { nodeId } })
    );
  });
}
