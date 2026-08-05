import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject, memo } from 'react';
import { cn } from '@/utils/classnames';
import {
  RcbCameraContext,
  RcbCameraMotionContext,
  RcbDevicePixelRatioContext,
  RcbOverlayRootContext,
  RcbViewportElContext,
} from '../camera/context';
import { readDevicePixelRatio, subscribeDevicePixelRatio } from '../core/dpr';
import {
  installDprDebugHelpers,
  logDprCameraState,
} from '../core/dprDebug';
import {
  rcbCameraCssZoom,
  rcbCameraScreenOffset,
  rcbClientToStageLocal,
  rcbFitCamera,
  rcbStepZoom,
  rcbZoomAtPoint,
} from '../core/math';
import { RCB_DEFAULT_CAMERA, type RcbCamera } from '../core/types';
import { DEFAULT_GRID_SIZE, shouldShowPixelGrid } from '../selection/alignGuides';

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
  /**
   * Pixel-grid pitch in scene units (default 1). Overlay auto-shows around ≥400%
   * zoom and paints only the viewport (screen-space) for performance.
   */
  gridSize?: number;
  stageRef?: RefObject<HTMLDivElement | null>;
  /**
   * Fires whenever the live viewport node mounts/unmounts.
   * Hosts must use this (not a one-shot effect) so stageEl stays connected
   * after resize / mobile breakpoint remounts.
   */
  onViewportEl?: (el: HTMLElement | null) => void;
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
 *   2. World — CSS `translate3d + scale` (optional grid + scene content)
 *   3. Overlay — unscaled screen UI only (toolbars / labels via RcbOverlayPortal)
 *
 * Selection chrome + align guides live in the world layer using the same
 * CSS box + SVG viewBox compositing as shape hosts — not a 1×1 overflow SVG —
 * so browser zoom cannot desync boxes from ink.
 *
 * Camera never mutates scene coordinate origin. Shapes SVG grows with content
 * bounds (no fixed ±N plane) — unbounded page space.
 */
