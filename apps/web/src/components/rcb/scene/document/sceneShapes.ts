/** Regular polygon / star / stroke (line·arrow) geometry helpers. */

import { ARROW_HEAD as ARROW_HEAD_GEOM, arrowBaselinePath } from '@/components/rcb/core/geometry';

export const DEFAULT_SHAPE_SIDES = 5;
export const MIN_SHAPE_SIDES = 3;
export const MAX_SHAPE_SIDES = 24;

/** Fixed arrowhead length in local (pre-rotation) units. */
export const ARROW_HEAD = ARROW_HEAD_GEOM;
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

/** Hit/selection thickness for line & arrow nodes (world units). */
export const STROKE_HIT = 24;

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

/** World-space endpoints of a line/arrow AABB + angle (local shaft left→right). */
export function strokeEndpointsFromBox(
  box: { left: number; top: number; width: number; height: number },
  angleDeg: number
): StrokeEndpoints {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const hx = (box.width / 2) * Math.cos(rad);
  const hy = (box.width / 2) * Math.sin(rad);
  return {
    x0: cx - hx,
    y0: cy - hy,
    x1: cx + hx,
    y1: cy + hy,
  };
}

/**
 * Drag an endpoint freely: opposite end stays fixed; length + angle update together.
 * `handle` `e` moves the right/local end; `w` moves the left/local start.
 */
export function resizeStrokeByEndpoint(
  box: { left: number; top: number; width: number; height: number },
  angleDeg: number,
  handle: 'e' | 'w',
  pointerX: number,
  pointerY: number
) {
  const ep = strokeEndpointsFromBox(box, angleDeg);
  if (handle === 'e') {
    return strokeNodeFromEndpoints({ x0: ep.x0, y0: ep.y0, x1: pointerX, y1: pointerY });
  }
  return strokeNodeFromEndpoints({ x0: pointerX, y0: pointerY, x1: ep.x1, y1: ep.y1 });
}

/** Distance from point to segment (for line/arrow hit-testing). */
export function distPointToSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * Canvas Path2D geometry cache — reuse for hit-test + overlay batch stroke.
 * Committed ink stays SVG hosts; Path2D is the shared vector kernel.
 */
const PATH2D_CACHE_MAX = 256;
const path2dByD = new Map<string, Path2D>();
const path2dTouch: string[] = [];
/** nodeId → path `d` fingerprint currently cached for that node. */
const nodePathFp = new Map<string, string>();

let hitCtx: CanvasRenderingContext2D | null = null;

function getPath2DHitCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (hitCtx) return hitCtx;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  hitCtx = c.getContext('2d', { willReadFrequently: true });
  return hitCtx;
}

function touchPath2DKey(d: string) {
  const i = path2dTouch.indexOf(d);
  if (i >= 0) path2dTouch.splice(i, 1);
  path2dTouch.push(d);
  while (path2dTouch.length > PATH2D_CACHE_MAX) {
    const drop = path2dTouch.shift();
    if (drop) path2dByD.delete(drop);
  }
}

/** Cached Path2D for an SVG path `d` (empty / invalid → null). */
export function getCachedPath2D(pathD: string): Path2D | null {
  const d = String(pathD || '').trim();
  if (!d || typeof Path2D === 'undefined') return null;
  let path = path2dByD.get(d);
  if (path) {
    touchPath2DKey(d);
    return path;
  }
  try {
    path = new Path2D(d);
  } catch {
    return null;
  }
  path2dByD.set(d, path);
  touchPath2DKey(d);
  return path;
}

/** Bind a node id to a path `d` so paint remounts can drop the entry. */
export function rememberNodePath2D(nodeId: string, pathD: string): Path2D | null {
  const id = String(nodeId || '');
  const d = String(pathD || '').trim();
  if (!id || !d) return null;
  const prev = nodePathFp.get(id);
  if (prev && prev !== d) {
    // Keep Path2D for `prev` if other nodes share it — only forget the binding.
  }
  nodePathFp.set(id, d);
  return getCachedPath2D(d);
}

