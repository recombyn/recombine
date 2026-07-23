/**
 * Bridge so siblings of SvgCanvas (e.g. FrameMoveFeature) can reuse the same
 * ink-aware hit test — mirrors single editor.getShapeAtPoint path.
 */
export type SceneHitFn = (
  x: number,
  y: number,
  screen?: { clientX: number; clientY: number }
) => string | null;

let hitFn: SceneHitFn | null = null;

export function setSceneHitTestBridge(fn: SceneHitFn | null) {
  hitFn = fn;
}

export function bridgeSceneHitTest(
  x: number,
  y: number,
  screen?: { clientX: number; clientY: number }
): string | null {
  return hitFn?.(x, y, screen) ?? null;
}
