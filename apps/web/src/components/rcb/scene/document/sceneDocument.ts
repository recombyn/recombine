import { nanoid } from '@reduxjs/toolkit';
import { buildMarkdownTextAttrs, measurePlainTextSize } from './sceneText';
import { clampShapeSides, DEFAULT_SHAPE_SIDES, DEFAULT_STAR_INNER_RATIO } from './sceneShapes';

/** Default canvas size (approx A4 @ 96dpi); user can change freely */
export const DEFAULT_CANVAS = { width: 794, height: 1123 };

export const A4_PORTRAIT = { ...DEFAULT_CANVAS };

function createPage(id?: string) {
  return {
    id: id || nanoid(8),
    children: [] as string[],
  };
}

/** Unified paint / layer order: `frame:id` | `node:id` (bottom → top). */
export function stackFrameKey(id: string) {
  return `frame:${id}`;
}

export function stackNodeKey(id: string) {
  return `node:${id}`;
}

export function parseStackKey(
  key: string
): { kind: 'frame' | 'node'; id: string } | null {
  if (typeof key !== 'string') return null;
  if (key.startsWith('frame:')) return { kind: 'frame', id: key.slice(6) };
  if (key.startsWith('node:')) return { kind: 'node', id: key.slice(5) };
  return null;
}

function listRootNodeIds(doc: any): string[] {
  const page = Array.isArray(doc?.pages) ? doc.pages[0] : null;
  const fromPage = page?.children;
  if (Array.isArray(fromPage)) return fromPage.filter(Boolean).map(String);
  const fromRoot = doc?.deltaSetLike?.ROOT?.children;
  return Array.isArray(fromRoot) ? fromRoot.filter(Boolean).map(String) : [];
}

/**
 * Keep `doc.stackOrder` in sync with frames + root nodes.
 * Empty → migrate legacy paint (frames under nodes). Missing entries append on top.
 */
export function reconcileStackOrder(doc: any): string[] {
  if (!doc || typeof doc !== 'object') return [];
  const frameIds = (Array.isArray(doc.frames) ? doc.frames : [])
    .map((f: any) => (f?.id != null ? String(f.id) : ''))
    .filter(Boolean);
  const nodeIds = listRootNodeIds(doc);
  const frameSet = new Set(frameIds);
  const nodeSet = new Set(nodeIds);
  const raw = Array.isArray(doc.stackOrder) ? doc.stackOrder.map(String) : [];

  if (!raw.length) {
    const migrated = [
      ...frameIds.map(stackFrameKey),
      ...nodeIds.map(stackNodeKey),
    ];
    doc.stackOrder = migrated;
    return migrated;
  }

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const key of raw) {
    const parsed = parseStackKey(key);
    if (!parsed) continue;
    if (parsed.kind === 'frame' && !frameSet.has(parsed.id)) continue;
    if (parsed.kind === 'node' && !nodeSet.has(parsed.id)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(key);
  }
  for (const id of frameIds) {
    const key = stackFrameKey(id);
    if (seen.has(key)) continue;
    kept.push(key);
    seen.add(key);
  }
  for (const id of nodeIds) {
    const key = stackNodeKey(id);
    if (seen.has(key)) continue;
    kept.push(key);
    seen.add(key);
  }
  doc.stackOrder = kept;
  return kept;
}

/** 1-based CSS z-index from unified stack (0 if missing). */
export function stackZIndex(doc: any, kind: 'frame' | 'node', id: string): number {
  const order = Array.isArray(doc?.stackOrder) ? doc.stackOrder : [];
  const key = kind === 'frame' ? stackFrameKey(id) : stackNodeKey(id);
  const i = order.indexOf(key);
  return i >= 0 ? i + 1 : 0;
}

function reorderKeysInList(
  ids: string[],
  selected: string[],
  action: 'front' | 'back' | 'forward' | 'backward'
): string[] {
  if (!selected.length) return ids;
  const rest = ids.filter((id) => !selected.includes(id));
  if (action === 'front') return [...rest, ...selected];
  if (action === 'back') return [...selected, ...rest];
  if (action === 'forward') {
    const working = [...ids];
    for (let i = working.length - 2; i >= 0; i -= 1) {
      if (selected.includes(working[i]) && !selected.includes(working[i + 1])) {
        const tmp = working[i];
        working[i] = working[i + 1];
        working[i + 1] = tmp;
      }
    }
    return working;
  }
  const working = [...ids];
  for (let i = 1; i < working.length; i += 1) {
    if (selected.includes(working[i]) && !selected.includes(working[i - 1])) {
      const tmp = working[i];
      working[i] = working[i - 1];
      working[i - 1] = tmp;
    }
  }
  return working;
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
    const withBg =
      !bg || bg === 'none' ? { ...f, backgroundColor: '#FFFFFF' } : { ...f };
    // Default: show overflow for legacy frames that never set the flag.
    if (withBg.clipContent === undefined) withBg.clipContent = false;
    return withBg;
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
  reconcileStackOrder(next);
  return next;
}

/** Shift imported JSON so content sits in canvas-local coords (document origin cleared). */
export function alignImportedDocumentOrigin(doc: any) {
  const next = normalizeDocument(doc);
  const page = getActivePage(next);
  const ids = page?.children || [];
  const docOx = Number(next.x) || 0;
  const docOy = Number(next.y) || 0;

  /**
   * Always bake `document.x/y` into node/frame coords then clear origin.
   * Editor paint (`canvasDocument`) forces origin 0 — leaving a non-zero store
   * origin makes fitView (store) disagree with hosts (zeroed), then a later
   * align remounts every shape and the page jumps after boot.
   *
   * With artboards: only bake the document origin (do NOT also subtract minX/minY —
   * that would collapse case margins). Without frames: also pull content to (0,0).
   */
  const hasFrames = Array.isArray(next.frames) && next.frames.length > 0;
  let shiftX = docOx;
  let shiftY = docOy;
  if (!hasFrames) {
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
    if (Number.isFinite(minX)) {
      shiftX = docOx + minX;
      shiftY = docOy + minY;
    }
  }

  if (shiftX !== 0 || shiftY !== 0) {
    for (const id of ids) {
      const node = next.deltaSetLike?.[id];
      if (!node) continue;
      node.x = (Number(node.x) || 0) - shiftX;
      node.y = (Number(node.y) || 0) - shiftY;
    }
    if (hasFrames) {
      for (const f of next.frames) {
        if (!f) continue;
        f.x = (Number(f.x) || 0) - shiftX;
        f.y = (Number(f.y) || 0) - shiftY;
      }
    }
  }
  next.x = 0;
  next.y = 0;
  return next;
}

