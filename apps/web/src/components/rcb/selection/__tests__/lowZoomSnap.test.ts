import { describe, expect, it } from 'vitest';
import {
  SMART_SNAP_PX,
  GUIDE_COINCIDE_EPS,
  smartSnapThreshold,
  snapMoveToSmartGuides,
  snapBoxToGrid,
  collectSmartGuidesAt,
} from '../alignGuides';
import {
  CHROME_HANDLE_HIT_PX,
  CHROME_RADIUS_HIT_PX,
  CHROME_RADIUS_PARK_GAP_PX,
  chromeHitScaleForBox,
  radiusHandleParkScreenPx,
  radiusHandlesFitOnScreen,
  radiusParkSceneForBox,
} from '../SelectionChrome';

/** Canvas zooms from floor → extreme (includes user repro ~31%). */
const CANVAS_ZOOMS = [0.05, 0.13, 0.25, 0.31, 0.5, 0.8, 1, 2, 8, 20, 40, 80] as const;

/** Production move settle: grid → smart → grid → paint guides. */
function settleMove(opts: {
  box: { left: number; top: number; width: number; height: number };
  targets: Array<{ left: number; top: number; width: number; height: number }>;
  zoom: number;
  gridSize?: number;
}) {
  const gridSize = opts.gridSize ?? 1;
  const threshold = smartSnapThreshold(opts.zoom);
  let next = { ...opts.box };
  if (gridSize > 0) next = snapBoxToGrid(next, gridSize);
  if (threshold > 0 && opts.targets.length) {
    next = snapMoveToSmartGuides({
      box: next,
      targets: opts.targets,
      threshold,
      gridSize,
    }).box;
  }
  if (gridSize > 0) next = snapBoxToGrid(next, gridSize);
  // Paint coincide only — never threshold (at 31% that painted ~25 cells as "aligned").
  const guides = collectSmartGuidesAt(next, opts.targets, GUIDE_COINCIDE_EPS);
  return { box: next, guides, threshold };
}

describe('smartSnapThreshold @ all canvas zooms', () => {
  it.each([...CANVAS_ZOOMS])('is screen-constant (px/zoom) at zoom %s', (zoom) => {
    const threshold = smartSnapThreshold(zoom);
    expect(threshold).toBeCloseTo(SMART_SNAP_PX / zoom, 6);
    expect(threshold * zoom).toBeCloseTo(SMART_SNAP_PX, 6);
  });

  it.each([...CANVAS_ZOOMS])(
    'does not yank across a gap beyond the screen-px magnet at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 120, height: 90 };
      const threshold = smartSnapThreshold(zoom);
      // Stay clearly outside the magnet in scene space.
      const gap = threshold + 10;
      const right = {
        left: left.left + left.width + gap,
        top: 0,
        width: 120,
        height: 90,
      };
      const nudged = { ...right, left: right.left - 2 };
      const { box } = settleMove({
        box: nudged,
        targets: [left],
        zoom,
        gridSize: 0,
      });
      expect(box.left).toBeCloseTo(nudged.left, 9);
      expect(box.left - (left.left + left.width)).toBeCloseTo(gap - 2, 9);
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'snaps flush when gap is within the screen-px threshold at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 100, height: 80 };
      const threshold = smartSnapThreshold(zoom);
      // Stay strictly inside the magnet (avoid equality / float edge).
      const gap = Math.max(1e-6, threshold * 0.5);
      const right = {
        left: left.left + left.width + gap,
        top: 0,
        width: 100,
        height: 80,
      };
      const settled = settleMove({ box: right, targets: [left], zoom, gridSize: 0 });
      expect(settled.box.left).toBeCloseTo(left.left + left.width, 6);
      expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);
    }
  );

  it('at 5% zoom a 67-scene gap is still within ~8 screen px and snaps', () => {
    const zoom = 0.05;
    const left = { left: 0, top: 0, width: 120, height: 90 };
    const gap = 67;
    expect(gap * zoom).toBeLessThan(SMART_SNAP_PX);
    const right = {
      left: left.left + left.width + gap,
      top: 0,
      width: 120,
      height: 90,
    };
    const settled = settleMove({ box: right, targets: [left], zoom, gridSize: 0 });
    expect(settled.threshold).toBeCloseTo(SMART_SNAP_PX / zoom, 6);
    expect(settled.box.left).toBeCloseTo(left.left + left.width, 6);
  });

  it.each([0.13, 0.25, 0.31, 0.5, 1])(
    'shows gap badge beside a sibling even when not edge-aligned at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 100, height: 80 };
      const right = { left: 140, top: 10, width: 100, height: 80 };
      // Paint-only — do not settle/snap first (low zoom would close the 40 gap).
      const guides = collectSmartGuidesAt(right, [left], GUIDE_COINCIDE_EPS);
      const gaps = guides.filter((g) => g.kind === 'gap');
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.some((g) => g.kind === 'gap' && g.dist === 40)).toBe(true);
      // Must not paint false align strokes for a 40-scene gap.
      expect(guides.some((g) => g.kind === 'align')).toBe(false);
    }
  );

  it('at 31% zoom does not paint distant edges as aligned (old threshold-as-eps)', () => {
    const zoom = 0.31;
    const threshold = smartSnapThreshold(zoom);
    // ~25.8 scene units — old paint used this as coincide and looked "stuck".
    expect(threshold).toBeGreaterThan(20);
    const left = { left: 0, top: 0, width: 100, height: 80 };
    const gap = 10;
    // Offset Y so tops/mids/bottoms do not coincide — only the false X paint matters.
    const right = {
      left: left.left + left.width + gap,
      top: 6,
      width: 100,
      height: 80,
    };

    const paintOnly = collectSmartGuidesAt(right, [left], GUIDE_COINCIDE_EPS);
    expect(paintOnly.some((g) => g.kind === 'align')).toBe(false);
    expect(paintOnly.some((g) => g.kind === 'gap' && g.dist === gap)).toBe(true);

    // Wrong paint (threshold as eps) would falsely claim X alignment:
    const falsePaint = collectSmartGuidesAt(right, [left], Math.max(0.51, threshold));
    expect(falsePaint.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);

    // Settle still snaps flush within the screen-px magnet, then paints real align.
    const settled = settleMove({
      box: { ...right, top: 0 },
      targets: [left],
      zoom,
      gridSize: 0,
    });
    expect(settled.box.left).toBeCloseTo(left.left + left.width, 6);
    expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);
  });

  it('near-align probe must not clear guides (old stillAligned bug)', () => {
    const left = { left: 0, top: 0, width: 100, height: 80 };
    const right = { left: 100.3, top: 0, width: 100, height: 80 };
    const guides = collectSmartGuidesAt(snapBoxToGrid(right, 1), [left], 8);
    expect(guides.some((g) => g.kind === 'gap' || g.kind === 'align')).toBe(true);
  });
});

