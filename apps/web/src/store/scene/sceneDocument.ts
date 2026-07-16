import { nanoid } from '@reduxjs/toolkit';
import { buildMarkdownTextAttrs, measureWrappedTextSize, DEFAULT_TEXT_BOX_WIDTH } from './sceneText';
import { clampShapeSides, DEFAULT_SHAPE_SIDES } from './sceneShapes';

/** Default canvas size (approx A4 @ 96dpi); user can change freely */
export const DEFAULT_CANVAS = { width: 794, height: 1123 };

export const A4_PORTRAIT = { ...DEFAULT_CANVAS };
export const A4_LANDSCAPE = { width: 1123, height: 794 };
export const A4_WIDTH = DEFAULT_CANVAS.width;
export const A4_HEIGHT = DEFAULT_CANVAS.height;

function createPage(id?: string) {
  return {
    id: id || nanoid(8),
    children: [] as string[],
  };
}

function emptyDeltaSet() {
  return {
    ROOT: {
      id: 'ROOT',
      key: 'entry',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      attrs: {},
      children: [] as string[],
    },
  };
}

/** Bare infinite world (no artboard frames). */
export function createBareDocument() {
  const page = createPage();
  return {
    x: 0,
    y: 0,
    width: DEFAULT_CANVAS.width,
    height: DEFAULT_CANVAS.height,
    // Empty → editor follows theme `--canvas` (light/dark).
    backgroundColor: '',
    frames: [] as any[],
    activeFrameId: null as string | null,
    pages: [page],
    activePageId: page.id,
    deltaSetLike: emptyDeltaSet(),
  };
}

export function createEmptyDocument(size?: {
  width?: number;
  height?: number;
  emptyWorld?: boolean;
}) {
  if (size?.emptyWorld) return createBareDocument();

  const width = Math.max(100, Math.round(size?.width || DEFAULT_CANVAS.width));
  const height = Math.max(100, Math.round(size?.height || DEFAULT_CANVAS.height));
  const page = createPage();
  return {
    x: 0,
    y: 0,
    width,
    height,
    backgroundColor: '',
    frames: [] as any[],
    activeFrameId: null as string | null,
    pages: [page],
    activePageId: page.id,
    deltaSetLike: emptyDeltaSet(),
  };
}

/** Ensure older saved docs still work; keep a single logical page for editing */
export function normalizeDocument(doc: any) {
  if (!doc) return createEmptyDocument({ emptyWorld: true });
  const next = JSON.parse(JSON.stringify(doc));
  next.width = Math.max(100, Math.round(Number(next.width) || DEFAULT_CANVAS.width));
  next.height = Math.max(100, Math.round(Number(next.height) || DEFAULT_CANVAS.height));
  // Keep empty / legacy light defaults; EditorPage maps them to theme `--canvas`.
  if (next.backgroundColor == null) next.backgroundColor = '';
  delete next.orientation;
  if (!Array.isArray(next.frames)) next.frames = [];
  next.frames = next.frames.map((f: any) => {
    if (!f || typeof f !== 'object') return f;
    const bg = String(f.backgroundColor || '').trim();
    if (!bg || bg === 'none') {
      return { ...f, backgroundColor: '#FFFFFF' };
    }
    return f;
  });
  // Keep activeFrameId nullable — null means no frame selected (do not force frames[0]).
  if (next.activeFrameId != null) {
    const exists = next.frames.some((f: any) => f?.id === next.activeFrameId);
    if (!exists) next.activeFrameId = null;
  }

  // Collapse multi-page docs into one canvas (PDF export will paginate later)
  if (!Array.isArray(next.pages) || !next.pages.length) {
    const page = createPage();
    page.children = [...(next.deltaSetLike?.ROOT?.children || [])];
    next.pages = [page];
  } else if (next.pages.length > 1) {
    const merged = next.pages.flatMap((p: any) => p.children || []);
    const page = createPage(next.pages[0].id);
    page.children = [...new Set(merged)] as string[];
    next.pages = [page];
  }
  next.activePageId = next.pages[0].id;
  syncRootChildren(next);
  return next;
}

