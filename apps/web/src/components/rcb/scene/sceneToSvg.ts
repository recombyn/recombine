/**
 * Scene → native SVG DOM (no SVG.js).
 */
import {
  append,
  clearChildren,
  createSvgRoot,
  ensureDefs,
  getBBox,
  setAttrs,
  setFill,
  setStroke,
  setStyles,
  svgEl,
  urlRef,
  XLINK_NS,
} from '@/components/rcb/svgDom';
import {
  parseNodeText,
  parseNodeTextStyle,
  textVerticalOriginY,
  toFabricFontFamily,
  wrapPlainTextLines,
} from './sceneText';
import {
  boolEffectAttr,
  hexWithOpacity,
  resolveStroke,
  resolveStrokeAlign,
  resolveStrokeLinecap,
  resolveStrokeLinejoin,
} from './sceneEffects';
import type { StrokeAlign, StrokeLinecap, StrokeLinejoin } from './sceneEffects';
import { isTransparentFill, resolveDocumentBackground, resolveFill } from './sceneFill';
import { isExportableSceneNode, isImageGeneratorNode, isImageProcessRunning, isNodeHidden } from './sceneDocument';
import {
  filletPathD,
  polygonRadiiFromCorners,
  radiiFromAttrs,
  roundedPolygonPath,
  roundedRectPath,
  type CornerRadii,
} from './sceneRadii';
import { isCustomPathShape } from './pathScale';
import { shapeVertexPoints, sidesFromAttrs, clampShapeSides, DEFAULT_SHAPE_SIDES } from './sceneShapes';
import { getShapeBaseline, getShapeBaselineD } from '@/components/rcb/geometry';
import { applyNodeShadow, applySvgFill } from './svgPaint';
import {
  brushSize,
  findPencilBrush,
  isStampBrush,
  parsePathPressures,
  parseSimplePathPoints,
  pencilInkPathFromPoints,
  samplePolyline,
  stampSizeForBrush,
  stampSpacingForBrush,
} from '@/components/rcb/tools/pencilBrushes';
import { applyFrameContentClip } from '@/components/rcb/frames/frameContentClip';
import { getTintedStampSrc } from '@/components/rcb/tools/stampTint';
import { strokeDashForStyle } from './sceneStrokeStyle';

const TRANSPARENT_PIXEL_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let clipSeq = 0;
function nextClipId(prefix: string) {
  clipSeq += 1;
  return `${prefix}-${clipSeq}`;
}

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sceneOrigin(document: any) {
  return { ox: num(document?.x, 0), oy: num(document?.y, 0) };
}

export function nodeLeftTop(document: any, node: any) {
  const { ox, oy } = sceneOrigin(document);
  return { left: num(node.x, 0) - ox, top: num(node.y, 0) - oy };
}

function objectMeta(node: any) {
  return {
    angle: num(node.attrs?.angle, 0),
    opacity: Math.min(1, Math.max(0, num(node.attrs?.opacity, 1))),
    blendMode: String(node.attrs?.blendMode || 'pass-through'),
    flipX: boolEffectAttr(node.attrs?.flipX, false),
    flipY: boolEffectAttr(node.attrs?.flipY, false),
  };
}

type ShapeStrokeOpts = {
  color: string;
  width: number;
  dasharray?: string;
  align: StrokeAlign;
  linecap: StrokeLinecap;
  linejoin: StrokeLinejoin;
};

function strokeOptsFromNode(node: any, color: string, width: number): ShapeStrokeOpts {
  const dash = strokeDashForStyle(node?.attrs?.strokeStyle);
  return {
    color,
    width,
    ...(dash ? { dasharray: dash } : {}),
    align: resolveStrokeAlign(node?.attrs),
    linecap: resolveStrokeLinecap(node?.attrs),
    linejoin: resolveStrokeLinejoin(node?.attrs),
  };
}

function setSvgImageHref(img: SVGImageElement, href: string) {
  img.setAttributeNS(XLINK_NS, 'href', href);
  img.setAttribute('href', href);
}

/**
 * Stroke paints along the element's vector baseline.
 * Align is paint-only — selection chrome stays on the path.
 *
 * Outside: a 2× underlay stroke behind an opaque fill (fill covers the inner half).
 * Inside: 2× stroke clipped to the fill region.
 * Center: normal SVG stroke centered on the path.
 */
function applyElementStroke(
  root: SVGSVGElement,
  el: SVGElement,
  opts: ShapeStrokeOpts,
  flags?: { hasOpaqueFill?: boolean }
) {
  if (!(opts.width > 0) || !opts.color || opts.color === 'transparent') {
    setStroke(el, 'none');
    removeStrokeUnderlay(el);
    return;
  }
  let align = opts.align || 'outside';
  if (align === 'outside' && flags?.hasOpaqueFill === false) {
    align = 'center';
  }

  el.removeAttribute('paint-order');
  el.style.removeProperty('paint-order');
  el.removeAttribute('clip-path');
  el.style.removeProperty('clip-path');
  el.removeAttribute('mask');
  el.style.removeProperty('mask');
  removeStrokeUnderlay(el);

  if (align === 'outside') {
    // Dual-path underlay is reliable; paint-order alone often looks like "center"
    // when fills/filters reorder painting.
    if (flags?.hasOpaqueFill !== false && applyOutsideStrokeUnderlay(el, opts)) {
      return;
    }
    const strokeSpec = {
      color: opts.color,
      width: opts.width * 2,
      linecap: opts.linecap || 'butt',
      linejoin: opts.linejoin || 'miter',
      ...(opts.dasharray ? { dasharray: opts.dasharray } : {}),
    };
    setAttrs(el, { 'paint-order': 'stroke fill' });
    el.style.setProperty('paint-order', 'stroke fill');
    setStroke(el, strokeSpec);
    return;
  }

  if (align === 'inside') {
    applyInsideStrokeClip(root, el);
    setAttrs(el, { 'paint-order': 'fill stroke' });
    el.style.setProperty('paint-order', 'fill stroke');
    setStroke(el, {
      color: opts.color,
      width: opts.width * 2,
      linecap: opts.linecap || 'butt',
      linejoin: opts.linejoin || 'miter',
      ...(opts.dasharray ? { dasharray: opts.dasharray } : {}),
    });
    return;
  }

  setStroke(el, {
    color: opts.color,
    width: opts.width,
    linecap: opts.linecap || 'butt',
    linejoin: opts.linejoin || 'miter',
    ...(opts.dasharray ? { dasharray: opts.dasharray } : {}),
  });
}

function removeStrokeUnderlay(el: SVGElement) {
  const prev = el.previousElementSibling;
  if (prev instanceof SVGElement && prev.getAttribute('data-stroke-under') === '1') {
    prev.remove();
  }
}

/**
 * Insert a fill-none path under `el` with 2× stroke; clear stroke on `el`.
 * Opaque fill on `el` covers the inward half → true outside stroke.
 */
function applyOutsideStrokeUnderlay(el: SVGElement, opts: ShapeStrokeOpts): boolean {
  const d = el.getAttribute('d');
  const parent = el.parentElement;
  if (!d || !parent) return false;

  const under = svgEl('path', {
    d,
    'data-stroke-under': '1',
    'data-radius-body': el.getAttribute('data-radius-body') === '1' ? '1' : null,
    'pointer-events': 'none',
  });
  setFill(under, 'none');
  setStroke(under, {
    color: opts.color,
    width: opts.width * 2,
    linecap: opts.linecap || 'butt',
    linejoin: opts.linejoin || 'miter',
    ...(opts.dasharray ? { dasharray: opts.dasharray } : {}),
  });
  parent.insertBefore(under, el);
  setStroke(el, 'none');
  return true;
}

/** Clip a stroked element to its own fill so only the inward half of a 2× stroke shows. */
function applyInsideStrokeClip(root: SVGSVGElement, el: SVGElement) {
  const id = nextClipId('stroke-inside');
  const defs = ensureDefs(root);
  const clip = svgEl('clipPath', { id });
  const d = el.getAttribute('d');

  if (d) {
    setAttrs(clip, { clipPathUnits: 'userSpaceOnUse' });
    clip.appendChild(svgEl('path', { d, fill: '#fff', stroke: 'none' }));
  } else {
    setAttrs(clip, { clipPathUnits: 'objectBoundingBox' });
    clip.appendChild(svgEl('rect', { x: 0, y: 0, width: 1, height: 1, fill: '#fff' }));
  }

  defs.appendChild(clip);
  const ref = urlRef(id);
  setAttrs(el, { 'clip-path': ref });
  el.style.setProperty('clip-path', ref);
}

