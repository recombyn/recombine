/**
 * Rasterize project covers for list cards / cloud sync.
 * Save path: up to 4 per-element snapshots (not full-page, not raw image src).
 */

import { inlineSvgImages, renderExport } from '@/components/rcb/scene/paint/exportImage';
import { createSvgBoard, loadSceneOntoSvg } from '@/components/rcb/scene/paint/sceneToSvg';
import {
  isExportableSceneNode,
  listSceneNodes,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  coverDocumentHasContent,
  extractFrameDocument,
  extractPlazaCoverDocument,
  findPlazaCoverFrame,
  listArtboardFrames,
  type PlazaCoverFrame,
} from '@/utils/plazaCover';

const MAX_EDGE = 480;
const MAX_TILES = 4;
const TILE_MAX_EDGE = 360;
const WEBP_QUALITY = 0.82;
/** Skip decorative noise smaller than ~1% of the artboard (or 40px edge). */
const MIN_ELEMENT_EDGE = 40;
/** Case preview modal — keep panels sharp (not list-card WebP). */
export const PREVIEW_PNG_MAX_EDGE = 1600;

export type ThumbRasterOptions = {
  allowEmpty?: boolean;
  /** Prefer png for HD previews; webp/jpeg for compact list thumbs. */
  format?: 'webp' | 'png' | 'jpeg';
  maxEdge?: number;
};

function paperBackground(document: any): string {
  const frame = Array.isArray(document?.frames) ? document.frames[0] : null;
  const fromFrame = String(frame?.backgroundColor || '').trim();
  if (fromFrame && fromFrame !== 'none' && fromFrame !== 'transparent') return fromFrame;
  const fromDoc = String(document?.backgroundColor || '').trim();
  if (fromDoc && fromDoc !== 'none' && fromDoc !== 'transparent') return fromDoc;
  return '#ffffff';
}

function canvasToDataUrl(canvas: HTMLCanvasElement, format: 'webp' | 'png' | 'jpeg'): string {
  if (format === 'png') {
    return canvas.toDataURL('image/png');
  }
  if (format === 'jpeg') {
    return canvas.toDataURL('image/jpeg', WEBP_QUALITY);
  }
  try {
    const webp = canvas.toDataURL('image/webp', WEBP_QUALITY);
    if (webp.startsWith('data:image/webp')) return webp;
  } catch {
    /* Safari / rare encoders */
  }
  return canvas.toDataURL('image/jpeg', WEBP_QUALITY);
}