/** Shift imported JSON so content sits in canvas-local coords (document origin cleared). */
export function alignImportedDocumentOrigin(doc: any) {
  const next = normalizeDocument(doc);
  const page = getActivePage(next);
  const ids = page?.children || [];
  let minX = Infinity;
  let minY = Infinity;
  for (const id of ids) {
    const node = next.deltaSetLike?.[id];
    if (!node) continue;
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  if (!Number.isFinite(minX)) {
    next.x = 0;
    next.y = 0;
    return next;
  }

  // Prefer shifting node coords over leaving a document.x/y offset —
  // old saved templates often ignore document origin and look blank off-canvas.
  const ox = (Number(next.x) || 0) + minX;
  const oy = (Number(next.y) || 0) + minY;
  if (ox !== 0 || oy !== 0) {
    for (const id of ids) {
      const node = next.deltaSetLike?.[id];
      if (!node) continue;
      node.x = (Number(node.x) || 0) - ox;
      node.y = (Number(node.y) || 0) - oy;
    }
  }
  next.x = 0;
  next.y = 0;
  return next;
}

/** Re-align only when no content intersects the visible canvas after origin offset. */
export function ensureDocumentContentOnCanvas(doc: any) {
  const next = normalizeDocument(doc);
  const page = getActivePage(next);
  const ids = page?.children || [];
  if (!ids.length) return next;

  const ox = Number(next.x) || 0;
  const oy = Number(next.y) || 0;
  const w = next.width || DEFAULT_CANVAS.width;
  const h = next.height || DEFAULT_CANVAS.height;

  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const id of ids) {
    const node = next.deltaSetLike?.[id];
    if (!node) continue;
    const left = (Number(node.x) || 0) - ox;
    const top = (Number(node.y) || 0) - oy;
    const right = left + Math.max(Number(node.width) || 0, 1);
    const bottom = top + Math.max(Number(node.height) || 0, 1);
    minL = Math.min(minL, left);
    minT = Math.min(minT, top);
    maxR = Math.max(maxR, right);
    maxB = Math.max(maxB, bottom);
  }
  if (!Number.isFinite(minL)) return next;

  const intersects = maxR > 0 && maxB > 0 && minL < w && minT < h;
  if (intersects) return next;
  return alignImportedDocumentOrigin(next);
}

export function syncRootChildren(doc: any) {
  const page = doc.pages?.find((p: any) => p.id === doc.activePageId) || doc.pages?.[0];
  if (!doc.deltaSetLike?.ROOT || !page) return doc;
  doc.deltaSetLike = {
    ...doc.deltaSetLike,
    ROOT: {
      ...doc.deltaSetLike.ROOT,
      children: [...(page.children || [])],
    },
  };
  return doc;
}

export function getActivePage(doc: any) {
  if (!doc?.pages?.length) return null;
  return doc.pages.find((p: any) => p.id === doc.activePageId) || doc.pages[0];
}

export function setDocumentSize(doc: any, width: number, height: number) {
  const next = normalizeDocument(doc);
  next.width = Math.max(100, Math.round(width) || DEFAULT_CANVAS.width);
  next.height = Math.max(100, Math.round(height) || DEFAULT_CANVAS.height);
  return next;
}

export function setDocumentCanvasMeta(doc: any, patch: Record<string, any> = {}) {
  const next = normalizeDocument(doc);
  if (patch.backgroundColor != null) next.backgroundColor = patch.backgroundColor;
  if (patch.backgroundFillType != null) next.backgroundFillType = patch.backgroundFillType;
  if (patch.backgroundGradient != null) next.backgroundGradient = patch.backgroundGradient;
  if (patch.backgroundOpacity != null) next.backgroundOpacity = patch.backgroundOpacity;
  if (patch.backgroundImageSrc != null) next.backgroundImageSrc = patch.backgroundImageSrc;
  if (patch.backgroundImageFit != null) next.backgroundImageFit = patch.backgroundImageFit;
  if (patch.backgroundImageRotate != null) next.backgroundImageRotate = patch.backgroundImageRotate;
  if (patch.backgroundImageAdjust != null) next.backgroundImageAdjust = patch.backgroundImageAdjust;
  if (patch.width != null) next.width = Math.max(100, Math.round(patch.width) || DEFAULT_CANVAS.width);
  if (patch.height != null) next.height = Math.max(100, Math.round(patch.height) || DEFAULT_CANVAS.height);
  return next;
}

export function createTextNode({
  x = 40,
  y = 40,
  text = '',
  width,
  height,
}: {
  x?: number;
  y?: number;
  text?: string;
  width?: number;
  height?: number;
} = {}) {
  const id = nanoid(10);
  const content = String(text ?? '');
  const measured = measureWrappedTextSize(content || 'M', {}, DEFAULT_TEXT_BOX_WIDTH);
  // Empty text = caret only: tiny width, one-line height.
  const w = width ?? (content ? measured.width : 2);
  const h = height ?? measured.height;
  return {
    id,
    node: {
      id,
      key: 'text',
      x,
      y,
      z: 0,
      width: w,
      height: h,
      attrs: buildMarkdownTextAttrs(content),
      children: [],
    },
  };
}

