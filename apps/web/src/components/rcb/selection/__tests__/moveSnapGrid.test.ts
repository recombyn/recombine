import { describe, expect, it } from 'vitest';
import {
  snapBoxToGrid,
  snapCoordToGrid,
  snapMoveToSmartGuides,
  snapResizeToGrid,
  snapResizeToSmartGuides,
} from '../alignGuides';
import {
  strokeChromeOutset,
  inflateBoxByVisualOutset,
  strokeVisualOutset,
} from '../../scene/document/sceneEffects';
import { resolveClosedDrawBoxes } from '../../tools/ShapeDrawFeature';

/**
 * Production move policy when gridSize > 0:
 *   nextVisual = snapBoxToGrid(visual0 + delta)   // smart does NOT nudge
 *   path += (nextVisual - visual0)
 * Path may stay on *.5; ink outer stays on integer cells.
 */
function moveSnapVisualOnly(opts: {
  path: { left: number; top: number; width: number; height: number };
  node: any;
  gridSize: number;
  dx?: number;
  dy?: number;
}) {
  const visual0 = inflateBoxByVisualOutset(opts.path, opts.node);
  const dragged = {
    ...visual0,
    left: visual0.left + (opts.dx ?? 0),
    top: visual0.top + (opts.dy ?? 0),
  };
  const visual = snapBoxToGrid(dragged, opts.gridSize);
  const sdx = visual.left - visual0.left;
  const sdy = visual.top - visual0.top;
  return {
    visual,
    path: {
      ...opts.path,
      left: opts.path.left + sdx,
      top: opts.path.top + sdy,
    },
    sdx,
    sdy,
  };
}

function assertInkOnGrid(
  path: { left: number; top: number; width: number; height: number },
  node: any,
  gridSize: number
) {
  const ink = inflateBoxByVisualOutset(path, node);
  expect(ink.left).toBe(snapCoordToGrid(ink.left, gridSize));
  expect(ink.top).toBe(snapCoordToGrid(ink.top, gridSize));
  expect(ink.left + ink.width).toBe(snapCoordToGrid(ink.left + ink.width, gridSize));
  expect(ink.top + ink.height).toBe(snapCoordToGrid(ink.top + ink.height, gridSize));
}

