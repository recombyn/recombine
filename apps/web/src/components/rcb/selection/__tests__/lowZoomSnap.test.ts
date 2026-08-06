import { describe, expect, it } from 'vitest';
import {
  SMART_SNAP_PX,
  SMART_SNAP_SCENE_MAX,
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

/** Canvas zooms from floor → extreme (not a single repro %). */
const CANVAS_ZOOMS = [0.05, 0.13, 0.25, 0.5, 0.8, 1, 2, 8, 20, 40, 80] as const;

/** Production move settle: smart (capped) → grid → paint guides. */
function settleMove(opts: {
  box: { left: number; top: number; width: number; height: number };
  targets: Array<{ left: number; top: number; width: number; height: number }>;
  zoom: number;
  gridSize?: number;
}) {
  const gridSize = opts.gridSize ?? 1;
  const threshold = smartSnapThreshold(opts.zoom);
  let next = { ...opts.box };
  if (threshold > 0 && opts.targets.length) {
    next = snapMoveToSmartGuides({
      box: next,
      targets: opts.targets,
      threshold,
      gridSize,
    }).box;
  }
  if (gridSize > 0) next = snapBoxToGrid(next, gridSize);
  const guides = collectSmartGuidesAt(next, opts.targets, Math.max(0.51, threshold));
  return { box: next, guides, threshold };
}

describe('smartSnapThreshold @ all canvas zooms', () => {
  it.each([...CANVAS_ZOOMS])('never exceeds scene cap at zoom %s', (zoom) => {
    const threshold = smartSnapThreshold(zoom);
    expect(threshold).toBeLessThanOrEqual(SMART_SNAP_SCENE_MAX + 1e-9);
    expect(threshold).toBeCloseTo(Math.min(SMART_SNAP_PX / zoom, SMART_SNAP_SCENE_MAX), 6);
  });

  it.each([...CANVAS_ZOOMS])(
    'does not yank across a 67-cell gap at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 120, height: 90 };
      const gap = 67;
      const right = {
        left: left.left + left.width + gap,
        top: 0,
        width: 120,
        height: 90,
      };
      const nudged = { ...right, left: right.left - 2 };
      const { box, threshold } = settleMove({ box: nudged, targets: [left], zoom });
      // eslint-disable-next-line no-console
      console.log('[test:smart-snap@zoom]', {
        zoom,
        threshold,
        remainingGap: box.left - (left.left + left.width),
      });
      expect(box.left).toBe(nudged.left);
      expect(box.left - (left.left + left.width)).toBe(gap - 2);
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'snaps flush when gap is within the capped threshold at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 100, height: 80 };
      const threshold = smartSnapThreshold(zoom);
      // Stay inside the magnet; at extreme zoom threshold can be < 1.
      const gap = Math.min(threshold, Math.max(threshold * 0.5, 0.25));
      const right = {
        left: left.left + left.width + gap,
        top: 0,
        width: 100,
        height: 80,
      };
      const settled = settleMove({ box: right, targets: [left], zoom, gridSize: 0 });
      // eslint-disable-next-line no-console
      console.log('[test:smart-snap-flush@zoom]', {
        zoom,
        threshold,
        gap,
        nextGap: settled.box.left - (left.left + left.width),
        alignCount: settled.guides.filter((g) => g.kind === 'align').length,
      });
      expect(settled.box.left).toBeCloseTo(left.left + left.width, 6);
      expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);
    }
  );

  it.each([0.13, 0.25, 0.5, 1])(
    'shows gap badge beside a sibling even when not edge-aligned at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 100, height: 80 };
      const right = { left: 140, top: 10, width: 100, height: 80 };
      const { guides } = settleMove({ box: right, targets: [left], zoom });
      const gaps = guides.filter((g) => g.kind === 'gap');
      // eslint-disable-next-line no-console
      console.log('[test:gap-badge@zoom]', { zoom, gaps });
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.some((g) => g.kind === 'gap' && g.dist === 40)).toBe(true);
    }
  );

  it('near-align probe must not clear guides (old stillAligned bug)', () => {
    const left = { left: 0, top: 0, width: 100, height: 80 };
    const right = { left: 100.3, top: 0, width: 100, height: 80 };
    const guides = collectSmartGuidesAt(snapBoxToGrid(right, 1), [left], 8);
    expect(guides.some((g) => g.kind === 'gap' || g.kind === 'align')).toBe(true);
  });

  it('uses full screen-px feel when 5/zoom is under the scene cap', () => {
    const edge = SMART_SNAP_PX / SMART_SNAP_SCENE_MAX;
    expect(smartSnapThreshold(edge)).toBeCloseTo(SMART_SNAP_SCENE_MAX, 6);
    expect(smartSnapThreshold(1)).toBe(SMART_SNAP_PX);
    expect(smartSnapThreshold(2)).toBeCloseTo(SMART_SNAP_PX / 2, 6);
    expect(smartSnapThreshold(40)).toBeCloseTo(SMART_SNAP_PX / 40, 6);
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
      expect(park * zoom).toBeLessThanOrEqual(Math.min(box.w, box.h) * zoom * 0.22 + 1e-6);
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'park clears scaled resize/radius hits when radius is interactive at zoom %s',
    (zoom) => {
      if (!radiusHandlesFitOnScreen(box.w, box.h, zoom)) return;
      const parkPx = radiusHandleParkScreenPx();
      const minScreen = Math.min(box.w, box.h) * zoom;
      const parkScene = radiusParkSceneForBox(box.w, box.h, zoom, parkPx);
      const expectedPx = Math.min(parkPx, minScreen * 0.22);
      expect(parkScene * zoom).toBeCloseTo(expectedPx, 5);
      const hitScale = chromeHitScaleForBox(box.w, box.h, zoom);
      // Both hits are icon-centered — park clears halfHit + halfRadius + gap.
      const resizeHalf = (CHROME_HANDLE_HIT_PX * hitScale) / 2 / zoom;
      const radiusHalf = (CHROME_RADIUS_HIT_PX * hitScale) / 2 / zoom;
      const clearance = parkScene - resizeHalf - radiusHalf;
      if (expectedPx >= parkPx - 1e-6) {
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
