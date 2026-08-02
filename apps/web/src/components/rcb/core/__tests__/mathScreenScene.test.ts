import { describe, expect, it, vi } from 'vitest';
import {
  rcbCameraScreenOffset,
  rcbClientDeltaToScene,
  rcbClientToStageLocal,
  rcbResolveViewportEl,
  rcbSceneToScreen,
  rcbScreenToScene,
} from '../math';
import { snapCssToDevicePixel, toDomPrecision } from '../dpr';

function mockViewport(opts: {
  left: number;
  top: number;
  width: number;
  height: number;
  clientWidth?: number;
  clientHeight?: number;
  connected?: boolean;
}) {
  return {
    getBoundingClientRect: () =>
      ({
        left: opts.left,
        top: opts.top,
        width: opts.width,
        height: opts.height,
        right: opts.left + opts.width,
        bottom: opts.top + opts.height,
        x: opts.left,
        y: opts.top,
        toJSON: () => ({}),
      }) as DOMRect,
    clientWidth: opts.clientWidth ?? opts.width,
    clientHeight: opts.clientHeight ?? opts.height,
    isConnected: opts.connected ?? true,
  } as HTMLElement;
}

describe('rcb screen ↔ scene', () => {
  it('uses DPR-snapped pan so scene→screen matches CSS translate', () => {
    const camera = { zoom: 0.18, x: 100.4, y: -40.7 };
    const dpr = 0.9;
    const offset = rcbCameraScreenOffset(camera, dpr);
    expect(offset.x).toBe(toDomPrecision(snapCssToDevicePixel(camera.x, dpr)));
    expect(offset.y).toBe(toDomPrecision(snapCssToDevicePixel(camera.y, dpr)));

    const screen = rcbSceneToScreen(camera, 50, 80, dpr);
    expect(screen.x).toBeCloseTo(50 * 0.18 + offset.x, 5);
    expect(screen.y).toBeCloseTo(80 * 0.18 + offset.y, 5);
  });

  it('round-trips through a mock viewport with snapped pan', () => {
    const camera = { zoom: 0.18, x: 120.3, y: 44.8 };
    const dpr = 1.25;
    const viewportEl = mockViewport({ left: 10, top: 20, width: 400, height: 300 });

    const scene = { x: 220, y: -30 };
    const screen = rcbSceneToScreen(camera, scene.x, scene.y, dpr);
    const back = rcbScreenToScene(
      camera,
      viewportEl,
      10 + screen.x,
      20 + screen.y,
      dpr
    );
    expect(back.x).toBeCloseTo(scene.x, 5);
    expect(back.y).toBeCloseTo(scene.y, 5);
  });

  it('corrects ancestor CSS scale via rect/clientWidth ratio', () => {
    const camera = { zoom: 1, x: 0, y: 0 };
    // Layout 800×600, visually scaled to 400×300 (scale 0.5).
    const viewportEl = mockViewport({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      clientWidth: 800,
      clientHeight: 600,
    });
    const local = rcbClientToStageLocal(viewportEl, 200, 150);
    expect(local.x).toBeCloseTo(400, 5);
    expect(local.y).toBeCloseTo(300, 5);
    const scene = rcbScreenToScene(camera, viewportEl, 200, 150);
    expect(scene.x).toBeCloseTo(400, 5);
    expect(scene.y).toBeCloseTo(300, 5);
  });

  it('maps client deltas with scale', () => {
    expect(rcbClientDeltaToScene(0.18, 18, -9)).toEqual({ x: 100, y: -50 });
    expect(rcbClientDeltaToScene(1, 10, 20, 0.5, 0.5)).toEqual({ x: 20, y: 40 });
  });

  it('prefers a connected viewport node', () => {
    const dead = mockViewport({ left: 0, top: 0, width: 0, height: 0, connected: false });
    const live = mockViewport({ left: 0, top: 0, width: 100, height: 100, connected: true });
    expect(rcbResolveViewportEl(dead, live)).toBe(live);
    expect(rcbResolveViewportEl(null, dead)).toBe(dead);
  });
});
