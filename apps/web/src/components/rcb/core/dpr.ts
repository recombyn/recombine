/**
 * Device-pixel helpers.
 * Browser zoom changes `window.devicePixelRatio`; we track it and align sizes
 * so CSS transforms don't drift by a subpixel.
 */

/** Greatest common divisor. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Smallest integer `m` such that `dpr * m` is (nearly) an integer.
 * Typical: dpr 2 → 1, 2.5 → 2, 2.25 → 4, 0.9 → 10.
 *
 * Important: use Math.round (not floor) — at 90% zoom Chrome reports
 * `0.899999976` which floor→0.89→multiple 100 (useless).
 */
export function nearestDprMultiple(dpr: number): number {
  const rounded = Math.round(dpr * 100) / 100;
  const decimal = String(rounded).split('.')[1];
  if (!decimal) return 1;
  const denominator = 10 ** decimal.length;
  const numerator = parseInt(decimal, 10);
  return denominator / gcd(numerator, denominator);
}

/** Round CSS transform scalars (`toDomPrecision`). */
export function toDomPrecision(v: number) {
  return Math.round(v * 1e4) / 1e4;
}

/**
 * Snap a CSS-pixel value onto the device-pixel grid.
 * At dpr=0.9: rounds so `css * dpr` is an integer.
 */
export function snapCssToDevicePixel(cssPx: number, dpr: number): number {
  const d = dpr > 0 ? dpr : 1;
  return Math.round(cssPx * d) / d;
}

/**
 * True when browser zoom makes dpr "messy" (not ~1/2/3…).
 * Integer scene coords then map to fractional device pixels → AA seams.
 */
export function isFractionalDpr(dpr: number): boolean {
  const nearest = Math.round(dpr);
  return Math.abs(dpr - nearest) > 0.02;
}

/**
 * Snap a scene coordinate so that after `screen = scene*zoom + cam` (cam already
 * device-snapped) the result lands on an integer device pixel:
 *   round(scene * zoom * dpr) / (zoom * dpr)
 */
export function snapSceneToDeviceGrid(scene: number, zoom: number, dpr: number): number {
  const z = Math.max(0.05, zoom || 1);
  const d = dpr > 0 ? dpr : 1;
  const scale = z * d;
  if (!(scale > 0) || !Number.isFinite(scene)) return scene;
  return Math.round(scene * scale) / scale;
}

/**
 * Snap a scene AABB so every edge shares the device grid (flush neighbors stay flush).
 */
export function snapSceneBoxToDeviceGrid(
  box: { left: number; top: number; width: number; height: number },
  zoom: number,
  dpr: number
): { left: number; top: number; width: number; height: number; dx: number; dy: number; sx: number; sy: number } {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const left = snapSceneToDeviceGrid(box.left, zoom, dpr);
  const top = snapSceneToDeviceGrid(box.top, zoom, dpr);
  const r = snapSceneToDeviceGrid(right, zoom, dpr);
  const b = snapSceneToDeviceGrid(bottom, zoom, dpr);
  const width = Math.max(1 / Math.max(0.05, zoom * dpr), r - left);
  const height = Math.max(1 / Math.max(0.05, zoom * dpr), b - top);
  const sx = box.width > 0 ? width / box.width : 1;
  const sy = box.height > 0 ? height / box.height : 1;
  return {
    left,
    top,
    width,
    height,
    dx: left - box.left,
    dy: top - box.top,
    sx,
    sy,
  };
}

/**
 * Round a length up to the nearest multiple of `dprMultiple`
 * so `length * devicePixelRatio` stays integer-aligned under browser zoom.
 */
export function alignLengthToDpr(length: number, dprMultiple: number): number {
  const m = Math.max(1, dprMultiple);
  const rem = length % m;
  const aligned = rem === 0 ? length : length + (m - rem);
  return Math.max(aligned, m);
}

export function readDevicePixelRatio(win: Window = window): number {
  const n = Number(win.devicePixelRatio);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Subscribe to browser zoom / resolution changes via matchMedia
 * (MDN: monitoring devicePixelRatio).
 * Returns an unsubscribe function.
 */
export function subscribeDevicePixelRatio(
  onChange: (dpr: number) => void,
  win: Window = window
): () => void {
  if (typeof win.matchMedia !== 'function') {
    onChange(readDevicePixelRatio(win));
    return () => undefined;
  }

  let remove: (() => void) | null = null;

  const update = () => {
    remove?.();
    const dpr = readDevicePixelRatio(win);
    onChange(dpr);
    const mq = win.matchMedia(`(resolution: ${dpr}dppx)`);
    const safariCb = (ev: MediaQueryListEvent | Event) => {
      if ((ev as MediaQueryListEvent).type === 'change' || (ev as MediaQueryListEvent).matches != null) {
        update();
      }
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      remove = () => mq.removeEventListener('change', update);
    } else {
      (mq as MediaQueryList & { addListener: (cb: (ev: MediaQueryListEvent) => void) => void }).addListener(
        safariCb as (ev: MediaQueryListEvent) => void
      );
      remove = () =>
        (
          mq as MediaQueryList & { removeListener: (cb: (ev: MediaQueryListEvent) => void) => void }
        ).removeListener(safariCb as (ev: MediaQueryListEvent) => void);
    }
  };

  update();
  return () => remove?.();
}
