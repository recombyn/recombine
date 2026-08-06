import { describe, expect, it } from 'vitest';
import { snapMoveToSmartGuides } from '../alignGuides';

/**
 * Edge-align guides must mark corners AND edge midpoints (上中/下中/左中/右中).
 * Old pathMarksForAlign only put × on corners — mid-edge looked "missing".
 * × arms on the stroke also read as broken segments at high zoom (paint is dots now).
 */
describe('smart guide marks (corners + edge mids, continuous line)', () => {
  it('left-edge align exposes TL / left-mid / BL on both boxes', () => {
    const moving = { left: 10, top: 8, width: 12, height: 10 };
    const target = { left: 10, top: 30, width: 8, height: 14 };
    const { guides } = snapMoveToSmartGuides({
      box: moving,
      targets: [target],
      threshold: 0.51,
      gridSize: 1,
    });
    const vert = guides.find((g) => g.kind === 'align' && g.axis === 'x' && g.at === 10);
    expect(vert && vert.kind === 'align').toBe(true);
    if (!vert || vert.kind !== 'align') return;

    const marks = vert.marks || [];
    // eslint-disable-next-line no-console
    console.log('[test:guides-marks:left-edge]', {
      at: vert.at,
      from: vert.from,
      to: vert.to,
      marks,
    });

    // Continuous span covering both boxes (not two broken stubs).
    expect(vert.from).toBeLessThanOrEqual(8);
    expect(vert.to).toBeGreaterThanOrEqual(44);

    const has = (x: number, y: number) =>
      marks.some((m) => Math.abs(m.x - x) < 1e-9 && Math.abs(m.y - y) < 1e-9);

    // Moving: TL, left-mid (左中), BL
    expect(has(10, 8)).toBe(true);
    expect(has(10, 8 + 5)).toBe(true);
    expect(has(10, 18)).toBe(true);
    // Target: TL, left-mid, BL
    expect(has(10, 30)).toBe(true);
    expect(has(10, 30 + 7)).toBe(true);
    expect(has(10, 44)).toBe(true);
  });

  it('top-edge align exposes TL / top-mid (上中) / TR', () => {
    const moving = { left: 10, top: 20, width: 12, height: 8 };
    const target = { left: 40, top: 20, width: 10, height: 6 };
    const { guides } = snapMoveToSmartGuides({
      box: moving,
      targets: [target],
      threshold: 0.51,
      gridSize: 1,
    });
    const hor = guides.find((g) => g.kind === 'align' && g.axis === 'y' && g.at === 20);
    expect(hor && hor.kind === 'align').toBe(true);
    if (!hor || hor.kind !== 'align') return;

    const marks = hor.marks || [];
    // eslint-disable-next-line no-console
    console.log('[test:guides-marks:top-edge]', { marks, from: hor.from, to: hor.to });

    const has = (x: number, y: number) =>
      marks.some((m) => Math.abs(m.x - x) < 1e-9 && Math.abs(m.y - y) < 1e-9);

    expect(has(10, 20)).toBe(true);
    expect(has(10 + 6, 20)).toBe(true); // 上中
    expect(has(22, 20)).toBe(true);
    expect(has(40, 20)).toBe(true);
    expect(has(40 + 5, 20)).toBe(true);
    expect(has(50, 20)).toBe(true);
  });

  it('right-edge align exposes TR / right-mid (右中) / BR', () => {
    const moving = { left: 30, top: 8, width: 10, height: 12 };
    const target = { left: 20, top: 30, width: 20, height: 10 };
    // moving.right = 40, target.right = 40
    const { guides } = snapMoveToSmartGuides({
      box: moving,
      targets: [target],
      threshold: 0.51,
      gridSize: 1,
    });
    const vert = guides.find((g) => g.kind === 'align' && g.axis === 'x' && g.at === 40);
    expect(vert && vert.kind === 'align').toBe(true);
    if (!vert || vert.kind !== 'align') return;
    const marks = vert.marks || [];
    // eslint-disable-next-line no-console
    console.log('[test:guides-marks:right-edge]', { marks });
    const has = (x: number, y: number) =>
      marks.some((m) => Math.abs(m.x - x) < 1e-9 && Math.abs(m.y - y) < 1e-9);
    expect(has(40, 8)).toBe(true);
    expect(has(40, 8 + 6)).toBe(true); // 右中
    expect(has(40, 20)).toBe(true);
    expect(has(40, 30)).toBe(true);
    expect(has(40, 30 + 5)).toBe(true);
    expect(has(40, 40)).toBe(true);
  });

  it('bottom-edge align exposes BL / bottom-mid (下中) / BR', () => {
    const moving = { left: 10, top: 10, width: 12, height: 10 };
    const target = { left: 40, top: 14, width: 10, height: 6 };
    // moving.bottom = 20, target.bottom = 20
    const { guides } = snapMoveToSmartGuides({
      box: moving,
      targets: [target],
      threshold: 0.51,
      gridSize: 1,
    });
    const hor = guides.find((g) => g.kind === 'align' && g.axis === 'y' && g.at === 20);
    expect(hor && hor.kind === 'align').toBe(true);
    if (!hor || hor.kind !== 'align') return;
    const marks = hor.marks || [];
    // eslint-disable-next-line no-console
    console.log('[test:guides-marks:bottom-edge]', { marks });
    const has = (x: number, y: number) =>
      marks.some((m) => Math.abs(m.x - x) < 1e-9 && Math.abs(m.y - y) < 1e-9);
    expect(has(10, 20)).toBe(true);
    expect(has(10 + 6, 20)).toBe(true); // 下中
    expect(has(22, 20)).toBe(true);
    expect(has(40, 20)).toBe(true);
    expect(has(40 + 5, 20)).toBe(true);
    expect(has(50, 20)).toBe(true);
  });

  it('center-line align still marks box centers (not only corners)', () => {
    const moving = { left: 10, top: 10, width: 10, height: 10 };
    const target = { left: 40, top: 10, width: 10, height: 10 };
    const { guides } = snapMoveToSmartGuides({
      box: moving,
      targets: [target],
      threshold: 0.51,
      gridSize: 1,
    });
    const midY = guides.find((g) => g.kind === 'align' && g.axis === 'y' && g.at === 15);
    expect(midY && midY.kind === 'align').toBe(true);
    if (!midY || midY.kind !== 'align') return;
    // eslint-disable-next-line no-console
    console.log('[test:guides-marks:center]', midY.marks);
    expect(midY.marks?.some((m) => m.x === 15 && m.y === 15)).toBe(true);
    expect(midY.marks?.some((m) => m.x === 45 && m.y === 15)).toBe(true);
  });

  it('guide from/to is one continuous span (not multi stubs)', () => {
    const moving = { left: 5, top: 0, width: 4, height: 4 };
    const a = { left: 5, top: 20, width: 4, height: 4 };
    const b = { left: 5, top: 40, width: 4, height: 4 };
    const { guides } = snapMoveToSmartGuides({
      box: moving,
      targets: [a, b],
      threshold: 0.51,
      gridSize: 1,
    });
    const verts = guides.filter((g) => g.kind === 'align' && g.axis === 'x' && g.at === 5);
    // eslint-disable-next-line no-console
    console.log(
      '[test:guides-continuous]',
      verts.map((g) => (g.kind === 'align' ? { at: g.at, from: g.from, to: g.to } : null))
    );
    expect(verts.length).toBe(1);
    if (verts[0]?.kind !== 'align') return;
    expect(verts[0].from).toBe(0);
    expect(verts[0].to).toBe(44);
  });
});

