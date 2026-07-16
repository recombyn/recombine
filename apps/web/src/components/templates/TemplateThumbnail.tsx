import { useEffect, useRef, useState } from 'react';
import { createSvgBoard, loadSceneOntoSvg } from '@/store/scene/sceneToSvg';

function isEmptyDocument(document: any) {
  const children = document?.deltaSetLike?.ROOT?.children;
  return !Array.isArray(children) || children.length === 0;
}

/** Theme-aware preview; empty docs use surface tint instead of forced white. */
export default function TemplateThumbnail({ document }: { document: any }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const empty = !document || isEmptyDocument(document);
  const docWidth = Math.max(1, Number(document?.width) || 794);
  const docHeight = Math.max(1, Number(document?.height) || 1123);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || empty) return undefined;
    const updateScale = () => {
      const width = el.clientWidth || docWidth;
      setScale(width / docWidth);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [docWidth, empty]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !document || empty) return undefined;

    const { root, layer } = createSvgBoard(host, docWidth, docHeight);
    let cancelled = false;
    loadSceneOntoSvg(root, layer, document).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
      root.remove();
    };
  }, [document, docWidth, docHeight, empty]);

  if (empty) {
    return <div className="h-full w-full bg-[var(--accent-soft)]" />;
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[var(--accent-soft)]"
    >
      <div
        ref={hostRef}
        className="absolute left-0 top-0 origin-top-left [&>svg]:block"
        style={{
          width: docWidth,
          height: docHeight,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}
