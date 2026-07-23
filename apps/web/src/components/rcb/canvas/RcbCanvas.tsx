import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/utils/classnames';
import {
  RcbCameraContext,
  RcbDevicePixelRatioContext,
  RcbOverlayRootContext,
  RcbViewportElContext,
} from '../camera/context';
import { readDevicePixelRatio, snapCssToDevicePixel, subscribeDevicePixelRatio, toDomPrecision } from '../core/dpr';
import {
  installDprDebugHelpers,
  logDprCameraState,
} from '../core/dprDebug';
import { rcbFitCamera, rcbZoomAtPoint } from '../core/math';
import { RCB_DEFAULT_CAMERA, type RcbCamera } from '../core/types';

export type { RcbCamera };
export { RCB_DEFAULT_CAMERA };

/** Zoom about a stage-local point — convenience for host zoom controls. */
export function zoomAtPoint(
  camera: RcbCamera,
  nextZoom: number,
  localX: number,
  localY: number
): RcbCamera {
  return rcbZoomAtPoint(camera, nextZoom, localX, localY);
}

export type RcbCanvasProps = {
  /**
   * Scene bounds used for one-shot autofit when `fitKey` changes.
   * Pass `{ width: 0, height: 0 }` to skip fit (empty document).
   */
  artboard: { x?: number; y?: number; width: number; height: number };
  camera: RcbCamera;
  onCameraChange: (next: RcbCamera) => void;
  /** Hand / space-pan mode. */
  panMode?: boolean;
  /** Select tool: left-drag on empty canvas starts pan after a short threshold. */
  emptyDragPans?: boolean;
  shouldBlockEmptyPan?: (e: PointerEvent) => boolean;
  /**
   * CSS selectors that block empty-canvas pan (selection chrome, etc.).
   * Host app supplies product-specific targets.
   */
  panBlockSelector?: string;
  className?: string;
  /** World-layer scene content (scaled with camera). */
  children: ReactNode;
  /** Optional SVG defs / ambient nodes inside the viewport (not scaled). */
  defs?: ReactNode;
  /** Dot grid behind the world layer. Default true. */
  showGrid?: boolean;
  stageRef?: RefObject<HTMLDivElement | null>;
  cursor?: string;
  background?: string;
  /** Stable id for one-time autofit (e.g. document id). */
  fitKey?: string;
};

/**
 * recombyn infinite canvas shell.
 *
 * Layers:
 *   1. Viewport — wheel / pan, overflow hidden
 *   2. Optional grid (screen space)
 *   3. World — CSS `translate3d + scale` (scene content)
 *   4. Overlay — unscaled screen UI only (toolbars / labels via RcbOverlayPortal)
 *
 * Selection chrome + align guides live in the world layer (scene coords) so
 * browser zoom + canvas zoom cannot desync boxes from shapes. DPR is tracked
 * for future length alignment / canvas buffers.
 *
 * Camera never mutates scene coordinate origin. Shapes SVG grows with content
 * bounds (no fixed ±N plane) — unbounded page space.
 */
