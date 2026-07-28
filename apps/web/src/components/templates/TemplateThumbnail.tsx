import { useEffect, useMemo, useState } from 'react';
import {
  PREVIEW_PNG_MAX_EDGE,
  renderDocumentThumbnail,
  type ThumbRasterOptions,
} from '@/utils/renderProjectThumbnail';

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

/**
 * List-card preview — always a raster `<img>`, never a live SVG in the DOM.
 * (SVG is only used off-screen while rasterizing.)
 */
export default function TemplateThumbnail({
  document,
  fit = 'contain',
  /** Prefer remote HD PNG URLs (after plaza approve) over client raster. */
  imageUrl,
  format = 'webp',
  maxEdge,
}: {
  document?: any;
  /** `cover` fills the card; `contain` letterboxes. */
  fit?: 'contain' | 'cover';
  imageUrl?: string | null;
  format?: ThumbRasterOptions['format'];
  maxEdge?: number;
}) {
  const remote = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : '';
  const empty = !remote && (!document || isEmptyDocument(document));
  const paperBg = useMemo(() => paperBackground(document), [document]);
  const [src, setSrc] = useState<string | null>(remote || null);

  useEffect(() => {
    if (remote) {
      setSrc(remote);
      return undefined;
    }
    if (empty) {
      setSrc(null);
      return undefined;
    }
    let cancelled = false;
    setSrc(null);
    const edge =
      maxEdge ?? (format === 'png' ? PREVIEW_PNG_MAX_EDGE : undefined);
    void renderDocumentThumbnail(document, { format, maxEdge: edge }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [document, empty, remote, format, maxEdge]);

  if (empty) {
    return <div className="h-full w-full bg-[var(--accent-soft)]" />;
  }

  if (!src) {
    return (
      <div
        className="h-full w-full animate-pulse bg-[var(--accent-soft)]"
        style={{ backgroundColor: paperBg }}
      />
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: paperBg }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className={
          fit === 'cover'
            ? 'h-full w-full object-cover'
            : 'h-full w-full object-contain'
        }
      />
    </div>
  );
}
