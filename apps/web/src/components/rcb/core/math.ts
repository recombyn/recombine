import { readDevicePixelRatio, snapCssToDevicePixel, toDomPrecision } from './dpr';
import type { RcbBox, RcbCamera, RcbVec } from './types';

export function rcbClampZoom(z: number) {
  return Math.min(8, Math.max(0.05, Number(z.toFixed(4))));
}

/**
 * CSS translate written on the camera world layer.
 * Must match `RcbCanvas` so hit-testing and overlays stay locked to pixels.
 */
export function rcbCameraScreenOffset(
  camera: RcbCamera,
  dpr: number = readDevicePixelRatio()
): RcbVec {
  return {
    x: toDomPrecision(snapCssToDevicePixel(camera.x, dpr)),
    y: toDomPrecision(snapCssToDevicePixel(camera.y, dpr)),
  };
}

export type RcbViewportMetrics = {
  rect: DOMRect;
  /** Visual CSS px per layout px (≈1 unless an ancestor has CSS scale / zoom). */
  scaleX: number;
  scaleY: number;
  clientWidth: number;
  clientHeight: number;
  connected: boolean;
};

/**
 * Map a client point into the stage's *layout* coordinate space (same space as
 * `camera.x/y` and CSS `translate` on the world layer).
 *
 * `getBoundingClientRect` is visual; `clientWidth` is layout. When they differ
 * (ancestor `transform: scale`, browser zoom quirks, stale detached node),
 * dividing by the ratio keeps the pointer on the ink.
 */
export function rcbViewportMetrics(viewportEl: HTMLElement): RcbViewportMetrics {
  const rect = viewportEl.getBoundingClientRect();
  const clientWidth = Math.max(0, viewportEl.clientWidth || 0);
  const clientHeight = Math.max(0, viewportEl.clientHeight || 0);
  const connected = typeof viewportEl.isConnected === 'boolean' ? viewportEl.isConnected : true;
  const scaleX =
    clientWidth > 0 && rect.width > 0 ? rect.width / clientWidth : 1;
  const scaleY =
    clientHeight > 0 && rect.height > 0 ? rect.height / clientHeight : 1;
  return { rect, scaleX, scaleY, clientWidth, clientHeight, connected };
}

/** Client → stage-local layout px (pre-camera). */
export function rcbClientToStageLocal(
  viewportEl: HTMLElement,
  clientX: number,
  clientY: number
): RcbVec & RcbViewportMetrics {
  const m = rcbViewportMetrics(viewportEl);
  const sx = m.scaleX > 0 ? m.scaleX : 1;
  const sy = m.scaleY > 0 ? m.scaleY : 1;
  return {
    ...m,
    x: (clientX - m.rect.left) / sx,
    y: (clientY - m.rect.top) / sy,
  };
}

/** Scene (page/world) -> screen/stage-local layout pixels. */
export function rcbSceneToScreen(
  camera: RcbCamera,
  sceneX: number,
  sceneY: number,
  dpr?: number
): RcbVec {
  const z = Math.max(0.05, camera.zoom || 1);
  const { x: camX, y: camY } = rcbCameraScreenOffset(camera, dpr);
  return {
    x: sceneX * z + camX,
    y: sceneY * z + camY,
  };
}

/**
 * Screen/client -> scene (page/world).
 * viewportEl is the unscaled stage root.
 * Uses DPR-snapped pan + layout/visual scale correction.
 */
export function rcbScreenToScene(
  camera: RcbCamera,
  viewportEl: HTMLElement,
  clientX: number,
  clientY: number,
  dpr?: number
): RcbVec {
  const local = rcbClientToStageLocal(viewportEl, clientX, clientY);
  const z = Math.max(0.05, camera.zoom || 1);
  const { x: camX, y: camY } = rcbCameraScreenOffset(camera, dpr);
  return {
    x: (local.x - camX) / z,
    y: (local.y - camY) / z,
  };
}

/**
 * Client-pixel gesture delta -> scene units.
 * Pass the same scaleX/scaleY from `rcbViewportMetrics` at gesture start.
 */
export function rcbClientDeltaToScene(
  zoom: number,
  clientDx: number,
  clientDy: number,
  scaleX = 1,
  scaleY = 1
): RcbVec {
  const z = Math.max(0.05, zoom || 1);
  const sx = scaleX > 0 ? scaleX : 1;
  const sy = scaleY > 0 ? scaleY : 1;
  return { x: clientDx / sx / z, y: clientDy / sy / z };
}

/** On-screen pixel gap -> scene units. */
export function rcbScreenPxToScene(px: number, zoom: number) {
  return px / Math.max(0.05, zoom || 1);
}

/** Zoom about a stage-local point (keeps that screen point fixed). */
export function rcbZoomAtPoint(
  camera: RcbCamera,
  nextZoom: number,
  localX: number,
  localY: number
): RcbCamera {
  const z0 = camera.zoom;
  const z1 = rcbClampZoom(nextZoom);
  if (z0 === z1) return camera;
  // Use raw camera pan (state space). CSS snap is display-only.
  const sceneX = (localX - camera.x) / z0;
  const sceneY = (localY - camera.y) / z0;
  return { zoom: z1, x: localX - sceneX * z1, y: localY - sceneY * z1 };
}

/** Fit scene bounds into the viewport (e.g. document open). */
export function rcbFitCamera(
  viewport: { width: number; height: number },
  bounds: { x?: number; y?: number; width: number; height: number },
  padding = 72
): RcbCamera {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const aw = Math.max(1, bounds.width);
  const ah = Math.max(1, bounds.height);
  const ox = bounds.x || 0;
  const oy = bounds.y || 0;
  const zoom = rcbClampZoom(Math.min((vw - padding * 2) / aw, (vh - padding * 2) / ah, 1));
  return {
    zoom,
    x: (vw - aw * zoom) / 2 - ox * zoom,
    y: (vh - ah * zoom) / 2 - oy * zoom,
  };
}

/** Visible scene AABB under the current camera. */
export function rcbViewportSceneBounds(
  camera: RcbCamera,
  stage: { width: number; height: number }
): RcbBox {
  const z = Math.max(0.05, camera.zoom || 1);
  return {
    x: -camera.x / z,
    y: -camera.y / z,
    width: Math.max(1, stage.width / z),
    height: Math.max(1, stage.height / z),
  };
}

/**
 * Quantize zoom while the camera is moving.
 * Keeps cull / LOD stable across tiny wheel deltas; idle uses true zoom.
 */
export function rcbStepZoom(zoom: number, step = 0.05): number {
  const z = Math.max(0.05, zoom || 1);
  const s = Math.max(0.01, step);
  return Math.round(Math.round(z / s) * s * 1e4) / 1e4;
}

/** Prefer a live, connected stage node (context beats a stale prop after resize). */
export function rcbResolveViewportEl(
  ...candidates: Array<HTMLElement | null | undefined>
): HTMLElement | null {
  for (const el of candidates) {
    if (el && el.isConnected) return el;
  }
  for (const el of candidates) {
    if (el) return el;
  }
  return null;
}
