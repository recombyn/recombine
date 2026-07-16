import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/utils/classnames';
import SvgContextLayer from './SvgContextLayer';
import {
  CameraContext,
  CameraOverlayRootContext,
  DEFAULT_CAMERA,
  type CanvasCamera,
} from './CameraContext';

export type { CanvasCamera };
export { DEFAULT_CAMERA };

function clampZoom(z: number) {
  return Math.min(8, Math.max(0.05, Number(z.toFixed(4))));
}

function fitCamera(
  viewport: { width: number; height: number },
  artboard: { x?: number; y?: number; width: number; height: number },
  padding = 72
): CanvasCamera {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const aw = Math.max(1, artboard.width);
  const ah = Math.max(1, artboard.height);
  const ox = artboard.x || 0;
  const oy = artboard.y || 0;
  const zoom = clampZoom(Math.min((vw - padding * 2) / aw, (vh - padding * 2) / ah, 1));
  return {
    zoom,
    x: (vw - aw * zoom) / 2 - ox * zoom,
    y: (vh - ah * zoom) / 2 - oy * zoom,
  };
}

/** Zoom while keeping the given stage-local point (px) fixed on screen. */
export function zoomAtPoint(
  camera: CanvasCamera,
  nextZoom: number,
  localX: number,
  localY: number
): CanvasCamera {
  const z0 = camera.zoom;
  const z1 = clampZoom(nextZoom);
  if (z0 === z1) return camera;
  const worldX = (localX - camera.x) / z0;
  const worldY = (localY - camera.y) / z0;
  return { zoom: z1, x: localX - worldX * z1, y: localY - worldY * z1 };
}

/** Targets that should keep pointer for selection / UI — not empty-canvas pan. */
const PAN_BLOCK_SELECTOR = [
  '[data-scene-node-id]',
  '[data-sel-box]',
  '[data-sel-handle]',
  '[data-frame-label]',
  '[data-image-label]',
  '[data-frame-toolbar]',
  '[data-sel-toolbar]',
  '[data-ctx-menu]',
  '[data-crop-expand-overlay]',
  '[data-crop-expand-toolbar]',
  '[data-image-tool-panel]',
  '[data-gradient-handles]',
  '[data-mesh-handles]',
  '[data-shape-style-panel]',
].join(',');

type InfiniteCanvasStageProps = {
  /** World content bounds for one-time fit. Skip when empty (0×0). */
  artboard: { x?: number; y?: number; width: number; height: number };
  camera: CanvasCamera;
  onCameraChange: (next: CanvasCamera) => void;
  panMode?: boolean;
  /**
   * In select tool: left-drag on empty canvas pans (Lovart-style).
   * Space / middle mouse / panMode always pan regardless.
   */
  emptyDragPans?: boolean;
  /**
   * When empty-drag would pan, return true to skip pan (e.g. pointer is over an artboard frame).
   */
  shouldBlockEmptyPan?: (e: PointerEvent) => boolean;
  className?: string;
  children: ReactNode;
  stageRef?: RefObject<HTMLDivElement | null>;
  /** crosshair while drawing frames */
  cursor?: string;
  /** Canvas backdrop color (defaults to theme --canvas). */
  background?: string;
  /**
   * Stable id for one-time autofit (e.g. document id).
   * Changing artboard bounds alone must NOT re-center the camera.
   */
  fitKey?: string;
};

