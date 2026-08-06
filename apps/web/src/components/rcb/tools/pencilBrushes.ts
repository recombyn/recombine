/**
 * Freehand pencil brushes (perfect-freehand) + optional stamp / custom tip brushes.
 */

import getStroke, { type StrokeOptions } from 'perfect-freehand';

export type PencilBrushId = string;

export type PencilBrushDef = {
  id: PencilBrushId;
  label: string;
  /** Size multiplier relative to UI stroke width. */
  sizeFactor: number;
  options: Omit<StrokeOptions, 'size'>;
  /** Simulate pressure from stroke speed (calligraphy-like). */
  simulatePressure?: boolean;
  /** freehand (default) | stamp (image tip along path). */
  kind?: 'freehand' | 'stamp';
  /** Data-URL / URL for stamp tip (custom upload or builtin stamp). */
  stampSrc?: string;
  /** Stamp spacing as a fraction of brush size (default 0.45). */
  spacingFactor?: number;
  /** User-uploaded brush. */
  custom?: boolean;
};

/** Legacy decorative stamp ids → treat as solid. */
const LEGACY_STAMP_IDS = new Set([
  'flower',
  'rose',
  'star',
  'heart',
  'sparkle',
  'leaf',
]);

const FREEHAND_DEFAULTS: Omit<StrokeOptions, 'size'> = {
  thinning: 0.05,
  smoothing: 0.45,
  streamline: 0.35,
  easing: (t) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
};