/**
 * Ensure content is paintable at document origin 0.
 * Non-zero `document.x/y` must always be baked away — not only when off-canvas.
 */
export function ensureDocumentContentOnCanvas(doc: any) {
  const next = normalizeDocument(doc);
  const ox = Number(next.x) || 0;
  const oy = Number(next.y) || 0;
  if (ox !== 0 || oy !== 0) {
    return alignImportedDocumentOrigin(next);
  }

  const page = getActivePage(next);
  const ids = page?.children || [];
  if (!ids.length) return next;

  const w = next.width || DEFAULT_CANVAS.width;
  const h = next.height || DEFAULT_CANVAS.height;

  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const id of ids) {
    const node = next.deltaSetLike?.[id];
    if (!node) continue;
    const left = Number(node.x) || 0;
    const top = Number(node.y) || 0;
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
  if (patch.gridSize != null) {
    const g = Number(patch.gridSize);
    if (Number.isFinite(g) && g > 0) next.gridSize = g;
  }
  return next;
}

export function createTextNode({
  x = 40,
  y = 40,
  text = '',
  width,
  height,
  autoSize = true,
  fontSize,
}: {
  x?: number;
  y?: number;
  text?: string;
  width?: number;
  height?: number;
  /** true = hug content; false = fixed wrap width from L/R resize or drag-create. */
  autoSize?: boolean;
  /** Scene-px font size (T-tool passes zoom-fitted size so high zoom is not huge). */
  fontSize?: number;
} = {}) {
  const id = nanoid(10);
  const content = String(text ?? '');
  const style =
    fontSize != null && Number.isFinite(fontSize) && fontSize > 0
      ? { fontSize: Math.max(1, Number(fontSize)) }
      : {};
  const measured = measurePlainTextSize(content || 'M', style);
  // Empty autoSize = caret only (tiny width). Fixed-width keeps the dragged box.
  const w = width ?? (content ? measured.width : autoSize ? 2 : 160);
  const h = height ?? measured.height;
  const attrs = buildMarkdownTextAttrs(content, style);
  (attrs as any).autoSize = autoSize ? 'true' : 'false';
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
      attrs,
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
  pathPressure,
  sides,
  opacity = 1,
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
  /** Comma-separated 0–1 pressures aligned with path points (pencil). */
  pathPressure?: string;
  /** Polygon side count / star point count (default 5). */
  sides?: number;
  /** 0–1 node opacity (brush-time opacity for pencil). */
  opacity?: number;
} = {}) {
  const op = Math.min(1, Math.max(0, Number(opacity)));
  const opacityVal = Number.isFinite(op) ? op : 1;
  const id = nanoid(10);
  const strokeW =
    borderWidth ??
    (shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'line' || shapeType === 'arrow' ? 2 : 1);
  // Stroke panel default — center on the path (inside/outside are explicit user picks).
  const strokeAlignDefault = 'center';
  // Quantize to 0.5px so odd center strokes can sit outer edges on integer grid
  // (geom = visual ± sw/2). Full integers when sw is even / inside.
  const ix = Math.round((Number(x) || 0) * 2) / 2;
  const iy = Math.round((Number(y) || 0) * 2) / 2;
  const iw = Math.max(1, Math.round((Number(width) || 1) * 2) / 2);
  const ih = Math.max(1, Math.round((Number(height) || 1) * 2) / 2);
  if (shapeType === 'line' || shapeType === 'arrow') {
    return {
      id,
      node: {
        id,
        key: 'shape',
        x: ix,
        y: iy,
        z: 0,
        width: Math.max(iw, 1),
        height: Math.max(ih, 8),
        attrs: {
          shapeType,
          'border-color': stroke,
          'border-width': strokeW,
          strokeAlign: strokeAlignDefault,
          'stroke-align': strokeAlignDefault,
          'stroke-enabled': 'true',
          'stroke-visible': 'true',
          // Must live on this early-return path — the general branch never runs
          // for line/arrow (panel showed Butt while paint stayed Round).
          strokeLinecap: 'butt',
          'stroke-linecap': 'butt',
          strokeLinejoin: 'miter',
          'stroke-linejoin': 'miter',
          'fill-color': 'transparent',
          'fill-enabled': 'false',
          opacity: opacityVal,
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
      x: ix,
      y: iy,
      z: 0,
      width: iw,
      height: ih,
      attrs: {
        shapeType,
        'fill-color': fill,
        'fill-type': 'solid',
        'border-color': stroke,
        'border-width': strokeW,
        strokeAlign: strokeAlignDefault,
        'stroke-align': strokeAlignDefault,
        'stroke-enabled': 'true',
        'stroke-visible': 'true',
        'fill-enabled':
          shapeType === 'pen' || shapeType === 'pencil' || fill === 'transparent'
            ? 'false'
            : 'true',
        'fill-visible':
          shapeType === 'pen' || shapeType === 'pencil' || fill === 'transparent'
            ? 'false'
            : 'true',
        L: 'true',
        R: 'true',
        T: 'true',
        B: 'true',
        opacity: opacityVal,
        angle: Number(angle) || 0,
        radiusTL: 0,
        radiusTR: 0,
        radiusBR: 0,
        radiusBL: 0,
        radiusLinked: 'true',
        ...(shapeType === 'polygon' || shapeType === 'star'
          ? { sides: clampShapeSides(sides, DEFAULT_SHAPE_SIDES) }
          : {}),
        ...(shapeType === 'star' ? { starInnerRatio: DEFAULT_STAR_INNER_RATIO } : {}),
        ...(path ? { path } : {}),
        // Persist open/closed so stroke panel can show linecap for open pens.
        ...((shapeType === 'pen' || shapeType === 'path' || path) && {
          closed: closed ? 'true' : 'false',
        }),
        // Pen / line / arrow → butt+miter (stroke panel default). Pencil stays round.
        ...(shapeType === 'pencil' && {
          strokeLinecap: 'round',
          'stroke-linecap': 'round',
          strokeLinejoin: 'round',
          'stroke-linejoin': 'round',
        }),
        ...((shapeType === 'pen' || shapeType === 'line' || shapeType === 'arrow') && {
          strokeLinecap: 'butt',
          'stroke-linecap': 'butt',
          strokeLinejoin: 'miter',
          'stroke-linejoin': 'miter',
        }),
        ...(brushStyle ? { brushStyle } : {}),
        ...(brushStampSrc ? { brushStampSrc } : {}),
        ...(shapeType === 'pencil' && pathPressure ? { pathPressure } : {}),
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

/** Read video metadata (size + duration) from a blob/object/http URL. */
export function measureVideoNaturalSize(
  src: string
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('empty video src'));
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };
    const finish = (width: number, height: number, duration: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ width, height, duration });
    };
    video.onloadedmetadata = () => {
      const width = Math.max(1, video.videoWidth || 1);
      const height = Math.max(1, video.videoHeight || 1);
      const raw = Number(video.duration);
      if (Number.isFinite(raw) && raw > 0 && raw < 60 * 60 * 12) {
        finish(width, height, raw);
        return;
      }
      // Fragmented MP4s often report Infinity — seek-clamp once at upload so we can store it.
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        window.clearTimeout(timer);
        const probed = Number(video.currentTime);
        const duration =
          Number.isFinite(probed) && probed > 0 && probed < 60 * 60 * 12 ? probed : 0;
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
        finish(width, height, duration);
      };
      const timer = window.setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        const probed = Number(video.currentTime);
        const duration =
          Number.isFinite(probed) && probed > 0 && probed < 60 * 60 * 12 ? probed : 0;
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
        finish(width, height, duration);
      }, 900);
      video.addEventListener('seeked', onSeeked);
      try {
        video.currentTime = 1e10;
      } catch {
        window.clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        finish(width, height, 0);
      }
    };
    video.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('video load failed'));
    };
    video.src = src;
  });
}

