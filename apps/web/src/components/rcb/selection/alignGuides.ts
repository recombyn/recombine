import { applyAspectToHandle } from './resizeGeometry';
import type { ResizeHandle, SceneBox } from './resizeGeometry';

export type { ResizeHandle, SceneBox };

/** Pixel snap step. Override via document.gridSize. */
export const DEFAULT_GRID_SIZE = 1;

export function getDocumentGridSize(doc: unknown): number {
  const n = Number((doc as { gridSize?: unknown } | null)?.gridSize);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRID_SIZE;
}

/**
 * Min `zoom × dpr` before the 1px cell grid appears.
 * At 100–200% a 1px lattice is dense, noisy, and costly — wait until ~400%+.
 */
export const PIXEL_GRID_MIN_ZOOM = 4;

/**
 * Auto pixel-grid visibility (no manual toggle).
 * Requires each scene pixel to cover ≥ {@link PIXEL_GRID_MIN_ZOOM} device pixels.
 */
export function shouldShowPixelGrid(zoom: number, dpr = 1): boolean {
  const z = Math.max(0, Number(zoom) || 0);
  const d = dpr > 0 ? dpr : 1;
  return z * d >= PIXEL_GRID_MIN_ZOOM - 1e-6;
}

export function snapCoordToGrid(value: number, gridSize: number): number {
  if (!(gridSize > 0) || !Number.isFinite(value)) return value;
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap all four edges to the grid (draw / place).
 * Collapsed edges expand by one cell so a soft drag still yields a grid tile.
 */
export function snapBoxEdgesToGrid(box: SceneBox, gridSize: number, minCells = 1): SceneBox {
  if (!(gridSize > 0)) return box;
  let left = snapCoordToGrid(box.left, gridSize);
  let top = snapCoordToGrid(box.top, gridSize);
  let right = snapCoordToGrid(box.left + box.width, gridSize);
  let bottom = snapCoordToGrid(box.top + box.height, gridSize);
  const min = Math.max(1, minCells) * gridSize;
  if (right - left < min) {
    right = left + min;
  }
  if (bottom - top < min) {
    bottom = top + min;
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** Snap box origin to grid; size unchanged (move / translate). */
export function snapBoxToGrid(box: SceneBox, gridSize: number): SceneBox {
  if (!(gridSize > 0)) return box;
  return {
    ...box,
    left: snapCoordToGrid(box.left, gridSize),
    top: snapCoordToGrid(box.top, gridSize),
  };
}

/**
 * Snap edges moved by `handle` onto the grid (resize).
 * Fixed edges stay put; moving edges round to gridSize.
 * When `lockAspect`, re-apply aspect after edge snap so ratio stays intact.
 */
export function snapResizeToGrid(
  resized: SceneBox,
  handle: ResizeHandle,
  gridSize: number,
  min = 1,
  opts?: { lockAspect?: boolean; aspectRatio?: number }
): SceneBox {
  if (!(gridSize > 0)) return resized;
  const moveL = handle === 'w' || handle === 'nw' || handle === 'sw';
  const moveR = handle === 'e' || handle === 'ne' || handle === 'se';
  const moveT = handle === 'n' || handle === 'nw' || handle === 'ne';
  const moveB = handle === 's' || handle === 'sw' || handle === 'se';

  let left = resized.left;
  let top = resized.top;
  let right = resized.left + resized.width;
  let bottom = resized.top + resized.height;

  if (moveL) left = snapCoordToGrid(left, gridSize);
  if (moveR) right = snapCoordToGrid(right, gridSize);
  if (moveT) top = snapCoordToGrid(top, gridSize);
  if (moveB) bottom = snapCoordToGrid(bottom, gridSize);

  let width = right - left;
  let height = bottom - top;
  if (width < min) {
    if (moveL && !moveR) left = right - min;
    else right = left + min;
    width = min;
  }
  if (height < min) {
    if (moveT && !moveB) top = bottom - min;
    else bottom = top + min;
    height = min;
  }

  let box: SceneBox = { left, top, width, height };
  if (opts?.lockAspect) {
    const ratio =
      opts.aspectRatio && Number.isFinite(opts.aspectRatio) && opts.aspectRatio > 0
        ? opts.aspectRatio
        : resized.width / Math.max(1, resized.height);
    box = applyAspectToHandle(handle, box.left, box.top, box.width, box.height, ratio);
    right = box.left + box.width;
    bottom = box.top + box.height;
    left = box.left;
    top = box.top;
    width = box.width;
    height = box.height;
    if (width < min) {
      if (moveL && !moveR) left = right - min;
      else right = left + min;
      width = min;
    }
    if (height < min) {
      if (moveT && !moveB) top = bottom - min;
      else bottom = top + min;
      height = min;
    }
    box = { left, top, width, height };
  }
  return box;
}
