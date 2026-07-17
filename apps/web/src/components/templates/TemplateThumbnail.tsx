import { useEffect, useMemo, useRef, useState } from 'react';
import { createSvgBoard, loadSceneOntoSvg } from '@/store/scene/sceneToSvg';

function isEmptyDocument(document: any) {
  const children = document?.deltaSetLike?.ROOT?.children;
  return !Array.isArray(children) || children.length === 0;
}

function paperBackground(document: any): string {
  const frame = Array.isArray(document?.frames) ? document.frames[0] : null;
  const fromFrame = String(frame?.backgroundColor || '').trim();
  if (fromFrame && fromFrame !== 'none' && fromFrame !== 'transparent') return fromFrame;
  const fromDoc = String(document?.backgroundColor || '').trim();
  if (fromDoc && fromDoc !== 'none' && fromDoc !== 'transparent') return fromDoc;
  return '#ffffff';
}

/** Theme-aware preview; empty docs use surface tint instead of forced white. */
export default function TemplateThumbnail({
  document,
  fit = 'contain',
}: {
  document: any;
  /** `cover` fills the card (inspiration masonry); `contain` letterboxes. */
  fit?: 'contain' | 'cover';
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const empty = !document || isEmptyDocument(document);
  const frame = Array.isArray(document?.frames) ? document.frames[0] : null;
  const docWidth = Math.max(1, Number(frame?.width || document?.width) || 794);
  const docHeight = Math.max(1, Number(frame?.height || document?.height) || 1123);
  const paperBg = useMemo(() => paperBackground(document), [document]);

  const previewDoc = useMemo(() => {
    if (!document || empty) return null;
    // Thumbnail paints artboard paper via document background (frames are HTML in the editor).
    return {
      ...document,
      width: docWidth,
      height: docHeight,
      backgroundColor: paperBg,
      backgroundFillType: 'solid',
    };
  }, [document, empty, docWidth, docHeight, paperBg]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || empty) return undefined;
    const updateScale = () => {
      const width = el.clientWidth || docWidth;
      const height = el.clientHeight || docHeight;
      const sx = width / docWidth;
      const sy = height / docHeight;
      setScale(fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [docWidth, docHeight, empty, fit]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !previewDoc) return undefined;

    const { root, layer } = createSvgBoard(host, docWidth, docHeight);
    let cancelled = false;
    loadSceneOntoSvg(root, layer, previewDoc).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
      root.remove();
    };
  }, [previewDoc, docWidth, docHeight]);

  if (empty) {
    return <div className="h-full w-full bg-[var(--accent-soft)]" />;
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: paperBg }}
    >
      <div
        ref={hostRef}
        className="absolute left-1/2 top-1/2 origin-center [&>svg]:block"
        style={{
          width: docWidth,
          height: docHeight,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      />
    </div>
  );
}
