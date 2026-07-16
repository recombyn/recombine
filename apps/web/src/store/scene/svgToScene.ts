import { fillAttrsFromElement } from '@/store/scene/sceneFill';
import {
  buildTextAttrs,
  buildTextAttrsPreservingMarkdown,
  measureWrappedTextSize,
  parseNodeText,
  parseNodeTextStyle,
} from '@/store/scene/sceneText';
import { markdownToPlain } from '@/store/scene/sceneMarkdown';
import { getActivePage, normalizeDocument, syncRootChildren } from '@/store/scene/sceneDocument';
import { isCustomPathShape, scalePathData } from '@/store/scene/pathScale';

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Scene left/top �?document node x/y (adds page origin). */
export function sceneToDocumentCoords(document: any, left: number, top: number) {
  return {
    x: num(left, 0) + num(document?.x, 0),
    y: num(top, 0) + num(document?.y, 0),
  };
}

export type SvgSceneObject = {
  sceneNodeId: string;
  sceneNodeKey: string;
  sceneShapeType?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  angle?: number;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  text?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
  fontFamily?: string;
  fontStyle?: string;
  textAlign?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: string;
  src?: string;
};

function preserveVisualAttrs(prev: any = {}, obj: SvgSceneObject) {
  return {
    opacity: obj.opacity ?? prev.opacity ?? 1,
    angle: obj.angle ?? prev.angle ?? 0,
    flipX: obj.flipX ? 'true' : 'false',
    flipY: obj.flipY ? 'true' : 'false',
    'border-width':
      prev['border-width'] != null && prev['border-width'] !== ''
        ? prev['border-width']
        : 1,
    radiusTL: prev.radiusTL ?? 0,
    radiusTR: prev.radiusTR ?? 0,
    radiusBR: prev.radiusBR ?? 0,
    radiusBL: prev.radiusBL ?? 0,
    radiusLinked: prev.radiusLinked ?? 'true',
    L: prev.L ?? 'true',
    R: prev.R ?? 'true',
    T: prev.T ?? 'true',
    B: prev.B ?? 'true',
  };
}

function paintAttrs(prevAttrs: Record<string, any> = {}) {
  const fill = fillAttrsFromElement(null, prevAttrs);
  return {
    ...fill,
    'border-color':
      prevAttrs['border-color'] != null && prevAttrs['border-color'] !== ''
        ? prevAttrs['border-color']
        : '#333333',
    ...(prevAttrs['stroke-enabled'] != null ? { 'stroke-enabled': prevAttrs['stroke-enabled'] } : {}),
    ...(prevAttrs['stroke-visible'] != null ? { 'stroke-visible': prevAttrs['stroke-visible'] } : {}),
    ...(prevAttrs['stroke-opacity'] != null ? { 'stroke-opacity': prevAttrs['stroke-opacity'] } : {}),
    ...(prevAttrs.strokeStyle != null ? { strokeStyle: prevAttrs.strokeStyle } : {}),
  };
}

