export type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Crop rect in image-local coords (origin = image top-left). */
export type CropRect = { x: number; y: number; w: number; h: number };

/** Expand frame: outer size + origin relative to image top-left (ox/oy ≤ 0). */
export type ExpandFrame = { w: number; h: number; ox: number; oy: number };

const MIN_CROP = 20;

export function calcCropMove(
  orig: CropRect,
  dx: number,
  dy: number,
  cw: number,
  ch: number
): CropRect {
  return {
    ...orig,
    x: Math.max(0, Math.min(orig.x + dx, cw - orig.w)),
    y: Math.max(0, Math.min(orig.y + dy, ch - orig.h)),
  };
}

export function calcCropEdgeResize(
  orig: CropRect,
  handle: 'n' | 's' | 'w' | 'e',
  dx: number,
  dy: number,
  cw: number,
  ch: number
): CropRect {
  const right = orig.x + orig.w;
  const bottom = orig.y + orig.h;
  if (handle === 'n') {
    const y = Math.max(0, Math.min(orig.y + dy, bottom - MIN_CROP));
    return { ...orig, y, h: bottom - y };
  }
  if (handle === 's') {
    const newBottom = Math.max(orig.y + MIN_CROP, Math.min(bottom + dy, ch));
    return { ...orig, h: newBottom - orig.y };
  }
  if (handle === 'w') {
    const x = Math.max(0, Math.min(orig.x + dx, right - MIN_CROP));
    return { ...orig, x, w: right - x };
  }
  const newRight = Math.max(orig.x + MIN_CROP, Math.min(right + dx, cw));
  return { ...orig, w: newRight - orig.x };
}

export function calcCropCornerResize(
  orig: CropRect,
  handle: 'nw' | 'ne' | 'sw' | 'se',
  dx: number,
  dy: number,
  cw: number,
  ch: number
): CropRect {
  const right = orig.x + orig.w;
  const bottom = orig.y + orig.h;
  const minScale = MIN_CROP / Math.min(orig.w, orig.h);

  if (handle === 'se') {
    const maxScale = Math.min((cw - orig.x) / orig.w, (ch - orig.y) / orig.h);
    const raw = Math.min((orig.w + dx) / orig.w, (orig.h + dy) / orig.h);
    const scale = Math.max(minScale, Math.min(raw, maxScale));
    return { x: orig.x, y: orig.y, w: orig.w * scale, h: orig.h * scale };
  }
  if (handle === 'sw') {
    const maxScale = Math.min(right / orig.w, (ch - orig.y) / orig.h);
    const raw = Math.min((orig.w - dx) / orig.w, (orig.h + dy) / orig.h);
    const scale = Math.max(minScale, Math.min(raw, maxScale));
    const w = orig.w * scale;
    return { x: right - w, y: orig.y, w, h: orig.h * scale };
  }
  if (handle === 'ne') {
    const maxScale = Math.min((cw - orig.x) / orig.w, bottom / orig.h);
    const raw = Math.min((orig.w + dx) / orig.w, (orig.h - dy) / orig.h);
    const scale = Math.max(minScale, Math.min(raw, maxScale));
    const h = orig.h * scale;
    return { x: orig.x, y: bottom - h, w: orig.w * scale, h };
  }
  const maxScale = Math.min(right / orig.w, bottom / orig.h);
  const raw = Math.min((orig.w - dx) / orig.w, (orig.h - dy) / orig.h);
  const scale = Math.max(minScale, Math.min(raw, maxScale));
  const w = orig.w * scale;
  const h = orig.h * scale;
  return { x: right - w, y: bottom - h, w, h };
}

export function calcExpandMove(
  orig: ExpandFrame,
  dx: number,
  dy: number,
  cw: number,
  ch: number
): ExpandFrame {
  const { w, h } = orig;
  return {
    w,
    h,
    ox: Math.min(0, Math.max(cw - w, orig.ox + dx)),
    oy: Math.min(0, Math.max(ch - h, orig.oy + dy)),
  };
}