export function createRectNode({ x = 40, y = 40, width = 200, height = 2 }) {
  const id = nanoid(10);
  return {
    id,
    node: {
      id,
      key: 'rect',
      x,
      y,
      z: 0,
      width,
      height,
      attrs: {
        L: 'false',
        R: 'false',
        T: 'false',
        B: 'true',
        'border-color': '#333333',
        'border-width': 1,
        'fill-color': 'transparent',
        opacity: 1,
        angle: 0,
        radiusTL: 0,
        radiusTR: 0,
        radiusBR: 0,
        radiusBL: 0,
        radiusLinked: 'true',
      },
      children: [],
    },
  };
}

/** shapeType: rect | line | arrow | circle | triangle | star | polygon | path | pen | pencil */
export function createShapeNode({
  x = 40,
  y = 40,
  width = 120,
  height = 120,
  shapeType = 'rect',
  fill = '#FFFFFF',
  stroke = '#333333',
  path = '',
  closed = false,
  borderWidth,
  angle = 0,
  brushStyle,
  brushStampSrc,
  sides,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shapeType?: string;
  fill?: string;
  stroke?: string;
  path?: string;
  closed?: boolean;
  borderWidth?: number;
  angle?: number;
  /** Pencil brush preset id (solid / calligraphy / marker / …). */
  brushStyle?: string;
  /** Embedded stamp tip for custom / portable stamp brushes. */
  brushStampSrc?: string;
  /** Polygon side count / star point count (default 5). */
  sides?: number;
} = {}) {
  const id = nanoid(10);
  const strokeW =
    borderWidth ??
    (shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'line' || shapeType === 'arrow' ? 2 : 1);
  if (shapeType === 'line' || shapeType === 'arrow') {
    return {
      id,
      node: {
        id,
        key: 'shape',
        x,
        y,
        z: 0,
        width: Math.max(width, 1),
        height: Math.max(height, 8),
        attrs: {
          shapeType,
          'border-color': stroke,
          'border-width': strokeW,
          'stroke-enabled': 'true',
          'stroke-visible': 'true',
          'fill-color': 'transparent',
          'fill-enabled': 'false',
          opacity: 1,
          angle: Number(angle) || 0,
        },
        children: [],
      },
    };
  }

  return {
    id,
    node: {
      id,
      key: 'shape',
      x,
      y,
      z: 0,
      width,
      height,
      attrs: {
        shapeType,
        'fill-color': fill,
        'fill-type': 'solid',
        'border-color': stroke,
        'border-width': strokeW,
        'stroke-enabled': 'true',
        'stroke-visible': 'true',
        'fill-enabled': 'true',
        'fill-visible': 'true',
        L: 'true',
        R: 'true',
        T: 'true',
        B: 'true',
        opacity: 1,
        angle: Number(angle) || 0,
        radiusTL: 0,
        radiusTR: 0,
        radiusBR: 0,
        radiusBL: 0,
        radiusLinked: 'true',
        ...(shapeType === 'polygon' || shapeType === 'star'
          ? { sides: clampShapeSides(sides, DEFAULT_SHAPE_SIDES) }
          : {}),
        ...(path ? { path } : {}),
        ...(closed ? { closed: 'true' } : {}),
        ...(brushStyle ? { brushStyle } : {}),
        ...(brushStampSrc ? { brushStampSrc } : {}),
      },
      children: [],
    },
  };
}

/** Read natural pixel size of an image src (data URL / http). */
export function measureImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('empty image src'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({
        width: Math.max(1, img.naturalWidth || img.width || 1),
        height: Math.max(1, img.naturalHeight || img.height || 1),
      });
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/** Fit natural size into a max box while keeping aspect ratio. */
export function fitImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxSide = 280
): { width: number; height: number } {
  const nw = Math.max(1, naturalWidth);
  const nh = Math.max(1, naturalHeight);
  const scale = Math.min(maxSide / nw, maxSide / nh, 1);
  return {
    width: Math.max(1, Math.round(nw * scale)),
    height: Math.max(1, Math.round(nh * scale)),
  };
}