/** Build a full-board WebP for project list / publish preview (contain, not cropped). */
export async function renderProjectThumbnail(document: unknown): Promise<string | null> {
  if (!document || typeof document !== 'object') return null;
  // Content-fit the artboard so list/publish covers center the design, not empty margins.
  // Empty boards still render (paper / frame background) so list covers stay in sync.
  const cover = extractPlazaCoverDocument(document, { contentFit: true }) || document;
  return renderDocumentThumbnail(cover, { allowEmpty: true });
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Same overlap rule as plaza cover extract — node must sit mostly on the artboard. */
function nodeOverlapsFrame(node: Record<string, unknown>, frame: PlazaCoverFrame): boolean {
  const x = num(node.x);
  const y = num(node.y);
  const w = Math.max(1, num(node.width, 1));
  const h = Math.max(1, num(node.height, 1));
  const ow = Math.max(0, Math.min(x + w, frame.x + frame.width) - Math.max(x, frame.x));
  const oh = Math.max(0, Math.min(y + h, frame.y + frame.height) - Math.max(y, frame.y));
  return ow * oh >= w * h * 0.12;
}

/** image → shape/svg → text → other (collage prefers visual tiles). */
function coverElementTypeRank(key: string): number {
  if (key === 'image') return 0;
  if (
    key === 'svg' ||
    key === 'path' ||
    key === 'shape' ||
    key === 'rect' ||
    key === 'ellipse' ||
    key === 'circle' ||
    key === 'line'
  ) {
    return 1;
  }
  if (key === 'text') return 2;
  return 3;
}

/**
 * Pick up to 4 exportable scene elements for the home collage.
 * Scope: active/cover artboard when present; rank image-first, then area, then z-order.
 */
export function pickCoverElementIds(document: unknown): string[] {
  if (!document || typeof document !== 'object') return [];
  const frame = findPlazaCoverFrame(document);
  const frameArea = frame ? frame.width * frame.height : 0;
  const minArea = frameArea > 0 ? frameArea * 0.01 : MIN_ELEMENT_EDGE * MIN_ELEMENT_EDGE;

  type Ranked = { id: string; typeRank: number; area: number; z: number };
  const ranked: Ranked[] = [];
  const nodes = listSceneNodes(document) as Array<{ id: string; node: Record<string, unknown> }>;

  nodes.forEach(({ id, node }, z) => {
    if (!id || !node || typeof node !== 'object') return;
    if (!isExportableSceneNode(node)) return;
    if (frame && !nodeOverlapsFrame(node, frame)) return;
    const w = Math.max(1, num(node.width, 1));
    const h = Math.max(1, num(node.height, 1));
    const area = w * h;
    if (area < minArea && Math.min(w, h) < MIN_ELEMENT_EDGE) return;
    ranked.push({
      id: String(id),
      typeRank: coverElementTypeRank(String(node.key || '')),
      area,
      z,
    });
  });

  ranked.sort((a, b) => {
    if (a.typeRank !== b.typeRank) return a.typeRank - b.typeRank;
    if (b.area !== a.area) return b.area - a.area;
    return b.z - a.z;
  });

  return ranked.slice(0, MAX_TILES).map((r) => r.id);
}

/** Rasterize one element (cropped to its bbox) for a collage tile. */
async function rasterizeElementTile(
  document: unknown,
  nodeId: string,
  opts?: { maxEdge?: number; format?: 'webp' | 'png' | 'jpeg'; compress?: boolean }
): Promise<string | null> {
  const dsl = (document as { deltaSetLike?: Record<string, unknown> })?.deltaSetLike;
  const node = dsl?.[nodeId];
  if (!node || typeof node !== 'object') return null;
  const w = Math.max(1, num((node as Record<string, unknown>).width, 1));
  const h = Math.max(1, num((node as Record<string, unknown>).height, 1));
  const maxEdge = Math.max(64, Math.round(opts?.maxEdge || TILE_MAX_EDGE));
  // Allow >1× so small scene boxes still fill the tile sharply on retina.
  const multiplier = Math.max(0.25, Math.min(2, maxEdge / Math.max(w, h)));
  const format = opts?.format || 'jpeg';
  // renderExport only accepts png|jpeg|svg — map webp tiles to png.
  const exportFormat = format === 'webp' ? 'png' : format;
  const compress = opts?.compress ?? exportFormat === 'jpeg';

  try {
    const result = await renderExport({
      document,
      selectionOnly: true,
      nodeIds: [nodeId],
      multiplier,
      format: exportFormat,
      compress,
      backgroundColor: '#ffffff',
    });
    if (result?.kind === 'raster' && result.dataUrl) return result.dataUrl;
  } catch {
    /* best-effort per tile */
  }
  return null;
}

/** @deprecated Prefer saved element-snapshot thumbs; kept for rare live fallbacks. */
export function collectProjectImageSrcs(document: unknown): string[] {
  if (!document || typeof document !== 'object') return [];
  const dsl = (document as { deltaSetLike?: unknown }).deltaSetLike;
  if (!dsl || typeof dsl !== 'object') return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(dsl as Record<string, unknown>)) {
    if (key === 'ROOT' || !raw || typeof raw !== 'object') continue;
    const node = raw as Record<string, unknown>;
    if (!isExportableSceneNode(node)) continue;
    if (String(node.key || '') !== 'image') continue;
    const attrs = (node.attrs && typeof node.attrs === 'object'
      ? node.attrs
      : {}) as Record<string, unknown>;
    const src = String(attrs.src || '').trim();
    if (!src || seen.has(src)) continue;
    if (
      !(
        src.startsWith('http://') ||
        src.startsWith('https://') ||
        src.startsWith('data:image/') ||
        src.startsWith('/')
      )
    ) {
      continue;
    }
    seen.add(src);
    out.push(src);
    if (out.length >= MAX_TILES) break;
  }
  return out;
}

export type ProjectCoverTiles = {
  /** Already-hosted image URLs — rare passthrough. */
  urls?: string[];
  /** Raster data URLs to upload as project thumbs (preferred). */
  dataUrls?: string[];
};

export type ProjectCoverTileOptions = {
  /** Longest edge for each tile (default list-card 360). Publish modal should pass ~960+. */
  maxEdge?: number;
  format?: 'webp' | 'png' | 'jpeg';
  /** JPEG only — list cards compress; HD previews should pass false. */
  compress?: boolean;
  /** Full-board fallback max edge (default 480 list / use PREVIEW_PNG_MAX_EDGE for modal). */
  fullBoardMaxEdge?: number;
};

