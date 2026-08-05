import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import { readDevicePixelRatio } from '../core/dpr';
import { rcbCameraCssZoom } from '../core/math';
import { useRcbCamera, useRcbDevicePixelRatio } from '../camera/context';

export type SceneOverlayBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RcbSceneOverlayCanvasHandle = {
  /**
   * Size the bitmap to `box` (scene units) and return a ctx whose (0,0)
   * is the box top-left in scene space. Caller draws then finishes the frame.
   */
  beginFrame: (box: SceneOverlayBox) => CanvasRenderingContext2D | null;
  /** Clear and hide the canvas. */
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
};

type Props = {
  className?: string;
  /** Stacking relative to other world overlays. */
  zClass?: string;
};

type FrameSlot = {
  left: number;
  top: number;
  w: number;
  h: number;
  pw: number;
  ph: number;
};

/**
 * Scene-space Canvas overlay for draw previews / indicators (under the camera layer).
 * Position with CSS `left/top` (no `translate`) so it matches shape-host boxes
 * under browser zoom. 1 scene unit = 1 CSS px under camera scale.
 * Path2D is stroked here; committed ink stays SVG.
 */
const RcbSceneOverlayCanvas = memo(
  forwardRef<RcbSceneOverlayCanvasHandle, Props>(function RcbSceneOverlayCanvas(
    { className, zClass = 'z-20' },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const camera = useRcbCamera();
    const dprCtx = useRcbDevicePixelRatio();
    const zoomRef = useRef(camera.zoom);
    const dprRef = useRef(dprCtx);
    const slotRef = useRef<FrameSlot | null>(null);
    zoomRef.current = rcbCameraCssZoom(camera);
    dprRef.current = dprCtx || readDevicePixelRatio();

    useImperativeHandle(
      ref,
      () => ({
        getCanvas: () => canvasRef.current,
        clear: () => {
          const canvas = canvasRef.current;
          slotRef.current = null;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          canvas.style.display = 'none';
        },
        beginFrame: (box) => {
          const canvas = canvasRef.current;
          if (!canvas) return null;
          const z = zoomRef.current;
          // Keep fractional browser-zoom dpr (e.g. 0.9) — clamping to ≥1 mis-sized
          // the backing store vs physical pixels and drifted indicators vs SVG ink.
          const dpr = Math.max(0.25, dprRef.current || 1);
          const w = Math.max(1, box.width);
          const h = Math.max(1, box.height);
          // World layer already CSS-scales by z; bake z*dpr for the backing store.
          // CSS size = bitmap/scale so setTransform(scale) stays isotropic (no
          // round(w*scale)/w skew vs SVG hosts under fractional dpr).
          const scale = z * dpr;
          const pw = Math.max(1, Math.round(w * scale));
          const ph = Math.max(1, Math.round(h * scale));
          const cssW = pw / scale;
          const cssH = ph / scale;
          const prev = slotRef.current;
          const sameSlot =
            prev &&
            prev.pw === pw &&
            prev.ph === ph &&
            prev.w === cssW &&
            prev.h === cssH &&
            prev.left === box.left &&
            prev.top === box.top;
          // Reassigning canvas.width clears the bitmap and causes draw-preview jitter.
          // Keep the same buffer when the scene box is unchanged.
          if (!sameSlot) {
            canvas.width = pw;
            canvas.height = ph;
            canvas.style.left = `${box.left}px`;
            canvas.style.top = `${box.top}px`;
            canvas.style.width = `${cssW}px`;
            canvas.style.height = `${cssH}px`;
            canvas.style.transform = '';
            slotRef.current = { left: box.left, top: box.top, w: cssW, h: cssH, pw, ph };
          }
          canvas.style.display = 'block';
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);
          ctx.translate(-box.left, -box.top);
          return ctx;
        },
      }),
      []
    );

    return (
      <canvas
        ref={canvasRef}
        className={
          className
            ? `pointer-events-none absolute overflow-visible ${zClass} ${className}`
            : `pointer-events-none absolute overflow-visible ${zClass}`
        }
        width={1}
        height={1}
        style={{ left: 0, top: 0, display: 'none' }}
        aria-hidden
      />
    );
  })
);

export default RcbSceneOverlayCanvas;
