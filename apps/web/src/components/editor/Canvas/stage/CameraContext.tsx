import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type CanvasCamera = {
  x: number;
  y: number;
  zoom: number;
};

export const DEFAULT_CAMERA: CanvasCamera = { x: 80, y: 60, zoom: 1 };

export const CameraContext = createContext<CanvasCamera>(DEFAULT_CAMERA);

/** DOM node for screen-space HTML overlays (sibling of the scaled world). */
export const CameraOverlayRootContext = createContext<HTMLElement | null>(null);

export function useCamera(): CanvasCamera {
  return useContext(CameraContext);
}

export function useCameraOverlayRoot(): HTMLElement | null {
  return useContext(CameraOverlayRootContext);
}

/** World → stage (viewport-local) pixels. */
export function worldToStage(
  camera: CanvasCamera,
  worldX: number,
  worldY: number
): { x: number; y: number } {
  const z = Math.max(0.05, camera.zoom || 1);
  return {
    x: worldX * z + camera.x,
    y: worldY * z + camera.y,
  };
}

/** Convert a constant on-screen pixel gap into world/scene units. */
export function screenPxToWorld(px: number, zoom: number) {
  return px / Math.max(0.05, zoom || 1);
}

/**
 * Position an HTML toolbar in screen/stage space (outside camera scale).
 * Pass world coordinates; returns absolute stage styles — stays sharp at any zoom.
 *
 * `anchor: 'bottom'` — `top` is the bottom edge of the toolbar (sits above the point).
 * `anchor: 'top'` — `top` is the top edge (hangs below the point).
 */
export function useScreenFixedToolbarStyle(opts: {
  left: number;
  top: number;
  /** Which edge of the toolbar anchors toward the target. */
  anchor?: 'bottom' | 'top';
}): CSSProperties {
  const camera = useCamera();
  const { x, y } = worldToStage(camera, opts.left, opts.top);
  const anchor = opts.anchor ?? 'bottom';
  return useMemo(
    () => ({
      position: 'absolute' as const,
      left: x,
      top: y,
      transform: anchor === 'bottom' ? 'translate(-50%, -100%)' : 'translateX(-50%)',
      transformOrigin: anchor === 'bottom' ? 'center bottom' : 'center top',
    }),
    [x, y, anchor]
  );
}

/**
 * Portal children into the stage overlay layer (unscaled).
 * Returns null until the overlay root mounts — never fall back into the
 * camera-scaled world tree (that would enlarge controls with zoom).
 */
export function CameraOverlayPortal({ children }: { children: ReactNode }) {
  const root = useCameraOverlayRoot();
  if (!root) return null;
  return createPortal(children, root);
}
