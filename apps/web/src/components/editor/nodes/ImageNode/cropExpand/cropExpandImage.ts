import type { CropRect, ExpandFrame } from './cropExpandMath';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('empty image src'));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/** Crop display-space rect → natural pixels (object-fit: fill / stretch to node). */
export async function cropImageToDataUrl(
  src: string,
  nodeW: number,
  nodeH: number,
  rect: CropRect
): Promise<string> {
  const img = await loadImage(src);
  const nw = Math.max(1, img.naturalWidth || img.width || 1);
  const nh = Math.max(1, img.naturalHeight || img.height || 1);
  const sx = (rect.x / Math.max(1, nodeW)) * nw;
  const sy = (rect.y / Math.max(1, nodeH)) * nh;
  const sw = Math.max(1, (rect.w / Math.max(1, nodeW)) * nw);
  const sh = Math.max(1, (rect.h / Math.max(1, nodeH)) * nh);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Build expanded bitmap: fill margin, draw source image into the hole. */
export async function expandImageToDataUrl(
  src: string,
  nodeW: number,
  nodeH: number,
  frame: ExpandFrame,
  fill = '#e8e8e8'
): Promise<string> {
  const img = await loadImage(src);
  const outW = Math.max(1, Math.round(frame.w));
  const outH = Math.max(1, Math.round(frame.h));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const dx = Math.round(-frame.ox);
  const dy = Math.round(-frame.oy);
  ctx.drawImage(img, dx, dy, Math.round(nodeW), Math.round(nodeH));
  return canvas.toDataURL('image/png');
}
