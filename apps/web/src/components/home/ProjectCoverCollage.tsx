import { useMemo, type ReactNode, memo } from 'react';
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
 * Layout: 1 full · 2 side-by-side · 3 tall-left · 4 = 2×2 CSS grid (equal gutters).
 */
function ProjectCoverCollage({
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

/** Grid cell: min-h-0 so tall imgs cannot blow past the 170px frame; overflow clips. */
function ImgTile({ src, className }: { src: string; className?: string }) {
  return (
    <div className={cn('relative min-h-0 min-w-0 overflow-hidden', className)}>
      {/* object-contain keeps shape tiles uncropped; white fill matches tile board. */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full bg-white object-contain"
        loading="lazy"
      />
    </div>
  );
}

/** Multi-tile collage — always map ``thumbnailUrl`` list to ``<img>`` (max 4). */
function ImgCollage({ urls }: { urls: string[]; fallbackDocument?: unknown }) {
  const list = urls.filter(Boolean).slice(0, MAX_TILES);
  if (!list.length) return null;

  const n = list.length;
  if (n <= 1) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={list[0]}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className="absolute inset-0 grid grid-cols-2 gap-1 overflow-hidden">
        {list.map((src) => (
          <ImgTile key={src} src={src} />
        ))}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 overflow-hidden">
        <ImgTile src={list[0]} className="row-span-2" />
        <ImgTile src={list[1]} />
        <ImgTile src={list[2]} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 overflow-hidden">
      {list.slice(0, 4).map((src) => (
        <ImgTile key={src} src={src} />
      ))}
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
      <div className="absolute inset-0 grid grid-cols-2 gap-1">
        {tiles.map((t) => (
          <div key={t.id} className="relative min-h-0 min-w-0 overflow-hidden">
            <TemplateThumbnail document={t.document} fit="cover" />
          </div>
        ))}
      </div>
    );
  }
  if (n === 3) {
    return (
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
        <div className="relative row-span-2 min-h-0 min-w-0 overflow-hidden">
          <TemplateThumbnail document={tiles[0].document} fit="cover" />
        </div>
        <div className="relative min-h-0 min-w-0 overflow-hidden">
          <TemplateThumbnail document={tiles[1].document} fit="cover" />
        </div>
        <div className="relative min-h-0 min-w-0 overflow-hidden">
          <TemplateThumbnail document={tiles[2].document} fit="cover" />
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
      {tiles.slice(0, 4).map((t) => (
        <div key={t.id} className="relative min-h-0 min-w-0 overflow-hidden">
          <TemplateThumbnail document={t.document} fit="cover" />
        </div>
      ))}
    </div>
  );
}

export default memo(ProjectCoverCollage);
