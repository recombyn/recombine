import { describe, expect, it } from 'vitest';
import {
  arrowBaselinePath,
  getShapeBaseline,
  lineBaselinePath,
  PathBuilder,
} from '@/components/rcb/core/geometry';

describe('PathBuilder', () => {
  it('builds a closed rect', () => {
    const d = new PathBuilder()
      .moveTo(0, 0)
      .lineTo(10, 0)
      .lineTo(10, 5)
      .lineTo(0, 5)
      .close()
      .toD();
    expect(d).toContain('M 0 0');
    expect(d).toContain('Z');
  });

  it('builds an ellipse', () => {
    const d = PathBuilder.ellipse(100, 50).toD();
    expect(d.startsWith('M ')).toBe(true);
    expect(d).toContain('C ');
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('getShapeBaseline', () => {
  it('line is a horizontal centerline', () => {
    expect(lineBaselinePath(80, 24)).toBe('M 0 12 L 80 12');
  });

  it('arrow shaft reaches tip and V shares tip', () => {
    const d = arrowBaselinePath(100, 24);
    expect(d).toContain('M 0 12');
    expect(d).toContain('L 100 12');
    // V ends at tip
    expect(d.match(/L 100 12/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('circle uses ellipse baseline', () => {
    const b = getShapeBaseline({
      key: 'shape',
      width: 40,
      height: 40,
      attrs: { shapeType: 'circle' },
    });
    expect(b?.closed).toBe(true);
    expect(b?.kind).toBe('geo');
    expect(b?.d).toContain('C ');
  });

  it('scales path baseline on live resize', () => {
    const b = getShapeBaseline(
      {
        key: 'shape',
        width: 100,
        height: 50,
        attrs: { shapeType: 'pen', path: 'M 0 0 L 100 50' },
      },
      { width: 200, height: 100 }
    );
    expect(b?.d).toContain('200');
    expect(b?.d).toContain('100');
  });

  it('rebuilds polygon for live size', () => {
    const small = getShapeBaseline({
      key: 'shape',
      width: 50,
      height: 50,
      attrs: { shapeType: 'polygon', sides: 5 },
    });
    const large = getShapeBaseline(
      {
        key: 'shape',
        width: 50,
        height: 50,
        attrs: { shapeType: 'polygon', sides: 5 },
      },
      { width: 200, height: 200 }
    );
    expect(small?.d).toBeTruthy();
    expect(large?.d).toBeTruthy();
    expect(small?.d).not.toBe(large?.d);
  });
});