/** List thumbs use webp; jpeg callers map to webp. PNG kept for HD publish preview. */
function resolveCoverTileRasterOpts(opts?: ProjectCoverTileOptions) {
  let format: 'webp' | 'png' = 'webp';
  if (opts?.format === 'png') format = 'png';

  const tileMax = opts?.maxEdge ?? TILE_MAX_EDGE;

  let fullMax = MAX_EDGE;
  if (opts?.fullBoardMaxEdge != null) fullMax = opts.fullBoardMaxEdge;
  else if (opts?.maxEdge != null) fullMax = opts.maxEdge;

  return { format, tileMax, fullMax };
}

/**
 * Up to 4 cover tiles for 最近打开 / 我的项目 / Publish.
 * Prefer one snapshot per artboard when there are 2+ boards (matches Share collage);
 * else per-element crops; else one full-board cover.
 */
export async function buildProjectCoverTiles(
  document: unknown,
  opts?: ProjectCoverTileOptions
): Promise<ProjectCoverTiles> {
  if (!document || typeof document !== 'object') return {};

  const { format: thumbFormat, tileMax, fullMax } = resolveCoverTileRasterOpts(opts);

  const frames = listArtboardFrames(document).slice(0, MAX_TILES);
  if (frames.length >= 2) {
    const dataUrls: string[] = [];
    for (const frame of frames) {
      const slice = extractFrameDocument(document, frame, { contentFit: true });
      if (!slice) continue;
      const data = await renderDocumentThumbnail(slice, {
        allowEmpty: true,
        format: thumbFormat,
        maxEdge: tileMax,
      });
      if (data) dataUrls.push(data);
    }
    if (dataUrls.length) return { dataUrls };
  }

  const ids = pickCoverElementIds(document);
  if (ids.length) {
    const dataUrls: string[] = [];
    for (const id of ids) {
      const data = await rasterizeElementTile(document, id, {
        maxEdge: opts?.maxEdge,
        format: opts?.format,
        compress: opts?.compress,
      });
      if (data) dataUrls.push(data);
    }
    if (dataUrls.length) return { dataUrls };
  }

  const one = await renderDocumentThumbnail(
    extractPlazaCoverDocument(document, { contentFit: true }) || document,
    {
      allowEmpty: true,
      format: thumbFormat,
      maxEdge: fullMax,
    }
  );
  return one ? { dataUrls: [one] } : {};
}

/**
 * Rasterize an already-extracted cover / artboard document to a data URL.
 * Used by list cards so the DOM shows `<img>`, not live SVG.
 */
export async function renderDocumentThumbnail(
  document: unknown,
  opts?: ThumbRasterOptions
): Promise<string | null> {
  if (!document || typeof document !== 'object') return null;
  if (!opts?.allowEmpty && !coverDocumentHasContent(document)) return null;

  const format = opts?.format || 'webp';
  const maxEdge = Math.max(64, Math.round(opts?.maxEdge || MAX_EDGE));

  const doc = document as {
    width?: number;
    height?: number;
    frames?: Array<{ width?: number; height?: number }>;
  };
  const frame = Array.isArray(doc.frames) ? doc.frames[0] : null;
  const docW = Math.max(1, Math.round(Number(frame?.width || doc.width) || 794));
  const docH = Math.max(1, Math.round(Number(frame?.height || doc.height) || 1123));
  const scale = Math.min(1, maxEdge / Math.max(docW, docH));
  const outW = Math.max(32, Math.round(docW * scale));
  const outH = Math.max(32, Math.round(docH * scale));
  const bg = paperBackground(document);

  const host = window.document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  window.document.body.appendChild(host);

  try {
    const previewDoc = {
      ...(document as object),
      width: docW,
      height: docH,
      backgroundColor: bg,
      backgroundFillType: 'solid',
    };
    const { root, layer } = createSvgBoard(host, docW, docH);
    await loadSceneOntoSvg(root, layer, previewDoc, 0, undefined, {
      omitNonExportable: true,
    });

    // Same as export: blob-URL SVG→canvas cannot load external <image> hrefs.
    // Inline rasters (auth/COS-aware) before rasterizing the cover.
    const xml = new XMLSerializer().serializeToString(root);
    const inlined = await inlineSvgImages(xml, previewDoc, { failClosed: false });
    const blob = new Blob([inlined], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('thumb_raster_failed'));
        el.src = url;
      });
      const canvas = window.document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      return canvasToDataUrl(canvas, format);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  } finally {
    host.remove();
  }
}
