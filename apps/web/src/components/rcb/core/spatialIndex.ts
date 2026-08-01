/**
 * Uniform-grid spatial index for scene AABBs (culling + hit candidate filter).
 * Dependency-free for the rcb core.
 */

import { nodeLeftTop } from '../scene/paint/sceneToSvg';

export type RcbSpatialItem = {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function cellKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

export class RcbSpatialIndex {
  private readonly cellSize: number;
  private readonly cells = new Map<string, RcbSpatialItem[]>();
  private readonly byId = new Map<string, RcbSpatialItem>();

  constructor(cellSize = 256) {
    this.cellSize = Math.max(32, cellSize);
  }

  get size() {
    return this.byId.size;
  }

  clear() {
    this.cells.clear();
    this.byId.clear();
  }

  upsert(item: RcbSpatialItem) {
    if (this.byId.has(item.id)) this.remove(item.id);
    this.byId.set(item.id, item);
    for (const key of this.keysFor(item)) {
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(item);
      else this.cells.set(key, [item]);
    }
  }

  remove(id: string) {
    const prev = this.byId.get(id);
    if (!prev) return;
    this.byId.delete(id);
    for (const key of this.keysFor(prev)) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      const next = bucket.filter((x) => x.id !== id);
      if (next.length) this.cells.set(key, next);
      else this.cells.delete(key);
    }
  }

  /** All items whose AABB intersects the query rect. */
  search(minX: number, minY: number, maxX: number, maxY: number): RcbSpatialItem[] {
    const out: RcbSpatialItem[] = [];
    const seen = new Set<string>();
    const x0 = Math.floor(minX / this.cellSize);
    const y0 = Math.floor(minY / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const y1 = Math.floor(maxY / this.cellSize);
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const bucket = this.cells.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) {
          if (seen.has(item.id)) continue;
          if (
            item.maxX < minX ||
            item.minX > maxX ||
            item.maxY < minY ||
            item.minY > maxY
          ) {
            continue;
          }
          seen.add(item.id);
          out.push(item);
        }
      }
    }
    return out;
  }

  searchPoint(x: number, y: number, pad = 0): RcbSpatialItem[] {
    return this.search(x - pad, y - pad, x + pad, y + pad);
  }

  private keysFor(item: RcbSpatialItem): string[] {
    const x0 = Math.floor(item.minX / this.cellSize);
    const y0 = Math.floor(item.minY / this.cellSize);
    const x1 = Math.floor(item.maxX / this.cellSize);
    const y1 = Math.floor(item.maxY / this.cellSize);
    const keys: string[] = [];
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        keys.push(cellKey(cx, cy));
      }
    }
    return keys;
  }
}

export function boxesIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/** Axis AABB in scene space (rotation-expanded). Optional pad for stroke / hit slack. */
export function nodeSceneAabb(
  document: any,
  nodeId: string,
  pad = 0
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const node = document?.deltaSetLike?.[nodeId];
  if (!node) return null;
  const { left: x0, top: y0 } = nodeLeftTop(document, node);
  const w = Math.max(1, Number(node.width) || 1);
  const h = Math.max(1, Number(node.height) || 1);
  const angle = Number(node.attrs?.angle) || 0;
  let minX = x0;
  let minY = y0;
  let maxX = x0 + w;
  let maxY = y0 + h;
  if (Math.abs(angle) > 0.5) {
    const rad = (Math.abs(angle) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const bw = w * cos + h * sin;
    const bh = w * sin + h * cos;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    minX = cx - bw / 2;
    minY = cy - bh / 2;
    maxX = cx + bw / 2;
    maxY = cy + bh / 2;
  }
  const stroke = Math.max(
    0,
    Number(node.attrs?.borderWidth ?? node.attrs?.['border-width'] ?? node.attrs?.strokeWidth ?? 0) ||
      0
  );
  const expand = pad + stroke;
  return {
    minX: minX - expand,
    minY: minY - expand,
    maxX: maxX + expand,
    maxY: maxY + expand,
  };
}