/** Capture a poster frame (JPEG data URL) from a video src. */
export function captureVideoPosterFrame(
  src: string,
  atSeconds = 0.1
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('empty video src'));
      return;
    }
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    // data/blob are same-origin; forcing anonymous breaks some blob captures.
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      video.crossOrigin = 'anonymous';
    }
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('video poster capture failed'));
    };
    const succeed = (url: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(url);
    };
    const timer = window.setTimeout(fail, 8000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.onerror = null;
      video.onloadeddata = null;
      video.onseeked = null;
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }
    };
    const draw = () => {
      try {
        const w = Math.max(1, video.videoWidth || 1);
        const h = Math.max(1, video.videoHeight || 1);
        if (w <= 1 || h <= 1) {
          fail();
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fail();
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        succeed(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        fail();
      }
    };
    video.onerror = fail;
    video.onloadeddata = () => {
      try {
        const seekTo = Math.min(
          Math.max(0, atSeconds),
          Math.max(0, (video.duration || 1) - 0.05)
        );
        if (seekTo <= 0.01 || Math.abs((Number(video.currentTime) || 0) - seekTo) <= 0.04) {
          draw();
          return;
        }
        const seekTimer = window.setTimeout(draw, 700);
        video.onseeked = () => {
          window.clearTimeout(seekTimer);
          draw();
        };
        video.currentTime = seekTo;
      } catch {
        fail();
      }
    };
    video.src = src;
  });
}

