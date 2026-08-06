/**
 * Executable checks: resize vs corner-radius hit pads at any canvas zoom.
 * Hits are centered on their icons (control-box corner / radius dot).
 */
import { describe, expect, it } from 'vitest';
import {
  CHROME_HANDLE_HIT_PX,
  CHROME_HANDLE_VIS_PX,
  CHROME_RADIUS_HIT_PX,
  CHROME_RADIUS_PARK_GAP_PX,
  chromeHitScaleForBox,
  radiusHandleParkScreenPx,
  radiusHandlesFitOnScreen,
  radiusParkSceneForBox,
} from '../SelectionChrome';
import {
  radiusParkAlongBisector,
  radiusSeatInset,
} from '../chrome/CornerRadiusHandlesOverlay';

type Aabb = { left: number; top: number; right: number; bottom: number };

function aabbFixed(cx: number, cy: number, half: number): Aabb {
  return {
    left: cx - half,
    top: cy - half,
    right: cx + half,
    bottom: cy + half,
  };
}

function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

function pointInAabb(x: number, y: number, box: Aabb): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** Box-mode: SE resize hit (icon center) + BR radius seat (R≈0). */
function seCornerHitLayout(boxW: number, boxH: number, zoom: number, r = 0) {
  const z = Math.max(0.05, zoom);
  const inv = 1 / z;
  const hitScale = chromeHitScaleForBox(boxW, boxH, z);
  const parkScene = radiusParkSceneForBox(boxW, boxH, z);
  const halfSide = Math.min(boxW, boxH) / 2;
  const inset = radiusSeatInset(r, halfSide, parkScene);

  const halfHit = (CHROME_HANDLE_HIT_PX * hitScale * inv) / 2;
  const resizeCx = boxW;
  const resizeCy = boxH;
  const radiusCx = boxW - inset;
  const radiusCy = boxH - inset;

  const radiusHalfScene = (CHROME_RADIUS_HIT_PX * hitScale * inv) / 2;
  const resizeHit = aabbFixed(resizeCx, resizeCy, halfHit);
  const radiusHit = aabbFixed(radiusCx, radiusCy, radiusHalfScene);

  const axisClearanceScene = Math.min(
    resizeHit.left - radiusHit.right,
    resizeHit.top - radiusHit.bottom
  );

  return {
    z,
    parkScene,
    resizeCx,
    resizeCy,
    radiusCx,
    radiusCy,
    resizeHit,
    radiusHit,
    overlap: aabbsOverlap(resizeHit, radiusHit),
    axisClearanceScreen: axisClearanceScene * z,
    resizeHitScreen: CHROME_HANDLE_HIT_PX * hitScale,
    radiusHitScreen: CHROME_RADIUS_HIT_PX * hitScale,
    radiusInteractive: radiusHandlesFitOnScreen(boxW, boxH, z),
  };
}

/** Path-mode: seat along inward 45° bisector. */
function sePathHitLayout(boxW: number, boxH: number, zoom: number, r = 0) {
  const z = Math.max(0.05, zoom);
  const inv = 1 / z;
  const hitScale = chromeHitScaleForBox(boxW, boxH, z);
  const parkScene = radiusParkSceneForBox(boxW, boxH, z);
  const halfSide = Math.min(boxW, boxH) / 2;
  const inset = radiusSeatInset(r, halfSide, parkScene);
  const ix = -Math.SQRT1_2;
  const iy = -Math.SQRT1_2;
  const along = radiusParkAlongBisector(inset, ix, iy);

  const halfHit = (CHROME_HANDLE_HIT_PX * hitScale * inv) / 2;
  const resizeHit = aabbFixed(boxW, boxH, halfHit);
  const radiusCx = boxW + ix * along;
  const radiusCy = boxH + iy * along;
  const radiusHit = aabbFixed(radiusCx, radiusCy, (CHROME_RADIUS_HIT_PX * hitScale * inv) / 2);
  const axisClearanceScene = Math.min(
    resizeHit.left - radiusHit.right,
    resizeHit.top - radiusHit.bottom
  );

  return {
    overlap: aabbsOverlap(resizeHit, radiusHit),
    axisClearanceScreen: axisClearanceScene * z,
    radiusCx,
    radiusCy,
    resizeHit,
    radiusInteractive: radiusHandlesFitOnScreen(boxW, boxH, z),
  };
}

const ZOOMS = [0.05, 0.13, 0.25, 0.5, 1, 2, 8, 20, 49.9, 80, 90] as const;
const BOX = { w: 200, h: 150 };

