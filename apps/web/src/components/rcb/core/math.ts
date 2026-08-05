import { readDevicePixelRatio, snapCssToDevicePixel, toDomPrecision } from './dpr';
import type { RcbBox, RcbCamera, RcbVec } from './types';

/** Camera zoom floor / ceiling (5% … 1200%). */
export const RCB_MIN_ZOOM = 0.05;
export const RCB_MAX_ZOOM = 12;

export function rcbClampZoom(z: number) {
  return Math.min(RCB_MAX_ZOOM, Math.max(RCB_MIN_ZOOM, Number(z.toFixed(4))));
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

/**
 * CSS `scale()` written on the camera world layer (`RcbCanvas` camZ).
 * Stage overlays must multiply by this — raw `camera.zoom` drifts on large scene X/Y.
 */
export function rcbCameraCssZoom(camera: RcbCamera): number {
  return toDomPrecision(Math.max(0.05, camera.zoom || 1));
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
  const z = rcbCameraCssZoom(camera);
  const { x: camX, y: camY } = rcbCameraScreenOffset(camera, dpr);
  return {
    x: sceneX * z + camX,
    y: sceneY * z + camY,
  };
}

/**
 * Snap a scene-axis value so `(scene * zoom + camSnapped) * dpr` lands on an
 * integer device pixel. Needed when browser zoom makes dpr fractional (e.g. 0.9):
 * pan is already snapped, but scene*zoom*dpr is still often frac — SVG strokes
 * and HTML chrome then round to different pixels.
 */
export function rcbSnapSceneAxis(
  scene: number,
  zoom: number,
  camSnapped: number,
  dpr: number
): number {
  const z = Math.max(0.05, zoom || 1);
  const d = dpr > 0 ? dpr : 1;
  const screen = scene * z + camSnapped;
  const snappedScreen = snapCssToDevicePixel(screen, d);
  return (snappedScreen - camSnapped) / z;
}

/** Snap box corners onto the device-pixel grid under the live camera CSS. */
export function rcbSnapSceneBox(
  box: { left: number; top: number; width: number; height: number },
  camera: RcbCamera,
  dpr: number = readDevicePixelRatio()
): { left: number; top: number; width: number; height: number } {
  const z = Math.max(0.05, camera.zoom || 1);
  const { x: camX, y: camY } = rcbCameraScreenOffset(camera, dpr);
  const left = rcbSnapSceneAxis(box.left, z, camX, dpr);
  const top = rcbSnapSceneAxis(box.top, z, camY, dpr);
  const right = rcbSnapSceneAxis(box.left + box.width, z, camX, dpr);
  const bottom = rcbSnapSceneAxis(box.top + box.height, z, camY, dpr);
  return {
    left,
    top,
    width: Math.max(1e-4, right - left),
    height: Math.max(1e-4, bottom - top),
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
  const z = rcbCameraCssZoom(camera);
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

/** Fit scene bounds into the viewport (e.g. document open / Shift+1). */
export function rcbFitCamera(
  viewport: { width: number; height: number },
  bounds: { x?: number; y?: number; width: number; height: number },
  /** Screen-px margin on each side (top/right/bottom/left). */
  padding = 120,
  /** Cap so small scenes do not zoom past 100%. */
  maxZoom = 1
): RcbCamera {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const aw = Math.max(1, bounds.width);
  const ah = Math.max(1, bounds.height);
  const ox = bounds.x || 0;
  const oy = bounds.y || 0;
  const pad = Math.max(0, padding);
  const cap = Math.max(RCB_MIN_ZOOM, Math.min(RCB_MAX_ZOOM, maxZoom));
  const availW = Math.max(1, vw - pad * 2);
  const availH = Math.max(1, vh - pad * 2);
  const zoom = rcbClampZoom(Math.min(availW / aw, availH / ah, cap));
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
