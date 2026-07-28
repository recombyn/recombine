import { describe, expect, it } from 'vitest';
import { RcbSpatialIndex, boxesIntersect } from '../spatialIndex';

describe('RcbSpatialIndex', () => {
  it('finds items by point and rect', () => {
    const idx = new RcbSpatialIndex(100);
    idx.upsert({ id: 'a', minX: 0, minY: 0, maxX: 50, maxY: 50 });
    idx.upsert({ id: 'b', minX: 200, minY: 200, maxX: 250, maxY: 250 });
    expect(idx.searchPoint(25, 25).map((x) => x.id)).toEqual(['a']);
    expect(idx.searchPoint(210, 210).map((x) => x.id)).toEqual(['b']);
    expect(idx.search(0, 0, 300, 300).map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(idx.search(180, 180, 190, 190)).toEqual([]);
  });

  it('upsert replaces bounds', () => {
    const idx = new RcbSpatialIndex(100);
    idx.upsert({ id: 'a', minX: 0, minY: 0, maxX: 10, maxY: 10 });
    idx.upsert({ id: 'a', minX: 500, minY: 500, maxX: 510, maxY: 510 });
    expect(idx.searchPoint(5, 5)).toEqual([]);
    expect(idx.searchPoint(505, 505).map((x) => x.id)).toEqual(['a']);
    expect(idx.size).toBe(1);
  });

  it('boxesIntersect', () => {
    expect(
      boxesIntersect(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 5, minY: 5, maxX: 15, maxY: 15 }
      )
    ).toBe(true);
    expect(
      boxesIntersect(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 11, minY: 0, maxX: 20, maxY: 10 }
      )
    ).toBe(false);
  });
});
