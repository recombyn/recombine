/**
 * At ~8000% zoom, rotate must not steal control-box / resize clicks.
 * Repro: 4×4 box @ zoom 80.19 (screenshot 8019%).
 * Resize hit is centered on the control-box corner icon.
 */
import { describe, expect, it } from 'vitest';
import {
  CHROME_HANDLE_HIT_PX,
  CHROME_ROTATE_GAP_PX,
  CHROME_ROTATE_HIT_PX,
  chromeHitScaleForBox,
  rotateHotzoneOutward,
} from '../SelectionChrome';

type Aabb = { left: number; top: number; right: number; bottom: number };

function aabb(cx: number, cy: number, half: number): Aabb {
  return {
    left: cx - half,
    top: cy - half,
    right: cx + half,
    bottom: cy + half,
  };
}

function overlap(a: Aabb, b: Aabb): boolean {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

function contains(box: Aabb, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** Production SE corner layout (local geom). */
function seResizeRotateLayout(boxW: number, boxH: number, zoom: number) {
  const z = Math.max(0.05, zoom);
  const inv = 1 / z;
  const hitScale = chromeHitScaleForBox(boxW, boxH, z);
  const handleHit = CHROME_HANDLE_HIT_PX * inv * hitScale;
  const halfHit = handleHit / 2;
  const rotateHit = CHROME_ROTATE_HIT_PX * inv * hitScale;
  const rotateGap = CHROME_ROTATE_GAP_PX * inv;
  const out = rotateHotzoneOutward(handleHit, rotateGap, rotateHit);

  const resizeC = { x: boxW, y: boxH };
  const rotateC = { x: resizeC.x + out, y: resizeC.y + out };
  const resizeHit = aabb(resizeC.x, resizeC.y, halfHit);
  const rotateHitBox = aabb(rotateC.x, rotateC.y, rotateHit / 2);

  return {
    resizeC,
    rotateC,
    resizeHit,
    rotateHitBox,
    overlap: overlap(resizeHit, rotateHitBox),
    axisGapScreen: (rotateHitBox.left - resizeHit.right) * z,
  };
}

function ownerAt(
  layout: ReturnType<typeof seResizeRotateLayout>,
  x: number,
  y: number
): 'resize' | 'rotate' | 'none' {
  if (contains(layout.resizeHit, x, y)) return 'resize';
  if (contains(layout.rotateHitBox, x, y)) return 'rotate';
  return 'none';
}

describe('resize vs rotate @ high zoom (control box clicks)', () => {
  it('rotate hit stays modest (not a 22px magnet on the corner)', () => {
    expect(CHROME_ROTATE_HIT_PX).toBeLessThanOrEqual(16);
    expect(CHROME_ROTATE_GAP_PX).toBeGreaterThanOrEqual(6);
  });

  it.each([1, 8, 20, 49.9, 80.19, 90] as const)(
    'SE resize and rotate AABBs do not overlap at zoom %s (4×4 box)',
    (zoom) => {
      const layout = seResizeRotateLayout(4, 4, zoom);
      expect(layout.overlap).toBe(false);
      expect(layout.axisGapScreen).toBeGreaterThanOrEqual(CHROME_ROTATE_GAP_PX - 0.05);
    }
  );

  it('at 8019%, control-box corner / resize icon is resize — not rotate', () => {
    const layout = seResizeRotateLayout(4, 4, 80.19);
    expect(ownerAt(layout, layout.resizeC.x, layout.resizeC.y)).toBe('resize');
    expect(ownerAt(layout, 4, 4)).toBe('resize');
    expect(ownerAt(layout, 3.95, 3.95)).not.toBe('rotate');
    expect(ownerAt(layout, 2, 4)).not.toBe('rotate');
    expect(ownerAt(layout, 4, 2)).not.toBe('rotate');
    expect(ownerAt(layout, layout.rotateC.x, layout.rotateC.y)).toBe('rotate');
  });

  it('approach corridor: screen px 0–6 resize, then air, then rotate', () => {
    const zoom = 80.19;
    const layout = seResizeRotateLayout(4, 4, zoom);
    const samples: Array<{ d: number; owner: string }> = [];
    for (let d = 0; d <= 36; d += 2) {
      const s = d / zoom;
      const owner = ownerAt(layout, 4 + s, 4 + s);
      if (owner !== 'none') samples.push({ d, owner });
    }
    expect(samples.filter((s) => s.owner === 'resize').every((s) => s.d <= 8)).toBe(true);
    expect(samples.filter((s) => s.owner === 'rotate').every((s) => s.d >= 12)).toBe(true);
    expect(layout.overlap).toBe(false);
  });
});