type SceneGeom = {
  left: number;
  top: number;
  width: number;
  height: number;
  abs: boolean;
};

const geomByDom = new WeakMap<SVGElement, SceneGeom>();

function writeGeom(el: SVGElement, geom: SceneGeom) {
  const anyEl = el as any;
  anyEl.__sceneLeft = geom.left;
  anyEl.__sceneTop = geom.top;
  anyEl.sceneWidth = geom.width;
  anyEl.sceneHeight = geom.height;
  anyEl.__sceneAbsPos = geom.abs;
  geomByDom.set(el, { ...geom });
}

function readGeom(el: SVGElement): SceneGeom | null {
  const anyEl = el as any;
  const fromMap = geomByDom.get(el);
  if (fromMap) return { ...fromMap };
  const left = Number(anyEl.__sceneLeft);
  const top = Number(anyEl.__sceneTop);
  const width = Number(anyEl.sceneWidth);
  const height = Number(anyEl.sceneHeight);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return { left, top, width, height, abs: !!anyEl.__sceneAbsPos };
}

function tagNode(
  el: SVGElement,
  nodeId: string,
  key: string,
  shapeType?: string,
  left = 0,
  top = 0,
  width = 0,
  height = 0
) {
  setAttrs(el, {
    'data-scene-node-id': nodeId,
    'data-scene-node-key': key,
    'shape-rendering': 'geometricPrecision',
    ...(shapeType ? { 'data-scene-shape-type': shapeType } : {}),
  });
  const anyEl = el as any;
  anyEl.sceneNodeId = nodeId;
  anyEl.sceneNodeKey = key;
  if (shapeType) anyEl.sceneShapeType = shapeType;
  writeGeom(el, { left, top, width, height, abs: false });
  return el;
}

function applyMeta(
  el: SVGElement,
  left: number,
  top: number,
  meta: ReturnType<typeof objectMeta>,
  width = 0,
  height = 0
) {
  const anyEl = el as any;
  anyEl.__sceneAngle = meta.angle;
  anyEl.__sceneFlipX = meta.flipX;
  anyEl.__sceneFlipY = meta.flipY;
  reapplySceneTransform(el, left, top, width, height);
  setAttrs(el, { opacity: meta.opacity });
  try {
    const mode = String(meta.blendMode || 'pass-through').toLowerCase();
    if (!mode || mode === 'pass-through' || mode === 'passthrough') {
      el.style.removeProperty('mix-blend-mode');
    } else {
      el.style.mixBlendMode = mode;
    }
  } catch {
    /* ignore */
  }
  return el;
}

function reapplySceneTransform(el: SVGElement, left: number, top: number, width: number, height: number) {
  const anyEl = el as any;
  const angle = Number(anyEl.__sceneAngle) || 0;
  const flipX = !!anyEl.__sceneFlipX;
  const flipY = !!anyEl.__sceneFlipY;
  const geom = readGeom(el);
  const abs = geom ? geom.abs : !!anyEl.__sceneAbsPos;
  const parts: string[] = [];

  if (!abs) parts.push(`translate(${left} ${top})`);

  const rx = abs ? left + width / 2 : width / 2;
  const ry = abs ? top + height / 2 : height / 2;
  if (angle) parts.push(`rotate(${angle} ${rx} ${ry})`);
  if (flipX || flipY) {
    const sx = flipX ? -1 : 1;
    const sy = flipY ? -1 : 1;
    parts.push(`translate(${rx} ${ry}) scale(${sx} ${sy}) translate(${-rx} ${-ry})`);
  }

  if (parts.length) setAttrs(el, { transform: parts.join(' ') });
  else el.removeAttribute('transform');
  syncStrokeUnderlayTransform(el);
}

/** Outside-stroke underlay is the previous sibling — mirror transforms from the filled body. */
function syncStrokeUnderlayTransform(el: SVGElement) {
  const prev = el.previousElementSibling;
  if (!(prev instanceof SVGElement) || prev.getAttribute('data-stroke-under') !== '1') return;
  const t = el.getAttribute('transform');
  if (t) prev.setAttribute('transform', t);
  else prev.removeAttribute('transform');
}

function markAbsPos(el: SVGElement) {
  const geom = readGeom(el);
  if (geom) writeGeom(el, { ...geom, abs: true });
  else (el as any).__sceneAbsPos = true;
  return el;
}

function writeSceneSides(el: SVGElement, sides: number) {
  const n = clampShapeSides(sides);
  (el as any).__sceneSides = n;
  setAttrs(el, { 'data-scene-sides': String(n) });
}

function readSceneSides(el: any): number {
  const fromMem = Number(el?.__sceneSides);
  if (Number.isFinite(fromMem) && fromMem >= 3) return clampShapeSides(fromMem);
  const fromAttr = Number(el?.getAttribute?.('data-scene-sides'));
  if (Number.isFinite(fromAttr) && fromAttr >= 3) return clampShapeSides(fromAttr);
  return DEFAULT_SHAPE_SIDES;
}

function roundedShapePath(
  shapeType: string,
  width: number,
  height: number,
  r: CornerRadii,
  sides: number = DEFAULT_SHAPE_SIDES
) {
  const pts = shapeVertexPoints(shapeType, width, height, sides);
  if (!pts.length) return '';
  const vertexRadii = polygonRadiiFromCorners(pts.length, r, shapeType);
  return roundedPolygonPath(pts, vertexRadii);
}

type DrawCtx = { root: SVGSVGElement; parent: SVGElement };

function coverRotatedFillFringe(
  el: SVGElement,
  paint: ReturnType<typeof resolveFill>,
  stroke: string,
  strokeWidth: number,
  angleDeg: number
) {
  if (strokeWidth > 0 && stroke && stroke !== 'transparent') return;
  if (paint.kind !== 'solid' || !paint.color) return;
  if (Math.abs(angleDeg) <= 0.2) return;
  setStroke(el, { color: paint.color, width: 0.75, linejoin: 'miter' });
}

function appendChild<T extends SVGElement>(parent: SVGElement, child: T): T {
  append(parent, child);
  return child;
}

function createRectLike(
  ctx: DrawCtx,
  document: any,
  node: any,
  nodeId: string,
  sceneNodeKey: string,
  shapeType?: string
) {
  const { root, parent } = ctx;
  const paint = resolveFill(node, 'transparent');
  const { stroke, strokeWidth: sw } = resolveStroke(node, '#333333');
  const { left, top } = nodeLeftTop(document, node);
  const width = Math.max(node.width || 0, 1);
  const height = Math.max(node.height || 0, 1);
  const r = radiiFromAttrs(node.attrs);
  const meta = objectMeta(node);
  const showL = boolEffectAttr(node.attrs?.L, true);
  const showR = boolEffectAttr(node.attrs?.R, true);
  const showT = boolEffectAttr(node.attrs?.T, true);
  const showB = boolEffectAttr(node.attrs?.B, true);
  const allSides = showL && showR && showT && showB;
  const noSides = !showL && !showR && !showT && !showB;
  const fillTransparent = isTransparentFill(paint);

  const strokeFull = strokeOptsFromNode(node, stroke, sw || 1);
  const strokeOpen: ShapeStrokeOpts = { ...strokeFull, align: 'center' };

  if (showB && !showT && !showL && !showR && fillTransparent) {
    const line = appendChild(
      parent,
      svgEl('line', { x1: left, y1: top + height, x2: left + width, y2: top + height })
    );
    applyElementStroke(root, line, strokeOpen);
    setFill(line, 'none');
    tagNode(line, nodeId, sceneNodeKey, shapeType, left, top, width, height);
    markAbsPos(line);
    applyMeta(line, left, top, meta, width, height);
    applyNodeShadow(root, line, node);
    return line;
  }

  const g = appendChild(parent, svgEl('g'));
  const body = appendChild(g, svgEl('path', { d: roundedRectPath(width, height, r) }));
  setAttrs(body, { 'data-radius-body': '1', 'data-baseline': '1' });
  applySvgFill(root, body, paint, `n-${nodeId}`);
  const hasRadius = Math.max(r.tl, r.tr, r.br, r.bl) > 0.5;
  if ((allSides || hasRadius) && !noSides) {
    applyElementStroke(root, body, strokeFull, { hasOpaqueFill: !fillTransparent });
  } else {
    setStroke(body, 'none');
  }

  if (!allSides && !noSides && !hasRadius) {
    if (showT) {
      const ln = appendChild(g, svgEl('line', { x1: 0, y1: 0, x2: width, y2: 0 }));
      setFill(ln, 'none');
      applyElementStroke(root, ln, strokeOpen);
    }
    if (showB) {
      const ln = appendChild(g, svgEl('line', { x1: 0, y1: height, x2: width, y2: height }));
      setFill(ln, 'none');
      applyElementStroke(root, ln, strokeOpen);
    }
    if (showL) {
      const ln = appendChild(g, svgEl('line', { x1: 0, y1: 0, x2: 0, y2: height }));
      setFill(ln, 'none');
      applyElementStroke(root, ln, strokeOpen);
    }
    if (showR) {
      const ln = appendChild(g, svgEl('line', { x1: width, y1: 0, x2: width, y2: height }));
      setFill(ln, 'none');
      applyElementStroke(root, ln, strokeOpen);
    }
  }

  tagNode(g, nodeId, sceneNodeKey, shapeType, left, top, width, height);
  if (allSides || noSides) {
    coverRotatedFillFringe(body, paint, stroke, sw, Number(meta.angle) || 0);
  }
  applyMeta(g, left, top, meta, width, height);
  applyNodeShadow(root, g, node);
  return g;
}