describe('radius park + chrome hits @ all canvas zooms', () => {
  const box = { w: 200, h: 150 };

  it.each([...CANVAS_ZOOMS])(
    'keeps park near the corner (≤45% half-side) at zoom %s',
    (zoom) => {
      const park = radiusParkSceneForBox(box.w, box.h, zoom);
      const half = Math.min(box.w, box.h) / 2;
      expect(park).toBeGreaterThanOrEqual(0);
      expect(park).toBeLessThanOrEqual(half * 0.45 + 1e-9);
      const parkPx = radiusHandleParkScreenPx();
      const unclamped = parkPx / zoom;
      if (unclamped <= half * 0.45) {
        expect(park * zoom).toBeCloseTo(parkPx, 5);
      }
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'park clears scaled resize/radius hits when radius is interactive at zoom %s',
    (zoom) => {
      if (!radiusHandlesFitOnScreen(box.w, box.h, zoom)) return;
      const parkPx = radiusHandleParkScreenPx();
      const parkScene = radiusParkSceneForBox(box.w, box.h, zoom, parkPx);
      const half = Math.min(box.w, box.h) / 2;
      const expectedScene = Math.min(parkPx / zoom, half * 0.45);
      expect(parkScene).toBeCloseTo(expectedScene, 5);
      const hitScale = chromeHitScaleForBox(box.w, box.h, zoom);
      const resizeHalf = (CHROME_HANDLE_HIT_PX * hitScale) / 2 / zoom;
      const radiusHalf = (CHROME_RADIUS_HIT_PX * hitScale) / 2 / zoom;
      const clearance = parkScene - resizeHalf - radiusHalf;
      if (expectedScene >= parkPx / zoom - 1e-6) {
        expect(clearance * zoom).toBeGreaterThanOrEqual(CHROME_RADIUS_PARK_GAP_PX - 0.05);
      } else {
        expect(clearance).toBeGreaterThanOrEqual(0);
      }
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'hit scale follows on-screen size at zoom %s',
    (zoom) => {
      const scale = chromeHitScaleForBox(box.w, box.h, zoom);
      const minScreen = Math.min(box.w, box.h) * zoom;
      if (minScreen >= 56) expect(scale).toBe(1);
      else {
        expect(scale).toBeLessThan(1);
        expect(scale).toBeGreaterThanOrEqual(0.35);
      }
    }
  );

  it('disables radius hits only when on-screen box is too small (any zoom)', () => {
    expect(radiusHandlesFitOnScreen(200, 150, 0.13)).toBe(false);
    expect(radiusHandlesFitOnScreen(26, 20, 1)).toBe(false);
    expect(radiusHandlesFitOnScreen(200, 150, 1)).toBe(true);
    expect(radiusHandlesFitOnScreen(200, 150, 20)).toBe(true);
    expect(radiusHandlesFitOnScreen(40, 40, 80)).toBe(true);
  });
});
