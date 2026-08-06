import { describe, expect, it } from 'vitest';
import { snapPenAnchorPoint } from '../PenDrawFeature';
import { snapCoordToGrid } from '../../selection/alignGuides';
import { penAnchorsToD, boundsOfAnchors, type PenAnchor } from '../penPath';

/**
 * Mirrors PenDrawFeature place path (without DOM):
 * raw pointer → snapPenAnchorPoint → anchor list → commit bounds.
 */
function simulatePenClicks(
  rawPoints: Array<{ x: number; y: number }>,
  gridSize = 1,
  skipGrid = false
): PenAnchor[] {
  return rawPoints.map((raw) => {
    const p = snapPenAnchorPoint(raw.x, raw.y, gridSize, skipGrid);
    return { x: p.x, y: p.y };
  });
}

/** Corner or edge-mid on the 1px lattice (not free floats / not cell centers). */
function assertOnPenGridLattice(anchors: PenAnchor[], gridSize: number) {
  const g = gridSize;
  const half = g / 2;
  for (const a of anchors) {
    const onX =
      Math.abs(a.x - snapCoordToGrid(a.x, g)) < 1e-9 ||
      Math.abs(a.x - (Math.floor(a.x / g) * g + half)) < 1e-9;
    const onY =
      Math.abs(a.y - snapCoordToGrid(a.y, g)) < 1e-9 ||
      Math.abs(a.y - (Math.floor(a.y / g) * g + half)) < 1e-9;
    const corner =
      Math.abs(a.x - snapCoordToGrid(a.x, g)) < 1e-9 &&
      Math.abs(a.y - snapCoordToGrid(a.y, g)) < 1e-9;
    const edgeMid =
      (Math.abs(a.x - snapCoordToGrid(a.x, g)) < 1e-9 &&
        Math.abs(a.y - (Math.floor(a.y / g) * g + half)) < 1e-9) ||
      (Math.abs(a.y - snapCoordToGrid(a.y, g)) < 1e-9 &&
        Math.abs(a.x - (Math.floor(a.x / g) * g + half)) < 1e-9);
    expect(onX && onY).toBe(true);
    expect(corner || edgeMid).toBe(true);
    // Cell center is not a snap target.
    expect(
      Math.abs(a.x - (Math.floor(a.x / g) * g + half)) < 1e-9 &&
        Math.abs(a.y - (Math.floor(a.y / g) * g + half)) < 1e-9
    ).toBe(false);
  }
}

describe('snapPenAnchorPoint (corners + edge mids)', () => {
  it('snaps to nearest grid cell corner when closer than edge mid', () => {
    const p = snapPenAnchorPoint(10.15, 20.85, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-snap:corner]', p);
    expect(p).toEqual({ x: 10, y: 21 });
  });

  it('snaps to vertical edge midpoint (网格边缘线中间)', () => {
    // Near mid of vertical line x=14 between y=11 and y=12.
    const raw = { x: 14.12, y: 11.48 };
    const tip = snapPenAnchorPoint(raw.x, raw.y, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-snap:v-edge-mid]', { raw, tip });
    expect(tip).toEqual({ x: 14, y: 11.5 });
  });

  it('snaps to horizontal edge midpoint', () => {
    const raw = { x: 20.47, y: 30.08 };
    const tip = snapPenAnchorPoint(raw.x, raw.y, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-snap:h-edge-mid]', { raw, tip });
    expect(tip).toEqual({ x: 20.5, y: 30 });
  });

  it('cell center prefers nearest edge mid (not stay at ½,½)', () => {
    const p = snapPenAnchorPoint(3.5, 7.5, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-snap:cell-center]', p);
    // Four edge mids tie at dist 0.5 — stable pick prefers lower x then y among ties,
    // after corner preference (corners farther). Expect an edge mid.
    expect(p.x === 3.5 || p.y === 7.5).toBe(true);
    expect(p.x === 3.5 && p.y === 7.5).toBe(false);
  });

  it('Ctrl / skip leaves the raw point (free place)', () => {
    const p = snapPenAnchorPoint(3.5, 7.5, 1, true);
    expect(p.x).toBe(3.5);
    expect(p.y).toBe(7.5);
  });

  it('gridSize 0 is a no-op', () => {
    const p = snapPenAnchorPoint(1.2, 3.4, 0, false);
    expect(p).toEqual({ x: 1.2, y: 3.4 });
  });
});

describe('pen draw full flow (click → snap → path)', () => {
  it('user clicks → all anchors land on corner or edge-mid lattice', () => {
    const rawClicks = [
      { x: 12.3, y: 8.7 },
      { x: 40.1, y: 9.4 },
      { x: 55.6, y: 30.2 },
      { x: 38.9, y: 48.5 },
      { x: 10.2, y: 45.8 },
    ];
    const anchors = simulatePenClicks(rawClicks, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-flow:clicks]', {
      raw: rawClicks,
      snapped: anchors,
    });
    expect(anchors).toHaveLength(5);
    assertOnPenGridLattice(anchors, 1);
  });

  it('rubber-band tip follows snapped cursor (edge mid when nearer)', () => {
    const tip = snapPenAnchorPoint(22.37, 18.61, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-flow:cursor]', tip);
    expect(tip).toEqual({ x: 22, y: 18.5 });
  });

  it('closed path from snapped anchors keeps vertices on lattice after localize', () => {
    const anchors = simulatePenClicks(
      [
        { x: 0.4, y: 0.4 },
        { x: 10.6, y: 0.3 },
        { x: 10.2, y: 8.7 },
        { x: 0.1, y: 8.4 },
      ],
      1,
      false
    );
    assertOnPenGridLattice(anchors, 1);
    const bounds = boundsOfAnchors(anchors, true);
    const d = penAnchorsToD(anchors, true);
    // eslint-disable-next-line no-console
    console.log('[test:pen-flow:commit]', { anchors, bounds, d });
    expect(d.length).toBeGreaterThan(0);
  });

  it('edit-drag: start off-grid legacy + move → ends on lattice', () => {
    const start = { x: 14.3, y: 11.7 };
    const pointer = { x: 20.2, y: 15.1 };
    const dx = pointer.x - 14.3;
    const dy = pointer.y - 11.7;
    const next = snapPenAnchorPoint(start.x + dx, start.y + dy, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-flow:edit-drag]', { start, pointer, next });
    assertOnPenGridLattice([next], 1);
  });

  it('screenshot: hover near vertical edge mid snaps there (not forced to corner)', () => {
    // User arrow: mid of vertical grid line should get a snap tip.
    const raw = { x: 14.08, y: 11.52 };
    const tip = snapPenAnchorPoint(raw.x, raw.y, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-flow:edge-mid-tip]', { raw, tip });
    expect(tip).toEqual({ x: 14, y: 11.5 });
  });

  it('final place never stores free mid-cell floats off the lattice', () => {
    const raw = [
      { x: 18.4, y: 22.7 },
      { x: 31.2, y: 35.6 },
    ];
    const placed = simulatePenClicks(raw, 1, false);
    // eslint-disable-next-line no-console
    console.log('[test:pen-flow:final-land]', { raw, placed });
    assertOnPenGridLattice(placed, 1);
  });
});