export const PENCIL_BRUSHES: PencilBrushDef[] = [
  {
    id: 'solid',
    label: '硬笔',
    sizeFactor: 1,
    options: { ...FREEHAND_DEFAULTS },
  },
  {
    id: 'calligraphy',
    label: '毛笔',
    sizeFactor: 1.35,
    simulatePressure: true,
    options: {
      thinning: 0.72,
      smoothing: 0.55,
      streamline: 0.42,
      easing: (t) => t * (2 - t),
      start: { taper: 28, cap: true },
      end: { taper: 72, cap: true },
    },
  },
  {
    id: 'marker',
    label: '马克笔',
    sizeFactor: 1.6,
    options: {
      thinning: 0.08,
      smoothing: 0.35,
      streamline: 0.25,
      easing: (t) => t,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },
  {
    id: 'soft',
    label: '软笔',
    sizeFactor: 1.25,
    simulatePressure: true,
    options: {
      thinning: 0.45,
      smoothing: 0.7,
      streamline: 0.65,
      easing: (t) => Math.sin((t * Math.PI) / 2),
      start: { taper: 16, cap: true },
      end: { taper: 40, cap: true },
    },
  },
  {
    id: 'fountain',
    label: '钢笔',
    sizeFactor: 0.95,
    simulatePressure: true,
    options: {
      thinning: 0.55,
      smoothing: 0.5,
      streamline: 0.4,
      easing: (t) => t,
      start: { taper: 8, cap: true },
      end: { taper: 56, cap: true },
    },
  },
  {
    id: 'brushpen',
    label: '签字笔',
    sizeFactor: 1.15,
    simulatePressure: true,
    options: {
      thinning: 0.58,
      smoothing: 0.48,
      streamline: 0.38,
      easing: (t) => t * t * (3 - 2 * t),
      start: { taper: 12, cap: true },
      end: { taper: 48, cap: true },
    },
  },
  {
    id: 'pencil-hb',
    label: '素描',
    sizeFactor: 0.85,
    simulatePressure: true,
    options: {
      thinning: 0.35,
      smoothing: 0.4,
      streamline: 0.3,
      easing: (t) => t,
      start: { taper: 4, cap: true },
      end: { taper: 20, cap: true },
    },
  },
  {
    id: 'chalk',
    label: '粉笔',
    sizeFactor: 1.45,
    simulatePressure: true,
    options: {
      thinning: 0.22,
      smoothing: 0.25,
      streamline: 0.2,
      easing: (t) => t,
      start: { taper: 6, cap: true },
      end: { taper: 14, cap: true },
    },
  },
  {
    id: 'charcoal',
    label: '炭笔',
    sizeFactor: 1.5,
    simulatePressure: true,
    options: {
      thinning: 0.4,
      smoothing: 0.3,
      streamline: 0.22,
      easing: (t) => Math.sqrt(t),
      start: { taper: 10, cap: true },
      end: { taper: 28, cap: true },
    },
  },
  {
    id: 'crayon',
    label: '蜡笔',
    sizeFactor: 1.55,
    options: {
      thinning: 0.12,
      smoothing: 0.28,
      streamline: 0.18,
      easing: (t) => t,
      start: { taper: 2, cap: true },
      end: { taper: 8, cap: true },
    },
  },
  {
    id: 'highlighter',
    label: '荧光笔',
    sizeFactor: 2.2,
    options: {
      thinning: 0.02,
      smoothing: 0.55,
      streamline: 0.45,
      easing: (t) => t,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },
  {
    id: 'ink',
    label: '墨水',
    sizeFactor: 1.2,
    simulatePressure: true,
    options: {
      thinning: 0.68,
      smoothing: 0.62,
      streamline: 0.5,
      easing: (t) => t * (2 - t),
      start: { taper: 20, cap: true },
      end: { taper: 90, cap: true },
    },
  },
  {
    id: 'watercolor',
    label: '水彩',
    sizeFactor: 1.8,
    simulatePressure: true,
    options: {
      thinning: 0.5,
      smoothing: 0.78,
      streamline: 0.7,
      easing: (t) => Math.sin((t * Math.PI) / 2),
      start: { taper: 24, cap: true },
      end: { taper: 60, cap: true },
    },
  },
  {
    id: 'dry',
    label: '枯笔',
    sizeFactor: 1.3,
    simulatePressure: true,
    options: {
      thinning: 0.85,
      smoothing: 0.2,
      streamline: 0.15,
      easing: (t) => t * t,
      start: { taper: 40, cap: true },
      end: { taper: 100, cap: true },
    },
  },
  {
    id: 'sketch',
    label: '速写',
    sizeFactor: 0.9,
    simulatePressure: true,
    options: {
      thinning: 0.48,
      smoothing: 0.32,
      streamline: 0.28,
      easing: (t) => t,
      start: { taper: 6, cap: true },
      end: { taper: 36, cap: true },
    },
  },
  {
    id: 'needle',
    label: '细针',
    sizeFactor: 0.55,
    options: {
      thinning: 0.1,
      smoothing: 0.55,
      streamline: 0.4,
      easing: (t) => t,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },
  {
    id: 'bold',
    label: '粗体',
    sizeFactor: 2.4,
    options: {
      thinning: 0.04,
      smoothing: 0.5,
      streamline: 0.4,
      easing: (t) => t,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
  },
  {
    id: 'airbrush',
    label: '喷枪',
    sizeFactor: 2.0,
    simulatePressure: true,
    options: {
      thinning: 0.3,
      smoothing: 0.85,
      streamline: 0.75,
      easing: (t) => 1 - (1 - t) * (1 - t),
      start: { taper: 30, cap: true },
      end: { taper: 50, cap: true },
    },
  },
];

/** Official brushes from design library (admin brush wheel). */
let officialBrushes: PencilBrushDef[] | null = null;

/** Runtime custom brushes (hydrated from localStorage). */
let customBrushes: PencilBrushDef[] = [];

export function getCustomPencilBrushes(): PencilBrushDef[] {
  return customBrushes.slice();
}

export function setCustomPencilBrushes(list: PencilBrushDef[]) {
  customBrushes = Array.isArray(list) ? list.filter((b) => b?.id && b.stampSrc) : [];
}

export function setOfficialPencilBrushes(list: PencilBrushDef[] | null) {
  if (!list?.length) {
    officialBrushes = null;
    return;
  }
  officialBrushes = list.filter((b) => b?.id);
}

export function listPencilBrushes(): PencilBrushDef[] {
  const base = officialBrushes?.length ? officialBrushes : PENCIL_BRUSHES;
  return [...base, ...customBrushes];
}

export function findPencilBrush(id: string | undefined | null): PencilBrushDef {
  const fallback = (officialBrushes && officialBrushes[0]) || PENCIL_BRUSHES[0];
  if (!id || LEGACY_STAMP_IDS.has(id)) return fallback;
  const custom = customBrushes.find((b) => b.id === id);
  if (custom) return custom;
  const official = officialBrushes?.find((b) => b.id === id);
  if (official) return official;
  return PENCIL_BRUSHES.find((b) => b.id === id) || fallback;
}

export function isStampBrush(id: string | undefined | null, stampSrc?: string | null) {
  if (stampSrc) return true;
  const b = findPencilBrush(id);
  return b.kind === 'stamp' && Boolean(b.stampSrc);
}

export type Pt = { x: number; y: number; pressure?: number };

export function brushSize(brush: PencilBrushDef, strokeWidth: number) {
  return Math.max(1, (Number(strokeWidth) || 1) * brush.sizeFactor);
}

export function stampSpacing(brush: PencilBrushDef, strokeWidth: number) {
  const size = brushSize(brush, strokeWidth);
  const factor = Number(brush.spacingFactor);
  const f = Number.isFinite(factor) && factor > 0 ? factor : 0.45;
  // Scene units — never floor at 2 (that left huge gaps under 1px grid / high zoom,
  // so stamp strokes looked like disconnected sausages).
  return Math.max(size * 0.12, size * f);
}

/** Convert input points to perfect-freehand input (real pressure or speed simulation). */
export function toStrokeInput(
  points: Pt[],
  brush: PencilBrushDef
): Array<[number, number, number]> {
  const hasReal = points.some(
    (p) => typeof p.pressure === 'number' && Number.isFinite(p.pressure) && p.pressure > 0
  );
  if (hasReal) {
    return points.map((p) => [
      p.x,
      p.y,
      Math.min(1, Math.max(0.05, Number(p.pressure) || 0.5)),
    ]);
  }
  if (!brush.simulatePressure) {
    return points.map((p) => [p.x, p.y, 0.5]);
  }
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < points.length; i += 1) {
    let pressure = 0.55;
    if (i > 0) {
      const a = points[i - 1];
      const b = points[i];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      pressure = Math.min(0.95, Math.max(0.12, 1 - dist / 36));
    }
    out.push([points[i].x, points[i].y, pressure]);
  }
  return out;
}

/** Outline polygon → SVG path `d` (quadratic midpoints, closed). */
export function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';
  const d: (string | number)[] = [];
  const first = stroke[0];
  d.push('M', first[0], first[1], 'Q');
  for (let i = 1; i < stroke.length; i += 1) {
    const [x0, y0] = stroke[i];
    const [x1, y1] = stroke[(i + 1) % stroke.length];
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  d.push('Z');
  return d.join(' ');
}

export type PencilStrokeDrawOpts = {
  /** Maps stroke-linecap onto perfect-freehand start/end caps. */
  linecap?: 'butt' | 'round' | 'square';
  /** Per-point pressure 0–1 (same length as points). Overrides speed simulation when set. */
  pressures?: number[];
  /** When false, force constant pressure (ignore brush simulatePressure + real pressure). */
  pressureEnabled?: boolean;
};

function extendPolylineEnds(points: Pt[], pad: number): Pt[] {
  if (points.length < 2 || pad <= 0) return points;
  const out = points.slice();
  const a0 = out[0];
  const a1 = out[1];
  const d0 = Math.hypot(a1.x - a0.x, a1.y - a0.y) || 1;
  out[0] = {
    x: a0.x - ((a1.x - a0.x) / d0) * pad,
    y: a0.y - ((a1.y - a0.y) / d0) * pad,
  };
  const b0 = out[out.length - 2];
  const b1 = out[out.length - 1];
  const d1 = Math.hypot(b1.x - b0.x, b1.y - b0.y) || 1;
  out[out.length - 1] = {
    x: b1.x + ((b1.x - b0.x) / d1) * pad,
    y: b1.y + ((b1.y - b0.y) / d1) * pad,
  };
  return out;
}

export function outlinePathFromPoints(
  points: Pt[],
  strokeWidth: number,
  brushId?: string | null,
  strokeOpts?: PencilStrokeDrawOpts
): string {
  if (points.length < 2) return '';
  const brush = findPencilBrush(brushId);
  // Stamp brushes still get a freehand fallback for bbox / simple preview.
  const size = brushSize(brush, strokeWidth);
  let pts: Pt[] = points.map((p, i) => {
    const pr = strokeOpts?.pressures?.[i];
    return pr != null && Number.isFinite(pr) ? { ...p, pressure: pr } : { ...p };
  });
  const options: Omit<StrokeOptions, 'size'> = {
    ...(brush.kind === 'stamp' ? FREEHAND_DEFAULTS : brush.options),
  };
  const cap = strokeOpts?.linecap;
  if (cap === 'butt') {
    options.start = { ...(options.start as object), taper: 0, cap: false };
    options.end = { ...(options.end as object), taper: 0, cap: false };
  } else if (cap === 'square') {
    options.start = { ...(options.start as object), taper: 0, cap: true };
    options.end = { ...(options.end as object), taper: 0, cap: true };
    pts = extendPolylineEnds(pts, size * 0.45);
  } else if (cap === 'round') {
    options.start = { ...(options.start as object), cap: true };
    options.end = { ...(options.end as object), cap: true };
  }
  const pressureOn = strokeOpts?.pressureEnabled !== false;
  const brushForInput: PencilBrushDef =
    brush.kind === 'stamp'
      ? { ...brush, simulatePressure: false, options: FREEHAND_DEFAULTS }
      : pressureOn
        ? { ...brush, options }
        : { ...brush, simulatePressure: false, options };
  if (!pressureOn) {
    pts = pts.map((p) => ({ x: p.x, y: p.y, pressure: 0.5 }));
  }
  const hasRealPressure =
    pressureOn &&
    (pts.some((p) => typeof p.pressure === 'number' && Number.isFinite(p.pressure) && p.pressure > 0) ||
      Boolean(strokeOpts?.pressures?.some((p) => typeof p === 'number' && p > 0)));
  const input = toStrokeInput(pts, brushForInput);
  // perfect-freehand defaults simulatePressure=true and IGNORES point pressures.
  // After erase we store pathPressure — must disable re-simulation or ink thickens
  // whenever point spacing changes.
  const outline = getStroke(input, {
    size,
    ...options,
    simulatePressure: hasRealPressure ? false : true,
    last: true,
  });
  return getSvgPathFromStroke(outline);
}

/** Split a polyline into dash / gap segments (dasharray like SVG: "8 4"). */
export function splitPolylineByDash(points: Pt[], dasharray: string): Pt[][] {
  const raw = dasharray
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (points.length < 2 || raw.length === 0) return [points];
  const pattern = raw.map((n) => Math.max(0.5, n));
  if (pattern.length % 2 === 1) pattern.push(pattern[pattern.length - 1]);

  const dashes: Pt[][] = [];
  let patternIdx = 0;
  let remaining = pattern[0];
  let drawing = true;
  let current: Pt[] = drawing ? [{ ...points[0] }] : [];

  const flush = () => {
    if (current.length >= 2) dashes.push(current);
    current = [];
  };

  for (let i = 1; i < points.length; i += 1) {
    let ax = points[i - 1].x;
    let ay = points[i - 1].y;
    const bx = points[i].x;
    const by = points[i].y;
    let left = Math.hypot(bx - ax, by - ay);
    if (left <= 1e-6) continue;
    while (left > 1e-6) {
      const take = Math.min(left, remaining);
      const full = Math.hypot(bx - ax, by - ay) || 1;
      const mx = ax + ((bx - ax) / full) * take;
      const my = ay + ((by - ay) / full) * take;
      if (drawing) {
        if (!current.length) current.push({ x: ax, y: ay });
        current.push({ x: mx, y: my });
      }
      ax = mx;
      ay = my;
      left -= take;
      remaining -= take;
      if (remaining <= 1e-6) {
        if (drawing) flush();
        patternIdx = (patternIdx + 1) % pattern.length;
        remaining = pattern[patternIdx];
        drawing = !drawing;
        if (drawing) current = [{ x: ax, y: ay }];
      }
    }
  }
  if (drawing) flush();
  return dashes.length ? dashes : [points];
}

/** Build freehand outline path(s); dashed styles return multiple closed outlines joined. */
export function pencilInkPathFromPoints(
  points: Pt[],
  strokeWidth: number,
  brushId?: string | null,
  strokeOpts?: PencilStrokeDrawOpts & { dasharray?: string }
): string {
  if (points.length < 2) return '';
  const dash = strokeOpts?.dasharray?.trim();
  if (!dash) {
    return outlinePathFromPoints(points, strokeWidth, brushId, strokeOpts);
  }
  const segs = splitPolylineByDash(points, dash);
  return segs
    .map((seg) => outlinePathFromPoints(seg, strokeWidth, brushId, strokeOpts))
    .filter(Boolean)
    .join(' ');
}

/** Polyline → SVG path `d` (baseline centerline). */
export function polylinePathD(points: Pt[]): string {
  if (points.length < 1) return '';
  return points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

/** Half-extent so the node bbox covers painted ink around the baseline. */
export function brushPad(brush: PencilBrushDef, strokeWidth: number) {
  const size = brushSize(brush, strokeWidth);
  if (brush.kind === 'stamp') return Math.max(size * 0.65, strokeWidth / 2);
  // Freehand outline can flare beyond size/2 (thinning / taper).
  return Math.max(size * 0.7, strokeWidth / 2);
}

/** Parse simple M/L path into points (pencil centerline). */
export function parseSimplePathPoints(d: string): Pt[] {
  const pts: Pt[] = [];
  const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    pts.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return pts;
}

/** Serialize / parse per-point pressure stored on pencil nodes. */
export function serializePathPressures(points: Pt[]): string | undefined {
  if (!points.some((p) => typeof p.pressure === 'number' && p.pressure > 0)) return undefined;
  return points
    .map((p) =>
      typeof p.pressure === 'number' && Number.isFinite(p.pressure)
        ? Math.min(1, Math.max(0.05, p.pressure)).toFixed(3)
        : '0.5'
    )
    .join(',');
}

export function parsePathPressures(raw: unknown, pointCount: number): number[] | undefined {
  if (raw == null || raw === '' || pointCount < 1) return undefined;
  const parts = String(raw)
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== pointCount) return undefined;
  return parts.map((p) => (Number.isFinite(p) ? Math.min(1, Math.max(0.05, p)) : 0.5));
}

/** Sample S-curve for brush list previews (viewBox 0 0 120 28). */
function buildBrushPreviewPoints(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const x = 6 + t * 108;
    const y = 14 + Math.sin(t * Math.PI * 2) * 7;
    // Fake a pressure ramp so preview shows thinning / taper differences.
    const pressure = 0.25 + 0.7 * Math.sin(t * Math.PI);
    pts.push({ x, y, pressure });
  }
  return pts;
}

export const BRUSH_PREVIEW_POINTS: Pt[] = buildBrushPreviewPoints();

export function brushPreviewPath(brush: PencilBrushDef, previewWidth = 10): string {
  return outlinePathFromPoints(BRUSH_PREVIEW_POINTS, previewWidth, brush.id, {
    pressureEnabled: true,
  });
}

/** Evenly space points along a polyline (always includes the endpoint). */
export function samplePolyline(points: Pt[], spacing: number): Pt[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];
  if (spacing <= 0) return [points[0], points[points.length - 1]];
  const out: Pt[] = [points[0]];
  let acc = 0;
  let next = spacing;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 1e-6) continue;
    while (acc + seg >= next) {
      const t = (next - acc) / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      next += spacing;
    }
    acc += seg;
  }
  const last = points[points.length - 1];
  const prev = out[out.length - 1];
  if (!prev || Math.hypot(last.x - prev.x, last.y - prev.y) > spacing * 0.2) {
    out.push(last);
  } else {
    out[out.length - 1] = last;
  }
  return out;
}

