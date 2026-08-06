import { describe, expect, it } from 'vitest';
import { snapBoxEdgesToGrid, snapCoordToGrid } from '../../selection/alignGuides';
import { sceneSurfaceSvgProps, worldCameraViewport } from '../../scene/paint/sceneToSvg';
import type { RcbCamera } from '../../core/types';
import { resolveClosedDrawBoxes } from '../ShapeDrawFeature';

/**
 * Preview used to paint on a per-drag `sceneSurfaceSvgProps` SVG.
 * At fractional DPR that surface origin snaps independently from the shared
 * world viewport → preview drifts vs grid; commit (shared SVG) looks correct.
 * Preview must share the world lattice (portal into data-rcb-draw-preview-mount).
 *
 * Pen draw / path-edit chrome had the same sibling-SVG drift — anchors looked
 * mid-cell even when snap math stored integers. Same portal target.
 */
describe('shape draw preview lattice', () => {
  const camera: RcbCamera = { x: 12.3, y: 45.6, zoom: 1 };

  it('at dpr 0.9, per-box preview surface snaps origin independently of world viewport', () => {
    const dpr = 0.9;
    const world = worldCameraViewport(camera, dpr, 800, 600);
    expect(world).not.toBeNull();
    const rawLeft = 100.4;
    const rawTop = 200.7;
    const surf = sceneSurfaceSvgProps(
      { left: rawLeft, top: rawTop, width: 60, height: 50 },
      camera,
      dpr
    );
    // Fractional DPR snaps the preview SVG origin away from the raw scene box.
    expect(surf.style.left !== rawLeft || surf.style.top !== rawTop).toBe(true);
    // That origin is not the shared world surface — two lattices.
    expect(surf.style.left).not.toBe(world!.left);
    expect(surf.style.top).not.toBe(world!.top);
    // eslint-disable-next-line no-console
    console.log('[test:pen-chrome-lattice:legacy]', {
      world: { left: world!.left, top: world!.top },
      penSurf: { left: surf.style.left, top: surf.style.top },
    });
  });

  it('closed draw visual edges land on grid (same math preview + commit)', () => {
    const gridSize = 1;
    const raw = { left: 10.4, top: 20.6, width: 5.7, height: 4.2 };
    const visual = snapBoxEdgesToGrid(raw, gridSize, 1);
    expect(visual.left).toBe(snapCoordToGrid(visual.left, gridSize));
    expect(visual.top).toBe(snapCoordToGrid(visual.top, gridSize));
    expect(visual.left + visual.width).toBe(snapCoordToGrid(visual.left + visual.width, gridSize));
    expect(visual.top + visual.height).toBe(snapCoordToGrid(visual.top + visual.height, gridSize));
  });

  it('circle visual 3×3 → geom 2×2; commit must keep geom (not Math.max 3)', () => {
    const { visual, geom, outset } = resolveClosedDrawBoxes(
      { left: 10, top: 10, width: 3, height: 3 },
      true,
      1,
      'circle'
    );
    expect(visual.width).toBe(3);
    expect(visual.height).toBe(3);
    expect(outset).toBe(0.5);
    expect(geom.width).toBe(2);
    expect(geom.height).toBe(2);
    // Old onCreateShape did Math.max(3, geom) → path 3 + stroke → visual 4. Forbidden.
    expect(Math.max(3, geom.width)).not.toBe(geom.width);
  });
});