describe('visual-outer move snap (1px grid)', () => {
  // Real createShapeNode attrs — resolveStroke reads border-width, not borderWidth.
  const centerStroke1 = {
    key: 'shape',
    attrs: {
      shapeType: 'rect',
      'border-width': 1,
      'border-color': '#333333',
      strokeAlign: 'center',
      'stroke-enabled': 'true',
      'stroke-visible': 'true',
    },
  };

  it('chrome stays on path; visual outer is separate (move/snap only)', () => {
    expect(strokeChromeOutset(centerStroke1)).toBe(0);
    expect(strokeVisualOutset(centerStroke1)).toBe(0.5);
    const path = { left: 10.5, top: 8.5, width: 3, height: 2 };
    const visual = {
      left: path.left - 0.5,
      top: path.top - 0.5,
      width: path.width + 1,
      height: path.height + 1,
    };
    // eslint-disable-next-line no-console
    console.log('[test:chrome=path]', { path, visual, chromeOutset: 0 });
    expect(visual.left).toBe(10);
    expect(visual.top).toBe(8);
  });

  it('draw → path *.5 → free drag keeps ink on integer grid (1px steps)', () => {
    const { visual: drawnVis, geom } = resolveClosedDrawBoxes(
      { left: 10.2, top: 8.4, width: 7.6, height: 7.1 },
      true,
      1,
      'rect'
    );
    expect(drawnVis.left).toBe(snapCoordToGrid(drawnVis.left, 1));
    expect(geom.left).toBe(drawnVis.left + 0.5);

    const moved = moveSnapVisualOnly({
      path: geom,
      node: centerStroke1,
      gridSize: 1,
      dx: 2.37,
      dy: -1.61,
    });
    // eslint-disable-next-line no-console
    console.log('[test:draw→move]', {
      drawnVis,
      geom,
      moved,
      stepX: moved.sdx,
      stepY: moved.sdy,
    });
    assertInkOnGrid(moved.path, centerStroke1, 1);
    // Steps are whole grid cells (not sub-pixel crawl).
    expect(Number.isInteger(moved.sdx)).toBe(true);
    expect(Number.isInteger(moved.sdy)).toBe(true);
    expect(moved.path.left).toBe(moved.visual.left + 0.5);
  });

  it('old path-grid snap yanks ink off grid — must not be used', () => {
    const path = { left: 10.5, top: 10.5, width: 7, height: 7 };
    const wrong = snapBoxToGrid({ ...path, left: path.left + 2.3, top: path.top }, 1);
    const wrongInk = inflateBoxByVisualOutset(wrong, centerStroke1);
    expect(wrongInk.left).not.toBe(snapCoordToGrid(wrongInk.left, 1));

    const right = moveSnapVisualOnly({
      path,
      node: centerStroke1,
      gridSize: 1,
      dx: 2.3,
      dy: 0,
    });
    assertInkOnGrid(right.path, centerStroke1, 1);
  });

  it('smart gap "4" must not leave moved ink off-grid (regression)', () => {
    // Left sibling already on-grid (visual 10..18). Right starts on-grid too.
    const leftVis = { left: 10, top: 10, width: 8, height: 8 };
    const rightPath = { left: 22.5, top: 10.5, width: 7, height: 7 };
    const rightVis0 = inflateBoxByVisualOutset(rightPath, centerStroke1);
    expect(rightVis0.left).toBe(22);

    // Pointer would place a ~4 cell gap, but with subpixel noise + smart pull.
    const noisy = {
      ...rightVis0,
      left: leftVis.left + leftVis.width + 4 + 0.37,
      top: rightVis0.top + 0.22,
    };
    // Old messy judge: smart nudge first (could land off lattice), then optionally
    // skip grid on that axis. New policy: grid only.
    const smart = snapMoveToSmartGuides({
      box: noisy,
      targets: [leftVis],
      threshold: 8,
      gridSize: 1,
    });
    const gridOnly = snapBoxToGrid(noisy, 1);
    // eslint-disable-next-line no-console
    console.log('[test:gap4]', { noisy, smart: smart.box, gridOnly });

    const moved = moveSnapVisualOnly({
      path: rightPath,
      node: centerStroke1,
      gridSize: 1,
      dx: noisy.left - rightVis0.left,
      dy: noisy.top - rightVis0.top,
    });
    assertInkOnGrid(moved.path, centerStroke1, 1);
    expect(moved.visual.left).toBe(gridOnly.left);
    expect(moved.visual.top).toBe(gridOnly.top);
  });

  it('repair: path already integer (ink *.5) — one drag puts ink back on grid', () => {
    // After old path-snap bug: path on integers → ink floats between cells.
    const brokenPath = { left: 14, top: 11, width: 7, height: 7 };
    const brokenInk = inflateBoxByVisualOutset(brokenPath, centerStroke1);
    expect(brokenInk.left).toBe(13.5);
    expect(brokenInk.left).not.toBe(snapCoordToGrid(brokenInk.left, 1));

    const fixed = moveSnapVisualOnly({
      path: brokenPath,
      node: centerStroke1,
      gridSize: 1,
      dx: 0.01,
      dy: 0.01,
    });
    // eslint-disable-next-line no-console
    console.log('[test:repair]', { brokenPath, fixed });
    assertInkOnGrid(fixed.path, centerStroke1, 1);
  });

  it('resize visual edge then inset path keeps ink on grid', () => {
    const path = { left: 10.5, top: 10.5, width: 7, height: 7 };
    const visual0 = inflateBoxByVisualOutset(path, centerStroke1);
    const smart = snapResizeToSmartGuides({
      box: { ...visual0, width: visual0.width + 2.4 },
      handle: 'e',
      targets: [],
      threshold: 8,
      min: 2,
      gridSize: 1,
    });
    const gridVisual = snapResizeToGrid(smart.box, 'e', 1, 2);
    const outset = strokeVisualOutset(centerStroke1);
    const pathNext = {
      left: gridVisual.left + outset,
      top: gridVisual.top + outset,
      width: Math.max(1, gridVisual.width - outset * 2),
      height: Math.max(1, gridVisual.height - outset * 2),
    };
    assertInkOnGrid(pathNext, centerStroke1, 1);
  });
});