export function createImageNode({
  x = 40,
  y = 40,
  width = 200,
  height = 200,
  src = '',
  name = 'Image',
  /** Catalog SVG icons — selection shows annotate tools, not photo AI tools. */
  assetKind,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  src?: string;
  name?: string;
  assetKind?: 'icon' | 'image';
} = {}) {
  const id = nanoid(10);
  const kind = assetKind || 'image';
  return {
    id,
    node: {
      id,
      key: 'image',
      x,
      y,
      z: 0,
      width,
      height,
      attrs: {
        src,
        name: name || (kind === 'icon' ? 'Icon' : 'Image'),
        assetKind: kind,
        mode: 'FIT',
        radiusTL: 0,
        radiusTR: 0,
        radiusBR: 0,
        radiusBL: 0,
        radiusLinked: 'true',
      } as Record<string, unknown>,
      children: [],
    },
  };
}

function looksLikeSvgSrc(src: string) {
  const s = String(src || '').trim();
  if (!s) return false;
  if (s.startsWith('data:image/svg+xml')) return true;
  const path = s.split('?')[0].toLowerCase();
  return path.endsWith('.svg');
}

/** True for icon-library assets that still use an SVG source. */
export function isIconImageNode(node: any): boolean {
  if (!node || node.key !== 'image') return false;
  const kind = String(node.attrs?.assetKind || '');
  const src = String(node.attrs?.src || '');
  // Explicit photo (incl. after replace) → never annotate-as-icon.
  if (kind === 'image') return false;
  if (kind === 'icon') return looksLikeSvgSrc(src);
  // Untagged legacy catalog inserts were SVG data URLs without assetKind.
  return looksLikeSvgSrc(src);
}

/** 1×1 transparent GIF — keeps image nodes selectable while src is blank. */
export const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export type ImageProcessKind =
  | 'upscale'
  | 'removeBg'
  | 'eraser'
  | 'editElements'
  | 'editText'
  | 'multiAngle'
  | 'moveObject'
  | 'expand'
  | 'adjust'
  | 'crop'
  | 'vector'
  | 'flipRotate'
  | 'import';

/**
 * Blank loading plate for PDF/DOCX import — selectable / transformable while parsing.
 */
export function spawnImportPlaceholderNode(
  doc: any,
  opts: {
    label?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  } = {}
) {
  if (!doc) return { document: doc, id: null as string | null };
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  const active =
    frames.find((f: any) => f.id === doc.activeFrameId) || frames[0] || null;
  const width = Math.max(120, Math.round(opts.width ?? 420));
  const height = Math.max(160, Math.round(opts.height ?? 594));
  const x =
    opts.x != null
      ? opts.x
      : active
        ? Math.round(Number(active.x) + Number(active.width) + 24)
        : 40;
  const y = opts.y != null ? opts.y : active ? Math.round(Number(active.y) || 0) : 40;
  const { id, node } = createImageNode({
    x,
    y,
    width,
    height,
    src: TRANSPARENT_PIXEL,
  });
  node.attrs = {
    ...node.attrs,
    processStatus: 'running',
    processKind: 'import',
    processLabel: opts.label || '解析中',
  };
  return { document: addNodeToDocument(doc, id, node), id };
}

/**
 * Upscale image pixel data to ~target resolution (long-edge match, aspect preserved).
 * Does not change scene node width/height — only returns a higher-res data URL.
 */