describe('resize vs radius hit pads (icon-centered)', () => {
  it('hits stay near icon size (not oversized magnets)', () => {
    expect(CHROME_HANDLE_HIT_PX).toBeLessThanOrEqual(CHROME_HANDLE_VIS_PX + 4);
    expect(CHROME_RADIUS_HIT_PX).toBeLessThanOrEqual(CHROME_HANDLE_VIS_PX + 4);
    expect(radiusHandleParkScreenPx()).toBe(
      CHROME_HANDLE_HIT_PX / 2 + CHROME_RADIUS_HIT_PX / 2 + CHROME_RADIUS_PARK_GAP_PX
    );
  });

  it.each([...ZOOMS])(
    'hit scene size scales as screenPx/zoom at canvas zoom %s',
    (zoom) => {
      const layout = seCornerHitLayout(BOX.w, BOX.h, zoom);
      const resizeScene = layout.resizeHit.right - layout.resizeHit.left;
      expect(resizeScene * zoom).toBeCloseTo(layout.resizeHitScreen, 5);
      if (zoom >= 2) {
        expect(resizeScene).toBeLessThan(CHROME_HANDLE_HIT_PX);
      }
    }
  );

  it.each([...ZOOMS])(
    'box-mode SE resize hit does not overlap BR radius at zoom %s when interactive',
    (zoom) => {
      const layout = seCornerHitLayout(BOX.w, BOX.h, zoom, 0);
      if (!layout.radiusInteractive) {
        expect(layout.radiusInteractive).toBe(false);
        return;
      }
      expect(layout.overlap).toBe(false);
      expect(pointInAabb(layout.resizeCx, layout.resizeCy, layout.resizeHit)).toBe(true);
      expect(pointInAabb(layout.radiusCx, layout.radiusCy, layout.resizeHit)).toBe(false);
      expect(pointInAabb(layout.resizeCx, layout.resizeCy, layout.radiusHit)).toBe(false);
      const fullPark =
        Math.abs(layout.parkScene * layout.z - radiusHandleParkScreenPx()) < 0.05;
      if (fullPark) {
        expect(layout.axisClearanceScreen).toBeGreaterThanOrEqual(
          CHROME_RADIUS_PARK_GAP_PX - 0.05
        );
      } else {
        expect(layout.axisClearanceScreen).toBeGreaterThanOrEqual(-0.05);
      }
    }
  );

  it.each([...ZOOMS])(
    'path-mode bisector seat clears SE resize hit at zoom %s when interactive',
    (zoom) => {
      const layout = sePathHitLayout(BOX.w, BOX.h, zoom, 0);
      if (!layout.radiusInteractive) {
        expect(layout.radiusInteractive).toBe(false);
        return;
      }
      expect(layout.overlap).toBe(false);
      expect(layout.axisClearanceScreen).toBeGreaterThanOrEqual(-0.05);
      expect(pointInAabb(layout.radiusCx, layout.radiusCy, layout.resizeHit)).toBe(false);
    }
  );

  it('at 9000% (90×), 1 scene px of park is enough on screen', () => {
    const zoom = 90;
    const layout = seCornerHitLayout(BOX.w, BOX.h, zoom, 0);
    expect(layout.radiusInteractive).toBe(true);
    expect(layout.overlap).toBe(false);
    expect(layout.parkScene).toBeLessThan(1);
    expect(layout.parkScene * zoom).toBeCloseTo(radiusHandleParkScreenPx(), 5);
    expect(layout.axisClearanceScreen).toBeGreaterThanOrEqual(CHROME_RADIUS_PARK_GAP_PX - 0.05);
  });

  it('at 100%, hits clear with icon-sized pads', () => {
    const layout = seCornerHitLayout(BOX.w, BOX.h, 1, 0);
    expect(layout.overlap).toBe(false);
    expect(layout.resizeHitScreen).toBe(10);
    expect(layout.radiusHitScreen).toBe(8);
  });

  it('at 8019% on 4×4 box, corner icon is resize territory; radius center is free of resize', () => {
    const layout = seCornerHitLayout(4, 4, 80.19, 0);
    expect(layout.radiusInteractive).toBe(true);
    expect(layout.overlap).toBe(false);
    expect(pointInAabb(layout.resizeCx, layout.resizeCy, layout.radiusHit)).toBe(false);
    expect(pointInAabb(layout.resizeCx, layout.resizeCy, layout.resizeHit)).toBe(true);
    expect(pointInAabb(layout.radiusCx, layout.radiusCy, layout.resizeHit)).toBe(false);
    expect(layout.axisClearanceScreen).toBeGreaterThanOrEqual(CHROME_RADIUS_PARK_GAP_PX - 0.05);
  });

  it('bisector park matches axis park on 45° corners', () => {
    const park = 13;
    const along = radiusParkAlongBisector(park, -Math.SQRT1_2, -Math.SQRT1_2);
    expect(along * Math.SQRT1_2).toBeCloseTo(park, 10);
  });
});
