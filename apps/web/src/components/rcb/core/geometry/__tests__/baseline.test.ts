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

  it('builds a donut with evenodd compound path', () => {
    const d = PathBuilder.ellipseVariant(100, 100, { innerRatio: 0.4, arcPercent: 100 }).toD();
    expect(d.split('M ').length).toBeGreaterThan(2);
    expect(d).toContain('Z');
  });

  it('builds a pie sector', () => {
    const d = PathBuilder.ellipseVariant(100, 100, { innerRatio: 0, arcPercent: 50 }).toD();
    expect(d).toContain('A ');
    expect(d).toContain('Z');
  });

  it('sweeps from fixed startDeg (default south)', () => {
    // start=90°, +50% → south to north via west.
    const d = PathBuilder.ellipseVariant(100, 100, {
      innerRatio: 0,
      arcPercent: 50,
      startDeg: 90,
    }).toD();
    expect(d).toMatch(/M 50 50/);
    // First rim point is start (south).
    expect(d).toMatch(/L 50(?:\.\d+)? 100/);
  });

  it('builds an annular sector with hole + partial arc', () => {
    const d = PathBuilder.ellipseVariant(100, 100, {
      innerRatio: 0.4,
      arcPercent: -76.7,
      startDeg: 90,
    }).toD();
    expect(d).toContain('A ');
    expect(d.match(/A /g)?.length).toBeGreaterThanOrEqual(2);
    expect(d).toContain('Z');
  });
});

describe('ellipseArcPercentFromPointer', () => {
  it('opens a small gap when dragging slightly from full', async () => {
    const { ellipseArcPercentFromPointer } = await import(
      '@/components/rcb/scene/document/sceneShapes'
    );
    // Start at south (90°); slight east of south → near-100% remaining.
    const next = ellipseArcPercentFromPointer(60, 90, 50, 50, 100, 90);
    expect(Math.abs(next)).toBeGreaterThan(90);
  });

  it('keeps one locked direction and does not flip past start', async () => {
    const { ellipseArcPercentFromPointer } = await import(
      '@/components/rcb/scene/document/sceneShapes'
    );
    // Locked negative: east of south stays negative near-full, not positive.
    const next = ellipseArcPercentFromPointer(60, 90, 50, 50, -95, 90, {
      lockSign: -1,
    });
    expect(next).toBeLessThan(0);
    expect(Math.abs(next)).toBeGreaterThan(90);
  });

  it('sign follows sweep direction from fixed start when unlocked', async () => {
    const { ellipseArcPercentFromPointer } = await import(
      '@/components/rcb/scene/document/sceneShapes'
    );
    // From south: east end → negative (CW); west end → positive (CCW).
    const neg = ellipseArcPercentFromPointer(90, 50, 50, 50, -50, 90, {
      lockSign: -1,
    });
    const pos = ellipseArcPercentFromPointer(10, 50, 50, 50, 50, 90, {
      lockSign: 1,
    });
    expect(neg).toBeLessThan(0);
    expect(pos).toBeGreaterThan(0);
  });
});

describe('snapEllipseArcPercent / snapEllipseInnerRatio', () => {
  it('snaps near-full arc and near-zero hole', async () => {
    const { snapEllipseArcPercent, snapEllipseInnerRatio } = await import(
      '@/components/rcb/scene/document/sceneShapes'
    );
    expect(snapEllipseArcPercent(97.5)).toBe(100);
    expect(snapEllipseArcPercent(-98)).toBe(-100);
    expect(snapEllipseArcPercent(80)).toBe(80);
    expect(snapEllipseInnerRatio(0.02)).toBe(0);
    expect(snapEllipseInnerRatio(0.1)).toBe(0);
    expect(snapEllipseInnerRatio(0.4)).toBeCloseTo(0.4);
    // Near-center in screen px also snaps (zoom=1 → sceneDist ≤ 18).
    expect(snapEllipseInnerRatio(0.2, { sceneDist: 10, zoom: 1 })).toBe(0);
    expect(snapEllipseInnerRatio(0.2, { sceneDist: 40, zoom: 1 })).toBeCloseTo(0.2);
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

  it('lottie generator uses sharp box baseline like image/video generators', () => {
    const b = getShapeBaseline({
      key: 'lottie',
      width: 80,
      height: 80,
      attrs: { lottieGenerator: true },
    });
    expect(b?.closed).toBe(true);
    expect(b?.kind).toBe('box');
    expect(b?.d).toMatch(/^M 0 0/);
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
