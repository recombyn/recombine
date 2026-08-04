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
          const dpr = Math.max(1, dprRef.current || 1);
          const w = Math.max(1, box.width);
          const h = Math.max(1, box.height);
          // World layer already CSS-scales by z; bake z*dpr for sharpness but map
          // with round so ceil stretch cannot drift under browser zoom.
          const scale = z * dpr;
          const pw = Math.max(1, Math.round(w * scale));
          const ph = Math.max(1, Math.round(h * scale));
          const prev = slotRef.current;
          const sameSlot =
            prev &&
            prev.pw === pw &&
            prev.ph === ph &&
            prev.w === w &&
            prev.h === h &&
            prev.left === box.left &&
            prev.top === box.top;
          // Reassigning canvas.width clears the bitmap and causes draw-preview jitter.
          // Keep the same buffer when the scene box is unchanged.
          if (!sameSlot) {
            canvas.width = pw;
            canvas.height = ph;
            canvas.style.left = `${box.left}px`;
            canvas.style.top = `${box.top}px`;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            canvas.style.transform = '';
            slotRef.current = { left: box.left, top: box.top, w, h, pw, ph };
          }
          canvas.style.display = 'block';
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.setTransform(pw / w, 0, 0, ph / h, 0, 0);
          ctx.clearRect(0, 0, w, h);
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
