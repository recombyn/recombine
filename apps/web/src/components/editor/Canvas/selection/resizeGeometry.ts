export type SceneBox = { left: number; top: number; width: number; height: number };
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const DEFAULT_MIN = 8;

/** Keep the opposite edge/corner fixed when clamping to min size (prevents bounce). */
function clampBoxAnchored(
  handle: ResizeHandle,
  left: number,
  top: number,
  width: number,
  height: number,
  min = DEFAULT_MIN
): SceneBox {
  const right = left + width;
  const bottom = top + height;
  let nl = left;
  let nt = top;
  let nw = width;
  let nh = height;

  if (nw < min) {
    if (handle === 'w' || handle === 'nw' || handle === 'sw') nl = right - min;
    nw = min;
  }
  if (nh < min) {
    if (handle === 'n' || handle === 'nw' || handle === 'ne') nt = bottom - min;
    nh = min;
  }

  return { left: nl, top: nt, width: nw, height: nh };
}

function applyAspectToHandle(
  handle: ResizeHandle,
  left: number,
  top: number,
  width: number,
  height: number,
  ratio: number
): SceneBox {
  const r = Math.max(1e-4, ratio);
  const right = left + width;
  const bottom = top + height;

  switch (handle) {
    case 'e': {
      const nw = width;
      const nh = Math.max(DEFAULT_MIN, nw / r);
      return { left, top, width: nw, height: nh };
    }
    case 'w': {
      const nw = width;
      const nh = Math.max(DEFAULT_MIN, nw / r);
      return { left: right - nw, top, width: nw, height: nh };
    }
    case 's': {
      const nh = height;
      const nw = Math.max(DEFAULT_MIN, nh * r);
      return { left, top, width: nw, height: nh };
    }
    case 'n': {
      const nh = height;
      const nw = Math.max(DEFAULT_MIN, nh * r);
      return { left, top: bottom - nh, width: nw, height: nh };
    }
    case 'se': {
      const s = Math.max(width / r, height);
      const nw = Math.max(DEFAULT_MIN, s * r);
      const nh = Math.max(DEFAULT_MIN, s);
      return { left, top, width: nw, height: nh };
    }
    case 'sw': {
      const s = Math.max(width / r, height);
      const nw = Math.max(DEFAULT_MIN, s * r);
      const nh = Math.max(DEFAULT_MIN, s);
      return { left: right - nw, top, width: nw, height: nh };
    }
    case 'ne': {
      const s = Math.max(width / r, height);
      const nw = Math.max(DEFAULT_MIN, s * r);
      const nh = Math.max(DEFAULT_MIN, s);
      return { left, top: bottom - nh, width: nw, height: nh };
    }
    case 'nw': {
      const s = Math.max(width / r, height);
      const nw = Math.max(DEFAULT_MIN, s * r);
      const nh = Math.max(DEFAULT_MIN, s);
      return { left: right - nw, top: bottom - nh, width: nw, height: nh };
    }
    default:
      return { left, top, width, height };
  }
}

export function resizeFromHandle(
  union: SceneBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  angleDeg: number,
  opts?: { lockAspect?: boolean; aspectRatio?: number; min?: number }
): SceneBox {
  const min = opts?.min ?? DEFAULT_MIN;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ldx = dx * cos + dy * sin;
  const ldy = -dx * sin + dy * cos;

  let { left, top, width, height } = union;

  switch (handle) {
    case 'e':
      width += ldx;
      break;
    case 'w':
      left += ldx;
      width -= ldx;
      break;
    case 's':
      height += ldy;
      break;
    case 'n':
      top += ldy;
      height -= ldy;
      break;
    case 'se':
      width += ldx;
      height += ldy;
      break;
    case 'sw':
      left += ldx;
      width -= ldx;
      height += ldy;
      break;
    case 'ne':
      top += ldy;
      width += ldx;
      height -= ldy;
      break;
    case 'nw':
      left += ldx;
      top += ldy;
      width -= ldx;
      height -= ldy;
      break;
    default:
      return union;
  }

  let box = clampBoxAnchored(handle, left, top, width, height, min);

  if (opts?.lockAspect) {
    const ratio =
      opts.aspectRatio && Number.isFinite(opts.aspectRatio) && opts.aspectRatio > 0
        ? opts.aspectRatio
        : union.width / Math.max(1, union.height);
    box = applyAspectToHandle(handle, box.left, box.top, box.width, box.height, ratio);
    box = clampBoxAnchored(handle, box.left, box.top, box.width, box.height, min);
  }

  return box;
}

export function sizeFromAspectPreset(
  box: SceneBox,
  ratioW: number,
  ratioH: number,
  min = DEFAULT_MIN
): { width: number; height: number } {
  const r = Math.max(1e-4, ratioW / ratioH);
  const width = Math.max(min, Math.round(box.width));
  const height = Math.max(min, Math.round(width / r));
  return { width, height };
}

export function matchAspectPresetKey(
  width: number,
  height: number,
  presets: Array<{ id: string; w: number; h: number }>
): string {
  for (const p of presets) {
    if (p.id === 'original' || p.w <= 0 || p.h <= 0) continue;
    const r = width / Math.max(1, height);
    if (Math.abs(r - p.w / p.h) < 0.02) return p.id;
  }
  return 'original';
}

/** Scale child boxes so the group maps from `from` → `to` (same top-left origin mapping). */
export function scaleBoxesToUnion(
  origins: SceneBox[],
  from: SceneBox,
  to: SceneBox
): SceneBox[] {
  const sx = to.width / Math.max(1e-4, from.width);
  const sy = to.height / Math.max(1e-4, from.height);
  return origins.map((o) => ({
    left: to.left + (o.left - from.left) * sx,
    top: to.top + (o.top - from.top) * sy,
    width: Math.max(1, o.width * sx),
    height: Math.max(1, o.height * sy),
  }));
}

/** Rotate box centers around a point; sizes unchanged. Returns new boxes. */
export function rotateBoxesAround(
  origins: SceneBox[],
  center: { x: number; y: number },
  deltaDeg: number
): SceneBox[] {
  const rad = (deltaDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return origins.map((o) => {
    const ocx = o.left + o.width / 2;
    const ocy = o.top + o.height / 2;
    const dx = ocx - center.x;
    const dy = ocy - center.y;
    const nx = center.x + dx * cos - dy * sin;
    const ny = center.y + dx * sin + dy * cos;
    return {
      left: nx - o.width / 2,
      top: ny - o.height / 2,
      width: o.width,
      height: o.height,
    };
  });
}

export function unionOfBoxes(boxes: SceneBox[]): SceneBox | null {
  if (!boxes.length) return null;
  let minL = boxes[0].left;
  let minT = boxes[0].top;
  let maxR = boxes[0].left + boxes[0].width;
  let maxB = boxes[0].top + boxes[0].height;
  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i];
    minL = Math.min(minL, b.left);
    minT = Math.min(minT, b.top);
    maxR = Math.max(maxR, b.left + b.width);
    maxB = Math.max(maxB, b.top + b.height);
  }
  return { left: minL, top: minT, width: Math.max(1, maxR - minL), height: Math.max(1, maxB - minT) };
}
