import { SVG, type Container, type Element, type Svg } from '@svgdotjs/svg.js';
import {
  parseNodeText,
  parseNodeTextStyle,
  textVerticalOriginY,
  toFabricFontFamily,
  wrapPlainTextLines,
} from '@/store/scene/sceneText';
import { boolEffectAttr, resolveStroke, resolveStrokeAlign, resolveStrokeLinecap, resolveStrokeLinejoin } from '@/store/scene/sceneEffects';
import type { StrokeAlign, StrokeLinecap, StrokeLinejoin } from '@/store/scene/sceneEffects';
import { isTransparentFill, resolveDocumentBackground, resolveFill } from '@/store/scene/sceneFill';
import {
  filletPathD,
  polygonRadiiFromCorners,
  radiiFromAttrs,
  roundedPolygonPath,
  roundedRectPath,
  type CornerRadii,
} from './sceneRadii';
import { isCustomPathShape } from '@/store/scene/pathScale';
import { arrowLocalPath, shapeVertexPoints, sidesFromAttrs, clampShapeSides, DEFAULT_SHAPE_SIDES } from './sceneShapes';
import { applyNodeShadow, applySvgFill } from './svgPaint';
import {
  findPencilBrush,
  isStampBrush,
  outlinePathFromPoints,
  parseSimplePathPoints,
  samplePolyline,
  stampSizeForBrush,
  stampSpacingForBrush,
} from '@/components/editor/nodes/ShapeNode/pencilBrushes';
import { getTintedStampSrc } from '@/components/editor/nodes/ShapeNode/stampTint';
import { strokeDashForStyle } from '@/store/scene/sceneStrokeStyle';

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

/**
 * Apply stroke with align / cap / join.
 * - center: default SVG stroke
 * - inside: 2× width clipped to the shape
 * - outside: 2× width under fill (paint-order) so only the outer half shows
 *   (falls back to center when there is no opaque fill to cover the inner half)
 */
function applyElementStroke(
  root: Svg,
  el: Element,
  opts: ShapeStrokeOpts,
  flags?: { hasOpaqueFill?: boolean }
) {
  if (!(opts.width > 0) || !opts.color || opts.color === 'transparent') {
    el.stroke('none');
    return;
  }
  let align = opts.align || 'center';
  if (align === 'outside' && flags?.hasOpaqueFill === false) {
    align = 'center';
  }
  const width = align === 'center' ? opts.width : opts.width * 2;
  const strokeSpec: Record<string, unknown> = {
    color: opts.color,
    width,
    linecap: opts.linecap || 'butt',
    linejoin: opts.linejoin || 'miter',
    ...(opts.dasharray ? { dasharray: opts.dasharray } : {}),
  };

  try {
    el.attr('paint-order', null as any);
  } catch {
    /* ignore */
  }

  const applyStrokeAttrs = () => {
    try {
      el.attr({
        'stroke-linecap': opts.linecap || 'butt',
        'stroke-linejoin': opts.linejoin || 'miter',
      });
    } catch {
      /* ignore */
    }
  };

  if (align === 'outside') {
    el.attr('paint-order', 'stroke fill');
    el.stroke(strokeSpec);
    applyStrokeAttrs();
    return;
  }

  if (align === 'inside') {
    try {
      const clip = (root as any).clip();
      // SVG.js clone() inserts a sibling into the layer — remove immediately or it
      // stays as a selectable-looking ghost when clip attachment fails.
      const clone = typeof (el as any).clone === 'function' ? (el as any).clone() : null;
      if (clone) {
        try {
          clone.remove();
        } catch {
          /* ignore */
        }
        clone.fill('#fff').stroke('none');
        // Clones copy data-scene-node-id — strip so orphan cleanup won't confuse them.
        try {
          clone.attr({ 'data-scene-node-id': null, 'data-scene-node-key': null });
        } catch {
          /* ignore */
        }
        clip.add(clone);
        el.clipWith(clip);
      }
    } catch {
      /* fall through — still apply 2× stroke */
    }
    el.stroke(strokeSpec);
    applyStrokeAttrs();
    return;
  }

  el.stroke(strokeSpec);
  applyStrokeAttrs();
}

