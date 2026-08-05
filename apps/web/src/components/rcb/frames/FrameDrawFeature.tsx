import { useEffect, useRef, useState, memo } from 'react';
import type { RcbCamera } from '../core/types';
import { useRcbDevicePixelRatio } from '../camera/context';
import { snapSvgSurfaceBox } from '@/components/rcb/scene/paint/sceneToSvg';


type FrameDrawFeatureProps = {
  enabled: boolean;
  camera: RcbCamera;
  stageEl: HTMLElement | null;
  onCommit: (rect: { x: number; y: number; width: number; height: number }) => void;
};

function normalizeRect(x0: number, y0: number, x1: number, y1: number) {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return { x: left, y: top, width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

function clientToWorld(
  stageEl: HTMLElement,
  camera: RcbCamera,
  clientX: number,
  clientY: number
) {
  const r = stageEl.getBoundingClientRect();
  const localX = clientX - r.left;
  const localY = clientY - r.top;
  return {
    x: (localX - camera.x) / camera.zoom,
    y: (localY - camera.y) / camera.zoom,
  };
}

/** Drag on empty world to create an artboard frame (SVG plate). */
function FrameDrawFeature({
  enabled,
  camera,
  stageEl,
  onCommit,
}: FrameDrawFeatureProps) {
  const dpr = useRcbDevicePixelRatio();
  const dragRef = useRef<{ x0: number; y0: number } | null>(null);
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !stageEl) return undefined;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-frame-label],[data-image-label]')) return;
      e.preventDefault();
      const p = clientToWorld(stageEl, camera, e.clientX, e.clientY);
      dragRef.current = { x0: p.x, y0: p.y };
      setPreview({ x: p.x, y: p.y, width: 0, height: 0 });
      stageEl.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const p = clientToWorld(stageEl, camera, e.clientX, e.clientY);
      setPreview(normalizeRect(dragRef.current.x0, dragRef.current.y0, p.x, p.y));
    };

    const onUp = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const p = clientToWorld(stageEl, camera, e.clientX, e.clientY);
      const rect = normalizeRect(dragRef.current.x0, dragRef.current.y0, p.x, p.y);
      dragRef.current = null;
      setPreview(null);
      try {
        stageEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      if (rect.width >= 24 && rect.height >= 24) {
        onCommit(rect);
      }
    };

    stageEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      stageEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [enabled, stageEl, camera, onCommit]);

  if (!enabled || !preview) return null;

  const showSize = preview.width >= 24 || preview.height >= 24;
  const inv = 1 / Math.max(0.05, camera.zoom || 1);
  const labelFont = 10 * inv;
  const labelGap = 10 * inv;
  const w = Math.max(1, preview.width);
  const h = Math.max(1, preview.height);

  // Same scene-lattice quantize as hosts / pixel grid.
  const surf = snapSvgSurfaceBox(
    { left: preview.x, top: preview.y, width: w, height: h },
    camera,
    dpr
  );
  const x = preview.x;
  const y = preview.y;
  return (
    <svg
      data-frame-draw-preview
      data-rcb-infinite="1"
      className="pointer-events-none absolute overflow-visible"
      width={surf.width}
      height={surf.height}
      viewBox={`${surf.left} ${surf.top} ${surf.width} ${surf.height}`}
      preserveAspectRatio="none"
      style={{
        left: surf.left,
        top: surf.top,
        width: surf.width,
        height: surf.height,
        overflow: 'visible',
        display: 'block',
        shapeRendering: 'geometricPrecision',
      }}
      aria-hidden
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="#FFFFFF"
        stroke="color-mix(in srgb, var(--ink) 12%, transparent)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {showSize ? (
        <text
          x={x + w / 2}
          y={y - labelGap}
          fill="var(--muted)"
          fontSize={labelFont}
          fontWeight={500}
          textAnchor="middle"
          dominantBaseline="auto"
        >
          {Math.round(preview.width)}
          {' × '}
          {Math.round(preview.height)}
        </text>
      ) : null}
    </svg>
  );
}

export default memo(FrameDrawFeature);
