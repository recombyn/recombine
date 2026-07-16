import { useEffect, useRef, useState } from 'react';
import type { CanvasCamera } from '@/components/editor/Canvas/stage/InfiniteCanvasStage';

type FrameDrawFeatureProps = {
  enabled: boolean;
  camera: CanvasCamera;
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
  camera: CanvasCamera,
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

/** Drag on empty world to create an HTML Frame (智能画板). */
export default function FrameDrawFeature({
  enabled,
  camera,
  stageEl,
  onCommit,
}: FrameDrawFeatureProps) {
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

  return (
    <div
      className="pointer-events-none absolute border border-dashed border-[#3370ff] bg-white"
      style={{
        left: preview.x,
        top: preview.y,
        width: preview.width,
        height: preview.height,
        boxShadow: '0 0 0 1px rgba(51,112,255,0.35)',
      }}
    >
      {showSize ? (
        <div className="absolute left-0 top-[-18px] whitespace-nowrap text-[10px] font-medium text-[var(--muted)]">
          {Math.round(preview.width)}
          {' × '}
          {Math.round(preview.height)}
        </div>
      ) : null}
    </div>
  );
}
