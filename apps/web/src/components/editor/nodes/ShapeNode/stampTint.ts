/** Colorize stamp tips (use alpha as mask, fill with stroke color). */

const imageCache = new Map<string, HTMLImageElement>();
const tintCache = new Map<string, string>();

function cacheKey(src: string, color: string) {
  // Full src — data-URL prefixes are identical across PNGs; slice would collide.
  return `${src}\0${color}`;
}

export const STAMP_TINT_READY_EVENT = 'recombine-stamp-tint-ready';

function notifyTintReady() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STAMP_TINT_READY_EVENT));
}

export function preloadStampSrc(src: string) {
  if (!src || imageCache.has(src)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  imageCache.set(src, img);
}

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  const c = String(color || '#333333').trim();
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    const hex =
      c.length === 4
        ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
        : c;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
      a: 1,
    };
  }
  const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] != null ? Number(m[4]) : 1,
    };
  }
  return { r: 51, g: 51, b: 51, a: 1 };
}

function tintLoadedImage(img: HTMLImageElement, color: string): string | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const canvas = document.createElement('canvas');
  const max = 128;
  const scale = Math.min(1, max / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const { r, g, b, a: ca } = parseColor(color);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    const luma = (data[i] + data[i + 1] + data[i + 2]) / (255 * 3);
    const coverage = alpha * (1 - luma * 0.15);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.round(Math.min(255, coverage * ca * 255));
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Sync tinted stamp data-URL when the tip image is already loaded;
 * otherwise kick off a load and return the original src for now.
 * Fires STAMP_TINT_READY_EVENT once tint is cached so the canvas can refresh.
 */
export function getTintedStampSrc(src: string, color: string): string {
  if (!src) return src;
  const key = cacheKey(src, color);
  const hit = tintCache.get(key);
  if (hit) return hit;

  let img = imageCache.get(src);
  if (!img) {
    preloadStampSrc(src);
    img = imageCache.get(src);
  }
  if (img && img.complete && (img.naturalWidth || img.width)) {
    const tinted = tintLoadedImage(img, color);
    if (tinted) {
      tintCache.set(key, tinted);
      return tinted;
    }
  } else if (img) {
    img.addEventListener(
      'load',
      () => {
        const tinted = tintLoadedImage(img!, color);
        if (tinted) {
          tintCache.set(key, tinted);
          notifyTintReady();
        }
      },
      { once: true }
    );
  }
  return src;
}
