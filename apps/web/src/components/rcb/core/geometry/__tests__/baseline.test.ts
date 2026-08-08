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

describe('ellipseArcApplyFullHysteresis', () => {
  it('avoids chatter when closing and reopening near full', async () => {
    const {
      ellipseArcApplyFullHysteresis,
      ELLIPSE_ARC_SNAP_FULL_PCT,
      ELLIPSE_ARC_UNSNAP_FULL_PCT,
    } = await import('@/components/rcb/scene/document/sceneShapes');
    const twoPi = Math.PI * 2;
    const snapIn = (ELLIPSE_ARC_SNAP_FULL_PCT / 100) * twoPi;
    const snapOut = (ELLIPSE_ARC_UNSNAP_FULL_PCT / 100) * twoPi;

    // First open from full: no snap yet.
    let s = ellipseArcApplyFullHysteresis(twoPi - snapIn * 0.5, {
      openedOnce: false,
      heldFull: false,
    });
    expect(s.openedOnce).toBe(false);
    expect(s.along).toBeLessThan(twoPi);

    // Past unsnap → armed.
    s = ellipseArcApplyFullHysteresis(twoPi - snapOut - 0.01, {
      openedOnce: false,
      heldFull: false,
    });
    expect(s.openedOnce).toBe(true);

    // Close into snap band → latch full.
    s = ellipseArcApplyFullHysteresis(twoPi - snapIn * 0.5, {
      openedOnce: true,
      heldFull: false,
    });
    expect(s.heldFull).toBe(true);
    expect(s.along).toBeCloseTo(twoPi, 5);

    // Still inside unsnap band → stay latched (no jitter).
    s = ellipseArcApplyFullHysteresis(twoPi - snapOut * 0.5, {
      openedOnce: true,
      heldFull: true,
    });
    expect(s.heldFull).toBe(true);
    expect(s.along).toBeCloseTo(twoPi, 5);

    // Past unsnap → release and follow.
    s = ellipseArcApplyFullHysteresis(twoPi - snapOut - 0.05, {
      openedOnce: true,
      heldFull: true,
    });
    expect(s.heldFull).toBe(false);
    expect(s.along).toBeLessThan(twoPi);
  });
});

describe('ellipseArcAlongFromPointerAngle', () => {
  it('puts the end under the pointer and clamps past 开始位置', async () => {
    const {
      ellipseArcAlongFromPointerAngle,
      ellipseArcEndAngles,
      ellipseArcPercentFromAlongRad,
    } = await import('@/components/rcb/scene/document/sceneShapes');
    const start = Math.PI / 2; // south
    const twoPi = Math.PI * 2;
    // CW of south with + lock → near-full; end ≈ pointer.
    const ptr = start - 0.2;
    const along = ellipseArcAlongFromPointerAngle(ptr, start, 1, twoPi);
    expect(along).toBeGreaterThan(twoPi * 0.9);
    const pct = ellipseArcPercentFromAlongRad(along, 1);
    const { a1 } = ellipseArcEndAngles(pct, 90);
    let d = a1 - ptr;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    expect(Math.abs(d)).toBeLessThan(0.05);
    // Crossing start from near-full stays full.
    expect(ellipseArcAlongFromPointerAngle(start + 0.2, start, 1, along)).toBeCloseTo(
      twoPi,
      5
    );
  });

  it('maps short vs long sides for a locked sign', async () => {
    const {
      ellipseArcAlongFromPointerAngle,
      ellipseArcPercentFromAlongRad,
    } = await import('@/components/rcb/scene/document/sceneShapes');
    const start = Math.PI / 2;
    const twoPi = Math.PI * 2;
    // Start south; slightly CW → short remaining for − lock.
    const shortAlong = ellipseArcAlongFromPointerAngle(start - 0.15, start, -1, 0.2);
    expect(ellipseArcPercentFromAlongRad(shortAlong, -1)).toBeGreaterThan(-20);
    // Slightly CCW → near-full for − lock.
    const longAlong = ellipseArcAlongFromPointerAngle(start + 0.15, start, -1, twoPi);
    expect(Math.abs(ellipseArcPercentFromAlongRad(longAlong, -1))).toBeGreaterThan(90);
  });
});

describe('ellipseArcPercentFromAlongRad', () => {
  it('covers a full turn without flipping sign', async () => {
    const { ellipseArcPercentFromAlongRad, ellipseArcAlongRadFromPercent } =
      await import('@/components/rcb/scene/document/sceneShapes');
    const half = Math.PI;
    expect(ellipseArcPercentFromAlongRad(half, 1)).toBeCloseTo(50, 5);
    expect(ellipseArcPercentFromAlongRad(half, -1)).toBeCloseTo(-50, 5);
    expect(ellipseArcAlongRadFromPercent(100)).toBeCloseTo(Math.PI * 2, 5);
    expect(ellipseArcPercentFromAlongRad(Math.PI * 2, -1)).toBe(-100);
  });
});

describe('snapEllipseArcPercent / snapEllipseInnerRatio', () => {
  it('snaps near-full arc and near-zero hole', async () => {
    const { snapEllipseArcPercent, snapEllipseInnerRatio } = await import(
      '@/components/rcb/scene/document/sceneShapes'
    );
    expect(snapEllipseArcPercent(97.5)).toBe(100);
    expect(snapEllipseArcPercent(-95)).toBe(-100);
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