export default function RcbCanvas({
  artboard,
  camera,
  onCameraChange,
  panMode = false,
  emptyDragPans = false,
  shouldBlockEmptyPan,
  panBlockSelector = '',
  className,
  children,
  defs = null,
  showGrid = true,
  stageRef: stageRefProp,
  cursor,
  background,
  fitKey,
}: RcbCanvasProps) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const stageRef = stageRefProp || localRef;
  const cameraRef = useRef(camera);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const spaceDown = useRef(false);
  const emptyDragPansRef = useRef(emptyDragPans);
  const shouldBlockEmptyPanRef = useRef(shouldBlockEmptyPan);
  const panBlockSelectorRef = useRef(panBlockSelector);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const fittedKey = useRef('');
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(() => readDevicePixelRatio());

  cameraRef.current = camera;

  // Browser zoom / HiDPI — keep DPR in sync.
  useEffect(() => subscribeDevicePixelRatio(setDevicePixelRatio), []);

  // Opt-in DPR camera logs: window.__RCB_DPR_DEBUG__ = true
  useEffect(() => {
    if (typeof window === 'undefined' || window.__RCB_DPR_DEBUG__ !== true) return;
    logDprCameraState({
      reason: 'camera-or-dpr',
      dpr: devicePixelRatio,
      camera,
      camCss: {
        x: toDomPrecision(snapCssToDevicePixel(camera.x, devicePixelRatio)),
        y: toDomPrecision(snapCssToDevicePixel(camera.y, devicePixelRatio)),
        z: toDomPrecision(camera.zoom),
      },
    });
  }, [devicePixelRatio, camera.x, camera.y, camera.zoom]);

  // Console helpers: window.__rcbDumpDpr() — also samples shape hosts under the stage.
  useEffect(() => {
    installDprDebugHelpers(() => {
      const stage = stageRef.current;
      const boxes: Array<{
        id: string;
        left: number;
        top: number;
        width: number;
        height: number;
      }> = [];
      if (stage) {
        const nodes = stage.querySelectorAll<SVGElement>('[data-scene-node-id]');
        nodes.forEach((el) => {
          const id = el.getAttribute('data-scene-node-id') || '';
          if (!id) return;
          try {
            const bb = el.getBBox();
            // getBBox is in SVG user space (= scene for our hosts).
            boxes.push({
              id,
              left: bb.x,
              top: bb.y,
              width: bb.width,
              height: bb.height,
            });
          } catch {
            /* ignore detached */
          }
        });
      }
      return { dpr: devicePixelRatio, camera: cameraRef.current, boxes };
    });
  }, [devicePixelRatio, stageRef]);
  emptyDragPansRef.current = emptyDragPans;
  shouldBlockEmptyPanRef.current = shouldBlockEmptyPan;
  panBlockSelectorRef.current = panBlockSelector;
  const emptyWorld = !(artboard.width > 0 && artboard.height > 0);

  const setStageNode = (node: HTMLDivElement | null) => {
    if (stageRefProp) {
      (stageRefProp as { current: HTMLDivElement | null }).current = node;
    } else {
      localRef.current = node;
    }
    setViewportEl(node);
  };

  useEffect(() => {
    const key = fitKey || 'default';
    if (emptyWorld) {
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
      onCameraChange(rcbFitCamera({ width: r.width, height: r.height }, artboard));
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
        onCameraChange(rcbZoomAtPoint(cam, cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), localX, localY));
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
      const block = panBlockSelectorRef.current;
      if (block && target?.closest?.(block)) return;
      if (shouldBlockEmptyPanRef.current?.(e)) return;
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

  // Snap pan to the device-pixel grid so translate doesn't add extra frac error
  // on top of scene*dpr (critical at browser 90% → dpr≈0.9).
  const camX = toDomPrecision(snapCssToDevicePixel(camera.x, devicePixelRatio));
  const camY = toDomPrecision(snapCssToDevicePixel(camera.y, devicePixelRatio));
  const camZ = toDomPrecision(camera.zoom);

  return (
    <RcbCameraContext.Provider value={camera}>
      <RcbDevicePixelRatioContext.Provider value={devicePixelRatio}>
        <RcbViewportElContext.Provider value={viewportEl}>
          <RcbOverlayRootContext.Provider value={overlayEl}>
            <div
              ref={setStageNode}
              data-rcb-canvas="1"
              data-canvas-stage="1"
              data-rcb-dpr={String(devicePixelRatio)}
              className={cn(
                'relative h-full w-full overflow-hidden',
                !background && 'bg-[var(--canvas)]',
                panning ? 'cursor-grab active:cursor-grabbing' : cursor || 'cursor-default',
                className
              )}
              style={background ? { background } : undefined}
            >
              {defs}
              {showGrid ? (
                <div
                  className="pointer-events-none absolute inset-0 z-0 opacity-[0.35]"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--line) 70%, transparent) 1px, transparent 0)',
                    backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
                    backgroundPosition: `${camera.x}px ${camera.y}px`,
                  }}
                />
              ) : null}
              {/* Camera layer. Shapes + selection chrome. */}
              <div
                className="rcb-html-layer absolute left-0 top-0 z-[1] origin-top-left overflow-visible [&>*]:pointer-events-auto"
                data-rcb-world="1"
                data-rcb-html-layer="1"
                style={{
                  transform: `translate3d(${camX}px, ${camY}px, 0) scale(${camZ})`,
                  backfaceVisibility: 'hidden',
                  // --tl-zoom / --tl-scale for screen-constant SVG chrome
                  ['--rcb-zoom' as string]: String(camZ),
                  ['--rcb-scale' as string]: `calc(1 / ${camZ})`,
                }}
              >
                {children}
              </div>
              <div
                ref={setOverlayEl}
                data-rcb-overlay="1"
                className="pointer-events-none absolute inset-0 z-[20] overflow-visible"
              />
            </div>
          </RcbOverlayRootContext.Provider>
        </RcbViewportElContext.Provider>
      </RcbDevicePixelRatioContext.Provider>
    </RcbCameraContext.Provider>
  );
}