/** Shared prep for canvas video place (tool strip / paste): preview, poster, size, label. */
export async function prepareVideoUploadPreview(file: File): Promise<{
  preview: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
  name: string;
}> {
  const { readFileAsDataUrl } = await import('@/utils/uploadImage');
  const preview = await readFileAsDataUrl(file);
  const natural = await measureVideoNaturalSize(preview);
  let poster = '';
  try {
    poster = await captureVideoPosterFrame(preview);
  } catch {
    /* optional */
  }
  return {
    preview,
    poster,
    width: natural.width,
    height: natural.height,
    duration: natural.duration,
    name: file.name?.replace(/\.[^.]+$/, '') || 'Video',
  };
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
        /** Default on — drag-resize keeps width:height (Shift temporarily unlocks). */
        lockAspect: 'true',
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

/** Canvas image-generator plate (empty image + generator overlay until promote). */
function attrFlagTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function isImageGeneratorNode(node: any): boolean {
  return Boolean(node) && node.key === 'image' && attrFlagTrue(node.attrs?.imageGenerator);
}

/** Canvas video-generator plate (empty video + generator overlay until promote). */
export function isVideoGeneratorNode(node: any): boolean {
  return Boolean(node) && node.key === 'video' && attrFlagTrue(node.attrs?.videoGenerator);
}

/** Image / video generator plates — not real scene content (no hide / lock / export). */
export function isGeneratorNode(node: any): boolean {
  return isImageGeneratorNode(node) || isVideoGeneratorNode(node);
}

export function isVideoNode(node: any): boolean {
  return Boolean(node) && node.key === 'video' && !isVideoGeneratorNode(node);
}

/** Layer hidden — skipped in SVG render + hit-test. */
export function isNodeHidden(node: any): boolean {
  return Boolean(node) && attrFlagTrue(node.attrs?.hidden);
}

/**
 * Nodes that belong in export / cover / thumbnail output.
 * Skip editor-only chrome: image/video-generator plates and in-progress process shimmer.
 */
export function isExportableSceneNode(node: any): boolean {
  if (!node || isNodeHidden(node)) return false;
  if (isGeneratorNode(node)) return false;
  if (String(node?.attrs?.processStatus || '') === 'running') return false;
  return true;
}

/**
 * Share / public preview: drop generator plates and process-shimmer so viewers
 * only see finished scene content (same filter as export / cover).
 */
export function documentForSharePreview(doc: any): any {
  if (!doc?.deltaSetLike?.ROOT) return doc;
  const delta = doc.deltaSetLike;
  const keepId = (id: string) => isExportableSceneNode(delta[id]);
  const rootChildren = Array.isArray(delta.ROOT.children)
    ? delta.ROOT.children.filter(keepId)
    : [];
  const pages = Array.isArray(doc.pages)
    ? doc.pages.map((p: any) => ({
        ...p,
        children: Array.isArray(p.children) ? p.children.filter(keepId) : p.children,
      }))
    : doc.pages;
  return {
    ...doc,
    pages,
    deltaSetLike: {
      ...delta,
      ROOT: { ...delta.ROOT, children: rootChildren },
    },
  };
}

/** True while an image job (upload / remove-bg / …) shows the loading shimmer. */
export function isImageProcessRunning(node: any): boolean {
  return Boolean(node) && String(node?.attrs?.processStatus || '') === 'running';
}

/**
 * In-flight process placeholder (upload / import / AI tools like editElements).
 * Delete is permanent — scrubbed from history so Undo cannot revive it; clearing
 * pendingImageProcessId aborts applying the result (same as upload-in-flight).
 */
export function isEphemeralUploadNode(node: any): boolean {
  return isImageProcessRunning(node);
}

/**
 * Nodes that may be pinned into Chat (右键 / 快捷键 / composer).
 * Generator plates and process-shimmer nodes stay out.
 * `imagesOnly` — image-generator / quick-edit pick: reject video nodes.
 */
export function canAttachNodeToChat(
  node: any,
  opts?: { imagesOnly?: boolean }
): boolean {
  if (!node) return false;
  if (isGeneratorNode(node)) return false;
  if (isImageProcessRunning(node)) return false;
  if (opts?.imagesOnly && node.key === 'video') return false;
  return true;
}

/** Layer locked — still visible/selectable, but transforms are blocked. */
export function isNodeLocked(node: any): boolean {
  return Boolean(node) && attrFlagTrue(node.attrs?.locked);
}

/**
 * Spawn an Image Generator plate. Same `image` key so hit-test / select
 * keep working; `attrs.imageGenerator` flips on the HTML composer overlay.
 * After generate, call `promoteImageGeneratorToImage` to become a normal photo.
 * Export / cover / thumbnails skip these plates via `isExportableSceneNode`.
 */
export function createImageGeneratorNode({
  x = 40,
  y = 40,
  width = 360,
  height = 360,
  name = 'Image Generator',
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
} = {}) {
  const id = nanoid(10);
  // Integer quantize — empty gen uses inset border so path === outer ink on the grid.
  // (Half-pixel was only needed for center strokes.)
  const iw = Math.max(1, Math.round(Number(width) || 360));
  const ih = Math.max(1, Math.round(Number(height) || 360));
  const ix = Math.round(Number(x) || 0);
  const iy = Math.round(Number(y) || 0);
  return {
    id,
    node: {
      id,
      key: 'image',
      x: ix,
      y: iy,
      z: 0,
      width: iw,
      height: ih,
      attrs: {
        src: '',
        name: name || 'Image Generator',
        assetKind: 'image',
        imageGenerator: true,
        // Durable gen settings — survive overlay remount / deselect.
        imageGenAspect: '1:1',
        imageGenResolution: '2K',
        imageGenCount: 1,
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

/** Parse durable multi-gen stack URLs from image node attrs. */
export function parseImageVariants(attrs: any): string[] {
  const raw = attrs?.imageVariants;
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((u) => String(u || '').trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** All stack URLs for an image node (falls back to single `src`). */
export function listImageVariantUrls(node: any): string[] {
  if (!node || node.key !== 'image') return [];
  const variants = parseImageVariants(node.attrs);
  if (variants.length) return variants;
  const src = String(node.attrs?.src || '').trim();
  return src ? [src] : [];
}

export function writeImageVariantsAttr(attrs: Record<string, unknown>, urls: string[]) {
  const cleaned = [...new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))];
  if (cleaned.length <= 1) {
    delete attrs.imageVariants;
  } else {
    attrs.imageVariants = JSON.stringify(cleaned);
  }
}

/**
 * Turn a generator plate into a normal image node (same id / selection).
 * Clears generator + process attrs and applies the result `src` + geometry.
 * When `variants` has 2+ URLs, stores them on `attrs.imageVariants` for stack UI.
 */
export function promoteImageGeneratorToImage(
  doc: any,
  nodeId: string,
  {
    src,
    width,
    height,
    x,
    y,
    name,
    variants,
    genPrompt,
  }: {
    src: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    name?: string;
    /** All generated URLs (including `src`); persisted when length > 1. */
    variants?: string[];
    /** Original text prompt — used to prefill quick-edit Chat. */
    genPrompt?: string;
  }
) {
  if (!doc || !nodeId || !src) return doc;
  const next = normalizeDocument(doc);
  const node = next.deltaSetLike?.[nodeId];
  if (!node || node.key !== 'image') return doc;
  const attrs = { ...(node.attrs || {}) };
  delete attrs.imageGenerator;
  delete attrs.imageGenAspect;
  delete attrs.imageGenResolution;
  delete attrs.imageGenCount;
  delete attrs.imageGenModel;
  delete attrs.processStatus;
  delete attrs.processKind;
  delete attrs.processLabel;
  delete attrs.processSourceId;
  delete attrs.processTargetWidth;
  delete attrs.processTargetHeight;
  delete attrs.processMeta;
  attrs.src = src;
  attrs.assetKind = 'image';
  if (name) attrs.name = name;
  const prompt = String(genPrompt || '').trim();
  if (prompt) attrs.genPrompt = prompt;
  else delete attrs.genPrompt;
  const stack = Array.isArray(variants) ? variants : [];
  const withMain = stack.includes(src) ? stack : [src, ...stack];
  writeImageVariantsAttr(attrs, withMain);
  node.attrs = attrs;
  if (width != null) node.width = Math.max(1, Math.round(width));
  if (height != null) node.height = Math.max(1, Math.round(height));
  if (x != null) node.x = Math.round(x);
  if (y != null) node.y = Math.round(y);
  return next;
}

/**
 * Spawn a Video Generator plate. Same `video` key so hit-test / select
 * keep working; `attrs.videoGenerator` flips on the HTML composer overlay.
 * After generate, call `promoteVideoGeneratorToVideo` to become a normal video.
 */
export function createVideoGeneratorNode({
  x = 40,
  y = 40,
  width = 640,
  height = 360,
  name = 'Video Generator',
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
} = {}) {
  const id = nanoid(10);
  // Integer quantize — inset border means path === outer ink on the grid.
  const iw = Math.max(1, Math.round(Number(width) || 640));
  const ih = Math.max(1, Math.round(Number(height) || 360));
  const ix = Math.round(Number(x) || 0);
  const iy = Math.round(Number(y) || 0);
  return {
    id,
    node: {
      id,
      key: 'video',
      x: ix,
      y: iy,
      z: 0,
      width: iw,
      height: ih,
      attrs: {
        src: '',
        poster: '',
        name: name || 'Video Generator',
        assetKind: 'video',
        videoGenerator: true,
        videoGenAspect: '16:9',
        videoGenResolution: '720p',
        videoGenDuration: 5,
        mode: 'FIT',
        lockAspect: 'true',
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

export function createVideoNode({
  x = 40,
  y = 40,
  width = 640,
  height = 360,
  src = '',
  poster = '',
  name = 'Video',
  duration,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  src?: string;
  poster?: string;
  name?: string;
  /** Media length in seconds — set at upload so players need not seek-probe. */
  duration?: number;
} = {}) {
  const id = nanoid(10);
  const d = Number(duration);
  // Integer quantize only — do NOT floor to 80×60. High-zoom viewport place
  // yields small scene sizes; independent floors destroy the natural aspect
  // and stretch the video (object-fit: fill / preserveAspectRatio none).
  const iw = Math.max(1, Math.round(Number(width) || 640));
  const ih = Math.max(1, Math.round(Number(height) || 360));
  const ix = Math.round(Number(x) || 0);
  const iy = Math.round(Number(y) || 0);
  return {
    id,
    node: {
      id,
      key: 'video',
      x: ix,
      y: iy,
      z: 0,
      width: iw,
      height: ih,
      attrs: {
        src,
        poster: poster || '',
        name: name || 'Video',
        assetKind: 'video',
        mode: 'FIT',
        lockAspect: 'true',
        ...(Number.isFinite(d) && d > 0 ? { duration: d } : {}),
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

/** Turn a video-generator plate into a normal video node (same id / selection). */
export function promoteVideoGeneratorToVideo(
  doc: any,
  nodeId: string,
  {
    src,
    poster,
    width,
    height,
    x,
    y,
    name,
    genPrompt,
  }: {
    src: string;
    poster?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    name?: string;
    genPrompt?: string;
  }
) {
  if (!doc || !nodeId || !src) return doc;
  const next = normalizeDocument(doc);
  const node = next.deltaSetLike?.[nodeId];
  if (!node || node.key !== 'video') return doc;
  const attrs = { ...(node.attrs || {}) };
  delete attrs.videoGenerator;
  delete attrs.videoGenAspect;
  delete attrs.videoGenResolution;
  delete attrs.videoGenDuration;
  delete attrs.videoGenModel;
  delete attrs.processStatus;
  delete attrs.processKind;
  delete attrs.processLabel;
  delete attrs.processSourceId;
  delete attrs.processTargetWidth;
  delete attrs.processTargetHeight;
  delete attrs.processMeta;
  attrs.src = src;
  if (poster) attrs.poster = poster;
  attrs.assetKind = 'video';
  if (name) attrs.name = name;
  const prompt = String(genPrompt || '').trim();
  if (prompt) attrs.genPrompt = prompt;
  else delete attrs.genPrompt;
  node.attrs = attrs;
  if (width != null) node.width = Math.max(1, Math.round(width));
  if (height != null) node.height = Math.max(1, Math.round(height));
  if (x != null) node.x = Math.round(x);
  if (y != null) node.y = Math.round(y);
  return next;
}

/** Spawn video node with local preview while remote upload runs. */
export function spawnVideoUploadPlaceholderNode(
  doc: any,
  {
    src,
    poster,
    width,
    height,
    label = '上传中',
    x,
    y,
    name,
    duration,
  }: {
    src: string;
    poster?: string;
    width: number;
    height: number;
    label?: string;
    x?: number;
    y?: number;
    name?: string;
    duration?: number;
  }
) {
  if (!doc || !src) return { document: doc, id: null as string | null };
  const next = normalizeDocument(doc);
  const { id, node } = createVideoNode({
    x: x ?? 40,
    y: y ?? 40,
    width,
    height,
    src,
    poster: poster || '',
    name: name || 'Video',
    duration,
  });
  node.attrs = {
    ...(node.attrs || {}),
    processStatus: 'running',
    processKind: 'upload',
    processLabel: label,
  };
  return { document: addNodeToDocument(next, id, node), id };
}

/**
 * Pull one stack URL out into a sibling image node (to the right).
 * Removes it from the source stack when successful.
 */
export function detachImageVariantToNode(
  doc: any,
  nodeId: string,
  url: string,
  { gap = 16, name = 'Image' }: { gap?: number; name?: string } = {}
) {
  const src = String(url || '').trim();
  if (!doc || !nodeId || !src) return { document: doc, id: null as string | null };
  const next = normalizeDocument(doc);
  const source = next.deltaSetLike?.[nodeId];
  if (!source || source.key !== 'image') return { document: doc, id: null as string | null };
  const stack = listImageVariantUrls(source);
  if (!stack.includes(src)) return { document: doc, id: null as string | null };

  const width = Math.max(1, Math.round(Number(source.width) || 200));
  const height = Math.max(1, Math.round(Number(source.height) || 200));
  const { id, node } = createImageNode({
    x: (Number(source.x) || 0) + width + gap,
    y: Number(source.y) || 0,
    width,
    height,
    src,
    name: name || String(source.attrs?.name || 'Image'),
    assetKind: 'image',
  });
  let document = addNodeToDocument(next, id, node);

  const remaining = stack.filter((u) => u !== src);
  const mainSrc = String(source.attrs?.src || '').trim();
  const attrs = { ...(document.deltaSetLike[nodeId].attrs || {}) };
  if (mainSrc === src) {
    attrs.src = remaining[0] || '';
  }
  writeImageVariantsAttr(attrs, remaining);
  document.deltaSetLike[nodeId].attrs = attrs;
  return { document, id };
}

/**
 * Native SVG node — markup stays SVG (not rasterized image, not converted to path).
 * User can later 轮廓化 if they want an editable path.
 */
export function createSvgNode({
  x = 40,
  y = 40,
  width = 48,
  height = 48,
  svg = '',
  name = 'SVG',
  fill,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  svg?: string;
  name?: string;
  fill?: string;
} = {}) {
  const id = nanoid(10);
  const ix = Math.round(Number(x) || 0);
  const iy = Math.round(Number(y) || 0);
  const iw = Math.max(1, Math.round(Number(width) || 1));
  const ih = Math.max(1, Math.round(Number(height) || 1));
  const markup = String(svg || '').trim();
  return {
    id,
    node: {
      id,
      key: 'svg',
      x: ix,
      y: iy,
      z: 0,
      width: iw,
      height: ih,
      attrs: {
        svg: markup,
        name: name || 'SVG',
        ...(fill ? { 'fill-color': String(fill) } : {}),
        opacity: 1,
        angle: 0,
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
  | 'editText'
  | 'editElements'
  | 'multiAngle'
  | 'moveObject'
  | 'expand'
  | 'adjust'
  | 'crop'
  | 'vector'
  | 'flipRotate'
  | 'import'
  | 'upload'
  | 'generate';

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
 * Image upload placeholder — shows local base64 preview at natural aspect while COS upload runs.
 */
export function spawnImageUploadPlaceholderNode(
  doc: any,
  opts: {
    src: string;
    width: number;
    height: number;
    label?: string;
    x?: number;
    y?: number;
    name?: string;
  }
) {
  if (!doc || !opts?.src) return { document: doc, id: null as string | null };
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  const active =
    frames.find((f: any) => f.id === doc.activeFrameId) || frames[0] || null;
  const width = Math.max(1, Math.round(opts.width) || 1);
  const height = Math.max(1, Math.round(opts.height) || 1);
  // Prefer frame / canvas center so the placeholder is visible (not parked off to the right).
  const x =
    opts.x != null
      ? opts.x
      : active
        ? Math.round(Number(active.x) + (Number(active.width) - width) / 2)
        : Math.round(((Number(doc.width) || 800) - width) / 2);
  const y =
    opts.y != null
      ? opts.y
      : active
        ? Math.round(Number(active.y) + (Number(active.height) - height) / 2)
        : Math.round(((Number(doc.height) || 600) - height) / 2);
  const { id, node } = createImageNode({
    x,
    y,
    width,
    height,
    src: opts.src,
    name: opts.name || 'Image',
  });
  node.attrs = {
    ...node.attrs,
    processStatus: 'running',
    processKind: 'upload',
    processLabel: opts.label || '上传中',
  };
  return { document: addNodeToDocument(doc, id, node), id };
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
    /** Extra JSON for watchers (e.g. multi-angle params). */
    meta?: Record<string, unknown> | null;
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
    ...(opts.meta ? { processMeta: JSON.stringify(opts.meta) } : {}),
  };
  return { document: addNodeToDocument(doc, id, node), id };
}

/** Clear processing overlay attrs after a job finishes. */
export function clearImageProcessAttrs(doc: any, nodeId: string) {
  if (!doc || !nodeId) return doc;
  const next = normalizeDocument(doc);
  const node = next.deltaSetLike?.[nodeId];
  if (!node?.attrs) return doc;
  // Must replace attrs — updateNodeInDocument merges and would keep processStatus.
  const attrs = { ...node.attrs };
  delete attrs.processStatus;
  delete attrs.processKind;
  delete attrs.processLabel;
  delete attrs.processSourceId;
  delete attrs.processTargetWidth;
  delete attrs.processTargetHeight;
  delete attrs.processMeta;
  node.attrs = attrs;
  return next;
}

export type DecomposeLayer = {
  type: 'image' | 'text' | string;
  src?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fill?: string;
  lineHeight?: number;
};

/**
 * Replace a process placeholder with split layers (editText / editElements).
 * Layer coords are in source-image pixels; scaled into the placeholder's box.
 * Result layers share one groupId so the stack still moves as one picture.
 */
export function applyImageDecomposeLayers(
  doc: any,
  placeholderId: string,
  layers: DecomposeLayer[],
  opts?: { sourceWidth?: number; sourceHeight?: number }
) {
  if (!doc || !placeholderId || !Array.isArray(layers) || !layers.length) {
    return { document: doc, ids: [] as string[] };
  }
  let next = normalizeDocument(doc);
  const placeholder = next.deltaSetLike?.[placeholderId];
  if (!placeholder) return { document: doc, ids: [] as string[] };

  const originX = Number(placeholder.x) || 0;
  const originY = Number(placeholder.y) || 0;
  const boxW = Math.max(1, Number(placeholder.width) || 1);
  const boxH = Math.max(1, Number(placeholder.height) || 1);
  const srcW = Math.max(1, Number(opts?.sourceWidth) || boxW);
  const srcH = Math.max(1, Number(opts?.sourceHeight) || boxH);
  const sx = boxW / srcW;
  const sy = boxH / srcH;

  // Drop the loading clone first.
  next = removeNodesFromDocument(next, [placeholderId]);

  const ids: string[] = [];
  for (const layer of layers) {
    const lx = originX + (Number(layer.x) || 0) * sx;
    const ly = originY + (Number(layer.y) || 0) * sy;
    const lw = Math.max(4, (Number(layer.width) || srcW) * sx);
    const lh = Math.max(4, (Number(layer.height) || srcH) * sy);
    const kind = String(layer.type || '');

    if (kind === 'text' && String(layer.text || '').trim()) {
      // layer.fontSize is source-image pixels → scale with sy; lh is already canvas-scaled.
      const srcFont = Number(layer.fontSize) || 0;
      const fontSize = Math.max(
        8,
        Math.round((srcFont > 0 ? srcFont * sy : lh * 0.78) * 10) / 10
      );
      const { id, node } = createTextNode({
        x: Math.round(lx),
        y: Math.round(ly),
        text: String(layer.text),
        width: Math.round(lw),
        height: Math.round(lh),
        autoSize: false,
      });
      const style = {
        fontSize,
        fontFamily: String(layer.fontFamily || 'Alibaba PuHuiTi'),
        fontWeight: String(layer.fontWeight || 'normal') === 'bold' ? 'bold' : 'normal',
        fill: String(layer.fill || '#333333'),
        lineHeight: Number(layer.lineHeight) || 1.25,
      } as const;
      node.attrs = {
        ...buildMarkdownTextAttrs(String(layer.text), style),
        autoSize: 'false',
        name: String(layer.name || '文字'),
      } as Record<string, unknown>;
      next = addNodeToDocument(next, id, node);
      ids.push(id);
      continue;
    }

    if (kind === 'image' && layer.src) {
      const { id, node } = createImageNode({
        x: Math.round(lx),
        y: Math.round(ly),
        width: Math.round(lw),
        height: Math.round(lh),
        src: String(layer.src),
        name: String(layer.name || '图层'),
      });
      next = addNodeToDocument(next, id, node);
      ids.push(id);
    }
  }

  // Keep the stack selectable / movable as one composition.
  if (ids.length >= 2) {
    next = groupNodesInDocument(next, ids);
  }

  return { document: next, ids };
}


export function addNodeToDocument(doc, nodeId, node) {
  const next = normalizeDocument(doc);
  next.deltaSetLike[nodeId] = node;
  const page = getActivePage(next);
  if (page && !page.children.includes(nodeId)) {
    page.children.push(nodeId);
  }
  syncRootChildren(next);
  const key = stackNodeKey(nodeId);
  const order = Array.isArray(next.stackOrder) ? next.stackOrder.map(String) : [];
  if (!order.includes(key)) next.stackOrder = [...order, key];
  else reconcileStackOrder(next);
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
    const order = Array.isArray(next.stackOrder) ? [...next.stackOrder] : [];
    src.frames.forEach((f: any) => {
      const newId = nanoid(8);
      frames.push({
        ...JSON.parse(JSON.stringify(f)),
        id: newId,
        x: (Number(f.x) || 0) + ox,
        y: (Number(f.y) || 0) + oy,
      });
      order.push(stackFrameKey(newId));
    });
    next.frames = frames;
    next.stackOrder = order;
    if (!next.activeFrameId && frames[0]) next.activeFrameId = frames[0].id;
  }

  reconcileStackOrder(next);
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
  reconcileStackOrder(next);
  return next;
}

export function updateNodeInDocument(doc, nodeId, patch) {
  const prev = doc?.deltaSetLike?.[nodeId];
  if (!prev || !doc) return doc;
  // Structural COW: new doc shell + new node; share untouched nodes and path strings.
  // Never Object.assign(patch) wholesale — that would replace `attrs` and drop shapeType etc.
  const { attrs, ...rest } = patch || {};
  const prevAttrs = prev.attrs || {};
  let nextAttrs = prevAttrs;
  if (attrs) {
    nextAttrs = { ...prevAttrs, ...attrs };
    // Hard-preserve geometry identity if a partial patch tries to clear it.
    if (
      prevAttrs.shapeType != null &&
      (nextAttrs.shapeType == null || nextAttrs.shapeType === '')
    ) {
      nextAttrs.shapeType = prevAttrs.shapeType;
    }
  }
  const nextNode = { ...prev, ...rest, attrs: nextAttrs };
  return {
    ...doc,
    deltaSetLike: {
      ...doc.deltaSetLike,
      [nodeId]: nextNode,
    },
  };
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

/** Reorder selected nodes in z-order (ROOT / page children + unified stack). */
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

  page.children = reorderKeysInList(ids, selected, action);
  syncRootChildren(next);

  const selectedKeys = selected.map(stackNodeKey);
  const stack = Array.isArray(next.stackOrder) ? next.stackOrder.map(String) : [];
  next.stackOrder = reorderKeysInList(stack, selectedKeys, action);
  reconcileStackOrder(next);
  return next;
}

/** Reorder frames and/or nodes in the unified stack (and sync node page children). */
export function reorderStackInDocument(
  doc: any,
  entries: Array<{ kind: 'frame' | 'node'; id: string }>,
  action: 'front' | 'back' | 'forward' | 'backward'
) {
  const next = normalizeDocument(doc);
  const selectedKeys = entries
    .map((e) => (e.kind === 'frame' ? stackFrameKey(e.id) : stackNodeKey(e.id)))
    .filter((key) => (next.stackOrder || []).includes(key));
  if (!selectedKeys.length) return next;
  next.stackOrder = reorderKeysInList(
    (next.stackOrder || []).map(String),
    selectedKeys,
    action
  );

  const page = getActivePage(next);
  if (page) {
    const nodeSelected = entries
      .filter((e) => e.kind === 'node')
      .map((e) => e.id)
      .filter((id) => (page.children || []).includes(id));
    if (nodeSelected.length) {
      page.children = reorderKeysInList([...(page.children || [])], nodeSelected, action);
      syncRootChildren(next);
    }
  }
  reconcileStackOrder(next);
  return next;
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
  // Circles / ellipses have no corners — AABB R-dots sit in the square's empty
  // corners (outside the disk). Use path/geo edit instead.
  if (node.key === 'ellipse') return false;
  if (node.key === 'rect' || node.key === 'image') return true;
  // Freehand / outlined / boolean `path` — radius is baked into `d` (or edited via
  // path anchors). Do not show the rect-style R dots on the AABB.
  if (node.key === 'path') return false;
  if (node.key === 'shape') {
    const t = String(node.attrs?.shapeType || 'rect');
    if (t === 'circle' || t === 'ellipse') return false;
    if (t === 'rect' || t === 'roundRect' || t === 'triangle' || t === 'polygon' || t === 'star') {
      return true;
    }
    if (t === 'path' || t === 'pen') return false;
  }
  return false;
}

function isClosedPathAttrs(attrs: Record<string, unknown> | null | undefined) {
  if (!attrs) return false;
  if (attrs.closed === false || attrs.closed === 'false') return false;
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
  if (node.key === 'image' || node.key === 'video' || node.key === 'frame' || node.key === 'svg') return true;
  if (node.key === 'rect' || node.key === 'ellipse') return true;
  if (node.key !== 'shape' && node.key !== 'path') return false;
  const t = String(node.attrs?.shapeType || (node.key === 'path' ? 'path' : 'rect'));
  // Open strokes have no box aspect; closed path (e.g. boolean result) does.
  if (['line', 'arrow', 'pen', 'pencil'].includes(t)) return false;
  if (t === 'path') return String(node.attrs?.closed) !== 'false';
  return true;
}

/**
 * Whether the node can have a fill / background color.
 * Open stroke paths (line, arrow, pencil, unclosed pen/path) are stroke-only.
 */
export function supportsFill(node: any) {
  if (!node) return false;
  if (node.key === 'rect' || node.key === 'ellipse' || node.key === 'image' || node.key === 'video' || node.key === 'svg') return true;
  if (node.key === 'path') {
    const d = String(node.attrs?.path || node.attrs?.d || '');
    if (node.attrs?.closed === false || node.attrs?.closed === 'false') return false;
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
    if (node.attrs?.closed === false || node.attrs?.closed === 'false') return false;
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
  if (node.key === 'image' || node.key === 'video' || node.key === 'text' || node.key === 'frame' || node.key === 'svg') return false;
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

/** Scene nodes whose center lies inside any of the given artboards. */
export function nodeIdsInsideFrames(doc: any, frameIds: string[]): string[] {
  if (!doc || !frameIds?.length) return [];
  const wanted = new Set(frameIds.filter(Boolean).map(String));
  if (!wanted.size) return [];
  const frames = (Array.isArray(doc.frames) ? doc.frames : []).filter(
    (f: any) => f?.id && wanted.has(String(f.id))
  );
  if (!frames.length) return [];
  const out: string[] = [];
  for (const { id, node } of listSceneNodes(doc)) {
    if (!node) continue;
    const left = Number(node.x) || 0;
    const top = Number(node.y) || 0;
    const w = Math.max(1, Number(node.width) || 1);
    const h = Math.max(1, Number(node.height) || 1);
    const cx = left + w / 2;
    const cy = top + h / 2;
    const inside = frames.some((f: any) => {
      const fx = Number(f.x) || 0;
      const fy = Number(f.y) || 0;
      const fw = Math.max(1, Number(f.width) || 1);
      const fh = Math.max(1, Number(f.height) || 1);
      return cx >= fx && cx <= fx + fw && cy >= fy && cy <= fy + fh;
    });
    if (inside) out.push(id);
  }
  return out;
}

/**
 * Nodes to operate on for a canvas selection: explicit node ids plus content
 * inside selected artboards (same expansion delete / copy already use).
 */
export function resolveSelectionNodeIds(
  doc: any,
  nodeIds: string[],
  frameIds: string[] = []
): string[] {
  const inside = nodeIdsInsideFrames(doc, frameIds);
  return [...new Set([...(nodeIds || []).filter(Boolean), ...inside])];
}

export type SceneClipboardPayload = {
  nodes: Array<{ id: string; node: any }>;
  /** Artboards included in the same copy/cut/duplicate batch. */
  frames?: Array<{ id: string; frame: any }>;
};

/** Axis-aligned bounds of clipboard nodes + frames (document coords). */
export function clipboardNodesBounds(clipboard: SceneClipboardPayload | null | undefined) {
  if (!clipboard) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  (clipboard.nodes || []).forEach(({ node }) => {
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const w = Math.max(0, Number(node.width) || 0);
    const h = Math.max(0, Number(node.height) || 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    any = true;
  });
  (clipboard.frames || []).forEach(({ frame }) => {
    const x = Number(frame.x) || 0;
    const y = Number(frame.y) || 0;
    const w = Math.max(0, Number(frame.width) || 0);
    const h = Math.max(0, Number(frame.height) || 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    any = true;
  });
  if (!any || !Number.isFinite(minX)) return null;
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

/** Deep-clone selected artboards for copy / cut / duplicate. */
export function snapshotFramesForClipboard(
  doc: any,
  frameIds: string[]
): NonNullable<SceneClipboardPayload['frames']> {
  const wanted = new Set((frameIds || []).filter(Boolean).map(String));
  if (!wanted.size || !doc) return [];
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  const out: NonNullable<SceneClipboardPayload['frames']> = [];
  frames.forEach((f: any) => {
    if (!f?.id || !wanted.has(String(f.id))) return;
    out.push({ id: String(f.id), frame: JSON.parse(JSON.stringify(f)) });
  });
  return out;
}

/**
 * Paste clipboard nodes + artboards with new ids.
 * - Default: nudge by offset (keyboard paste).
 * - `anchor`: place union top-left at that scene point (context-menu paste).
 */
export function pasteClipboardIntoDocument(
  doc: any,
  clipboard: SceneClipboardPayload | null | undefined,
  opts?: { offsetX?: number; offsetY?: number; anchor?: { x: number; y: number } }
): { document: any; ids: string[]; frameIds: string[] } {
  const hasNodes = Boolean(clipboard?.nodes?.length);
  const hasFrames = Boolean(clipboard?.frames?.length);
  if (!doc || (!hasNodes && !hasFrames)) {
    return { document: doc, ids: [], frameIds: [] };
  }
  let next = normalizeDocument(doc);
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  const frameIdMap = new Map<string, string>();
  (clipboard!.nodes || []).forEach(({ id }) => idMap.set(id, nanoid(10)));
  (clipboard!.frames || []).forEach(({ id }) => frameIdMap.set(id, nanoid(10)));

  let ox = opts?.offsetX ?? 24;
  let oy = opts?.offsetY ?? 24;
  if (opts?.anchor) {
    const bounds = clipboardNodesBounds(clipboard);
    if (bounds) {
      ox = opts.anchor.x - bounds.left;
      oy = opts.anchor.y - bounds.top;
    }
  }

  const newIds: string[] = [];
  (clipboard!.nodes || []).forEach(({ id, node: raw }) => {
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

  const newFrameIds: string[] = [];
  if (clipboard!.frames?.length) {
    const frames = Array.isArray(next.frames) ? [...next.frames] : [];
    const order = Array.isArray(next.stackOrder) ? [...next.stackOrder] : [];
    clipboard!.frames.forEach(({ id, frame: raw }) => {
      const frame = JSON.parse(JSON.stringify(raw));
      const newId = frameIdMap.get(id)!;
      frame.id = newId;
      frame.x = (Number(frame.x) || 0) + ox;
      frame.y = (Number(frame.y) || 0) + oy;
      // Drop transient chrome that should not clone with the artboard.
      delete frame.processStatus;
      delete frame.processLabel;
      delete frame.processKind;
      frames.push(frame);
      newFrameIds.push(newId);
      order.push(stackFrameKey(newId));
    });
    next = {
      ...next,
      frames,
      stackOrder: order,
      activeFrameId: newFrameIds[0] || next.activeFrameId || null,
    };
  }

  reconcileStackOrder(next);
  return { document: next, ids: newIds, frameIds: newFrameIds };
}