function tagNode(el: Element, nodeId: string, key: string, shapeType?: string, left = 0, top = 0, width = 0, height = 0) {
  el.attr({
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

type SceneGeom = {
  left: number;
  top: number;
  width: number;
  height: number;
  abs: boolean;
};

/** Geometry meta keyed by DOM node — survives better than props on SVG.js wrappers. */
const geomByDom = new WeakMap<SVGElement, SceneGeom>();

function writeGeom(el: Element, geom: SceneGeom) {
  const anyEl = el as any;
  anyEl.__sceneLeft = geom.left;
  anyEl.__sceneTop = geom.top;
  anyEl.sceneWidth = geom.width;
  anyEl.sceneHeight = geom.height;
  anyEl.__sceneAbsPos = geom.abs;
  const dom = anyEl.node as SVGElement | undefined;
  if (dom) geomByDom.set(dom, { ...geom });
}

function readGeom(el: Element): SceneGeom | null {
  const anyEl = el as any;
  const dom = anyEl.node as SVGElement | undefined;
  const fromMap = dom ? geomByDom.get(dom) : undefined;
  if (fromMap) return { ...fromMap };
  const left = Number(anyEl.__sceneLeft);
  const top = Number(anyEl.__sceneTop);
  const width = Number(anyEl.sceneWidth);
  const height = Number(anyEl.sceneHeight);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return { left, top, width, height, abs: !!anyEl.__sceneAbsPos };
}

function applyMeta(el: Element, left: number, top: number, meta: ReturnType<typeof objectMeta>, width = 0, height = 0) {
  const anyEl = el as any;
  anyEl.__sceneAngle = meta.angle;
  anyEl.__sceneFlipX = meta.flipX;
  anyEl.__sceneFlipY = meta.flipY;
  reapplySceneTransform(el, left, top, width, height);
  el.opacity(meta.opacity);
  try {
    const dom = (el as any).node as SVGElement | undefined;
    if (dom?.style) {
      const mode = String(meta.blendMode || 'pass-through').toLowerCase();
      if (!mode || mode === 'pass-through' || mode === 'passthrough') {
        dom.style.removeProperty('mix-blend-mode');
      } else {
        dom.style.mixBlendMode = mode;
      }
    }
  } catch {
    /* ignore */
  }
  return el;
}

/**
 * Position + rotate/flip.
 * - Transform-mode (default): `translate(left,top) rotate(...)` — local geometry at 0,0.
 * - Abs-mode (line/text): only rotate around AABB center; x/y live in SVG attrs.
 */
function reapplySceneTransform(el: Element, left: number, top: number, width: number, height: number) {
  const anyEl = el as any;
  const angle = Number(anyEl.__sceneAngle) || 0;
  const flipX = !!anyEl.__sceneFlipX;
  const flipY = !!anyEl.__sceneFlipY;
  const geom = readGeom(el);
  const abs = geom ? geom.abs : !!anyEl.__sceneAbsPos;
  const parts: string[] = [];

  if (!abs) {
    parts.push(`translate(${left} ${top})`);
  }

  const rx = abs ? left + width / 2 : width / 2;
  const ry = abs ? top + height / 2 : height / 2;
  if (angle) parts.push(`rotate(${angle} ${rx} ${ry})`);
  if (flipX || flipY) {
    const sx = flipX ? -1 : 1;
    const sy = flipY ? -1 : 1;
    parts.push(`translate(${rx} ${ry}) scale(${sx} ${sy}) translate(${-rx} ${-ry})`);
  }

  if (parts.length) el.attr('transform', parts.join(' '));
  else el.attr('transform', null);
}

/** Mark elements whose left/top live in SVG attrs (not the transform string). */
function markAbsPos(el: Element) {
  const geom = readGeom(el);
  if (geom) writeGeom(el, { ...geom, abs: true });
  else (el as any).__sceneAbsPos = true;
  return el;
}

function writeSceneSides(el: Element, sides: number) {
  const n = clampShapeSides(sides);
  const anyEl = el as any;
  anyEl.__sceneSides = n;
  if (typeof anyEl.attr === 'function') anyEl.attr('data-scene-sides', String(n));
}

function readSceneSides(el: any): number {
  const fromMem = Number(el?.__sceneSides);
  if (Number.isFinite(fromMem) && fromMem >= 3) return clampShapeSides(fromMem);
  const fromAttr = Number(
    typeof el?.attr === 'function' ? el.attr('data-scene-sides') : el?.getAttribute?.('data-scene-sides')
  );
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

type DrawCtx = { root: Svg; parent: Container };

/** Same-color hairline covers AA fringe on rotated fills under CSS camera scale. */
function coverRotatedFillFringe(
  el: Element,
  paint: ReturnType<typeof resolveFill>,
  stroke: string,
  strokeWidth: number,
  angleDeg: number
) {
  if (strokeWidth > 0 && stroke && stroke !== 'transparent') return;
  if (paint.kind !== 'solid' || !paint.color) return;
  if (Math.abs(angleDeg) <= 0.2) return;
  el.stroke({ color: paint.color, width: 0.75, linejoin: 'miter' });
}

function createRectLike(ctx: DrawCtx, document: any, node: any, nodeId: string, sceneNodeKey: string, shapeType?: string) {
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
  // Open side segments ignore align (not a closed path).
  const strokeOpen: ShapeStrokeOpts = { ...strokeFull, align: 'center' };

  if (showB && !showT && !showL && !showR && fillTransparent) {
    const line = parent.line(left, top + height, left + width, top + height);
    applyElementStroke(root, line, strokeOpen);
    line.fill('none');
    tagNode(line, nodeId, sceneNodeKey, shapeType, left, top, width, height);
    markAbsPos(line);
    applyMeta(line, left, top, meta, width, height);
    applyNodeShadow(root, line, node);
    return line;
  }

  const g = parent.group();
  const body = g.path(roundedRectPath(width, height, r));
  body.attr('data-radius-body', '1');
  applySvgFill(root, body, paint, `n-${nodeId}`);
  const hasRadius = Math.max(r.tl, r.tr, r.br, r.bl) > 0.5;
  // When corners are rounded, always stroke the rounded path.
  // Per-side line segments ignore radius and look like a sharp rectangular border.
  if ((allSides || hasRadius) && !noSides) {
    applyElementStroke(root, body, strokeFull, { hasOpaqueFill: !fillTransparent });
  } else {
    body.stroke('none');
  }

  if (!allSides && !noSides && !hasRadius) {
    if (showT) {
      const ln = g.line(0, 0, width, 0).fill('none');
      applyElementStroke(root, ln, strokeOpen);
    }
    if (showB) {
      const ln = g.line(0, height, width, height).fill('none');
      applyElementStroke(root, ln, strokeOpen);
    }
    if (showL) {
      const ln = g.line(0, 0, 0, height).fill('none');
      applyElementStroke(root, ln, strokeOpen);
    }
    if (showR) {
      const ln = g.line(width, 0, width, height).fill('none');
      applyElementStroke(root, ln, strokeOpen);
    }
  }

  // Position via transform translate (do not g.move — that fights rotate rewrite).
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
  // Freehand defaults to round caps/joins unless the user set attrs.
  const hasCapAttr = node.attrs?.strokeLinecap != null || node.attrs?.['stroke-linecap'] != null;
  const hasJoinAttr = node.attrs?.strokeLinejoin != null || node.attrs?.['stroke-linejoin'] != null;
  const strokeOpen: ShapeStrokeOpts = {
    ...strokeFull,
    align: 'center',
    linecap: hasCapAttr ? strokeFull.linecap : shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'arrow' ? 'round' : strokeFull.linecap,
    linejoin: hasJoinAttr ? strokeFull.linejoin : shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'arrow' ? 'round' : strokeFull.linejoin,
  };

  if (shapeType === 'line') {
    // Local horizontal shaft; free angle via attrs.angle (transform rotate).
    const mid = height / 2;
    const line = parent.line(0, mid, width, mid).fill('none');
    applyElementStroke(root, line, strokeOpen);
    tagNode(line, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(line, left, top, meta, width, height);
    applyNodeShadow(root, line, node);
    return line;
  }

  if (shapeType === 'arrow') {
    // Fixed head size — height only affects hit/selection pad, not wing span.
    const d = arrowLocalPath(width, height);
    const path = parent.path(d).fill('none');
    applyElementStroke(root, path, strokeOpen);
    tagNode(path, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(path, left, top, meta, width, height);
    applyNodeShadow(root, path, node);
    return path;
  }

  if (shapeType === 'circle') {
    // Local box 0..w / 0..h; world position via transform translate.
    const ellipse = parent.ellipse(width, height).move(0, 0);
    applySvgFill(root, ellipse, paint, `n-${nodeId}`);
    if (strokeWidth > 0 && stroke && stroke !== 'transparent') {
      applyElementStroke(root, ellipse, strokeFull, { hasOpaqueFill: !isTransparentFill(paint) });
    } else {
      ellipse.stroke('none');
      coverRotatedFillFringe(ellipse, paint, stroke, strokeWidth, Number(meta.angle) || 0);
    }
    tagNode(ellipse, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(ellipse, left, top, meta, width, height);
    applyNodeShadow(root, ellipse, node);
    return ellipse;
  }

  if (shapeType === 'triangle' || shapeType === 'star' || shapeType === 'polygon') {
    const cornerR = radiiFromAttrs(node.attrs);
    const sides = sidesFromAttrs(node.attrs);
    const d = roundedShapePath(shapeType, width, height, cornerR, sides);
    const path = parent.path(d);
    applySvgFill(root, path, paint, `n-${nodeId}`);
    applyElementStroke(root, path, strokeFull, { hasOpaqueFill: !isTransparentFill(paint) });
    tagNode(path, nodeId, 'shape', shapeType, left, top, width, height);
    if (shapeType === 'star' || shapeType === 'polygon') writeSceneSides(path, sides);
    applyMeta(path, left, top, meta, width, height);
    applyNodeShadow(root, path, node);
    return path;
  }

  if (shapeType === 'path' || shapeType === 'pen' || shapeType === 'pencil') {
    const d = node.attrs?.path || `M 0 0 L ${width} ${height}`;
    const closed = boolEffectAttr(node.attrs?.closed, false) || /\sZ\s*$/i.test(String(d).trim());
    const brushId = String(node.attrs?.brushStyle || 'solid');

    // Pencil strokes: centerline path + brushStyle → freehand outline or stamp tips.
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
        const g = parent.group();
        for (const p of samples) {
          if (!tinted) continue;
          const img = g.image(tinted);
          img.size(size, size);
          img.center(p.x, p.y);
        }
        // Invisible hit path so selection / erase still work.
        const hit = g
          .path(outlinePathFromPoints(pts, strokeWidth, 'solid'))
          .fill('transparent')
          .stroke({ width: 0 });
        hit.attr({ 'pointer-events': 'stroke' });
        tagNode(g, nodeId, 'shape', shapeType, left, top, width, height);
        applyMeta(g, left, top, meta, width, height);
        applyNodeShadow(root, g, node);
        return g;
      }

      const outline =
        pts.length >= 2 ? outlinePathFromPoints(pts, strokeWidth, brushId) : String(d);
      const path = parent.path(outline);
      path.fill(ink).stroke({ width: 0 });
      path.attr({ 'fill-rule': 'nonzero' });
      tagNode(path, nodeId, 'shape', shapeType, left, top, width, height);
      applyMeta(path, left, top, meta, width, height);
      applyNodeShadow(root, path, node);
      return path;
    }

    const fillPaint =
      shapeType === 'pen' && !closed
        ? ({ kind: 'none' } as const)
        : resolveFill(node, closed ? '#FFFFFF' : 'transparent');
    const baseD = String(d);
    const cornerR = closed ? radiiFromAttrs(node.attrs) : { tl: 0, tr: 0, br: 0, bl: 0 };
    const drawD = closed ? filletPathD(baseD, cornerR) : baseD;
    const path = parent.path(drawD);
    if (closed) {
      path.attr({ 'data-scene-base-path': baseD });
      (path as any).__sceneBasePath = baseD;
    }
    applySvgFill(root, path, fillPaint, `n-${nodeId}`);
    const fillRule = String(node.attrs?.['fill-rule'] || '');
    if (fillRule === 'evenodd' || fillRule === 'nonzero') {
      path.attr('fill-rule', fillRule);
    }
    applyElementStroke(root, path, closed ? strokeFull : strokeOpen, {
      hasOpaqueFill: closed && !isTransparentFill(fillPaint),
    });
    tagNode(path, nodeId, 'shape', shapeType, left, top, width, height);
    applyMeta(path, left, top, meta, width, height);
    applyNodeShadow(root, path, node);
    return path;
  }

  return createRectLike(ctx, document, node, nodeId, 'shape', 'rect');
}

export async function nodeToSvgElement(
  root: Svg,
  parent: Container,
  document: any,
  node: any,
  nodeId: string
): Promise<Element | null> {
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

    const wrapW = boxW > 8 ? boxW : Math.max(1, boxW);
    const visualLines =
      boxW > 8 ? wrapPlainTextLines(text || ' ', style, wrapW) : String(text || ' ').split('\n');
    const displayText = visualLines.join('\n') || ' ';

    /**
     * Local (0,0) + transform translate — dmove on SVG text fights tspan attrs and lags
     * behind the selection chrome while dragging.
     */
    const el = parent.text(displayText).font({
      family: toFabricFontFamily(style.fontFamily),
      size: style.fontSize,
      weight: String(style.fontWeight),
      style: style.fontStyle,
      anchor: align,
      leading: style.lineHeight || 1.4,
    });
    el.fill(style.fill || '#333333');
    if (style.letterSpacing) {
      el.attr({ 'letter-spacing': `${style.letterSpacing}px` });
    }
    const decoration = String(style.textDecoration || 'none').trim();
    if (decoration && decoration !== 'none') {
      el.attr({ 'text-decoration': decoration, 'text-decoration-line': decoration });
    }

    const measuredW = boxW > 1 ? boxW : Math.max(1, el.bbox().width);
    const measuredH = boxH > 1 ? boxH : Math.max(1, el.bbox().height);
    let localX = 0;
    if (align === 'middle') localX = measuredW / 2;
    else if (align === 'end') localX = measuredW;

    const lineHeight = Math.max(0.8, Number(style.lineHeight) || 1.4);
    const fontSize = Math.max(1, Number(style.fontSize) || 14);
    const lineCount = Math.max(1, visualLines.length);
    // Center the line box inside the selection height (avoids top- or bottom-heavy chrome).
    const originY = textVerticalOriginY(measuredH, fontSize, lineHeight, lineCount);

    el.attr({
      x: localX,
      y: originY,
      'dominant-baseline': 'text-before-edge',
      'alignment-baseline': 'before-edge',
    });
    try {
      const nodeEl = el.node as SVGTextElement;
      nodeEl.setAttribute('dominant-baseline', 'text-before-edge');
      const tspans = nodeEl.querySelectorAll('tspan');
      tspans.forEach((t, i) => {
        t.setAttribute('x', String(localX));
        if (i === 0) {
          t.removeAttribute('dy');
          t.setAttribute('y', String(originY));
        }
      });
    } catch {
      /* ignore */
    }
    tagNode(el, nodeId, 'text', undefined, left, top, measuredW, measuredH);
    const anyEl = el as any;
    anyEl.__sceneFontSize = fontSize;
    anyEl.__sceneLineHeight = lineHeight;
    anyEl.__sceneLineCount = lineCount;
    applyMeta(el, left, top, meta, measuredW, measuredH);
    applyNodeShadow(root, el, node);
    return el;
  }

  if (node.key === 'shape') return createShape(ctx, document, node, nodeId);
  if (node.key === 'rect') return createRectLike(ctx, document, node, nodeId, 'rect');

  if (node.key === 'image') {
    const src = node.attrs?.src;
    const processing = String(node.attrs?.processStatus || '') === 'running';
    if (!src && !processing) return null;
    const { left, top } = nodeLeftTop(document, node);
    const boxW = Math.max(1, Number(node.width) || 100);
    const boxH = Math.max(1, Number(node.height) || 100);
    const meta = objectMeta(node);
    const cssFilter = String(node.attrs?.cssFilter || '').trim();
    const cornerR = radiiFromAttrs(node.attrs);
    const clipD = roundedRectPath(boxW, boxH, cornerR);

    // Loading plate (fig.2): soft blue wash — status pill is HTML (ImageProcessOverlay).
    if (processing) {
      const g = parent.group();
      if (src) {
        const img = g.image(src).size(boxW, boxH).move(0, 0);
        img.opacity(0);
        if (cssFilter) img.attr('style', `filter: ${cssFilter}`);
      }
      const grad = (root as any).gradient('linear', (add: any) => {
        add.stop(0, '#B9CBDA');
        add.stop(0.55, '#D5DEE6');
        add.stop(1, '#E8ECF0');
      });
      if (typeof grad.from === 'function') grad.from(0, 0.5).to(1, 0.5);
      const plate = g.path(clipD).fill(grad).stroke({ color: '#A8C5E4', width: 1.5 });
      plate.attr('data-radius-body', '1');
      // Status pill is HTML (ImageProcessOverlay) so it stays screen-fixed at any zoom.

      tagNode(g, nodeId, 'image', undefined, left, top, boxW, boxH);
      applyMeta(g, left, top, meta, boxW, boxH);
      applyNodeShadow(root, g, node);
      return g;
    }

    // Always wrap in a group so corner-radius clip path can be live-updated.
    const g = parent.group();
    const img = g.image(src).size(boxW, boxH).move(0, 0);
    const clip = (root as any).clip();
    const clipPath = clip.path(clipD);
    clipPath.attr('data-radius-clip', '1');
    img.clipWith(clip);
    g.attr('data-radius-clip-id', String(clip.id?.() ?? clip.attr?.('id') ?? ''));
    (g as any).__sceneCornerRadii = { ...cornerR };
    tagNode(g, nodeId, 'image', undefined, left, top, boxW, boxH);
    applyMeta(g, left, top, meta, boxW, boxH);
    applyNodeShadow(root, g, node);
    // Apply after shadow — applyNodeShadow clears `filter` when there is no drop-shadow.
    if (cssFilter && cssFilter !== 'none') {
      const shadowFilter = String((g as any).css?.('filter') || '').trim();
      const combined =
        shadowFilter && shadowFilter !== 'none'
          ? `${cssFilter} ${shadowFilter}`
          : cssFilter;
      (g as any).css?.('filter', combined);
      if (!(g as any).css) g.attr('style', `filter: ${combined}`);
    }
    return g;
  }

  return null;
}

export async function loadSceneOntoSvg(
  root: Svg,
  layer: Container,
  document: any,
  loadSeq = 0,
  boardMeta?: { loadSeq?: number }
) {
  if (!root || !layer || !document?.deltaSetLike?.ROOT) {
    return new Map<string, Element>();
  }

  const w = Math.round(document.width || 794);
  const h = Math.round(document.height || 1123);
  root.size(w, h).viewbox(0, 0, w, h);
  layer.clear();

  // Infinite-canvas embeds pass transparent doc bg — skip world rect so frame fills show.
  const docBg = resolveDocumentBackground(document);
  if (!isTransparentFill(docBg)) {
    const bg = layer.rect(w, h).move(0, 0);
    bg.attr({ 'data-scene-bg': '1', 'pointer-events': 'none' });
    applySvgFill(root, bg, docBg, 'doc-bg');
  }

  const children: string[] = document.deltaSetLike.ROOT.children || [];
  const nodeEls = new Map<string, Element>();

  for (const nodeId of children) {
    if (boardMeta && loadSeq && boardMeta.loadSeq !== loadSeq) return nodeEls;
    const node = document.deltaSetLike[nodeId];
    try {
      const el = await nodeToSvgElement(root, layer, document, node, nodeId);
      // Superseded loads must drop the just-appended node — otherwise it stays as an
      // unmapped "ghost" at the stale position (common after move grows the world surface).
      if (boardMeta && loadSeq && boardMeta.loadSeq !== loadSeq) {
        try {
          el?.remove();
        } catch {
          /* ignore */
        }
        return nodeEls;
      }
      if (el) nodeEls.set(nodeId, el);
    } catch (err) {
      console.error('nodeToSvgElement failed', nodeId, err);
    }
  }

  return nodeEls;
}

/**
 * Remove duplicate DOM nodes for a scene id, keeping `keep` (or the last match).
 * Racey async load/replace can leave same-id copies that are not in `nodeEls`.
 */
export function dedupeSceneNode(
  layer: Container,
  nodeId: string,
  keep?: Element | null
) {
  try {
    const root = (layer as any).node as SVGElement | undefined;
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const keepDom = keep ? ((keep as any).node as SVGElement | undefined) : undefined;
    const matches = [...root.querySelectorAll('[data-scene-node-id]')].filter(
      (n) => n.getAttribute('data-scene-node-id') === nodeId
    );
    if (matches.length <= 1) return;
    const survivor =
      keepDom && matches.includes(keepDom) ? keepDom : matches[matches.length - 1];
    matches.forEach((n) => {
      if (n === survivor) return;
      n.parentNode?.removeChild(n);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Drop any tagged layer nodes that are not the mapped `nodeEls` entry
 * (or not in `validIds`). Clears move/draw ghosts that lost their map entry.
 */
export function purgeOrphanSceneNodes(
  layer: Container,
  nodeEls: Map<string, Element>,
  validIds?: Iterable<string>
) {
  try {
    const root = (layer as any).node as SVGElement | undefined;
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const allowed = validIds ? new Set(validIds) : null;
    root.querySelectorAll('[data-scene-node-id]').forEach((n) => {
      const id = n.getAttribute('data-scene-node-id');
      if (!id) return;
      if (allowed && !allowed.has(id)) {
        n.parentNode?.removeChild(n);
        return;
      }
      const keep = nodeEls.get(id) as any;
      const keepDom = keep?.node as SVGElement | undefined;
      if (keepDom && n !== keepDom) {
        n.parentNode?.removeChild(n);
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * Live corner-radius preview — rewrite path `d` in place (no node replace).
 */
export function previewSvgNodeRadii(
  nodeEls: Map<string, Element>,
  nodeId: string,
  radii: CornerRadii
): boolean {
  const el = nodeEls.get(nodeId) as any;
  if (!el) return false;
  const geom = readGeom(el);
  if (!geom) return false;

  const shapeType = String(el.sceneShapeType || el.attr?.('data-scene-shape-type') || '');

  const setPathD = (target: any, d: string) => {
    if (!target || !d) return false;
    if (typeof target.plot === 'function') {
      target.plot(d);
      return true;
    }
    if (typeof target.attr === 'function') {
      target.attr('d', d);
      return true;
    }
    const dom = target.node as SVGElement | undefined;
    if (dom?.setAttribute) {
      dom.setAttribute('d', d);
      return true;
    }
    return false;
  };

  const findRadiusPath = () => {
    const clipId = String(el.attr?.('data-radius-clip-id') || '');
    if (clipId) {
      const rootSvg = typeof el.root === 'function' ? el.root() : null;
      const clipHost =
        (rootSvg && typeof rootSvg.findOne === 'function' ? rootSvg.findOne(`#${clipId}`) : null) ||
        (typeof document !== 'undefined' ? document.getElementById(clipId) : null);
      if (clipHost) {
        const fromSvg =
          typeof (clipHost as any).findOne === 'function'
            ? (clipHost as any).findOne('[data-radius-clip="1"]') || (clipHost as any).findOne('path')
            : null;
        if (fromSvg) return fromSvg;
        const hostNode = (clipHost as any).node || clipHost;
        const fromDom =
          (hostNode as SVGElement).querySelector?.('[data-radius-clip="1"]') ||
          (hostNode as SVGElement).querySelector?.('path');
        if (fromDom) {
          return {
            node: fromDom,
            attr: (k: string, v?: string) => {
              if (v === undefined) return (fromDom as SVGElement).getAttribute(k);
              (fromDom as SVGElement).setAttribute(k, v);
            },
            plot: (d: string) => (fromDom as SVGElement).setAttribute('d', d),
          };
        }
      }
    }
    if (typeof el.findOne === 'function') {
      return (
        el.findOne('[data-radius-clip="1"]') ||
        el.findOne('[data-radius-body="1"]') ||
        el.findOne('path') ||
        null
      );
    }
    const dom = el.node as SVGElement | undefined;
    return (
      (dom?.querySelector?.('[data-radius-clip="1"]') as any) ||
      (dom?.querySelector?.('[data-radius-body="1"]') as any) ||
      (dom?.querySelector?.(':scope > path') as any) ||
      (dom?.tagName?.toLowerCase() === 'path' ? el : null)
    );
  };

  if (shapeType === 'triangle' || shapeType === 'star' || shapeType === 'polygon') {
    const d = roundedShapePath(shapeType, geom.width, geom.height, radii, readSceneSides(el));
    if (el.node?.tagName?.toLowerCase() === 'path') return setPathD(el, d);
    return setPathD(findRadiusPath() || el, d);
  }

  if (shapeType === 'path' || shapeType === 'pen') {
    const base =
      String(el.__sceneBasePath || '') ||
      String(el.attr?.('data-scene-base-path') || '') ||
      '';
    if (!base) return false;
    const d = filletPathD(base, radii);
    if (el.node?.tagName?.toLowerCase() === 'path') return setPathD(el, d);
    return setPathD(findRadiusPath() || el, d);
  }

  const d = roundedRectPath(geom.width, geom.height, radii);
  const body = findRadiusPath();
  if (setPathD(body, d)) {
    if (String(el.sceneNodeKey || '') === 'image') {
      el.__sceneCornerRadii = { ...radii };
    }
    return true;
  }

  // Rect-like group: first path body.
  const first = typeof el.first === 'function' ? el.first() : null;
  if (setPathD(first, d)) return true;

  const dom = el.node as SVGElement | undefined;
  const pathEl =
    dom?.tagName?.toLowerCase() === 'path'
      ? dom
      : (dom?.querySelector?.(':scope > path') as SVGPathElement | null);
  if (!pathEl) return false;
  pathEl.setAttribute('d', d);
  return true;
}

/** Clear live-resize scale base so the next drag starts clean. */
export function clearSceneDragPreview(nodeEls: Map<string, Element>, nodeId: string) {
  const el = nodeEls.get(nodeId) as any;
  if (!el) return;
  delete el.__sceneDragBaseW;
  delete el.__sceneDragBaseH;
  delete el.__sceneDragBaseFontSize;
  delete el.__sceneDragBaseLetterSpacing;
  delete el.__sceneDidResize;
}

/**
 * Live-resize text by scaling font-size in place (no transform scale).
 * Avoids flicker: transform-scale preview → commit rebuild at old fontSize.
 */
function previewResizeText(
  el: any,
  box: { left: number; top: number; width: number; height: number }
): boolean {
  if (String(el.sceneNodeKey || '') !== 'text') return false;

  const geom = readGeom(el);
  if (!geom) return false;

  if (!el.__sceneDragBaseW) {
    el.__sceneDragBaseW = geom.width;
    el.__sceneDragBaseH = geom.height;
    let fontSize = Number(el.__sceneFontSize);
    if (!(fontSize > 0) && typeof el.font === 'function') {
      try {
        fontSize = Number(el.font('size'));
      } catch {
        fontSize = 0;
      }
    }
    if (!(fontSize > 0)) {
      fontSize = Number(String(el.attr?.('font-size') || '').replace(/px$/i, '')) || 14;
    }
    el.__sceneDragBaseFontSize = fontSize;
    const lsRaw = String(el.attr?.('letter-spacing') || '0').replace(/px$/i, '');
    el.__sceneDragBaseLetterSpacing = Number(lsRaw) || 0;
  }

  const bw = Math.max(1, Number(el.__sceneDragBaseW) || geom.width);
  const bh = Math.max(1, Number(el.__sceneDragBaseH) || geom.height);
  const sy = box.height / bh;
  const fontSize = Math.max(1, Number(el.__sceneDragBaseFontSize) * sy);
  const lineHeight = Math.max(0.8, Number(el.__sceneLineHeight) || 1.4);
  const lineCount = Math.max(1, Number(el.__sceneLineCount) || 1);
  const originY = textVerticalOriginY(box.height, fontSize, lineHeight, lineCount);

  const anchor = String(el.attr?.('text-anchor') || 'start');
  let localX = 0;
  if (anchor === 'middle') localX = box.width / 2;
  else if (anchor === 'end') localX = box.width;

  if (typeof el.font === 'function') {
    el.font({ size: fontSize });
  } else if (typeof el.attr === 'function') {
    el.attr('font-size', fontSize);
  }
  el.__sceneFontSize = fontSize;

  const baseLs = Number(el.__sceneDragBaseLetterSpacing) || 0;
  if (baseLs || el.attr?.('letter-spacing') != null) {
    el.attr('letter-spacing', `${baseLs * sy}px`);
  }

  el.attr({
    x: localX,
    y: originY,
    'dominant-baseline': 'text-before-edge',
    'alignment-baseline': 'before-edge',
  });
  try {
    const nodeEl = el.node as SVGTextElement;
    nodeEl.setAttribute('dominant-baseline', 'text-before-edge');
    const tspans = nodeEl.querySelectorAll('tspan');
    tspans.forEach((t, i) => {
      if (i === 0) {
        t.removeAttribute('dy');
        t.setAttribute('y', String(originY));
        t.removeAttribute('x');
      }
    });
  } catch {
    /* ignore */
  }

  // In-place typography sync — do not flag for async replace (that causes flash).
  el.__sceneDidResize = false;
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

/**
 * Live-resize images by updating `<image>` size + clip path in place.
 * Never use transform-scale or async replace — both flash as the bitmap reloads.
 */
function previewResizeImage(
  el: any,
  box: { left: number; top: number; width: number; height: number }
): boolean {
  if (String(el.sceneNodeKey || el.attr?.('data-scene-node-key') || '') !== 'image') {
    return false;
  }

  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);

  const findImage = (): any => {
    if (typeof el.findOne === 'function') {
      return el.findOne('image') || el.findOne('img') || null;
    }
    const dom = el.node as SVGElement | undefined;
    return dom?.querySelector?.('image, img') || null;
  };

  const img = findImage();
  if (img) {
    if (typeof img.size === 'function') {
      img.size(w, h).move?.(0, 0);
    } else if (typeof img.attr === 'function') {
      img.attr({ width: w, height: h, x: 0, y: 0 });
    } else if ((img as SVGElement).setAttribute) {
      const node = img as SVGElement;
      node.setAttribute('width', String(w));
      node.setAttribute('height', String(h));
      node.setAttribute('x', '0');
      node.setAttribute('y', '0');
    }
  }

  // Prefer stored radii from image create (absolute px); fall back to sharp rect.
  const stored = el.__sceneCornerRadii as CornerRadii | undefined;
  const radii: CornerRadii = stored
    ? {
        tl: Number(stored.tl) || 0,
        tr: Number(stored.tr) || 0,
        br: Number(stored.br) || 0,
        bl: Number(stored.bl) || 0,
      }
    : { tl: 0, tr: 0, br: 0, bl: 0 };
  const clipD = roundedRectPath(w, h, radii);

  const setPathD = (target: any, d: string) => {
    if (!target || !d) return false;
    if (typeof target.plot === 'function') {
      target.plot(d);
      return true;
    }
    if (typeof target.attr === 'function') {
      target.attr('d', d);
      return true;
    }
    const dom = target.node as SVGElement | undefined;
    if (dom?.setAttribute) {
      dom.setAttribute('d', d);
      return true;
    }
    if ((target as SVGElement).setAttribute) {
      (target as SVGElement).setAttribute('d', d);
      return true;
    }
    return false;
  };

  const clipId = String(el.attr?.('data-radius-clip-id') || '');
  if (clipId) {
    const rootSvg = typeof el.root === 'function' ? el.root() : null;
    const clipHost =
      (rootSvg && typeof rootSvg.findOne === 'function' ? rootSvg.findOne(`#${clipId}`) : null) ||
      (typeof document !== 'undefined' ? document.getElementById(clipId) : null);
    if (clipHost) {
      const pathEl =
        (typeof (clipHost as any).findOne === 'function'
          ? (clipHost as any).findOne('[data-radius-clip="1"]') || (clipHost as any).findOne('path')
          : null) ||
        ((clipHost as any).node || clipHost)?.querySelector?.('[data-radius-clip="1"], path');
      setPathD(pathEl, clipD);
    }
  } else if (typeof el.findOne === 'function') {
    setPathD(el.findOne('[data-radius-clip="1"]'), clipD);
  }

  // In-place — do not flag for replaceSvgNode (recreating <image> flashes).
  el.__sceneDidResize = false;
  delete el.__sceneDragBaseW;
  delete el.__sceneDragBaseH;
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

/** Live rotation preview — update transform in place (no async node replace). */
export function previewSvgNodeAngle(
  nodeEls: Map<string, Element>,
  nodeId: string,
  angleDeg: number
): boolean {
  const el = nodeEls.get(nodeId) as any;
  if (!el) return false;
  const geom = readGeom(el);
  if (!geom) return false;

  el.__sceneAngle = angleDeg;
  const baseW = Number(el.__sceneDragBaseW);
  const baseH = Number(el.__sceneDragBaseH);
  if (el.__sceneDidResize && baseW > 0 && baseH > 0) {
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

/**
 * Transform with optional non-uniform scale from the drag-start box
 * (local geometry stays at base size; scale provides real-time resize).
 */
function reapplySceneTransformScaled(
  el: Element,
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

  if (parts.length) el.attr('transform', parts.join(' '));
  else el.attr('transform', null);
}

/**
 * Sync move/resize preview without tearing the node out of the DOM
 * (avoids canvas/background flash while dragging).
 * Returns true when applied; false when caller should full-replace.
 * Size changes use a temporary scale from the drag-start box (real-time resize).
 */
/** Live-resize local geometry (path / ellipse / line) without transform scale jitter. */
function previewResizeLocalGeometry(el: Element, width: number, height: number): boolean {
  const anyEl = el as any;
  const shapeType = String(anyEl.sceneShapeType || anyEl.attr?.('data-scene-shape-type') || '');

  if (isCustomPathShape(shapeType)) return false;

  if (shapeType === 'line') {
    const mid = Math.max(1, height) / 2;
    if (typeof anyEl.plot === 'function') {
      anyEl.plot(0, mid, width, mid);
      return true;
    }
    if (typeof anyEl.attr === 'function') {
      anyEl.attr({ x1: 0, y1: mid, x2: width, y2: mid });
      return true;
    }
    return false;
  }

  if (shapeType === 'arrow') {
    const d = arrowLocalPath(width, height);
    if (anyEl.node?.tagName?.toLowerCase() === 'path') {
      if (typeof anyEl.plot === 'function') {
        anyEl.plot(d);
        return true;
      }
      if (typeof anyEl.attr === 'function') {
        anyEl.attr('d', d);
        return true;
      }
    }
    return false;
  }

  if (shapeType === 'circle') {
    if (typeof anyEl.size === 'function') {
      anyEl.size(width, height);
      return true;
    }
    if (typeof anyEl.attr === 'function') {
      anyEl.attr({ rx: width / 2, ry: height / 2 });
      return true;
    }
  }

  const zeroR = { tl: 0, tr: 0, br: 0, bl: 0, linked: true as const };
  const setPathD = (target: any, d: string) => {
    if (!target || !d) return false;
    if (typeof target.plot === 'function') {
      target.plot(d);
      return true;
    }
    if (typeof target.attr === 'function') {
      target.attr('d', d);
      return true;
    }
    return false;
  };

  if (shapeType === 'triangle' || shapeType === 'star' || shapeType === 'polygon') {
    const d = roundedShapePath(shapeType, width, height, zeroR, readSceneSides(anyEl));
    if (anyEl.node?.tagName?.toLowerCase() === 'path') return setPathD(anyEl, d);
    const path = typeof anyEl.findOne === 'function' ? anyEl.findOne('path') : null;
    return setPathD(path, d);
  }

  // Only rewrite path `d` for true path-backed rects — never invent a rect path on
  // foreign tags (that used to no-op, then fall through to scale and leave ghosts).
  if (shapeType === 'rect' || shapeType === 'roundRect' || shapeType === '') {
    const d = roundedRectPath(width, height, zeroR);
    if (anyEl.node?.tagName?.toLowerCase() === 'path') return setPathD(anyEl, d);
    const path = typeof anyEl.findOne === 'function' ? anyEl.findOne('path') : null;
    return setPathD(path, d);
  }

  return false;
}

export function previewSvgNodeGeometry(
  nodeEls: Map<string, Element>,
  nodeId: string,
  box: { left: number; top: number; width: number; height: number }
): boolean {
  const el = nodeEls.get(nodeId) as any;
  if (!el) return false;

  // Images always resize in place (size + clip), regardless of abs/local geom mode.
  if (String(el.sceneNodeKey || el.attr?.('data-scene-node-key') || '') === 'image') {
    return previewResizeImage(el, box);
  }

  const geom = readGeom(el);
  if (!geom) return false;

  const sameSize =
    Math.abs(geom.width - box.width) < 0.5 && Math.abs(geom.height - box.height) < 0.5;
  const samePos =
    Math.abs(geom.left - box.left) < 0.5 && Math.abs(geom.top - box.top) < 0.5;

  if (geom.abs && sameSize && !samePos) {
    const dx = box.left - geom.left;
    const dy = box.top - geom.top;
    if ((dx || dy) && typeof el.dmove === 'function') {
      el.dmove(dx, dy);
    }
    writeGeom(el, { ...geom, left: box.left, top: box.top });
    return true;
  }

  if (!geom.abs) {
    const shapeType = String(el.sceneShapeType || el.attr?.('data-scene-shape-type') || '');
    const isStrokeShape = shapeType === 'line' || shapeType === 'arrow';
    const isText = String(el.sceneNodeKey || el.attr?.('data-scene-node-key') || '') === 'text';

    // Text: scale font-size in place — never transform-scale (flickers on commit).
    if (isText) {
      return previewResizeText(el, box);
    }

    if (!sameSize && isCustomPathShape(shapeType)) {
      if (!el.__sceneDragBaseW) {
        el.__sceneDragBaseW = geom.width;
        el.__sceneDragBaseH = geom.height;
      }
      el.__sceneDidResize = true;
      const bw = Math.max(1, Number(el.__sceneDragBaseW) || geom.width);
      const bh = Math.max(1, Number(el.__sceneDragBaseH) || geom.height);
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

    // Line/arrow: always rewrite local shaft (never scale) — scale left ghost strokes.
    if (isStrokeShape) {
      el.__sceneDidResize = !sameSize;
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

    el.__sceneDidResize = !sameSize;
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
      if (!el.__sceneDragBaseW) {
        el.__sceneDragBaseW = geom.width;
        el.__sceneDragBaseH = geom.height;
      }
      el.__sceneDidResize = true;
      const bw = Math.max(1, Number(el.__sceneDragBaseW) || geom.width);
      const bh = Math.max(1, Number(el.__sceneDragBaseH) || geom.height);
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
    if (!el.__sceneDragBaseW) {
      el.__sceneDragBaseW = geom.width;
      el.__sceneDragBaseH = geom.height;
    }
    el.__sceneDidResize = true;
    const bw = Math.max(1, Number(el.__sceneDragBaseW) || geom.width);
    const bh = Math.max(1, Number(el.__sceneDragBaseH) || geom.height);
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

/** Drop every layer child tagged with this scene node id (clears race ghosts). */
function removeSceneNodesById(layer: Container, nodeId: string) {
  try {
    const root = (layer as any).node as SVGElement | undefined;
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-scene-node-id]').forEach((n) => {
      if (n.getAttribute('data-scene-node-id') !== nodeId) return;
      n.parentNode?.removeChild(n);
    });
  } catch {
    /* ignore */
  }
}

const replaceGenByMap = new WeakMap<object, Map<string, number>>();

/** Replace a node — build new first, swap, and cancel superseded async calls. */
export async function replaceSvgNode(
  root: Svg,
  layer: Container,
  document: any,
  nodeEls: Map<string, Element>,
  nodeId: string
) {
  let gens = replaceGenByMap.get(nodeEls);
  if (!gens) {
    gens = new Map();
    replaceGenByMap.set(nodeEls, gens);
  }
  const gen = (gens.get(nodeId) || 0) + 1;
  gens.set(nodeId, gen);

  // Remove ghosts + mapped el up front so concurrent replaces cannot pile up.
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
  // nodeToSvgElement already appends into `layer` — do not call removeSceneNodesById
  // afterward or the brand-new node (incl. fill paint) is detached from the DOM.
  const el = await nodeToSvgElement(root, layer, document, node, nodeId);
  if (gens.get(nodeId) !== gen) {
    try {
      el?.remove();
    } catch {
      /* ignore */
    }
    return;
  }
  if (!el) return;
  // Drop any same-id copies that raced in while we were building.
  dedupeSceneNode(layer, nodeId, el);
  nodeEls.set(nodeId, el);
}

export function createSvgBoard(host: HTMLElement, width: number, height: number) {
  host.innerHTML = '';
  const root = SVG().addTo(host).size(width, height).viewbox(0, 0, width, height);
  root.attr({
    preserveAspectRatio: 'xMidYMid meet',
    // Prefer smooth AA on rotated edges (avoids crispEdges stair-steps).
    'shape-rendering': 'geometricPrecision',
  });
  root.css({
    display: 'block',
    overflow: 'visible',
    width: '100%',
    height: '100%',
    // Promote to its own layer so CSS camera scale re-rasters less harshly.
    transform: 'translateZ(0)',
  });
  const layer = root.group().attr({ id: 'scene-layer' });
  return { root, layer };
}