export async function upscaleImageDataUrl(
  src: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  const { width: nw, height: nh } = await measureImageNaturalSize(src);
  const longTarget = Math.max(1, Math.round(targetWidth) || 1, Math.round(targetHeight) || 1);
  const longSrc = Math.max(nw, nh);
  const scale = Math.max(1, longTarget / longSrc);
  let outW = Math.max(1, Math.round(nw * scale));
  let outH = Math.max(1, Math.round(nh * scale));
  const MAX_SIDE = 8192;
  if (outW > MAX_SIDE || outH > MAX_SIDE) {
    const fit = Math.min(MAX_SIDE / outW, MAX_SIDE / outH);
    outW = Math.max(1, Math.round(outW * fit));
    outH = Math.max(1, Math.round(outH * fit));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = window.document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no-2d'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/** Clone image to the right as a loading process node — original stays untouched. */
export function spawnImageProcessNode(
  doc: any,
  sourceId: string,
  opts: {
    kind: ImageProcessKind;
    label: string;
    targetWidth?: number;
    targetHeight?: number;
    gap?: number;
  }
) {
  if (!doc || !sourceId) return { document: doc, id: null as string | null };
  const src = doc.deltaSetLike?.[sourceId];
  if (!src || src.key !== 'image') return { document: doc, id: null as string | null };

  const id = nanoid(10);
  const gap = opts.gap ?? 16;
  // Upscale raises bitmap resolution only — keep on-canvas node size.
  // Expand may grow the plate; other kinds stay source-sized.
  const resizeNode = opts.kind === 'expand';
  const width = Math.max(
    1,
    Math.round(resizeNode ? (opts.targetWidth ?? src.width ?? 100) : (src.width ?? 100))
  );
  const height = Math.max(
    1,
    Math.round(resizeNode ? (opts.targetHeight ?? src.height ?? 100) : (src.height ?? 100))
  );
  const node = JSON.parse(JSON.stringify(src));
  node.id = id;
  node.x = (Number(src.x) || 0) + (Number(src.width) || width) + gap;
  node.y = Number(src.y) || 0;
  node.width = width;
  node.height = height;
  node.attrs = {
    ...(node.attrs || {}),
    processStatus: 'running',
    processKind: opts.kind,
    processLabel: opts.label,
    processSourceId: sourceId,
    ...(opts.targetWidth != null ? { processTargetWidth: Math.round(opts.targetWidth) } : {}),
    ...(opts.targetHeight != null ? { processTargetHeight: Math.round(opts.targetHeight) } : {}),
  };
  return { document: addNodeToDocument(doc, id, node), id };
}

/** Clear processing overlay attrs after a job finishes. */
export function clearImageProcessAttrs(doc: any, nodeId: string) {
  if (!doc || !nodeId) return doc;
  const node = doc.deltaSetLike?.[nodeId];
  if (!node?.attrs) return doc;
  const attrs = { ...node.attrs };
  delete attrs.processStatus;
  delete attrs.processKind;
  delete attrs.processLabel;
  delete attrs.processSourceId;
  delete attrs.processTargetWidth;
  delete attrs.processTargetHeight;
  return updateNodeInDocument(doc, nodeId, { attrs });
}


export function addNodeToDocument(doc, nodeId, node) {
  const next = normalizeDocument(doc);
  next.deltaSetLike[nodeId] = node;
  const page = getActivePage(next);
  if (page && !page.children.includes(nodeId)) {
    page.children.push(nodeId);
  }
  syncRootChildren(next);
  return next;
}

/** Merge an imported Scene (PDF/image job) into the current canvas with remapped ids. */
export function mergeImportedIntoDocument(
  base: any,
  incoming: any,
  opts?: { offsetX?: number; offsetY?: number }
) {
  if (!base) return alignImportedDocumentOrigin(incoming);
  const src = alignImportedDocumentOrigin(incoming);
  const ox = opts?.offsetX ?? 40;
  const oy = opts?.offsetY ?? 40;
  let next = normalizeDocument(base);
  const children: string[] = src.deltaSetLike?.ROOT?.children || [];
  const idMap = new Map<string, string>();
  children.forEach((oldId) => idMap.set(oldId, nanoid(10)));

  children.forEach((oldId) => {
    const raw = src.deltaSetLike?.[oldId];
    if (!raw) return;
    const node = JSON.parse(JSON.stringify(raw));
    const newId = idMap.get(oldId)!;
    node.id = newId;
    node.x = (Number(node.x) || 0) + ox;
    node.y = (Number(node.y) || 0) + oy;
    next = addNodeToDocument(next, newId, node);
  });

  // Import artboard frames if present (offset too).
  if (Array.isArray(src.frames) && src.frames.length) {
    const frames = Array.isArray(next.frames) ? [...next.frames] : [];
    src.frames.forEach((f: any) => {
      frames.push({
        ...JSON.parse(JSON.stringify(f)),
        id: nanoid(8),
        x: (Number(f.x) || 0) + ox,
        y: (Number(f.y) || 0) + oy,
      });
    });
    next.frames = frames;
    if (!next.activeFrameId && frames[0]) next.activeFrameId = frames[0].id;
  }

  return next;
}

export function removeNodeFromDocument(doc, nodeId) {
  const next = normalizeDocument(doc);
  delete next.deltaSetLike[nodeId];
  next.pages.forEach((page: any) => {
    page.children = page.children.filter((id: string) => id !== nodeId);
  });
  syncRootChildren(next);
  return next;
}

export function removeNodesFromDocument(doc, nodeIds: string[]) {
  const ids = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : [];
  if (!ids.length) return doc;
  let next = normalizeDocument(doc);
  ids.forEach((nodeId) => {
    delete next.deltaSetLike[nodeId];
    next.pages.forEach((page: any) => {
      page.children = page.children.filter((id: string) => id !== nodeId);
    });
  });
  syncRootChildren(next);
  return next;
}

export function updateNodeInDocument(doc, nodeId, patch) {
  const next = normalizeDocument(doc);
  const node = next.deltaSetLike[nodeId];
  if (!node) return doc;
  // Never Object.assign(patch) wholesale — that would replace `attrs` and drop shapeType etc.
  const { attrs, ...rest } = patch || {};
  Object.assign(node, rest);
  if (attrs) {
    const prev = node.attrs || {};
    node.attrs = { ...prev, ...attrs };
    // Hard-preserve geometry identity if a partial patch tries to clear it.
    if (prev.shapeType != null && (node.attrs.shapeType == null || node.attrs.shapeType === '')) {
      node.attrs.shapeType = prev.shapeType;
    }
  }
  return next;
}

export function listSceneNodes(doc) {
  if (!doc) return [];
  // Read-only: never mutate Redux/Immer state here
  const page = getActivePage(doc);
  const ids = page?.children || doc.deltaSetLike?.ROOT?.children || [];
  return ids
    .map((id: string) => ({ id, node: doc.deltaSetLike?.[id] }))
    .filter((item: any) => item.node);
}

/** Reorder selected nodes in z-order (ROOT / page children). */
export function reorderNodesInDocument(
  doc: any,
  nodeIds: string[],
  action: 'front' | 'back' | 'forward' | 'backward'
) {
  const next = normalizeDocument(doc);
  const page = getActivePage(next);
  if (!page) return next;
  const ids = [...(page.children || [])];
  const selected = nodeIds.filter((id) => ids.includes(id));
  if (!selected.length) return next;

  const rest = ids.filter((id) => !selected.includes(id));

  if (action === 'front') {
    page.children = [...rest, ...selected];
  } else if (action === 'back') {
    page.children = [...selected, ...rest];
  } else if (action === 'forward') {
    // Move each selected id one step toward the end (keep relative order).
    let working = [...ids];
    for (let i = working.length - 2; i >= 0; i -= 1) {
      if (selected.includes(working[i]) && !selected.includes(working[i + 1])) {
        const tmp = working[i];
        working[i] = working[i + 1];
        working[i + 1] = tmp;
      }
    }
    page.children = working;
  } else if (action === 'backward') {
    let working = [...ids];
    for (let i = 1; i < working.length; i += 1) {
      if (selected.includes(working[i]) && !selected.includes(working[i - 1])) {
        const tmp = working[i];
        working[i] = working[i - 1];
        working[i - 1] = tmp;
      }
    }
    page.children = working;
  }

  syncRootChildren(next);
  return next;
}

export function isRectLikeNode(node: any) {
  return supportsCornerRadius(node);
}

/**
 * Per-side stroke (T/R/B/L) is only rendered for rect-like closed paths
 * (`createRectLike` in sceneToSvg).
 */
export function supportsSideStroke(node: any) {
  if (!node) return false;
  if (node.key === 'rect') return true;
  if (node.key === 'shape') {
    const t = String(node.attrs?.shapeType || 'rect');
    return t === 'rect' || t === 'roundRect' || t === '';
  }
  return false;
}

/** Nodes that expose corner-radius toolbar + on-canvas handles. */
export function supportsCornerRadius(node: any) {
  if (!node) return false;
  if (node.key === 'rect' || node.key === 'image') return true;
  if (node.key === 'path') {
    return isClosedPathAttrs(node.attrs);
  }
  if (node.key === 'shape') {
    const t = String(node.attrs?.shapeType || 'rect');
    if (t === 'rect' || t === 'roundRect' || t === 'triangle' || t === 'polygon' || t === 'star') {
      return true;
    }
    // Boolean / freehand closed paths — same R control as rect (no aspect presets).
    if (t === 'path' || t === 'pen') {
      return isClosedPathAttrs(node.attrs);
    }
  }
  return false;
}

function isClosedPathAttrs(attrs: Record<string, unknown> | null | undefined) {
  if (!attrs) return false;
  if (attrs.closed === true || attrs.closed === 'true') return true;
  const d = String(attrs.path || attrs.d || '').trim();
  return /z\s*$/i.test(d);
}

/** Regular polygon / star: adjustable side (or point) count. */
export function supportsShapeSides(node: any) {
  if (!node || node.key !== 'shape') return false;
  const t = String(node.attrs?.shapeType || '');
  return t === 'polygon' || t === 'star';
}

/**
 * Whether preset aspect ratios (1:1 / 16:9 …) are meaningful.
 * Freehand paths, lines, and arrows only have a loose bounding box — skip presets.
 */
export function supportsAspectPresets(node: any) {
  if (!node) return false;
  if (node.key === 'image' || node.key === 'frame') return true;
  if (node.key === 'rect' || node.key === 'ellipse') return true;
  if (node.key === 'path') return false;
  if (node.key !== 'shape') return false;
  const t = String(node.attrs?.shapeType || 'rect');
  return !['line', 'arrow', 'pen', 'pencil', 'path'].includes(t);
}

/**
 * Whether the node can have a fill / background color.
 * Open stroke paths (line, arrow, pencil, unclosed pen/path) are stroke-only.
 */
export function supportsFill(node: any) {
  if (!node) return false;
  if (node.key === 'rect' || node.key === 'ellipse' || node.key === 'image') return true;
  if (node.key === 'path') {
    const d = String(node.attrs?.path || node.attrs?.d || '');
    return (
      node.attrs?.closed === true ||
      node.attrs?.closed === 'true' ||
      /\sZ\s*$/i.test(d.trim())
    );
  }
  if (node.key !== 'shape') return false;
  const t = String(node.attrs?.shapeType || 'rect');
  if (t === 'line' || t === 'arrow' || t === 'pencil') return false;
  if (t === 'pen' || t === 'path') {
    const d = String(node.attrs?.path || node.attrs?.d || '');
    return (
      node.attrs?.closed === true ||
      node.attrs?.closed === 'true' ||
      /\sZ\s*$/i.test(d.trim())
    );
  }
  return true;
}

/**
 * Shape stroke panel (描边). Images / text / frames use other chrome — not this control.
 */
export function supportsStroke(node: any) {
  if (!node) return false;
  if (node.key === 'image' || node.key === 'text' || node.key === 'frame') return false;
  if (node.key === 'rect' || node.key === 'ellipse' || node.key === 'path') return true;
  return node.key === 'shape';
}

/**
 * Closed shapes eligible for union / subtract / intersect / exclude.
 * Excludes open strokes and non-shape nodes (image, text, …).
 */
export function supportsBooleanOp(node: any) {
  if (!node || node.key !== 'shape') return false;
  const t = String(node.attrs?.shapeType || 'rect');
  return !['line', 'arrow', 'pen', 'pencil'].includes(t);
}

/** Logical multi-object group id stored on each member (`attrs.groupId`). */
export function readNodeGroupId(node: any): string | null {
  const id = String(node?.attrs?.groupId || '').trim();
  return id || null;
}

/** All node ids that share the same groupId. */
export function listGroupMemberIds(doc: any, groupId: string): string[] {
  if (!doc || !groupId) return [];
  return listSceneNodes(doc)
    .filter(({ node }) => readNodeGroupId(node) === groupId)
    .map(({ id }) => id);
}

/**
 * Expand a selection so that picking any member selects the whole group.
 * Used on click / marquee select (not when empty).
 */
export function expandSelectionWithGroups(doc: any, nodeIds: string[]): string[] {
  if (!doc || !nodeIds?.length) return nodeIds || [];
  const out = new Set<string>();
  for (const id of nodeIds) {
    const gid = readNodeGroupId(doc.deltaSetLike?.[id]);
    if (!gid) {
      out.add(id);
      continue;
    }
    listGroupMemberIds(doc, gid).forEach((mid) => out.add(mid));
  }
  return [...out];
}

/**
 * If every selected id shares one groupId and the selection is exactly that group,
 * return the groupId; otherwise null.
 */
export function selectionSharedGroupId(doc: any, nodeIds: string[]): string | null {
  if (!doc || !nodeIds || nodeIds.length < 2) return null;
  const first = readNodeGroupId(doc.deltaSetLike?.[nodeIds[0]]);
  if (!first) return null;
  if (!nodeIds.every((id) => readNodeGroupId(doc.deltaSetLike?.[id]) === first)) return null;
  const members = listGroupMemberIds(doc, first);
  if (members.length !== nodeIds.length) return null;
  const set = new Set(nodeIds);
  if (!members.every((id) => set.has(id))) return null;
  return first;
}

/** Assign a shared groupId to the given nodes. */
export function groupNodesInDocument(doc: any, nodeIds: string[]) {
  const ids = [...new Set((nodeIds || []).filter(Boolean))];
  if (ids.length < 2) return doc;
  const next = normalizeDocument(doc);
  const groupId = nanoid(8);
  ids.forEach((id) => {
    const node = next.deltaSetLike?.[id];
    if (!node) return;
    node.attrs = { ...(node.attrs || {}), groupId };
  });
  return next;
}

/** Clear groupId from the given nodes (and leftover siblings in that group). */
export function ungroupNodesInDocument(doc: any, nodeIds: string[]) {
  const ids = [...new Set((nodeIds || []).filter(Boolean))];
  if (!ids.length) return doc;
  const next = normalizeDocument(doc);
  const groupIds = new Set<string>();
  ids.forEach((id) => {
    const gid = readNodeGroupId(next.deltaSetLike?.[id]);
    if (gid) groupIds.add(gid);
  });
  if (!groupIds.size) return doc;
  listSceneNodes(next).forEach(({ id, node }) => {
    const gid = readNodeGroupId(node);
    if (!gid || !groupIds.has(gid)) return;
    const attrs = { ...(node.attrs || {}) };
    delete attrs.groupId;
    node.attrs = attrs;
    next.deltaSetLike[id] = node;
  });
  return next;
}

export type SceneClipboardPayload = {
  nodes: Array<{ id: string; node: any }>;
};

/** Axis-aligned bounds of clipboard nodes (document x/y/width/height). */
export function clipboardNodesBounds(clipboard: SceneClipboardPayload | null | undefined) {
  if (!clipboard?.nodes?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  clipboard.nodes.forEach(({ node }) => {
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const w = Math.max(0, Number(node.width) || 0);
    const h = Math.max(0, Number(node.height) || 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  if (!Number.isFinite(minX)) return null;
  return {
    left: minX,
    top: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/** Deep-clone selected nodes for copy / cut (preserves page z-order). */
export function snapshotNodesForClipboard(
  doc: any,
  nodeIds: string[]
): SceneClipboardPayload | null {
  if (!doc) return null;
  const wanted = new Set((nodeIds || []).filter(Boolean));
  if (!wanted.size) return null;
  const page = getActivePage(doc);
  const ordered = (page?.children || []).filter((id: string) => wanted.has(id));
  const ids = ordered.length ? ordered : [...wanted];
  const nodes: SceneClipboardPayload['nodes'] = [];
  ids.forEach((id) => {
    const raw = doc.deltaSetLike?.[id];
    if (!raw) return;
    nodes.push({ id, node: JSON.parse(JSON.stringify(raw)) });
  });
  return nodes.length ? { nodes } : null;
}

/**
 * Paste clipboard nodes with new ids.
 * - Default: nudge by offset (keyboard paste).
 * - `anchor`: place union top-left at that scene point (context-menu paste).
 */
export function pasteClipboardIntoDocument(
  doc: any,
  clipboard: SceneClipboardPayload | null | undefined,
  opts?: { offsetX?: number; offsetY?: number; anchor?: { x: number; y: number } }
): { document: any; ids: string[] } {
  if (!doc || !clipboard?.nodes?.length) return { document: doc, ids: [] };
  let next = normalizeDocument(doc);
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  clipboard.nodes.forEach(({ id }) => idMap.set(id, nanoid(10)));

  let ox = opts?.offsetX ?? 24;
  let oy = opts?.offsetY ?? 24;
  if (opts?.anchor) {
    let minX = Infinity;
    let minY = Infinity;
    clipboard.nodes.forEach(({ node }) => {
      minX = Math.min(minX, Number(node.x) || 0);
      minY = Math.min(minY, Number(node.y) || 0);
    });
    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      ox = opts.anchor.x - minX;
      oy = opts.anchor.y - minY;
    }
  }

  const newIds: string[] = [];
  clipboard.nodes.forEach(({ id, node: raw }) => {
    const node = JSON.parse(JSON.stringify(raw));
    const newId = idMap.get(id)!;
    node.id = newId;
    node.x = (Number(node.x) || 0) + ox;
    node.y = (Number(node.y) || 0) + oy;
    const gid = String(node.attrs?.groupId || '').trim();
    if (gid) {
      if (!groupMap.has(gid)) groupMap.set(gid, nanoid(8));
      node.attrs = { ...(node.attrs || {}), groupId: groupMap.get(gid) };
    }
    next = addNodeToDocument(next, newId, node);
    newIds.push(newId);
  });
  return { document: next, ids: newIds };
}

