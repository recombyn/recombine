import type { RcbVec } from './types';

export type RcbBoxLike = {
  left?: number;
  top?: number;
  x?: number;
  y?: number;
  width: number;
  height: number;
};

export type RcbAlign =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center'
  | 'left-center'
  | 'right-center';

function boxOrigin(box: RcbBoxLike) {
  return {
    left: Number(box.left ?? box.x) || 0,
    top: Number(box.top ?? box.y) || 0,
    width: Math.max(0, Number(box.width) || 0),
    height: Math.max(0, Number(box.height) || 0),
  };
}

/**
 * Place a `size` element inside `box` (scene or stage pixels — same math).
 * Returns top-left of the placed element.
 *
 * @example
 * ```ts
 * import { rcbAlignInBox } from '@/components/rcb'
 * const { x, y } = rcbAlignInBox(imageBox, { width: 32, height: 32 }, 'center')
 * ```
 */
export function rcbAlignInBox(
  box: RcbBoxLike,
  size: { width: number; height: number },
  align: RcbAlign = 'center',
  pad = 0
): RcbVec {
  const b = boxOrigin(box);
  const w = Math.max(0, Number(size.width) || 0);
  const h = Math.max(0, Number(size.height) || 0);
  const p = Math.max(0, Number(pad) || 0);
  const innerL = b.left + p;
  const innerT = b.top + p;
  const innerR = b.left + b.width - p;
  const innerB = b.top + b.height - p;
  const innerW = Math.max(0, innerR - innerL);
  const innerH = Math.max(0, innerB - innerT);

  let x = innerL;
  let y = innerT;
  switch (align) {
    case 'center':
      x = innerL + (innerW - w) / 2;
      y = innerT + (innerH - h) / 2;
      break;
    case 'top-left':
      x = innerL;
      y = innerT;
      break;
    case 'top-right':
      x = innerR - w;
      y = innerT;
      break;
    case 'bottom-left':
      x = innerL;
      y = innerB - h;
      break;
    case 'bottom-right':
      x = innerR - w;
      y = innerB - h;
      break;
    case 'top-center':
      x = innerL + (innerW - w) / 2;
      y = innerT;
      break;
    case 'bottom-center':
      x = innerL + (innerW - w) / 2;
      y = innerB - h;
      break;
    case 'left-center':
      x = innerL;
      y = innerT + (innerH - h) / 2;
      break;
    case 'right-center':
      x = innerR - w;
      y = innerT + (innerH - h) / 2;
      break;
    default:
      break;
  }
  return { x, y };
}

/** Shorthand: center `size` inside `box`. */
export function rcbCenterInBox(
  box: RcbBoxLike,
  size: { width: number; height: number },
  pad = 0
): RcbVec {
  return rcbAlignInBox(box, size, 'center', pad);
}

/**
 * On-canvas size for an uploaded / pasted image.
 *
 * Scene units are zoom-independent, so a fixed pixel cap lands huge when the user
 * is zoomed out and postage-stamp small when zoomed in. Measure against the visible
 * viewport instead: keep the natural size while it already reads well, otherwise
 * scale so the image covers between `minRatio` and `maxRatio` of the screen.
 *
 * `viewport` is the on-screen stage size in CSS px; `zoom` the current camera zoom.
 */
export function rcbFitImageIntoViewport(
  natural: { width: number; height: number },
  viewport: { width: number; height: number },
  zoom: number,
  { minRatio = 0.25, maxRatio = 0.6 }: { minRatio?: number; maxRatio?: number } = {}
): { width: number; height: number } {
  const nw = Math.max(1, Number(natural.width) || 1);
  const nh = Math.max(1, Number(natural.height) || 1);
  const z = Math.max(0.05, Number(zoom) || 1);
  const vw = Math.max(1, (Number(viewport.width) || 1) / z);
  const vh = Math.max(1, (Number(viewport.height) || 1) / z);
  const contain = (ratio: number) => Math.min((vw * ratio) / nw, (vh * ratio) / nh);
  const scale = Math.min(contain(maxRatio), Math.max(1, contain(minRatio)));
  return {
    width: Math.max(1, Math.round(nw * scale)),
    height: Math.max(1, Math.round(nh * scale)),
  };
}

/**
 * Center a node-sized rect on a point (e.g. drop image centered on pointer).
 */
export function rcbCenterOnPoint(
  point: RcbVec,
  size: { width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const w = Math.max(1, Number(size.width) || 1);
  const h = Math.max(1, Number(size.height) || 1);
  return {
    left: point.x - w / 2,
    top: point.y - h / 2,
    width: w,
    height: h,
  };
}
