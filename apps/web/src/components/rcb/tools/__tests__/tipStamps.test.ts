import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildStampDabs,
  emptyStampLiveWalk,
  extendStampLiveWalk,
  findPencilBrush,
  isStampBrush,
  listPencilBrushes,
  outlinePathFromPoints,
  paintStampDabs,
  setCustomPencilBrushes,
  setOfficialPencilBrushes,
  STAMP_MAX_DABS_LIVE,
  STAMP_MAX_DABS,
} from '../pencilBrushes';

const TIPS_DIR = resolve(__dirname, '../../../../../public/brushes/tips');

describe('pencil tip stamps', () => {
  it('builtin tip stamps have public tip files; vector brushes are freehand', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const list = listPencilBrushes();
    expect(list.length).toBeGreaterThan(5);
    const vectors = list.filter((b) => b.kind === 'freehand');
    expect(vectors.map((b) => b.id)).toEqual([
      'vector-ink',
      'vector-even',
      'vector-calligraphy',
    ]);
    for (const v of vectors) {
      expect(isStampBrush(v.id)).toBe(false);
    }
    for (const b of list.filter((x) => x.kind === 'stamp')) {
      expect(b.stampSrc).toMatch(/^\/brushes\/tips\/.+\.png$/);
      expect(isStampBrush(b.id, b.stampSrc)).toBe(true);
      const file = String(b.stampSrc).replace('/brushes/tips/', '');
      expect(existsSync(resolve(TIPS_DIR, file)), `missing tip ${file}`).toBe(true);
    }
  });

  it('vector brushes build filled freehand outlines (not stamp)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    for (const id of ['vector-ink', 'vector-even', 'vector-calligraphy'] as const) {
      const brush = findPencilBrush(id);
      expect(brush.kind).toBe('freehand');
      expect(isStampBrush(brush.id, brush.stampSrc)).toBe(false);
      const d = outlinePathFromPoints(
        [
          { x: 0, y: 10, pressure: 0.4 },
          { x: 20, y: 8, pressure: 0.8 },
          { x: 40, y: 12, pressure: 0.5 },
          { x: 60, y: 9, pressure: 0.7 },
        ],
        8,
        id,
        { pressureEnabled: true }
      );
      expect(d.length).toBeGreaterThan(20);
      expect(d.startsWith('M') || d.startsWith('m')).toBe(true);
    }
  });

  it('vector hardness soft vs hard changes outline (pressure width)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const pts = [
      { x: 0, y: 10, pressure: 0.2 },
      { x: 30, y: 10, pressure: 0.95 },
      { x: 60, y: 10, pressure: 0.25 },
    ];
    const soft = outlinePathFromPoints(pts, 10, 'vector-ink', {
      pressureEnabled: true,
      hardness: 5,
    });
    const hard = outlinePathFromPoints(pts, 10, 'vector-ink', {
      pressureEnabled: true,
      hardness: 95,
    });
    expect(soft).not.toBe(hard);
    expect(soft.length).toBeGreaterThan(20);
    expect(hard.length).toBeGreaterThan(20);
  });

  it('buildStampDabs places overlapping tips (not sparse dots)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const brush = findPencilBrush('solid');
    const wavy = [];
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      wavy.push({
        x: 10 + t * 100,
        y: 14 + Math.sin(t * Math.PI * 2) * 6,
        pressure: 0.7,
      });
    }
    const straight = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 },
    ];
    for (const path of [straight, wavy]) {
      const dabs = buildStampDabs(path, brush, 10, {
        hardness: 80,
        pressureEnabled: true,
        maxDabs: 160,
      });
      expect(dabs.length).toBeGreaterThan(15);
      const mid = dabs[Math.floor(dabs.length / 2)];
      expect(mid.size).toBeGreaterThan(2);
      for (let i = 1; i < Math.min(dabs.length, 40); i += 1) {
        const d = Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y);
        expect(d).toBeLessThanOrEqual(mid.size * 0.2 + 0.5);
      }
    }
  });

  it('airbrush tip stamp path stays stamp (not freehand silhouette)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const brush = findPencilBrush('airbrush');
    expect(isStampBrush(brush.id, brush.stampSrc)).toBe(true);
    expect(brush.stampSrc).toContain('airbrush.png');
    const dabs = buildStampDabs(
      [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 40, y: 0, pressure: 0.5 },
      ],
      brush,
      8,
      { hardness: 80, maxDabs: STAMP_MAX_DABS_LIVE }
    );
    expect(dabs.length).toBeGreaterThan(5);
  });

  it('paintStampDabs draws each dab (single-canvas bake path)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const brush = findPencilBrush('solid');
    const dabs = buildStampDabs(
      [
        { x: 20, y: 20, pressure: 0.7 },
        { x: 80, y: 20, pressure: 0.7 },
      ],
      brush,
      12,
      { hardness: 80, maxDabs: 80 }
    );
    expect(dabs.length).toBeGreaterThan(5);

    const drawImage = vi.fn();
    const ctx = {
      imageSmoothingEnabled: false,
      globalAlpha: 1,
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    const tip = {} as CanvasImageSource;
    paintStampDabs(ctx, dabs, tip, 1);
    expect(drawImage).toHaveBeenCalledTimes(dabs.length);
    const first = drawImage.mock.calls[0];
    expect(first[0]).toBe(tip);
    expect(first[3]).toBeGreaterThan(0);
    expect(first[4]).toBeGreaterThan(0);
  });

  it('extendStampLiveWalk only adds new dabs (live incremental)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const brush = findPencilBrush('solid');
    const pts = [
      { x: 0, y: 0, pressure: 0.6 },
      { x: 40, y: 0, pressure: 0.6 },
    ];
    let walk = emptyStampLiveWalk();
    walk = extendStampLiveWalk(walk, pts, brush, 10, { hardness: 80, maxDabs: 200 });
    const n1 = walk.dabs.length;
    expect(n1).toBeGreaterThan(5);
    pts.push({ x: 80, y: 0, pressure: 0.6 });
    walk = extendStampLiveWalk(walk, pts, brush, 10, { hardness: 80, maxDabs: 200 });
    expect(walk.dabs.length).toBeGreaterThan(n1);
    expect(walk.dabs.length - n1).toBeGreaterThan(5);
  });

  it('stamp dab build cost for many strokes (soft budget)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const brush = findPencilBrush('solid');
    const pts = [];
    for (let i = 0; i <= 80; i += 1) {
      pts.push({ x: i * 2, y: Math.sin(i / 8) * 8, pressure: 0.6 });
    }
    const dabs1 = buildStampDabs(pts, brush, 8, { hardness: 80, maxDabs: STAMP_MAX_DABS });
    const cases = [1, 50, 200, 500];
    const rows: Array<{ strokes: number; dabsPer: number; totalDabs: number; ms: number }> = [];
    for (const strokes of cases) {
      for (let s = 0; s < strokes; s += 1) {
        buildStampDabs(pts, brush, 8, { hardness: 80, maxDabs: STAMP_MAX_DABS });
      }
      const t0 = performance.now();
      for (let s = 0; s < strokes; s += 1) {
        buildStampDabs(pts, brush, 8, { hardness: 80, maxDabs: STAMP_MAX_DABS });
      }
      const ms = performance.now() - t0;
      rows.push({
        strokes,
        dabsPer: dabs1.length,
        totalDabs: dabs1.length * strokes,
        ms: Math.round(ms * 100) / 100,
      });
    }
    // eslint-disable-next-line no-console
    console.log('[stamp-stroke-stress]', JSON.stringify(rows));
    expect(dabs1.length).toBeGreaterThan(10);
    expect(dabs1.length).toBeLessThanOrEqual(STAMP_MAX_DABS);
    const row500 = rows.find((r) => r.strokes === 500);
    expect(row500?.ms ?? 1e9).toBeLessThan(2500);
  });
});
