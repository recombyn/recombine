import type { RcbBox, RcbCamera, RcbVec } from './types';

export function rcbClampZoom(z: number) {
  return Math.min(8, Math.max(0.05, Number(z.toFixed(4))));
}

/** Scene (page/world) -> screen/stage-local pixels. */
export function rcbSceneToScreen(camera: RcbCamera, sceneX: number, sceneY: number): RcbVec {
  const z = Math.max(0.05, camera.zoom || 1);
  return {
    x: sceneX * z + camera.x,
    y: sceneY * z + camera.y,
  };
}

/**
 * Screen/client -> scene (page/world).
 * iewportEl is the unscaled stage root (getBoundingClientRect origin).
 */
export function rcbScreenToScene(
  camera: RcbCamera,
  viewportEl: HTMLElement,
  clientX: number,
  clientY: number
): RcbVec {
  const rect = viewportEl.getBoundingClientRect();
  const z = Math.max(0.05, camera.zoom || 1);
  return {
    x: (clientX - rect.left - camera.x) / z,
    y: (clientY - rect.top - camera.y) / z,
  };
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