function RcbCanvas({
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
  gridSize = DEFAULT_GRID_SIZE,
  stageRef: stageRefProp,
  onViewportEl,
  cursor,
  background,
  fitKey,
}: RcbCanvasProps) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const stageRef = stageRefProp || localRef;
  const onViewportElRef = useRef(onViewportEl);
  onViewportElRef.current = onViewportEl;
  const cameraRef = useRef(camera);
  const panRef = useRef<{ x: number; y: number; scaleX: number; scaleY: number } | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const spaceDown = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraMoving, setCameraMoving] = useState(false);
  const emptyDragPansRef = useRef(emptyDragPans);
  const shouldBlockEmptyPanRef = useRef(shouldBlockEmptyPan);
  const panBlockSelectorRef = useRef(panBlockSelector);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const fittedKey = useRef('');
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(() => readDevicePixelRatio());

  cameraRef.current = camera;

  const markCameraMoving = useCallback(() => {
    setCameraMoving(true);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setCameraMoving(false);
    }, 140);
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  const cameraMotion = useMemo(
    () => ({
      moving: cameraMoving,
      efficientZoom: cameraMoving ? rcbStepZoom(camera.zoom) : camera.zoom,
    }),
    [cameraMoving, camera.zoom]
  );

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
        ...rcbCameraScreenOffset(camera, devicePixelRatio),
        z: rcbCameraCssZoom(camera),
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
    onViewportElRef.current?.(node);
  };

  useEffect(() => {
    const key = fitKey || 'default';
    if (emptyWorld) {
      // Remember we opened empty so the first real artboard can still autofit.
      if (fittedKey.current !== key) fittedKey.current = `${key}:empty`;
      return;
    }
    // Already fitted for this key — skip. Do NOT treat `:empty` as fitted:
    // empty → first frame must run rcbFitCamera so content centers in the viewport.
    if (fittedKey.current === key) return;
    const el = stageRef.current || viewportEl;
    if (!el) return;
    let cancelled = false;
    let tries = 0;
    const applyFit = () => {
      if (cancelled) return;
      const stage = stageRef.current || viewportEl;
      if (!stage) return;
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      if (vw < 40 || vh < 40) {
        // Stage not laid out yet — retry a few frames.
        if (tries++ < 30) requestAnimationFrame(applyFit);
        return;
      }
      fittedKey.current = key;
      // clientWidth/Height match camera.x/y layout space (not visual getBoundingClientRect).
      onCameraChange(rcbFitCamera({ width: vw, height: vh }, artboard));
    };
    applyFit();
    return () => {
      cancelled = true;
    };
  }, [
    fitKey,
    emptyWorld,
    artboard.x,
    artboard.y,
    artboard.width,
    artboard.height,
    onCameraChange,
    stageRef,
    viewportEl,
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
      const local = rcbClientToStageLocal(el, e.clientX, e.clientY);
      panRef.current = { x: local.x, y: local.y, scaleX: local.scaleX, scaleY: local.scaleY };
      el.setPointerCapture?.(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const local = rcbClientToStageLocal(el, e.clientX, e.clientY);
      const cam = cameraRef.current;
      markCameraMoving();

      let deltaX = e.deltaX;
      let deltaY = e.deltaY;
      // Normalize line/page deltas so trackpads don't pan/zoom by huge jumps.
      if (e.deltaMode === 1) {
        deltaX *= 16;
        deltaY *= 16;
      } else if (e.deltaMode === 2) {
        deltaX *= el.clientWidth;
        deltaY *= el.clientHeight;
      }

      if (e.ctrlKey || e.metaKey) {
        onCameraChange(
          rcbZoomAtPoint(cam, cam.zoom * (deltaY > 0 ? 0.92 : 1.08), local.x, local.y)
        );
        return;
      }
      const sx = local.scaleX > 0 ? local.scaleX : 1;
      const sy = local.scaleY > 0 ? local.scaleY : 1;
      onCameraChange({
        ...cam,
        x: cam.x - deltaX / sx,
        y: cam.y - deltaY / sy,
      });
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
        const local = rcbClientToStageLocal(el, e.clientX, e.clientY);
        const dx = local.x - panRef.current.x;
        const dy = local.y - panRef.current.y;
        panRef.current = {
          x: local.x,
          y: local.y,
          scaleX: local.scaleX,
          scaleY: local.scaleY,
        };
        const cam = cameraRef.current;
        markCameraMoving();
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
  }, [panMode, onCameraChange, stageRef, markCameraMoving]);

  const panning = panMode || spaceHeld;

  // Re-assert after child tool effects (pen cleanup used to wipe style.cursor).
  useEffect(() => {
    const el = stageRef.current;
    if (!el || panning) return;
    el.style.cursor = cursor || '';
  }, [cursor, panning, stageRef]);

  // Snap pan to the device-pixel grid so translate doesn't add extra frac error
  // on top of scene*dpr (critical at browser 90% → dpr≈0.9).
  // Must stay in sync with rcbScreenToScene / rcbSceneToScreen.
  const { x: camX, y: camY } = rcbCameraScreenOffset(camera, devicePixelRatio);
  const camZ = rcbCameraCssZoom(camera);
  const g = gridSize > 0 ? gridSize : DEFAULT_GRID_SIZE;
  const showPixelGrid = shouldShowPixelGrid(camZ, devicePixelRatio);
  // Screen-space cell size + origin so lines lock to scene integers without a
  // 200k² world tile (that was the perf hit at mid zoom).
  const gridCellPx = camZ * g;
  const gridPosX = ((camX % gridCellPx) + gridCellPx) % gridCellPx;
  const gridPosY = ((camY % gridCellPx) + gridCellPx) % gridCellPx;

  return (
    <RcbCameraContext.Provider value={camera}>
      <RcbCameraMotionContext.Provider value={cameraMotion}>
      <RcbDevicePixelRatioContext.Provider value={devicePixelRatio}>
        <RcbViewportElContext.Provider value={viewportEl}>
          <RcbOverlayRootContext.Provider value={overlayEl}>
            <div
              ref={setStageNode}
              data-rcb-canvas="1"
              data-canvas-stage="1"
              data-rcb-dpr={String(devicePixelRatio)}
              className={cn(
                // Own pan/zoom/draw — block browser scroll/pinch so it cannot
                // fire pointercancel mid-gesture (common on tablet / DevTools device).
                'relative h-full w-full touch-none overflow-hidden select-none',
                !background && 'bg-[var(--canvas)]',
                panning && 'cursor-grab active:cursor-grabbing',
                // Force nested shapes / chrome to inherit tool cursor (eraser / pencil / …).
                !panning && cursor && '[&_*]:!cursor-inherit',
                !panning && !cursor && 'cursor-default',
                className
              )}
              style={{
                ...(background ? { background } : null),
                // Always set so leaving a tool clears any previous inline cursor.
                cursor: !panning && cursor ? cursor : '',
              }}
            >
              {defs}
              {/* Viewport-only pixel grid (not in the scaled world — cheap + auto ≥400%). */}
              {showPixelGrid ? (
                <div
                  aria-hidden
                  data-rcb-pixel-grid="1"
                  className="pointer-events-none absolute inset-0 z-0"
                  style={{
                    backgroundImage: [
                      'linear-gradient(to right, color-mix(in srgb, var(--line) 50%, transparent) 0, color-mix(in srgb, var(--line) 50%, transparent) 1px, transparent 1px)',
                      'linear-gradient(to bottom, color-mix(in srgb, var(--line) 50%, transparent) 0, color-mix(in srgb, var(--line) 50%, transparent) 1px, transparent 1px)',
                    ].join(', '),
                    backgroundSize: `${gridCellPx}px ${gridCellPx}px`,
                    backgroundPosition: `${gridPosX}px ${gridPosY}px`,
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
      </RcbCameraMotionContext.Provider>
    </RcbCameraContext.Provider>
  );
}

export default memo(RcbCanvas);
