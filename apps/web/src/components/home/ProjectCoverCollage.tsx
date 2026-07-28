import { useMemo, useState, type ReactNode } from 'react';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import LazyTemplateThumb from '@/components/home/LazyTemplateThumb';
import {
  projectThumbFrameClass,
  projectThumbZoomLayerClass,
  withThumbCacheBust,
} from '@/utils/projectThumb';
import {
  extractFrameDocument,
  listArtboardFrames,
} from '@/utils/plazaCover';
import { cn } from '@/utils/classnames';

const MAX_TILES = 4;

export function normalizeThumbnailUrls(
  input: string | string[] | null | undefined
): string[] {
  if (Array.isArray(input)) {
    return input.map((u) => String(u || '').trim()).filter(Boolean).slice(0, MAX_TILES);
  }
  const one = String(input || '').trim();
  return one ? [one] : [];
}

type DocTile = { id: string; document: unknown };

function collectDocTiles(document: unknown): DocTile[] {
  if (!document || typeof document !== 'object') return [];
  const frames = listArtboardFrames(document).slice(0, MAX_TILES);
  const out: DocTile[] = [];
  for (const frame of frames) {
    const id = String(frame.id || '').trim() || `frame-${out.length}`;
    const slice = extractFrameDocument(document, frame, { contentFit: true });
    if (slice) out.push({ id, document: slice });
  }
  return out;
}

type Props = {
  /** Up to 4 cover image URLs. */
  urls?: string | string[] | null;
  version?: number | string | null;
  /** Live document — image nodes / artboards when urls are missing. */
  document?: unknown;
  className?: string;
  children?: ReactNode;
};

type Mode = 'urls' | 'docs' | 'doc-full' | 'empty';

/**
 * Project card cover for 最近打开 / 我的项目 — multi `<img>` collage (max 4).
 * Layout: 1 full · 2 side-by-side · 3 tall-left · 4 = 2×2 flex columns.
 */
export default function ProjectCoverCollage({
  urls,
  version,
  document,
  className,
  children,
}: Props) {
  const urlTiles = useMemo(
    () =>
      normalizeThumbnailUrls(urls)
        .map((u) => withThumbCacheBust(u, version))
        .filter(Boolean),
    [urls, version]
  );
  const docTiles = useMemo(() => collectDocTiles(document), [document]);

  // Prefer saved element-snapshot URLs from edit save; else artboards; else full doc.
  // Do not collage raw image-node attrs.src — those are source assets, not element tiles.
  const { mode, imgList } = useMemo((): { mode: Mode; imgList: string[] } => {
    if (urlTiles.length >= 1) return { mode: 'urls', imgList: urlTiles };
    if (docTiles.length >= 2) return { mode: 'docs', imgList: [] };
    if (docTiles.length === 1) return { mode: 'docs', imgList: [] };
    if (document) return { mode: 'doc-full', imgList: [] };
    return { mode: 'empty', imgList: [] };
  }, [urlTiles, docTiles, document]);

  if (mode === 'doc-full') {
    return (
      <LazyTemplateThumb document={document} fit="cover" className={className}>
        {children}
      </LazyTemplateThumb>
    );
  }

  return (
    <div className={projectThumbFrameClass(className)}>
      {mode === 'empty' ? null : (
        <div className={cn('absolute inset-0', projectThumbZoomLayerClass)}>
          {mode === 'urls' ? (
            <ImgCollage urls={imgList} fallbackDocument={document} />
          ) : (
            <DocCollage tiles={docTiles} />
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** Fig2 structure: absolute flex columns of `<img class="h-1/2 w-full object-cover">`. */
function ImgCollage({
  urls,
  fallbackDocument,
}: {
  urls: string[];
  fallbackDocument?: unknown;
}) {
  const [failed, setFailed] = useState(() => new Set<string>());
  const visible = urls.filter((u) => !failed.has(u));

  const onError = (src: string) => {
    setFailed((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  };

  if (!visible.length) {
    if (fallbackDocument) {
      return (
        <div className="absolute inset-0 overflow-hidden">
          <TemplateThumbnail document={fallbackDocument} fit="cover" />
        </div>
      );
    }
    return null;
  }

  const n = visible.length;
  if (n <= 1) {
    return (
      <img
        src={visible[0]}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        onError={() => onError(visible[0])}
      />
    );
  }

  if (n === 2) {
    return (
      <div className="absolute inset-0 flex gap-1">
        {visible.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            className="h-full w-1/2 flex-1 object-cover"
            loading="lazy"
            onError={() => onError(src)}
          />
        ))}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className="absolute inset-0 flex gap-1">
        <img
          src={visible[0]}
          alt=""
          className="h-full w-1/2 flex-1 object-cover"
          loading="lazy"
          onError={() => onError(visible[0])}
        />
        <div className="flex h-full flex-1 flex-col gap-1">
          <img
            src={visible[1]}
            alt=""
            className="h-1/2 w-full object-cover"
            loading="lazy"
            onError={() => onError(visible[1])}
          />
          <img
            src={visible[2]}
            alt=""
            className="h-1/2 w-full object-cover"
            loading="lazy"
            onError={() => onError(visible[2])}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex gap-1">
      <div className="flex h-full flex-1 flex-col gap-1">
        <img
          src={visible[0]}
          alt=""
          className="h-1/2 w-full object-cover"
          loading="lazy"
          onError={() => onError(visible[0])}
        />
        <img
          src={visible[1]}
          alt=""
          className="h-1/2 w-full object-cover"
          loading="lazy"
          onError={() => onError(visible[1])}
        />
      </div>
      <div className="flex h-full flex-1 flex-col gap-1">
        <img
          src={visible[2]}
          alt=""
          className="h-1/2 w-full object-cover"
          loading="lazy"
          onError={() => onError(visible[2])}
        />
        <img
          src={visible[3]}
          alt=""
          className="h-1/2 w-full object-cover"
          loading="lazy"
          onError={() => onError(visible[3])}
        />
      </div>
    </div>
  );
}

function DocCollage({ tiles }: { tiles: DocTile[] }) {
  const n = tiles.length;
  if (n <= 1) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <TemplateThumbnail document={tiles[0].document} fit="cover" />
      </div>
    );
  }
  if (n === 2) {
    return (
      <div className="absolute inset-0 flex gap-1">
        {tiles.map((t) => (
          <div key={t.id} className="relative h-full min-w-0 flex-1 overflow-hidden">
            <TemplateThumbnail document={t.document} fit="cover" />
          </div>
        ))}
      </div>
    );
  }
  if (n === 3) {
    return (
      <div className="absolute inset-0 flex gap-1">
        <div className="relative h-full min-w-0 flex-1 overflow-hidden">
          <TemplateThumbnail document={tiles[0].document} fit="cover" />
        </div>
        <div className="flex h-full min-w-0 flex-1 flex-col gap-1">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <TemplateThumbnail document={tiles[1].document} fit="cover" />
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <TemplateThumbnail document={tiles[2].document} fit="cover" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex gap-1">
      <div className="flex h-full min-w-0 flex-1 flex-col gap-1">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <TemplateThumbnail document={tiles[0].document} fit="cover" />
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <TemplateThumbnail document={tiles[1].document} fit="cover" />
        </div>
      </div>
      <div className="flex h-full min-w-0 flex-1 flex-col gap-1">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <TemplateThumbnail document={tiles[2].document} fit="cover" />
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <TemplateThumbnail document={tiles[3].document} fit="cover" />
        </div>
      </div>
    </div>
  );
}