export function calcExpandEdgeResize(
  orig: ExpandFrame,
  handle: 'n' | 's' | 'w' | 'e',
  dx: number,
  dy: number,
  cw: number,
  ch: number
): ExpandFrame {
  const { ox, oy, w, h } = orig;
  const right = ox + w;
  const bottom = oy + h;
  if (handle === 'n') {
    const newY = Math.min(0, oy + dy, bottom - ch);
    return { ox, oy: newY, w, h: bottom - newY };
  }
  if (handle === 's') {
    const newBottom = Math.max(ch, bottom + dy);
    return { ox, oy, w, h: newBottom - oy };
  }
  if (handle === 'w') {
    const newX = Math.min(0, ox + dx, right - cw);
    return { ox: newX, oy, w: right - newX, h };
  }
  const newRight = Math.max(cw, right + dx);
  return { ox, oy, w: newRight - ox, h };
}

export function calcExpandCornerResize(
  orig: ExpandFrame,
  handle: 'nw' | 'ne' | 'sw' | 'se',
  dx: number,
  dy: number,
  cw: number,
  ch: number
): ExpandFrame {
  const { ox, oy, w: w0, h: h0 } = orig;
  const right = ox + w0;
  const bottom = oy + h0;

  if (handle === 'se') {
    const raw = Math.min((w0 + dx) / w0, (h0 + dy) / h0);
    const minScale = Math.max((cw - ox) / w0, (ch - oy) / h0);
    const scale = Math.max(minScale, raw);
    return { ox, oy, w: w0 * scale, h: h0 * scale };
  }
  if (handle === 'sw') {
    const raw = Math.min((w0 - dx) / w0, (h0 + dy) / h0);
    const minScale = Math.max(right / w0, (ch - oy) / h0);
    const scale = Math.max(minScale, raw);
    const w = w0 * scale;
    return { ox: right - w, oy, w, h: h0 * scale };
  }
  if (handle === 'ne') {
    const raw = Math.min((w0 + dx) / w0, (h0 - dy) / h0);
    const minScale = Math.max((cw - ox) / w0, bottom / h0);
    const scale = Math.max(minScale, raw);
    const h = h0 * scale;
    return { ox, oy: bottom - h, w: w0 * scale, h };
  }
  const raw = Math.min((w0 - dx) / w0, (h0 - dy) / h0);
  const minScale = Math.max(right / w0, bottom / h0);
  const scale = Math.max(minScale, raw);
  const w = w0 * scale;
  const h = h0 * scale;
  return { ox: right - w, oy: bottom - h, w, h };
}

export const EXPAND_PAD = 40;

export function initialExpandFrame(cw: number, ch: number): ExpandFrame {
  const pad = EXPAND_PAD;
  return { w: cw + pad * 2, h: ch + pad * 2, ox: -pad, oy: -pad };
}

export function initialCropRect(cw: number, ch: number): CropRect {
  return { x: 0, y: 0, w: cw, h: ch };
}

/** Largest centered crop of aspect `rw:rh` that fits inside the image. */
export function cropRectForRatio(
  cw: number,
  ch: number,
  rw: number,
  rh: number
): CropRect {
  if (rw <= 0 || rh <= 0) return initialCropRect(cw, ch);
  const target = rw / rh;
  const img = cw / ch;
  if (img > target) {
    const h = ch;
    const w = Math.max(MIN_CROP, h * target);
    return { x: (cw - w) / 2, y: 0, w, h };
  }
  const w = cw;
  const h = Math.max(MIN_CROP, w / target);
  return { x: 0, y: (ch - h) / 2, w, h };
}

/** Smallest expand frame of aspect `rw:rh` that still contains the image. */
export function expandFrameForRatio(
  cw: number,
  ch: number,
  rw: number,
  rh: number
): ExpandFrame {
  if (rw <= 0 || rh <= 0) return initialExpandFrame(cw, ch);
  const target = rw / rh;
  const img = cw / ch;
  if (img > target) {
    const w = cw;
    const h = Math.max(ch, w / target);
    return { w, h, ox: 0, oy: (ch - h) / 2 };
  }
  const h = ch;
  const w = Math.max(cw, h * target);
  return { w, h, ox: (cw - w) / 2, oy: 0 };
}