export function invalidateNodePath2D(nodeId: string) {
  const id = String(nodeId || '');
  if (!id) return;
  nodePathFp.delete(id);
}

export function clearPath2DCache() {
  path2dByD.clear();
  path2dTouch.length = 0;
  nodePathFp.clear();
}

export type Path2DHitOpts = {
  /** Test fill (closed shapes / pencil blobs). */
  fill?: boolean;
  /** Stroke hit width in local units (0 / omit → skip stroke test). */
  strokeWidth?: number;
  fillRule?: CanvasFillRule;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
};

/**
 * Local-space hit against a cached Path2D (same coords as path `d`).
 * Prefer this over sampling `getPointAtLength` for pen/path hover.
 */
export function hitTestPath2DLocal(
  pathD: string,
  lx: number,
  ly: number,
  opts?: Path2DHitOpts
): boolean {
  if (![lx, ly].every(Number.isFinite)) return false;
  const path = getCachedPath2D(pathD);
  if (!path) return false;
  const ctx = getPath2DHitCtx();
  if (!ctx) return false;

  const wantFill = Boolean(opts?.fill);
  const sw = Math.max(0, Number(opts?.strokeWidth) || 0);
  const rule: CanvasFillRule =
    opts?.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';

  try {
    if (wantFill && ctx.isPointInPath(path, lx, ly, rule)) return true;
    if (sw > 0 && typeof ctx.isPointInStroke === 'function') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.lineWidth = sw;
      ctx.lineCap = opts?.lineCap || 'round';
      ctx.lineJoin = opts?.lineJoin || 'round';
      ctx.miterLimit = 10;
      if (ctx.isPointInStroke(path, lx, ly)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Stroke a cached Path2D onto a Canvas2D context (overlay / draft batch). */
export function strokeCachedPath2D(
  ctx: CanvasRenderingContext2D,
  pathD: string,
  style?: { strokeStyle?: string; lineWidth?: number; lineCap?: CanvasLineCap; lineJoin?: CanvasLineJoin }
): boolean {
  const path = getCachedPath2D(pathD);
  if (!path) return false;
  if (style?.strokeStyle) ctx.strokeStyle = style.strokeStyle;
  if (style?.lineWidth != null) ctx.lineWidth = style.lineWidth;
  if (style?.lineCap) ctx.lineCap = style.lineCap;
  if (style?.lineJoin) ctx.lineJoin = style.lineJoin;
  ctx.stroke(path);
  return true;
}

/** Fill a cached Path2D (closed geo / pencil). */
export function fillCachedPath2D(
  ctx: CanvasRenderingContext2D,
  pathD: string,
  style?: { fillStyle?: string; fillRule?: CanvasFillRule }
): boolean {
  const path = getCachedPath2D(pathD);
  if (!path) return false;
  if (style?.fillStyle) ctx.fillStyle = style.fillStyle;
  const rule = style?.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
  ctx.fill(path, rule);
  return true;
}

/** Reused off-DOM path for length sampling (Bezier pen / freehand). */
let measurePathEl: SVGPathElement | null = null;

function getMeasurePathEl(): SVGPathElement {
  if (measurePathEl) return measurePathEl;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute(
    'style',
    'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none'
  );
  measurePathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.appendChild(measurePathEl);
  if (typeof document !== 'undefined') {
    document.documentElement.appendChild(svg);
  }
  return measurePathEl;
}

/** Outlined text / dense logos — avoid re-parsing & dense sampling every pointermove. */
export const HEAVY_PATH_D_CHARS = 12_000;

let measurePathDCache = '';
let measurePathRuleCache = '';

function syncMeasurePathD(el: SVGPathElement, d: string, fillRule?: string) {
  if (measurePathDCache !== d) {
    el.setAttribute('d', d);
    measurePathDCache = d;
  }
  if (fillRule != null) {
    const rule = fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
    if (measurePathRuleCache !== rule) {
      el.setAttribute('fill-rule', rule);
      measurePathRuleCache = rule;
    }
  }
}

/**
 * Whether a local-space point lies inside a path fill (respects `fill-rule`, incl. boolean holes).
 */
export function pathDContainsPoint(
  px: number,
  py: number,
  pathD: string,
  fillRule: string = 'nonzero'
): boolean {
  const d = String(pathD || '').trim();
  if (!d || typeof document === 'undefined') return false;
  // Prefer Canvas Path2D (cached) — no DOM CTM / createSVGPoint per probe.
  if (
    hitTestPath2DLocal(d, px, py, {
      fill: true,
      fillRule: fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
    })
  ) {
    return true;
  }
  try {
    const el = getMeasurePathEl();
    syncMeasurePathD(el, d, fillRule);
    if (typeof el.isPointInFill !== 'function') return false;
    const svg = el.ownerSVGElement;
    if (!svg?.createSVGPoint) return false;
    const pt = svg.createSVGPoint();
    pt.x = px;
    pt.y = py;
    return el.isPointInFill(pt);
  } catch {
    return false;
  }
}

/**
 * Min distance from a local-space point to an SVG path `d` (samples the stroke centerline).
 * Used so pen/pencil selection requires clicking near the ink — not the AABB.
 */
export function distPointToPathD(px: number, py: number, d: string): number {
  const pathD = String(d || '').trim();
  if (!pathD || typeof document === 'undefined') return Infinity;
  // Outlined text / multi-glyph paths: dense getPointAtLength walks freeze the main thread.
  if (pathD.length >= HEAVY_PATH_D_CHARS) return Infinity;
  try {
    const el = getMeasurePathEl();
    syncMeasurePathD(el, pathD);
    const len = el.getTotalLength();
    if (!(len > 0) || !Number.isFinite(len)) return Infinity;
    const step = Math.max(1.5, Math.min(6, len / 120));
    let min = Infinity;
    let prev = el.getPointAtLength(0);
    for (let t = step; t < len; t += step) {
      const p = el.getPointAtLength(t);
      min = Math.min(min, distPointToSegment(px, py, prev.x, prev.y, p.x, p.y));
      prev = p;
      if (min <= 0.5) return min;
    }
    const end = el.getPointAtLength(len);
    return Math.min(min, distPointToSegment(px, py, prev.x, prev.y, end.x, end.y));
  } catch {
    return Infinity;
  }
}

/** Resolve SVG.js wrapper or raw DOM element → Element. */
function asDomElement(el: any): Element | null {
  if (!el) return null;
  if (typeof el.nodeType === 'number' && el.nodeType === 1) return el as Element;
  if (el.node && typeof el.node.nodeType === 'number' && el.node.nodeType === 1) {
    return el.node as Element;
  }
  return null;
}

/**
 * Whether a local-space path stroke intersects a world-space AABB
 * (marquee / box select). Samples the centerline — not the path's own AABB.
 */
export function pathStrokeHitsSceneBox(
  pathD: string,
  nodeBox: { left: number; top: number; width: number; height: number },
  angleDeg: number,
  sceneBox: { left: number; top: number; width: number; height: number },
  pad = 2
): boolean {
  const d = String(pathD || '').trim();
  if (!d || typeof document === 'undefined') return false;
  const left = sceneBox.left - pad;
  const top = sceneBox.top - pad;
  const right = sceneBox.left + sceneBox.width + pad;
  const bottom = sceneBox.top + sceneBox.height + pad;
  const angle = Number(angleDeg) || 0;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = nodeBox.width / 2;
  const cy = nodeBox.height / 2;
  const toWorld = (lx: number, ly: number) => {
    const dx = lx - cx;
    const dy = ly - cy;
    return {
      x: nodeBox.left + cx + dx * cos - dy * sin,
      y: nodeBox.top + cy + dx * sin + dy * cos,
    };
  };
  const inBox = (x: number, y: number) => x >= left && x <= right && y >= top && y <= bottom;
  try {
    const el = getMeasurePathEl();
    el.setAttribute('d', d);
    const len = el.getTotalLength();
    if (!(len > 0) || !Number.isFinite(len)) return false;
    const step = Math.max(1.5, Math.min(8, len / 100));
    let prev = toWorld(el.getPointAtLength(0).x, el.getPointAtLength(0).y);
    if (inBox(prev.x, prev.y)) return true;
    for (let t = step; t <= len; t += step) {
      const lp = el.getPointAtLength(Math.min(t, len));
      const p = toWorld(lp.x, lp.y);
      if (inBox(p.x, p.y)) return true;
      // Segment crosses the rect (coarse: midpoint + endpoints already checked).
      const mx = (prev.x + p.x) / 2;
      const my = (prev.y + p.y) / 2;
      if (inBox(mx, my)) return true;
      prev = p;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Hit-test the rendered SVG node with browser geometry APIs.
 * Pen: stroke only. Pencil outline: fill (ink blob) and/or stroke.
 * Returns false when the element is missing — caller should fall back.
 */
export function hitTestSvgNodeAtClient(
  el: any,
  clientX: number,
  clientY: number,
  opts?: { mode?: 'stroke' | 'fill' | 'auto'; strokeHitWidth?: number }
): boolean {
  const root = asDomElement(el);
  if (!root || typeof document === 'undefined') return false;

  const geoms: SVGGeometryElement[] = [];
  const push = (n: Element | null | undefined) => {
    if (!n) return;
    const anyN = n as SVGGeometryElement;
    if (typeof anyN.isPointInStroke === 'function' || typeof anyN.isPointInFill === 'function') {
      geoms.push(anyN);
    }
  };
  push(root);
  root.querySelectorAll?.('path,line,polyline,polygon,circle,ellipse,rect').forEach((n) => push(n));

  const mode = opts?.mode || 'auto';
  const hitW = opts?.strokeHitWidth;

  for (const geom of geoms) {
    const svg = geom.ownerSVGElement;
    if (!svg) continue;
    const ctm = geom.getScreenCTM?.();
    if (!ctm) continue;
    let local: DOMPoint;
    try {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      local = pt.matrixTransform(ctm.inverse());
    } catch {
      continue;
    }

    try {
      const fill = String(geom.getAttribute('fill') || '').toLowerCase();
      // SVG default fill is black when the attribute is omitted — only skip explicit none.
      const skipFill = fill === 'none' || fill === 'transparent';

      if (mode === 'fill' || mode === 'auto') {
        if (!skipFill && typeof geom.isPointInFill === 'function' && geom.isPointInFill(local)) {
          return true;
        }
      }

      if (mode === 'stroke' || mode === 'auto') {
        if (typeof geom.isPointInStroke === 'function') {
          let prev: string | null = null;
          if (hitW != null && hitW > 0) {
            prev = geom.getAttribute('stroke-width');
            geom.setAttribute('stroke-width', String(hitW));
            // Some engines ignore stroke hit when stroke is none / transparent.
            const prevStroke = geom.getAttribute('stroke');
            if (!prevStroke || prevStroke === 'none') {
              geom.setAttribute('stroke', '#000');
              const hit = geom.isPointInStroke(local);
              if (prevStroke == null) geom.removeAttribute('stroke');
              else geom.setAttribute('stroke', prevStroke);
              if (prev != null) geom.setAttribute('stroke-width', prev);
              else geom.removeAttribute('stroke-width');
              if (hit) return true;
              continue;
            }
          }
          const hit = geom.isPointInStroke(local);
          if (hitW != null) {
            if (prev != null) geom.setAttribute('stroke-width', prev);
            else geom.removeAttribute('stroke-width');
          }
          if (hit) return true;
        }
      }
    } catch {
      /* try next geom */
    }
  }
  return false;
}

/** Local SVG path for an open arrow — geometry kernel SoT. */
export function arrowLocalPath(width: number, height: number, head = ARROW_HEAD) {
  return arrowBaselinePath(width, height, head);
}