/** Infinite viewport: whole page is the canvas (, self-built). */
export default function InfiniteCanvasStage({
  artboard,
  camera,
  onCameraChange,
  panMode = false,
  emptyDragPans = false,
  shouldBlockEmptyPan,
  className,
  children,
  stageRef: stageRefProp,
  cursor,
  background,
  fitKey,
}: InfiniteCanvasStageProps) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const stageRef = stageRefProp || localRef;
  const cameraRef = useRef(camera);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  /** Empty-area left-drag: wait for a few px before panning so clicks still deselect. */
  const pendingPanRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const spaceDown = useRef(false);
  const emptyDragPansRef = useRef(emptyDragPans);
  const shouldBlockEmptyPanRef = useRef(shouldBlockEmptyPan);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const fittedKey = useRef('');

  cameraRef.current = camera;
  emptyDragPansRef.current = emptyDragPans;
  shouldBlockEmptyPanRef.current = shouldBlockEmptyPan;
  const emptyWorld = !(artboard.width > 0 && artboard.height > 0);

  // Autofit once per document open when content already exists.
  // Do not re-fit when the user draws new frames (that felt like the frame jumping).
  useEffect(() => {
    const key = fitKey || 'default';
    if (emptyWorld) {
      // Session started empty — never autofit when the first frame appears.
      if (fittedKey.current !== key) fittedKey.current = `${key}:empty`;
      return;
    }
    if (fittedKey.current === key || fittedKey.current === `${key}:empty`) {
      fittedKey.current = key;
      return;
    }
    const el = stageRef.current;
    if (!el) return;
    const applyFit = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      fittedKey.current = key;
      onCameraChange(fitCamera({ width: r.width, height: r.height }, artboard));
    };
    applyFit();
  }, [
    fitKey,
    emptyWorld,
    artboard.x,
    artboard.y,
    artboard.width,
    artboard.height,
    onCameraChange,
    stageRef,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      if (e.repeat) return;
      spaceDown.current = true;
      setSpaceHeld(true);
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceDown.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;

    const isPanTool = () => panMode || spaceDown.current;

    const beginPan = (e: PointerEvent) => {
      pendingPanRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      panRef.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const cam = cameraRef.current;

      if (e.ctrlKey || e.metaKey) {
        onCameraChange(zoomAtPoint(cam, cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), localX, localY));
        return;
      }
      onCameraChange({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY });
    };

    const onDown = (e: PointerEvent) => {
      if (e.button === 1 || isPanTool()) {
        beginPan(e);
        return;
      }
      if (e.button !== 0 || !emptyDragPansRef.current) return;
      const target = e.target as Element | null;
      if (target?.closest?.(PAN_BLOCK_SELECTOR)) return;
      if (shouldBlockEmptyPanRef.current?.(e)) return;
      // Defer pan until the pointer moves — clicks still reach SelectionFeature.
      pendingPanRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    };
    const onMove = (e: PointerEvent) => {
      if (panRef.current) {
        const dx = e.clientX - panRef.current.x;
        const dy = e.clientY - panRef.current.y;
        panRef.current = { x: e.clientX, y: e.clientY };
        const cam = cameraRef.current;
        onCameraChange({ ...cam, x: cam.x + dx, y: cam.y + dy });
        return;
      }
      const pending = pendingPanRef.current;
      if (!pending || pending.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 4) return;
      beginPan(e);
    };
    const onUp = (e: PointerEvent) => {
      pendingPanRef.current = null;
      if (!panRef.current) return;
      panRef.current = null;
      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown, { capture: true } as EventListenerOptions);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [panMode, onCameraChange, stageRef]);

  const panning = panMode || spaceHeld;
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);

  return (
    <CameraContext.Provider value={camera}>
      <CameraOverlayRootContext.Provider value={overlayEl}>
        <div
          ref={stageRef as RefObject<HTMLDivElement>}
          data-canvas-stage="1"
          className={cn(
            'relative h-full w-full overflow-hidden',
            !background && 'bg-[var(--canvas)]',
            panning ? 'cursor-grab active:cursor-grabbing' : cursor || 'cursor-default',
            className
          )}
          style={background ? { background } : undefined}
        >
          <SvgContextLayer />
          {/* Dot grid stays behind artboards (z-0); world content is z-[1]. */}
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--line) 70%, transparent) 1px, transparent 0)',
              backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
              backgroundPosition: `${camera.x}px ${camera.y}px`,
            }}
          />
          <div
            className="absolute left-0 top-0 z-[1] origin-top-left overflow-visible [&>*]:pointer-events-auto"
            style={{
              transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
              backfaceVisibility: 'hidden',
            }}
          >
            {children}
          </div>
          {/* Screen-space overlays (toolbars / labels) — not scaled with camera.zoom */}
          <div
            ref={setOverlayEl}
            className="pointer-events-none absolute inset-0 z-[20] overflow-visible"
          />
        </div>
      </CameraOverlayRootContext.Provider>
    </CameraContext.Provider>
  );
}