/**
 * EMA streamline for live pencil capture (brush.options.streamline).
 * `amount` 0 = raw, ~0.35–0.7 = smoother. Last point stays on the tip.
 */
export function streamlinePencilPoints(points: Pt[], amount: number): Pt[] {
  if (points.length < 2) return points.slice();
  const a = Math.min(0.92, Math.max(0, Number(amount) || 0));
  if (!(a > 0)) return points.map((p) => ({ ...p }));
  const out: Pt[] = [{ ...points[0] }];
  let px = points[0].x;
  let py = points[0].y;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    px = px + (p.x - px) * (1 - a);
    py = py + (p.y - py) * (1 - a);
    out.push({
      x: px,
      y: py,
      ...(p.pressure != null ? { pressure: p.pressure } : {}),
    });
  }
  const last = points[points.length - 1];
  out[out.length - 1] = {
    x: last.x,
    y: last.y,
    ...(last.pressure != null ? { pressure: last.pressure } : {}),
  };
  return out;
}

/** Min scene step between stored samples — scales with ink size, stays dense at high zoom. */
export function pencilSampleMinStep(strokeWidth: number, brush?: PencilBrushDef | null): number {
  const size = brush ? brushSize(brush, strokeWidth) : Math.max(1, strokeWidth);
  return Math.max(0.12, Math.min(0.4, size * 0.1));
}

export function stampSizeForBrush(brush: PencilBrushDef, strokeWidth: number) {
  return brushSize(brush, strokeWidth);
}

export function stampSpacingForBrush(brush: PencilBrushDef, strokeWidth: number) {
  return stampSpacing(brush, strokeWidth);
}

/** Build a custom stamp brush def from an uploaded tip image. */
export function makeCustomStampBrush(opts: {
  id?: string;
  label: string;
  stampSrc: string;
  sizeFactor?: number;
  spacingFactor?: number;
}): PencilBrushDef {
  const id =
    opts.id ||
    `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    label: opts.label || '自定义画笔',
    sizeFactor: opts.sizeFactor ?? 1.4,
    spacingFactor: opts.spacingFactor ?? 0.4,
    kind: 'stamp',
    stampSrc: opts.stampSrc,
    custom: true,
    options: { ...FREEHAND_DEFAULTS },
  };
}