export function svgObjectsToScene(document: any, objects: SvgSceneObject[]) {
  const next = normalizeDocument(document);
  const rootChildren: string[] = [];

  objects.forEach((obj) => {
    const nodeId = obj.sceneNodeId;
    if (!nodeId) return;
    const key = obj.sceneNodeKey || 'text';
    const prev = document.deltaSetLike?.[nodeId];
    const visual = preserveVisualAttrs(prev?.attrs, obj);
    const { x, y } = sceneToDocumentCoords(document, obj.left, obj.top);

    if (key === 'text') {
      const prevStyle = parseNodeTextStyle(prev?.attrs || {});
      const style = {
        fontSize: obj.fontSize || prevStyle.fontSize || 14,
        fill: obj.fill || prevStyle.fill || '#333333',
        fontWeight: obj.fontWeight || prevStyle.fontWeight || 'normal',
        fontFamily: obj.fontFamily || prevStyle.fontFamily,
        fontStyle: obj.fontStyle || prevStyle.fontStyle || 'normal',
        textAlign: obj.textAlign || prevStyle.textAlign || 'left',
        lineHeight: obj.lineHeight || prevStyle.lineHeight || 1.4,
        letterSpacing: obj.letterSpacing ?? prevStyle.letterSpacing ?? 0,
        textDecoration: obj.textDecoration || prevStyle.textDecoration || 'none',
      };
      const plain = obj.text || '';
      const prevMd = prev?.attrs?.markdown;
      const textAttrs: Record<string, unknown> = { ...buildTextAttrs(plain, style) };
      if (typeof prevMd === 'string' && markdownToPlain(prevMd) === plain) {
        textAttrs.markdown = prevMd;
      } else {
        textAttrs.markdown = plain;
      }
      next.deltaSetLike[nodeId] = {
        id: nodeId,
        key: 'text',
        x,
        y,
        z: 0,
        width: Math.max(obj.width, 1),
        height: Math.max(obj.height, 1),
        attrs: {
          ...textAttrs,
          opacity: visual.opacity,
          angle: visual.angle,
          flipX: visual.flipX,
          flipY: visual.flipY,
        },
        children: [],
      };
    } else if (key === 'rect') {
      next.deltaSetLike[nodeId] = {
        id: nodeId,
        key: 'rect',
        x,
        y,
        z: 0,
        width: Math.max(obj.width, 1),
        height: Math.max(obj.height, 1),
        attrs: {
          ...visual,
          ...paintAttrs({
            ...prev?.attrs,
            'fill-color': prev?.attrs?.['fill-color'] || 'transparent',
          }),
        },
        children: [],
      };
    } else if (key === 'shape') {
      next.deltaSetLike[nodeId] = {
        id: nodeId,
        key: 'shape',
        x,
        y,
        z: 0,
        width: Math.max(obj.width, 1),
        height: Math.max(obj.height, 1),
        attrs: {
          ...visual,
          shapeType: obj.sceneShapeType || prev?.attrs?.shapeType || 'rect',
          ...paintAttrs({
            ...prev?.attrs,
            'fill-color': prev?.attrs?.['fill-color'] || '#FFFFFF',
          }),
          ...(prev?.attrs?.path ? { path: prev.attrs.path } : {}),
          ...(prev?.attrs?.closed != null ? { closed: prev.attrs.closed } : {}),
          ...(prev?.attrs?.sides != null ? { sides: prev.attrs.sides } : {}),
          ...(prev?.attrs?.brushStyle != null ? { brushStyle: prev.attrs.brushStyle } : {}),
          ...(prev?.attrs?.brushStampSrc != null
            ? { brushStampSrc: prev.attrs.brushStampSrc }
            : {}),
        },
        children: [],
      };
    } else if (key === 'image') {
      next.deltaSetLike[nodeId] = {
        id: nodeId,
        key: 'image',
        x,
        y,
        z: 0,
        width: Math.max(obj.width, 1),
        height: Math.max(obj.height, 1),
        attrs: {
          src: obj.src || prev?.attrs?.src || '',
          mode: prev?.attrs?.mode || 'FIT',
          opacity: visual.opacity,
          angle: visual.angle,
          flipX: visual.flipX,
          flipY: visual.flipY,
        },
        children: [],
      };
    }

    rootChildren.push(nodeId);
  });

  next.deltaSetLike.ROOT.children = rootChildren;
  const page = getActivePage(next);
  if (page) page.children = [...rootChildren];
  return syncRootChildren(next);
}

/** Read placed node boxes from the SVG board into a scene document. */
export function syncSvgBoardToDocument(
  document: any,
  nodeEls: Map<string, any>,
  order: string[]
) {
  const objects: SvgSceneObject[] = [];
  for (const nodeId of order) {
    const el = nodeEls.get(nodeId);
    if (!el) continue;
    const bbox = typeof el.bbox === 'function' ? el.bbox() : { x: 0, y: 0, width: 1, height: 1 };
    const node = document.deltaSetLike?.[nodeId];
    const left = num(el.x?.() ?? el.attr?.('x') ?? bbox.x, bbox.x);
    const top = num(el.y?.() ?? el.attr?.('y') ?? bbox.y, bbox.y);
    objects.push({
      sceneNodeId: nodeId,
      sceneNodeKey: el.sceneNodeKey || node?.key || 'shape',
      sceneShapeType: el.sceneShapeType || node?.attrs?.shapeType,
      left: Number.isFinite(el.__sceneLeft) ? el.__sceneLeft : left,
      top: Number.isFinite(el.__sceneTop) ? el.__sceneTop : top,
      width: Number.isFinite(el.sceneWidth) ? el.sceneWidth : Math.max(bbox.width, 1),
      height: Number.isFinite(el.sceneHeight) ? el.sceneHeight : Math.max(bbox.height, 1),
      angle: num(node?.attrs?.angle, 0),
      opacity: num(node?.attrs?.opacity, 1),
      flipX: node?.attrs?.flipX === true || node?.attrs?.flipX === 'true',
      flipY: node?.attrs?.flipY === true || node?.attrs?.flipY === 'true',
      text: node?.key === 'text' ? String(el.text?.() ?? node?.attrs?.text ?? '') : undefined,
      src: node?.attrs?.src,
      fontSize: node?.attrs?.fontSize,
      fill: node?.attrs?.['fill-color'] || node?.attrs?.fill,
      fontFamily: node?.attrs?.fontFamily,
      fontWeight: node?.attrs?.fontWeight,
      fontStyle: node?.attrs?.fontStyle,
      textAlign: node?.attrs?.textAlign,
      lineHeight: node?.attrs?.lineHeight,
      letterSpacing: node?.attrs?.letterSpacing,
    });
  }
  return svgObjectsToScene(document, objects);
}