describe('snap tip lattice (1px mouse bias)', () => {
  it('snapped tip lands on nearest corner or edge mid (no free float)', async () => {
    const { snapPenAnchorPoint } = await import('../../tools/PenDrawFeature');
    const raw = { x: 14.6, y: 11.4 };
    const tip = snapPenAnchorPoint(raw.x, raw.y, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:snap-tip:1px]', {
      raw,
      tip,
      delta: { x: tip.x - raw.x, y: tip.y - raw.y },
    });
    // Near (14.6,11.4): horizontal edge mid (14.5,11) beats corner (15,11).
    expect(tip).toEqual({ x: 14.5, y: 11 });
  });

  it('when pointer already on corner, tip equals pointer (0 bias)', async () => {
    const { snapPenAnchorPoint } = await import('../../tools/PenDrawFeature');
    const raw = { x: 20, y: 30 };
    const tip = snapPenAnchorPoint(raw.x, raw.y, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:snap-tip:on-corner]', { raw, tip });
    expect(tip).toEqual(raw);
  });

  it('when pointer already on edge mid, tip equals pointer', async () => {
    const { snapPenAnchorPoint } = await import('../../tools/PenDrawFeature');
    const raw = { x: 14, y: 11.5 };
    const tip = snapPenAnchorPoint(raw.x, raw.y, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:snap-tip:on-edge-mid]', { raw, tip });
    expect(tip).toEqual(raw);
  });
});
