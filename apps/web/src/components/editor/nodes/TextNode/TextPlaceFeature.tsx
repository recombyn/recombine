import { useEffect } from 'react';

function clientToScene(
  paperEl: HTMLElement | null,
  artboard: { width: number; height: number },
  clientX: number,
  clientY: number
) {
  if (!paperEl) return { x: 0, y: 0 };
  const rect = paperEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const w = Math.max(1, artboard.width);
  const h = Math.max(1, artboard.height);
  return {
    x: ((clientX - rect.left) / rect.width) * w,
    y: ((clientY - rect.top) / rect.height) * h,
  };
}

type TextPlaceFeatureProps = {
  enabled: boolean;
  artboard: { width: number; height: number };
  paperEl: HTMLElement | null;
  onPlace: (x: number, y: number) => void;
};

/** Click-to-place text node. */
export default function TextPlaceFeature({
  enabled,
  artboard,
  paperEl,
  onPlace,
}: TextPlaceFeatureProps) {
  useEffect(() => {
    if (!enabled || !paperEl) return undefined;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      onPlace(p.x, p.y);
    };
    paperEl.addEventListener('click', onClick);
    return () => paperEl.removeEventListener('click', onClick);
  }, [enabled, paperEl, artboard, onPlace]);

  return null;
}