function createShape(ctx: DrawCtx, document: any, node: any, nodeId: string) {
  const { root, parent } = ctx;
  const shapeType = node.attrs?.shapeType || 'rect';
  const paint = resolveFill(node, '#FFFFFF');
  const { stroke, strokeWidth: resolvedSw } = resolveStroke(node, '#333333');
  const swFallback =
    shapeType === 'pencil' ? 1.5 : shapeType === 'pen' || shapeType === 'line' || shapeType === 'arrow' ? 2 : 1;
  const strokeWidth = Number.isFinite(resolvedSw) ? resolvedSw : swFallback;
  const { left, top } = nodeLeftTop(document, node);
  const width = Math.max(node.width || 100, 1);
  const height = Math.max(node.height || 100, 1);
  const meta = objectMeta(node);
  const strokeFull = strokeOptsFromNode(node, stroke, strokeWidth);
  const hasCapAttr = node.attrs?.strokeLinecap != null || node.attrs?.['stroke-linecap'] != null;
  const hasJoinAttr = node.attrs?.strokeLinejoin != null || node.attrs?.['stroke-linejoin'] != null;
  const strokeOpen: ShapeStrokeOpts = {
    ...strokeFull,
    align: 'center',
    linecap: hasCapAttr
      ? strokeFull.linecap
      : shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'arrow'
        ? 'round'
        : strokeFull.linecap,
    linejoin: hasJoinAttr
      ? strokeFull.linejoin
      : shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'arrow'
        ? 'round'
        : strokeFull.linejoin,
  };

  if (shapeType === 'line') {
    const mid = height / 2;
    const line = appendChild(parent, svgEl('line', { x1: 0, y1: mid, x2: width, y2: mid }));
    setFill(line, 'none');
    setAttrs(line, { 'data-baseline': '1' });
    applyElementStroke(root, line, strokeOpen);
    tagNode(line, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(line, left, top, meta, width, height);
    applyNodeShadow(root, line, node);
    return line;
  }

  if (shapeType === 'arrow') {
    const d = getShapeBaselineD({
      key: 'shape',
      width,
      height,
      attrs: { shapeType: 'arrow' },
    })!;
    const path = appendChild(parent, svgEl('path', { d }));
    setFill(path, 'none');
    setAttrs(path, { 'data-baseline': '1' });
    applyElementStroke(root, path, strokeOpen);
    tagNode(path, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(path, left, top, meta, width, height);
    applyNodeShadow(root, path, node);
    return path;
  }

  if (shapeType === 'circle') {
    const baseline = getShapeBaseline({
      key: 'shape',
      width,
      height,
      attrs: { ...(node.attrs || {}), shapeType: 'circle' },
    });
    const g = appendChild(parent, svgEl('g'));
    const path = appendChild(g, svgEl('path', { d: baseline?.d || '' }));
    setAttrs(path, { 'data-baseline': '1' });
    applySvgFill(root, path, paint, `n-${nodeId}`);
    if (strokeWidth > 0 && stroke && stroke !== 'transparent') {
      applyElementStroke(root, path, strokeFull, { hasOpaqueFill: !isTransparentFill(paint) });
    } else {
      setStroke(path, 'none');
      coverRotatedFillFringe(path, paint, stroke, strokeWidth, Number(meta.angle) || 0);
    }
    tagNode(g, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(g, left, top, meta, width, height);
    applyNodeShadow(root, g, node);
    return g;
  }

  if (shapeType === 'triangle' || shapeType === 'star' || shapeType === 'polygon') {
    const baseline = getShapeBaseline({
      key: 'shape',
      width,
      height,
      attrs: { ...(node.attrs || {}), shapeType },
    });
    const g = appendChild(parent, svgEl('g'));
    const path = appendChild(g, svgEl('path', { d: baseline?.d || '' }));
    setAttrs(path, { 'data-baseline': '1' });
    applySvgFill(root, path, paint, `n-${nodeId}`);
    applyElementStroke(root, path, strokeFull, { hasOpaqueFill: !isTransparentFill(paint) });
    tagNode(g, nodeId, 'shape', shapeType, left, top, width, height);
    if (shapeType === 'star' || shapeType === 'polygon') writeSceneSides(g, sidesFromAttrs(node.attrs));
    applyMeta(g, left, top, meta, width, height);
    applyNodeShadow(root, g, node);
    return g;
  }

  if (shapeType === 'path' || shapeType === 'pen' || shapeType === 'pencil') {
    const d = node.attrs?.path || `M 0 0 L ${width} ${height}`;
    const closed = boolEffectAttr(node.attrs?.closed, false) || /\sZ\s*$/i.test(String(d).trim());
    const brushId = String(node.attrs?.brushStyle || 'solid');

    if (shapeType === 'pencil') {
      const pts = parseSimplePathPoints(String(d));
      const ink = stroke && stroke !== 'transparent' ? stroke : '#333333';
      const stampSrcAttr =
        node.attrs?.brushStampSrc != null ? String(node.attrs.brushStampSrc) : '';
      const brush = findPencilBrush(brushId);
      const useStamp = isStampBrush(brushId, stampSrcAttr || brush.stampSrc);

      if (useStamp && pts.length >= 2) {
        const src = stampSrcAttr || brush.stampSrc || '';
        const size = stampSizeForBrush(brush, strokeWidth);
        const spacing = stampSpacingForBrush(brush, strokeWidth);
        const samples = samplePolyline(pts, spacing);
        const tinted = src ? getTintedStampSrc(src, ink) : '';
        const g = appendChild(parent, svgEl('g'));
        for (const p of samples) {
          if (!tinted) continue;
          const img = appendChild(
            g,
            svgEl('image', {
              width: size,
              height: size,
              x: p.x - size / 2,
              y: p.y - size / 2,
            })
          );
          setSvgImageHref(img, tinted);
        }
        const hit = appendChild(g, svgEl('path', { d: String(d) }));
        setFill(hit, 'none');
        setStroke(hit, { color: 'transparent', width: Math.max(size, strokeWidth) });
        setAttrs(hit, { 'pointer-events': 'stroke', 'data-baseline': '1' });
        tagNode(g, nodeId, 'shape', shapeType, left, top, width, height);
        applyMeta(g, left, top, meta, width, height);
        applyNodeShadow(root, g, node);
        return g;
      }

      // Variable-width freehand silhouette (pressure + brush thinning / taper).
      const pressures = parsePathPressures(node.attrs?.pathPressure, pts.length);
      const outlineD = pencilInkPathFromPoints(pts, strokeWidth, brushId, {
        linecap: strokeOpen.linecap,
        dasharray: strokeFull.dasharray,
        pressures,
        pressureEnabled: true,
      });
      const g = appendChild(parent, svgEl('g'));
      if (outlineD) {
        const inkPath = appendChild(g, svgEl('path', { d: outlineD }));
        setFill(inkPath, ink);
        setStroke(inkPath, 'none');
        setAttrs(inkPath, { 'pointer-events': 'none' });
      }
      const hit = appendChild(g, svgEl('path', { d: String(d) }));
      setFill(hit, 'none');
      setStroke(hit, {
        color: 'transparent',
        width: Math.max(brushSize(brush, strokeWidth), strokeWidth),
      });
      setAttrs(hit, { 'pointer-events': 'stroke', 'data-baseline': '1' });
      tagNode(g, nodeId, 'shape', shapeType, left, top, width, height);
      applyMeta(g, left, top, meta, width, height);
      applyNodeShadow(root, g, node);
      return g;
    }

    const fillPaint =
      shapeType === 'pen'
        ? resolveFill(node, 'transparent')
        : resolveFill(node, closed ? '#FFFFFF' : 'transparent');
    const baseD = String(d);
    const cornerR =
      shapeType === 'pen' || !closed
        ? { tl: 0, tr: 0, br: 0, bl: 0 }
        : radiiFromAttrs(node.attrs);
    const drawD = closed && shapeType !== 'pen' ? filletPathD(baseD, cornerR) : baseD;
    const path = appendChild(parent, svgEl('path', { d: drawD }));
    setAttrs(path, { 'data-baseline': '1' });
    if (closed && shapeType !== 'pen') {
      setAttrs(path, { 'data-scene-base-path': baseD });
      (path as any).__sceneBasePath = baseD;
    }
    applySvgFill(root, path, fillPaint, `n-${nodeId}`);
    const fillRule = String(node.attrs?.['fill-rule'] || '');
    if (fillRule === 'evenodd' || fillRule === 'nonzero') {
      setAttrs(path, { 'fill-rule': fillRule });
    }
    applyElementStroke(root, path, closed ? strokeFull : strokeOpen, {
      hasOpaqueFill: closed && shapeType !== 'pen' && !isTransparentFill(fillPaint),
    });
    if (shapeType === 'pen') {
      setAttrs(path, { 'pointer-events': 'stroke' });
    }
    tagNode(path, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(path, left, top, meta, width, height);
    applyNodeShadow(root, path, node);
    return path;
  }

  return createRectLike(ctx, document, node, nodeId, 'shape', 'rect');
}

function buildMultilineText(
  parent: SVGElement,
  lines: string[],
  opts: {
    localX: number;
    originY: number;
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    fontStyle: string;
    anchor: string;
    fill: string;
    letterSpacing?: number;
    decoration?: string;
    lineHeight: number;
  }
): SVGTextElement {
  const el = appendChild(
    parent,
    svgEl('text', {
      x: opts.localX,
      y: opts.originY,
      'font-family': opts.fontFamily,
      'font-size': opts.fontSize,
      'font-weight': opts.fontWeight,
      'font-style': opts.fontStyle,
      'text-anchor': opts.anchor,
      fill: opts.fill,
      'dominant-baseline': 'text-before-edge',
      'alignment-baseline': 'before-edge',
    })
  );
  if (opts.letterSpacing) {
    setAttrs(el, { 'letter-spacing': `${opts.letterSpacing}px` });
  }
  if (opts.decoration && opts.decoration !== 'none') {
    setAttrs(el, {
      'text-decoration': opts.decoration,
      'text-decoration-line': opts.decoration,
    });
  }
  const dy = `${Math.max(0.8, opts.lineHeight)}em`;
  lines.forEach((line, i) => {
    const tspan = svgEl('tspan', {
      x: opts.localX,
      ...(i === 0 ? { y: opts.originY } : { dy }),
    });
    tspan.textContent = line || ' ';
    el.appendChild(tspan);
  });
  return el;
}

export async function nodeToSvgElement(
  root: SVGSVGElement,
  parent: SVGElement,
  document: any,
  node: any,
  nodeId: string
): Promise<SVGElement | null> {
  if (!node) return null;
  const ctx: DrawCtx = { root, parent };

  if (node.key === 'text') {
    const text = parseNodeText(node.attrs);
    const style = parseNodeTextStyle(node.attrs);
    const { left, top } = nodeLeftTop(document, node);
    const meta = objectMeta(node);
    const boxW = Math.max(num(node.width, 0), 0);
    const boxH = Math.max(num(node.height, style.fontSize * (style.lineHeight || 1.4)), 1);
    const align =
      style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';

    const autoSize = String(node.attrs?.autoSize ?? 'true') !== 'false';
    const wrapW = boxW > 8 ? boxW : Math.max(1, boxW);
    const visualLines =
      !autoSize && boxW > 8
        ? wrapPlainTextLines(text || ' ', style, wrapW)
        : String(text || ' ').split('\n');

    const lineHeight = Math.max(0.8, Number(style.lineHeight) || 1.4);
    const fontSize = Math.max(1, Number(style.fontSize) || 14);
    const lineCount = Math.max(1, visualLines.length);
    // Fixed box (button/chip/input label): vertically center ink in the selection height.
    // Left/right align still centers vertically so placeholders aren't top-heavy.
    const originY = !autoSize
      ? textVerticalOriginY(boxH, fontSize, lineHeight, lineCount)
      : 0;
    let localX = 0;
    const measuredW = boxW > 1 ? boxW : 1;
    if (align === 'middle') localX = measuredW / 2;
    else if (align === 'end') localX = measuredW;

    const el = buildMultilineText(parent, visualLines.length ? visualLines : [' '], {
      localX,
      originY,
      fontFamily: toFabricFontFamily(style.fontFamily),
      fontSize,
      fontWeight: String(style.fontWeight),
      fontStyle: style.fontStyle,
      anchor: align,
      fill: hexWithOpacity(style.fill || '#333333', style.fillOpacity ?? 100),
      letterSpacing: style.letterSpacing || undefined,
      decoration: String(style.textDecoration || 'none').trim(),
      lineHeight,
    });

    const bbox = getBBox(el);
    const finalW = boxW > 1 ? boxW : Math.max(1, bbox.width);
    const finalH = boxH > 1 ? boxH : Math.max(1, bbox.height);
    if (boxW <= 1) {
      localX = align === 'middle' ? finalW / 2 : align === 'end' ? finalW : 0;
      setAttrs(el, { x: localX });
      el.querySelectorAll('tspan').forEach((t, i) => {
        t.setAttribute('x', String(localX));
        if (i === 0) {
          t.removeAttribute('dy');
          t.setAttribute('y', String(originY));
        }
      });
    }

    tagNode(el, nodeId, 'text', undefined, left, top, finalW, finalH);
    const anyEl = el as any;
    anyEl.__sceneFontSize = fontSize;
    anyEl.__sceneLineHeight = lineHeight;
    anyEl.__sceneLineCount = Math.max(1, visualLines.length);
    anyEl.__scenePlainText = text;
    applyMeta(el, left, top, meta, finalW, finalH);
    applyNodeShadow(root, el, node);
    return el;
  }

  if (node.key === 'shape') return createShape(ctx, document, node, nodeId);
  if (node.key === 'rect') return createRectLike(ctx, document, node, nodeId, 'rect');

  if (node.key === 'svg') {
    const markup = String(node.attrs?.svg || node.attrs?.content || '').trim();
    const { left, top } = nodeLeftTop(document, node);
    const boxW = Math.max(1, Number(node.width) || 24);
    const boxH = Math.max(1, Number(node.height) || 24);
    const meta = objectMeta(node);
    const fillOverride = String(node.attrs?.['fill-color'] || node.attrs?.fill || '').trim();
    const g = appendChild(parent, svgEl('g'));
    // Box hit target — SVG content may be sparse.
    const hit = appendChild(
      g,
      svgEl('rect', { x: 0, y: 0, width: boxW, height: boxH, fill: 'transparent' })
    );
    setAttrs(hit, { 'pointer-events': 'all', 'data-svg-hit': '1' });

    if (markup) {
      try {
        const wrapped = /^<svg[\s>]/i.test(markup)
          ? markup
          : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${markup}</svg>`;
        const parsed = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
        if (!parsed.querySelector('parsererror')) {
          const srcSvg = parsed.querySelector('svg');
          if (srcSvg) {
            const vbParts = String(srcSvg.getAttribute('viewBox') || '')
              .trim()
              .split(/[\s,]+/)
              .map(Number);
            let vbX = 0;
            let vbY = 0;
            let vbW = 24;
            let vbH = 24;
            if (vbParts.length === 4 && vbParts.every((n) => Number.isFinite(n)) && vbParts[2] > 0 && vbParts[3] > 0) {
              vbX = vbParts[0];
              vbY = vbParts[1];
              vbW = vbParts[2];
              vbH = vbParts[3];
            } else {
              const wAttr = Number(srcSvg.getAttribute('width'));
              const hAttr = Number(srcSvg.getAttribute('height'));
              if (wAttr > 0 && hAttr > 0) {
                vbW = wAttr;
                vbH = hAttr;
              }
            }
            const sx = boxW / Math.max(1e-6, vbW);
            const sy = boxH / Math.max(1e-6, vbH);
            // Uniform scale + letterbox — non-uniform stretch fattened icons into "blobs".
            const s = Math.min(sx, sy);
            const ox = (boxW - vbW * s) / 2;
            const oy = (boxH - vbH * s) / 2;
            const inner = appendChild(g, svgEl('g'));
            setAttrs(inner, {
              transform: `translate(${ox},${oy}) scale(${s}) translate(${-vbX},${-vbY})`,
              'data-svg-content': '1',
              'pointer-events': 'none',
            });
            const od = g.ownerDocument;
            for (const child of Array.from(srcSvg.childNodes)) {
              if (child.nodeType !== 1) continue;
              const tag = (child as Element).tagName.toLowerCase().replace(/^.*:/, '');
              if (tag === 'script' || tag === 'foreignobject' || tag === 'style') continue;
              inner.appendChild(od.importNode(child, true));
            }
            if (fillOverride && fillOverride !== 'none' && fillOverride !== 'transparent') {
              inner.querySelectorAll('path, circle, ellipse, rect, polygon, polyline').forEach((el) => {
                const cur = String(el.getAttribute('fill') || '').trim();
                if (!cur || cur === 'currentColor' || cur === 'black' || cur === '#000' || cur === '#000000') {
                  el.setAttribute('fill', fillOverride);
                }
                const stroke = String(el.getAttribute('stroke') || '').trim();
                if (stroke === 'currentColor') el.setAttribute('stroke', fillOverride);
              });
            }
          }
        }
      } catch {
        /* keep empty hit box */
      }
    }

    tagNode(g, nodeId, 'svg', undefined, left, top, boxW, boxH);
    applyMeta(g, left, top, meta, boxW, boxH);
    applyNodeShadow(root, g, node);
    return g;
  }

  if (node.key === 'image') {
    const src = node.attrs?.src;
    const processing = String(node.attrs?.processStatus || '') === 'running';
    const { left, top } = nodeLeftTop(document, node);
    const boxW = Math.max(1, Number(node.width) || 100);
    const boxH = Math.max(1, Number(node.height) || 100);
    const meta = objectMeta(node);
    const cssFilter = String(node.attrs?.cssFilter || '').trim();
    const isGen = isImageGeneratorNode(node);
    // Generator plates are always sharp (artboard-like), even for older docs with radius attrs.
    const cornerR = isGen
      ? { tl: 0, tr: 0, br: 0, bl: 0 }
      : radiiFromAttrs(node.attrs);
    const clipD = roundedRectPath(boxW, boxH, cornerR);

    if (!src && !processing) {
      const g = appendChild(parent, svgEl('g'));
      const plate = appendChild(g, svgEl('path', { d: clipD }));
      // Generator: soft gray plate + centered photo icon (no selection chrome).
      // Empty image upload placeholder: dashed border wash.
      setFill(plate, isGen ? '#E8EAED' : '#E5E7EB');
      setStroke(plate, {
        color: isGen ? 'rgba(0,0,0,0.06)' : '#9CA3AF',
        width: isGen ? 1 : 1.5,
        dasharray: isGen ? undefined : '6 4',
      });
      setAttrs(plate, { 'data-radius-body': '1' });
      if (isGen) {
        // Solid landscape glyph (sun + two peaks) — flat fill, no frame.
        // Scale with the plate (~34% of the shorter side); no tiny absolute cap.
        const iconSize = Math.max(72, Math.min(boxW, boxH) * 0.34);
        const ix = (boxW - iconSize) / 2;
        const iy = (boxH - iconSize) / 2;
        const s = iconSize / 24;
        const icon = appendChild(
          g,
          svgEl('g', {
            transform: `translate(${ix},${iy}) scale(${s})`,
            'pointer-events': 'none',
          })
        );
        // Sun (upper-right) — light gray so it sits softly on the plate
        const sun = appendChild(
          icon,
          svgEl('circle', { cx: 16.5, cy: 7.5, r: 2.25 })
        );
        setFill(sun, '#D1D5DB');
        setStroke(sun, 'none');
        // Twin peaks silhouette
        const peaks = appendChild(
          icon,
          svgEl('path', {
            d: 'M3.5 18.5 L9.2 10.2 L13.1 15.1 L16.4 11.4 L20.5 18.5 Z',
          })
        );
        setFill(peaks, '#D1D5DB');
        setStroke(peaks, 'none');
      } else {
        const wash = appendChild(
          g,
          svgEl('rect', {
            x: 8,
            y: 8,
            width: Math.max(1, boxW - 16),
            height: Math.max(1, boxH - 16),
            'pointer-events': 'none',
          })
        );
        setFill(wash, '#F9FAFB');
        setStroke(wash, 'none');
      }
      tagNode(g, nodeId, 'image', undefined, left, top, boxW, boxH);
      if (isGen || processing) setAttrs(g, { 'data-export-ignore': '1' });
      applyMeta(g, left, top, meta, boxW, boxH);
      return g;
    }

    if (processing) {
      const g = appendChild(parent, svgEl('g'));
      const kind = String(node.attrs?.processKind || '');
      const previewSrc =
        kind === 'upload' && src && String(src) !== TRANSPARENT_PIXEL_SRC ? String(src) : '';
      if (previewSrc) {
        const img = appendChild(
          g,
          svgEl('image', {
            width: boxW,
            height: boxH,
            x: 0,
            y: 0,
            // Fill the node box (like rects) — default SVG `meet` letterboxes.
            preserveAspectRatio: 'none',
          })
        );
        setSvgImageHref(img, previewSrc);
        if (cssFilter) setStyles(img, { filter: cssFilter });
        const overlay = appendChild(g, svgEl('path', { d: clipD }));
        setFill(overlay, 'rgba(185, 203, 218, 0.28)');
        setStroke(overlay, { color: '#A8C5E4', width: 1.5 });
        setAttrs(overlay, { 'pointer-events': 'none', 'data-radius-body': '1' });
      } else {
        const gid = nextClipId('img-load');
        const defs = ensureDefs(root);
        const grad = svgEl('linearGradient', {
          id: gid,
          x1: '0%',
          y1: '50%',
          x2: '100%',
          y2: '50%',
        });
        grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#B9CBDA' }));
        grad.appendChild(svgEl('stop', { offset: '0.55', 'stop-color': '#D5DEE6' }));
        grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#E8ECF0' }));
        defs.appendChild(grad);
        const plate = appendChild(g, svgEl('path', { d: clipD }));
        setFill(plate, urlRef(gid));
        setStroke(plate, { color: '#A8C5E4', width: 1.5 });
        setAttrs(plate, { 'data-radius-body': '1' });
      }

      tagNode(g, nodeId, 'image', undefined, left, top, boxW, boxH);
      // Process shimmer is editor chrome — never bake into export / cover clones.
      setAttrs(g, { 'data-export-ignore': '1' });
      applyMeta(g, left, top, meta, boxW, boxH);
      applyNodeShadow(root, g, node);
      (g as any).__sceneCornerRadii = { ...cornerR };
      return g;
    }

    const g = appendChild(parent, svgEl('g'));
    const img = appendChild(
      g,
      svgEl('image', {
        width: boxW,
        height: boxH,
        x: 0,
        y: 0,
        // Stretch to the control box — same as shapes filling their bounds.
        // Default `xMidYMid meet` keeps photo aspect and leaves empty gutters.
        preserveAspectRatio: 'none',
      })
    );
    setSvgImageHref(img, String(src));
    const clipId = nextClipId('img-clip');
    const defs = ensureDefs(root);
    const clip = svgEl('clipPath', { id: clipId });
    const clipPath = svgEl('path', { d: clipD, 'data-radius-clip': '1' });
    clip.appendChild(clipPath);
    defs.appendChild(clip);
    setAttrs(img, { 'clip-path': urlRef(clipId) });
    setAttrs(g, { 'data-radius-clip-id': clipId });
    (g as any).__sceneCornerRadii = { ...cornerR };
    tagNode(g, nodeId, 'image', undefined, left, top, boxW, boxH);
    if (isGen || isImageProcessRunning(node)) setAttrs(g, { 'data-export-ignore': '1' });
    applyMeta(g, left, top, meta, boxW, boxH);
    applyNodeShadow(root, g, node);
    if (cssFilter && cssFilter !== 'none') {
      const shadowFilter = String(g.style.filter || '').trim();
      const combined =
        shadowFilter && shadowFilter !== 'none' ? `${cssFilter} ${shadowFilter}` : cssFilter;
      setStyles(g, { filter: combined });
    }
    return g;
  }

  return null;
}

export function applyInfiniteSvgViewport(root: SVGSVGElement) {
  setAttrs(root, {
    width: 1,
    height: 1,
    viewBox: '0 0 1 1',
    overflow: 'visible',
    preserveAspectRatio: 'none',
    'shape-rendering': 'geometricPrecision',
    'pointer-events': 'none',
    'data-rcb-infinite': '1',
  });
  setStyles(root, {
    display: 'block',
    overflow: 'visible',
    position: 'absolute',
    left: '0',
    top: '0',
    width: '1px',
    height: '1px',
    'pointer-events': 'none',
  });
}

const INFINITE_SVG_PAD = 64;

function isInfiniteSvgRoot(root: SVGSVGElement) {
  return root.getAttribute('data-rcb-infinite') === '1';
}

export function fitInfiniteSvgToContent(root: SVGSVGElement, layer?: SVGElement | null) {
  if (!isInfiniteSvgRoot(root)) return;

  let minX = 0;
  let minY = 0;
  let w = 1;
  let h = 1;
  try {
    const target = (layer || root) as SVGGraphicsElement;
    const box = getBBox(target);
    if (
      Number.isFinite(box.x) &&
      Number.isFinite(box.y) &&
      Number.isFinite(box.width) &&
      Number.isFinite(box.height) &&
      (box.width > 0 || box.height > 0)
    ) {
      minX = box.x - INFINITE_SVG_PAD;
      minY = box.y - INFINITE_SVG_PAD;
      w = Math.max(1, box.width + INFINITE_SVG_PAD * 2);
      h = Math.max(1, box.height + INFINITE_SVG_PAD * 2);
    }
  } catch {
    /* empty layer */
  }

  setAttrs(root, {
    width: w,
    height: h,
    viewBox: `${minX} ${minY} ${w} ${h}`,
    overflow: 'visible',
    preserveAspectRatio: 'none',
    'shape-rendering': 'geometricPrecision',
    'pointer-events': 'none',
    'data-rcb-infinite': '1',
  });
  setStyles(root, {
    display: 'block',
    overflow: 'visible',
    position: 'absolute',
    left: `${minX}px`,
    top: `${minY}px`,
    width: `${w}px`,
    height: `${h}px`,
    'pointer-events': 'none',
  });
}

export async function loadSceneOntoSvg(
  root: SVGSVGElement,
  layer: SVGElement,
  document: any,
  loadSeq = 0,
  boardMeta?: { loadSeq?: number },
  opts?: { infinite?: boolean; /** Skip generators + process-shimmer plates (export / cover). */ omitNonExportable?: boolean; /** @deprecated use omitNonExportable */ omitImageGenerators?: boolean }
) {
  if (!root || !layer || !document?.deltaSetLike?.ROOT) {
    return new Map<string, SVGElement>();
  }

  const infinite = Boolean(opts?.infinite);
  const omitNonExportable = Boolean(opts?.omitNonExportable || opts?.omitImageGenerators);
  const w = Math.round(document.width || 794);
  const h = Math.round(document.height || 1123);
  if (infinite) {
    applyInfiniteSvgViewport(root);
  } else {
    setAttrs(root, { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  }
  clearChildren(layer);

  const docBg = resolveDocumentBackground(document);
  if (!infinite && !isTransparentFill(docBg)) {
    const bg = appendChild(layer, svgEl('rect', { x: 0, y: 0, width: w, height: h }));
    setAttrs(bg, { 'data-scene-bg': '1', 'pointer-events': 'none' });
    applySvgFill(root, bg, docBg, 'doc-bg');
  }

  const children: string[] = document.deltaSetLike.ROOT.children || [];
  const nodeEls = new Map<string, SVGElement>();

  for (const nodeId of children) {
    if (boardMeta && loadSeq && boardMeta.loadSeq !== loadSeq) return nodeEls;
    const node = document.deltaSetLike[nodeId];
    if (omitNonExportable ? !isExportableSceneNode(node) : isNodeHidden(node)) continue;
    try {
      const el = await nodeToSvgElement(root, layer, document, node, nodeId);
      if (boardMeta && loadSeq && boardMeta.loadSeq !== loadSeq) {
        el?.remove();
        return nodeEls;
      }
      if (el) {
        applyFrameContentClip(root, el, document, node);
        nodeEls.set(nodeId, el);
      }
    } catch (err) {
      console.error('nodeToSvgElement failed', nodeId, err);
    }
  }

  if (infinite) fitInfiniteSvgToContent(root, layer);
  return nodeEls;
}

export function dedupeSceneNode(layer: SVGElement, nodeId: string, keep?: SVGElement | null) {
  try {
    const matches = [...layer.querySelectorAll('[data-scene-node-id]')].filter(
      (n) => n.getAttribute('data-scene-node-id') === nodeId
    );
    if (matches.length <= 1) return;
    const survivor = keep && matches.includes(keep) ? keep : matches[matches.length - 1];
    matches.forEach((n) => {
      if (n === survivor) return;
      n.parentNode?.removeChild(n);
    });
  } catch {
    /* ignore */
  }
}

export function purgeOrphanSceneNodes(
  layer: SVGElement,
  nodeEls: Map<string, SVGElement>,
  validIds?: Iterable<string>
) {
  try {
    const allowed = validIds ? new Set(validIds) : null;
    layer.querySelectorAll('[data-scene-node-id]').forEach((n) => {
      const id = n.getAttribute('data-scene-node-id');
      if (!id) return;
      if (allowed && !allowed.has(id)) {
        n.parentNode?.removeChild(n);
        return;
      }
      const keep = nodeEls.get(id);
      if (keep && n !== keep) {
        n.parentNode?.removeChild(n);
      }
    });
  } catch {
    /* ignore */
  }
}

function setPathD(target: Element | null | undefined, d: string): boolean {
  if (!target || !d) return false;
  target.setAttribute('d', d);
  // Keep outside-stroke underlay in sync (sibling behind the filled body).
  const parent = target.parentElement;
  if (parent) {
    parent.querySelectorAll(':scope > [data-stroke-under="1"]').forEach((u) => {
      u.setAttribute('d', d);
    });
  }
  const prev = target.previousElementSibling;
  if (prev instanceof Element && prev.getAttribute('data-stroke-under') === '1') {
    prev.setAttribute('d', d);
  }
  return true;
}

export function clearSceneDragPreview(nodeEls: Map<string, SVGElement>, nodeId: string) {
  const el = nodeEls.get(nodeId) as any;
  if (!el) return;
  delete el.__sceneDragBaseW;
  delete el.__sceneDragBaseH;
  delete el.__sceneDragBaseFontSize;
  delete el.__sceneDragBaseLetterSpacing;
  delete el.__sceneDidResize;
}

function previewResizeText(
  el: SVGElement,
  box: { left: number; top: number; width: number; height: number },
  options?: {
    textResizeMode?: 'scale' | 'wrap';
    plainText?: string;
    textStyle?: ReturnType<typeof parseNodeTextStyle>;
  }
): boolean {
  const anyEl = el as any;
  if (String(anyEl.sceneNodeKey || '') !== 'text') return false;

  const geom = readGeom(el);
  if (!geom) return false;

  if (!anyEl.__sceneDragBaseW) {
    anyEl.__sceneDragBaseW = geom.width;
    anyEl.__sceneDragBaseH = geom.height;
    let fontSize = Number(anyEl.__sceneFontSize);
    if (!(fontSize > 0)) {
      fontSize = Number(String(el.getAttribute('font-size') || '').replace(/px$/i, '')) || 14;
    }
    anyEl.__sceneDragBaseFontSize = fontSize;
    const lsRaw = String(el.getAttribute('letter-spacing') || '0').replace(/px$/i, '');
    anyEl.__sceneDragBaseLetterSpacing = Number(lsRaw) || 0;
  }

  const bh = Math.max(1, Number(anyEl.__sceneDragBaseH) || geom.height);
  const baseFs = Math.max(1, Number(anyEl.__sceneDragBaseFontSize) || 14);
  const lineHeight = Math.max(0.8, Number(anyEl.__sceneLineHeight) || 1.4);
  const mode = options?.textResizeMode === 'wrap' ? 'wrap' : 'scale';
  const anchor = String(el.getAttribute('text-anchor') || 'start');
  const lineCount = Math.max(1, Number(anyEl.__sceneLineCount) || el.querySelectorAll('tspan').length || 1);
  const originY =
    anchor === 'middle'
      ? textVerticalOriginY(bh, baseFs, lineHeight, lineCount)
      : 0;

  let localX = 0;
  if (anchor === 'middle') localX = box.width / 2;
  else if (anchor === 'end') localX = box.width;

  if (mode === 'wrap') {
    const style = options?.textStyle || parseNodeTextStyle({});
    const plain =
      options?.plainText != null ? options.plainText : String(anyEl.__scenePlainText ?? '');
    const wrapStyle = { ...style, fontSize: baseFs };
    const lines = wrapPlainTextLines(plain || ' ', wrapStyle, Math.max(24, box.width));
    clearChildren(el);
    const dy = `${lineHeight}em`;
    lines.forEach((line, i) => {
      const tspan = svgEl('tspan', {
        x: localX,
        ...(i === 0 ? { y: originY } : { dy }),
      });
      tspan.textContent = line || ' ';
      el.appendChild(tspan);
    });
    setAttrs(el, {
      'font-family': toFabricFontFamily(style.fontFamily || wrapStyle.fontFamily),
      'font-size': baseFs,
      'font-weight': String(style.fontWeight || 'normal'),
      'font-style': style.fontStyle || 'normal',
      'text-anchor':
        style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start',
      fill: hexWithOpacity(style.fill || '#333333', style.fillOpacity ?? 100),
      x: localX,
      y: originY,
      'dominant-baseline': 'text-before-edge',
      'alignment-baseline': 'before-edge',
    });
    anyEl.__sceneFontSize = baseFs;
    anyEl.__sceneLineCount = Math.max(1, lines.length);
    anyEl.__scenePlainText = plain;
    anyEl.__sceneDidResize = false;
    writeGeom(el, {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      abs: false,
    });
    reapplySceneTransform(el, box.left, box.top, box.width, box.height);
    return true;
  }

  const sy = box.height / bh;
  const fontSize = Math.max(1, baseFs * sy);
  setAttrs(el, {
    'font-size': fontSize,
    x: localX,
    y: originY,
    'dominant-baseline': 'text-before-edge',
    'alignment-baseline': 'before-edge',
  });
  anyEl.__sceneFontSize = fontSize;

  const baseLs = Number(anyEl.__sceneDragBaseLetterSpacing) || 0;
  if (baseLs || el.getAttribute('letter-spacing') != null) {
    setAttrs(el, { 'letter-spacing': `${baseLs * sy}px` });
  }

  el.querySelectorAll('tspan').forEach((t, i) => {
    if (i === 0) {
      t.removeAttribute('dy');
      t.setAttribute('y', String(originY));
      t.removeAttribute('x');
    }
  });

  anyEl.__sceneDidResize = false;
  writeGeom(el, {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    abs: false,
  });
  reapplySceneTransform(el, box.left, box.top, box.width, box.height);
  return true;
}

function previewResizeImage(
  el: SVGElement,
  box: { left: number; top: number; width: number; height: number }
): boolean {
  const anyEl = el as any;
  if (String(anyEl.sceneNodeKey || el.getAttribute('data-scene-node-key') || '') !== 'image') {
    return false;
  }

  const geom = readGeom(el);
  if (!geom) return false;

  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const EPS = 1e-3;
  const sameSize =
    Math.abs(geom.width - w) < EPS && Math.abs(geom.height - h) < EPS;

  // Pure translate — keep bitmap attrs; just move the group.
  if (sameSize && !anyEl.__sceneDidResize) {
    writeGeom(el, {
      left: box.left,
      top: box.top,
      width: w,
      height: h,
      abs: false,
    });
    reapplySceneTransform(el, box.left, box.top, w, h);
    return true;
  }

  // Live resize: scale the group (same as svg/custom-path nodes). Mutating
  // <image width/height> alone does not reliably repaint under per-shape
  // infinite SVG hosts — the control box moves while the bitmap stays put.
  // Final size is baked via replaceShapePaint on commit.
  if (!anyEl.__sceneDragBaseW) {
    anyEl.__sceneDragBaseW = geom.width;
    anyEl.__sceneDragBaseH = geom.height;
  }
  anyEl.__sceneDidResize = true;
  const bw = Math.max(1, Number(anyEl.__sceneDragBaseW) || geom.width);
  const bh = Math.max(1, Number(anyEl.__sceneDragBaseH) || geom.height);

  writeGeom(el, {
    left: box.left,
    top: box.top,
    width: w,
    height: h,
    abs: false,
  });
  reapplySceneTransformScaled(el, box.left, box.top, bw, bh, w / bw, h / bh);
  return true;
}

export function previewSvgNodeAngle(
  nodeEls: Map<string, SVGElement>,
  nodeId: string,
  angleDeg: number
): boolean {
  const el = nodeEls.get(nodeId);
  if (!el) return false;
  const geom = readGeom(el);
  if (!geom) return false;

  const anyEl = el as any;
  anyEl.__sceneAngle = angleDeg;
  const baseW = Number(anyEl.__sceneDragBaseW);
  const baseH = Number(anyEl.__sceneDragBaseH);
  if (anyEl.__sceneDidResize && baseW > 0 && baseH > 0) {
    reapplySceneTransformScaled(
      el,
      geom.left,
      geom.top,
      baseW,
      baseH,
      geom.width / baseW,
      geom.height / baseH
    );
  } else {
    reapplySceneTransform(el, geom.left, geom.top, geom.width, geom.height);
  }
  return true;
}

function reapplySceneTransformScaled(
  el: SVGElement,
  left: number,
  top: number,
  baseW: number,
  baseH: number,
  sx: number,
  sy: number
) {
  const anyEl = el as any;
  const angle = Number(anyEl.__sceneAngle) || 0;
  const flipX = !!anyEl.__sceneFlipX;
  const flipY = !!anyEl.__sceneFlipY;
  const geom = readGeom(el);
  const abs = geom ? geom.abs : !!anyEl.__sceneAbsPos;
  const parts: string[] = [];

  if (!abs) {
    parts.push(`translate(${left} ${top})`);
    if (Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4) {
      parts.push(`scale(${sx} ${sy})`);
    }
  }

  const rx = abs ? left + (baseW * sx) / 2 : baseW / 2;
  const ry = abs ? top + (baseH * sy) / 2 : baseH / 2;
  if (angle) parts.push(`rotate(${angle} ${rx} ${ry})`);
  if (flipX || flipY) {
    const fsx = flipX ? -1 : 1;
    const fsy = flipY ? -1 : 1;
    parts.push(`translate(${rx} ${ry}) scale(${fsx} ${fsy}) translate(${-rx} ${-ry})`);
  }

  if (parts.length) setAttrs(el, { transform: parts.join(' ') });
  else el.removeAttribute('transform');
  syncStrokeUnderlayTransform(el);
}

function previewResizeLocalGeometry(el: SVGElement, width: number, height: number): boolean {
  const anyEl = el as any;
  const shapeType = String(
    anyEl.sceneShapeType || el.getAttribute('data-scene-shape-type') || ''
  );

  if (isCustomPathShape(shapeType)) return false;

  if (shapeType === 'line') {
    const mid = Math.max(1, height) / 2;
    setAttrs(el, { x1: 0, y1: mid, x2: width, y2: mid });
    return true;
  }

  if (shapeType === 'arrow') {
    const d =
      getShapeBaselineD({
        key: 'shape',
        width,
        height,
        attrs: { shapeType: 'arrow' },
      }) || '';
    if (el.tagName.toLowerCase() === 'path') return setPathD(el, d);
    return false;
  }

  if (shapeType === 'circle') {
    const d =
      getShapeBaselineD({
        key: 'shape',
        width,
        height,
        attrs: { shapeType: 'circle' },
      }) || '';
    if (el.tagName.toLowerCase() === 'path') return setPathD(el, d);
    return setPathD(
      el.querySelector('[data-baseline="1"]') ||
        el.querySelector('path:not([data-stroke-under])'),
      d
    );
  }

  const zeroR = { tl: 0, tr: 0, br: 0, bl: 0, linked: true as const };

  if (shapeType === 'triangle' || shapeType === 'star' || shapeType === 'polygon') {
    const d =
      getShapeBaselineD({
        key: 'shape',
        width,
        height,
        attrs: {
          shapeType,
          sides: readSceneSides(el),
        },
      }) || roundedShapePath(shapeType, width, height, zeroR, readSceneSides(el));
    if (el.tagName.toLowerCase() === 'path') return setPathD(el, d);
    return setPathD(el.querySelector('path'), d);
  }

  if (shapeType === 'rect' || shapeType === 'roundRect' || shapeType === '') {
    const d = roundedRectPath(width, height, zeroR);
    if (el.tagName.toLowerCase() === 'path') return setPathD(el, d);
    // Prefer the filled baseline body (not the stroke underlay).
    const body =
      el.querySelector(':scope > [data-baseline="1"]') ||
      el.querySelector(':scope > [data-radius-body="1"]:not([data-stroke-under])') ||
      el.querySelector(':scope > path:not([data-stroke-under])');
    return setPathD(body, d);
  }

  return false;
}

function dmoveAbs(el: SVGElement, dx: number, dy: number) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'line') {
    setAttrs(el, {
      x1: num(el.getAttribute('x1')) + dx,
      y1: num(el.getAttribute('y1')) + dy,
      x2: num(el.getAttribute('x2')) + dx,
      y2: num(el.getAttribute('y2')) + dy,
    });
    return;
  }
  if (el.hasAttribute('x') || el.hasAttribute('y')) {
    setAttrs(el, {
      x: num(el.getAttribute('x')) + dx,
      y: num(el.getAttribute('y')) + dy,
    });
  }
}

export function previewSvgNodeGeometry(
  nodeEls: Map<string, SVGElement>,
  nodeId: string,
  box: { left: number; top: number; width: number; height: number },
  options?: {
    textResizeMode?: 'scale' | 'wrap';
    plainText?: string;
    textStyle?: ReturnType<typeof parseNodeTextStyle>;
  }
): boolean {
  const el = nodeEls.get(nodeId);
  if (!el) return false;
  const anyEl = el as any;

  if (String(anyEl.sceneNodeKey || el.getAttribute('data-scene-node-key') || '') === 'image') {
    return previewResizeImage(el, box);
  }
  if (String(anyEl.sceneNodeKey || el.getAttribute('data-scene-node-key') || '') === 'svg') {
    // Scale whole group like a custom path — content re-renders on commit.
    const geom = readGeom(el);
    if (!geom) return false;
    if (!anyEl.__sceneDragBaseW) {
      anyEl.__sceneDragBaseW = geom.width;
      anyEl.__sceneDragBaseH = geom.height;
    }
    anyEl.__sceneDidResize = true;
    const bw = Math.max(1, Number(anyEl.__sceneDragBaseW) || geom.width);
    const bh = Math.max(1, Number(anyEl.__sceneDragBaseH) || geom.height);
    writeGeom(el, {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      abs: false,
    });
    reapplySceneTransformScaled(
      el,
      box.left,
      box.top,
      bw,
      bh,
      box.width / bw,
      box.height / bh
    );
    return true;
  }

  const geom = readGeom(el);
  if (!geom) return false;

  const EPS = 1e-3;
  const sameSize =
    Math.abs(geom.width - box.width) < EPS && Math.abs(geom.height - box.height) < EPS;
  const samePos =
    Math.abs(geom.left - box.left) < EPS && Math.abs(geom.top - box.top) < EPS;

  if (geom.abs && sameSize && !samePos) {
    const dx = box.left - geom.left;
    const dy = box.top - geom.top;
    if (dx || dy) dmoveAbs(el, dx, dy);
    writeGeom(el, { ...geom, left: box.left, top: box.top });
    return true;
  }

  if (!geom.abs) {
    const shapeType = String(
      anyEl.sceneShapeType || el.getAttribute('data-scene-shape-type') || ''
    );
    const isStrokeShape = shapeType === 'line' || shapeType === 'arrow';
    const isText = String(anyEl.sceneNodeKey || el.getAttribute('data-scene-node-key') || '') === 'text';

    if (isText) {
      return previewResizeText(el, box, options);
    }

    if (!sameSize && isCustomPathShape(shapeType)) {
      if (!anyEl.__sceneDragBaseW) {
        anyEl.__sceneDragBaseW = geom.width;
        anyEl.__sceneDragBaseH = geom.height;
      }
      anyEl.__sceneDidResize = true;
      const bw = Math.max(1, Number(anyEl.__sceneDragBaseW) || geom.width);
      const bh = Math.max(1, Number(anyEl.__sceneDragBaseH) || geom.height);
      writeGeom(el, {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        abs: false,
      });
      reapplySceneTransformScaled(
        el,
        box.left,
        box.top,
        bw,
        bh,
        box.width / bw,
        box.height / bh
      );
      return true;
    }

    if (isStrokeShape) {
      anyEl.__sceneDidResize = !sameSize;
      writeGeom(el, {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        abs: false,
      });
      if (!previewResizeLocalGeometry(el, box.width, box.height)) return false;
      reapplySceneTransform(el, box.left, box.top, box.width, box.height);
      return true;
    }

    anyEl.__sceneDidResize = !sameSize;
    writeGeom(el, {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      abs: false,
    });
    if (previewResizeLocalGeometry(el, box.width, box.height)) {
      reapplySceneTransform(el, box.left, box.top, box.width, box.height);
      return true;
    }
    if (!sameSize) {
      if (!anyEl.__sceneDragBaseW) {
        anyEl.__sceneDragBaseW = geom.width;
        anyEl.__sceneDragBaseH = geom.height;
      }
      anyEl.__sceneDidResize = true;
      const bw = Math.max(1, Number(anyEl.__sceneDragBaseW) || geom.width);
      const bh = Math.max(1, Number(anyEl.__sceneDragBaseH) || geom.height);
      reapplySceneTransformScaled(
        el,
        box.left,
        box.top,
        bw,
        bh,
        box.width / bw,
        box.height / bh
      );
      return true;
    }
    reapplySceneTransform(el, box.left, box.top, box.width, box.height);
    return true;
  }

  if (geom.abs && sameSize) {
    writeGeom(el, {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      abs: geom.abs,
    });
    reapplySceneTransform(el, box.left, box.top, box.width, box.height);
    return true;
  }

  if (!sameSize) {
    if (!anyEl.__sceneDragBaseW) {
      anyEl.__sceneDragBaseW = geom.width;
      anyEl.__sceneDragBaseH = geom.height;
    }
    anyEl.__sceneDidResize = true;
    const bw = Math.max(1, Number(anyEl.__sceneDragBaseW) || geom.width);
    const bh = Math.max(1, Number(anyEl.__sceneDragBaseH) || geom.height);
    writeGeom(el, {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      abs: geom.abs,
    });
    reapplySceneTransformScaled(
      el,
      box.left,
      box.top,
      bw,
      bh,
      box.width / bw,
      box.height / bh
    );
    return true;
  }

  writeGeom(el, {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    abs: geom.abs,
  });
  reapplySceneTransform(el, box.left, box.top, box.width, box.height);
  return true;
}

function removeSceneNodesById(layer: SVGElement, nodeId: string) {
  try {
    layer.querySelectorAll('[data-scene-node-id]').forEach((n) => {
      if (n.getAttribute('data-scene-node-id') !== nodeId) return;
      n.parentNode?.removeChild(n);
    });
  } catch {
    /* ignore */
  }
}

const replaceGenByMap = new WeakMap<object, Map<string, number>>();

export async function replaceSvgNode(
  root: SVGSVGElement,
  layer: SVGElement,
  document: any,
  nodeEls: Map<string, SVGElement>,
  nodeId: string
) {
  let gens = replaceGenByMap.get(nodeEls);
  if (!gens) {
    gens = new Map();
    replaceGenByMap.set(nodeEls, gens);
  }
  const gen = (gens.get(nodeId) || 0) + 1;
  gens.set(nodeId, gen);

  removeSceneNodesById(layer, nodeId);
  const prev = nodeEls.get(nodeId);
  if (prev) {
    try {
      prev.remove();
    } catch {
      /* ignore */
    }
    nodeEls.delete(nodeId);
  }

  const node = document.deltaSetLike?.[nodeId];
  const el = await nodeToSvgElement(root, layer, document, node, nodeId);
  if (gens.get(nodeId) !== gen) {
    el?.remove();
    return;
  }
  if (!el) return;
  dedupeSceneNode(layer, nodeId, el);
  applyFrameContentClip(root, el, document, node);
  nodeEls.set(nodeId, el);
  try {
    fitInfiniteSvgToContent(root, layer);
  } catch {
    /* ignore */
  }
}

export function createSvgBoard(
  host: HTMLElement,
  width: number,
  height: number,
  opts?: { infinite?: boolean }
) {
  const infinite = Boolean(opts?.infinite);
  const root = createSvgRoot(host);
  if (infinite) {
    applyInfiniteSvgViewport(root);
  } else {
    setAttrs(root, {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: 'none',
      'shape-rendering': 'geometricPrecision',
    });
    setStyles(root, {
      display: 'block',
      overflow: 'visible',
      width: '100%',
      height: '100%',
    });
  }
  const layer = appendChild(root, svgEl('g', { id: 'scene-layer' }));
  return { root, layer };
}