/** Patch a single node's geometry from selection chrome — document. */
export function patchNodeGeometry(
  document: any,
  nodeId: string,
  geometry: { left: number; top: number; width: number; height: number },
  options?: { fitTextBox?: boolean }
) {
  const next = normalizeDocument(document);
  const node = next.deltaSetLike?.[nodeId];
  if (!node) return next;
  const { x, y } = sceneToDocumentCoords(next, geometry.left, geometry.top);
  const oldW = Math.max(1, Number(node.width) || 1);
  const oldH = Math.max(1, Number(node.height) || 1);
  // Pixel grid: positions and sizes stay on whole pixels (no subpixel drift / .5 gaps).
  let newW = Math.max(1, Math.round(geometry.width));
  let newH = Math.max(1, Math.round(geometry.height));
  const ix = Math.round(x);
  const iy = Math.round(y);

  let attrs = node.attrs;
  const shapeType = String(node.attrs?.shapeType || '');
  const pathD = node.attrs?.path != null ? String(node.attrs.path) : '';
  if (
    isCustomPathShape(shapeType) &&
    pathD &&
    (Math.abs(newW - oldW) > 0.5 || Math.abs(newH - oldH) > 0.5)
  ) {
    attrs = {
      ...node.attrs,
      path: scalePathData(pathD, newW / oldW, newH / oldH),
    };
  }

  // Text: scale typography with height. On commit (`fitTextBox`), remasure height
  // so the selection chrome hugs wrapped ink — keep the dragged width for wrapping.
  if (
    node.key === 'text' &&
    (Math.abs(newW - oldW) > 0.5 || Math.abs(newH - oldH) > 0.5)
  ) {
    let style = parseNodeTextStyle(attrs || node.attrs || {});
    const sy = newH / oldH;
    if (Math.abs(sy - 1) > 1e-4) {
      const nextSize = Math.max(1, Math.round(style.fontSize * sy * 100) / 100);
      const nextSpacing = Math.round(style.letterSpacing * sy * 1000) / 1000;
      style = { ...style, fontSize: nextSize, letterSpacing: nextSpacing };
      attrs = {
        ...(attrs || node.attrs),
        ...buildTextAttrsPreservingMarkdown(node.attrs || {}, {
          fontSize: nextSize,
          letterSpacing: nextSpacing,
        }),
      };
    }
    if (options?.fitTextBox) {
      const plain = parseNodeText(attrs || node.attrs || {}) || ' ';
      const measured = measureWrappedTextSize(plain, style, Math.max(24, newW));
      newW = Math.max(1, measured.width);
      newH = Math.max(1, measured.height);
    }
  }

  next.deltaSetLike[nodeId] = {
    ...node,
    attrs,
    x: ix,
    y: iy,
    width: newW,
    height: newH,
  };
  return next;
}

/** Move/resize multiple nodes. Each entry is scene-local left/top/size. */
export function patchNodesGeometry(
  document: any,
  patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>,
  options?: { fitTextBox?: boolean }
) {
  let next = normalizeDocument(document);
  patches.forEach((p) => {
    next = patchNodeGeometry(next, p.nodeId, p, options);
  });
  return next;
}
