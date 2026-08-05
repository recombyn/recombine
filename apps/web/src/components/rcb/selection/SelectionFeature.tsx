import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import ImageReplaceCornerButton from '@/components/editor/nodes/ImageNode/ImageReplaceCornerButton';
import ImageVariantsOverlay from '@/components/editor/nodes/ImageNode/ImageVariantsOverlay';
import VideoReplaceCornerButton from '@/components/editor/nodes/VideoNode/VideoReplaceCornerButton';
import {
  useRcbCamera,
  useRcbOverlayRoot,
  useRcbScreenToScene,
  useRcbViewportEl,
} from '@/components/rcb/camera/context';
import {
  rcbClientDeltaToScene,
  rcbClientToStageLocal,
  rcbResolveViewportEl,
  rcbViewportMetrics,
} from '@/components/rcb/core/math';
import { logEdgeSamples, sampleBoxEdges } from '@/components/rcb/core/dprDebug';
import {
  getDocumentGridSize,
  snapBoxToGrid,
  snapResizeToGrid,
  type SceneBox,
} from './alignGuides';
import SelectionChrome from './SelectionChrome';
import SelectionContextToolbar from './chrome/SelectionContextToolbar';
import MultiSelectionToolbar from './chrome/MultiSelectionToolbar';
import NodeTitleLabel from './chrome/NodeTitleLabel';
import BrushOverlay from './chrome/BrushOverlay';
import CornerRadiusHandlesOverlay from './chrome/CornerRadiusHandlesOverlay';
import PolygonShapeHandlesOverlay from './chrome/PolygonShapeHandlesOverlay';
import StarShapeHandlesOverlay from './chrome/StarShapeHandlesOverlay';
import CircleShapeHandlesOverlay from './chrome/CircleShapeHandlesOverlay';
import { resizeFromHandle, rotateBoxesAround, scaleBoxesToUnion, unionOfBoxes, type ResizeHandle } from './resizeGeometry';
import {
  HEAVY_PATH_D_CHARS,
  pathStrokeHitsSceneBox,
  rememberNodePath2D,
  resizeStrokeByEndpoint,
  strokeEndpointsFromBox,
} from '@/components/rcb/scene/document/sceneShapes';
import {
  expandSelectionWithGroups,
  isImageGeneratorNode,
  isVideoGeneratorNode,
  isNodeHidden,
  isNodeLocked,
  listImageVariantUrls,
  nodeIdsInsideFrames,
  supportsCornerRadius,
  supportsFill,
  supportsShapeSides,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  TEXT_SELECTION_PAD,
  deflateSelectionBox,
  strokeChromeOutset,
  strokeVisualOutset,
} from '@/components/rcb/scene/document/sceneEffects';
import { geometryIndicatorPathD, isEditablePathNode } from '@/components/rcb/scene/paint/outlineToPath';
import { patchDocumentNode, setDevHoverNodeId } from '@/store/modules/editor';
import {
  measureWrappedTextSize,
  parseNodeText,
  parseNodeTextStyle,
} from '@/components/rcb/scene/document/sceneText';
import type { TextResizeMode } from '@/components/rcb/scene/paint/svgToScene';
import { getSharedNodeEls } from '@/components/rcb/shapes/shapeHostRegistry';
import {
  ShapeOutlineSvg,
  liveShapeGeomBox,
  nodeUsesPathChrome,
  nodeUsesOpenStrokeEndpoints,
  pathLocalEndpoints,
  localPointToWorld,
  boxFromLocalAnchor,
  type ShapeOutlineItem,
} from './HostPathChrome';

const CORNER_HANDLES = new Set<ResizeHandle>(['nw', 'ne', 'sw', 'se']);

function textResizeModeForHandle(handle: ResizeHandle): TextResizeMode {
  return handle === 'e' || handle === 'w' ? 'wrap' : 'scale';
}

/**
 * Aspect lock while resizing.
 * - Toolbar lock and Shift are OR'd: Shift reinforces proportional scale,
 *   and never unlocks when the chain icon is already on (avoids fight with lock).
 * - Single text corners: proportional by default; Shift allows free resize.
 * - Image/video default locked; other nodes free unless `lockAspect` is set.
 */
function nodeAspectLockDefault(key: string | undefined): boolean {
  return key === 'image' || key === 'video';
}

function readNodeAspectLocked(node: any): boolean {
  const raw = node?.attrs?.lockAspect;
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return nodeAspectLockDefault(node?.key);
}

/** Persist lock OR Shift ??Shift adds constraint, does not toggle it off. */
function combineAspectLock(locked: boolean, shiftKey: boolean) {
  return locked || shiftKey;
}

function resolveLockAspect(
  document: any,
  origins: Array<{ nodeId: string }>,
  handle: ResizeHandle | undefined,
  shiftKey: boolean
) {
  if (!handle) return shiftKey;
  if (origins.length === 1) {
    const node = document?.deltaSetLike?.[origins[0].nodeId];
    const key = node?.key;
    // Text corners: default scale; Shift temporarily unlocks for free reshape.
    if (key === 'text' && CORNER_HANDLES.has(handle)) return !shiftKey;
    return combineAspectLock(readNodeAspectLocked(node), shiftKey);
  }
  // Multi / group: lock when selection includes images/videos (unless explicitly unlocked).
  const nodes = origins
    .map(({ nodeId }) => document?.deltaSetLike?.[nodeId])
    .filter(Boolean);
  const hasExplicitUnlock = nodes.some((n) => {
    const raw = n?.attrs?.lockAspect;
    return raw === false || raw === 'false' || raw === 0 || raw === '0';
  });
  const allLocked =
    !hasExplicitUnlock && nodes.some((n) => n.key === 'image' || n.key === 'video')
      ? true
      : nodes.length > 0 && nodes.every((n) => readNodeAspectLocked(n));
  return combineAspectLock(allLocked, shiftKey);
}

/** Remasure text height for L/R wrap so chrome hugs wrapped lines while dragging. */
function applyTextWrapHeight(
  document: any,
  nodeId: string,
  box: SceneBox
): SceneBox {
  const node = document?.deltaSetLike?.[nodeId];
  if (!node || node.key !== 'text') return box;
  const style = parseNodeTextStyle(node.attrs || {});
  const plain = parseNodeText(node.attrs || {}) || ' ';
  // `box` is chrome bounds (includes TEXT_SELECTION_PAD); measure wrap on content width.
  const contentW = Math.max(24, box.width - TEXT_SELECTION_PAD * 2);
  const measured = measureWrappedTextSize(plain, style, contentW);
  return {
    ...box,
    height: Math.max(1, Math.round(measured.height) + TEXT_SELECTION_PAD * 2),
  };
}

function normalizeBox(x0: number, y0: number, x1: number, y1: number) {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    left,
    top,
    width: Math.max(1, Math.abs(x1 - x0)),
    height: Math.max(1, Math.abs(y1 - y0)),
  };
}

function boxesIntersect(a: SceneBox, b: SceneBox) {
  return !(
    a.left + a.width < b.left ||
    b.left + b.width < a.left ||
    a.top + a.height < b.top ||
    b.top + b.height < a.top
  );
}

/** Frame AABB ??marquee ??same idea as selecting a rectangle. Locked frames are skipped. */
function framesHittingMarquee(doc: any, marquee: SceneBox): Array<{ id: string; area: number }> {
  const frames = Array.isArray(doc?.frames) ? doc.frames : [];
  const out: Array<{ id: string; area: number }> = [];
  for (const f of frames) {
    if (!f?.id || f.locked) continue;
    const fb: SceneBox = {
      left: Number(f.x) || 0,
      top: Number(f.y) || 0,
      width: Math.max(1, Number(f.width) || 1),
      height: Math.max(1, Number(f.height) || 1),
    };
    if (!boxesIntersect(marquee, fb)) continue;
    const ix0 = Math.max(marquee.left, fb.left);
    const iy0 = Math.max(marquee.top, fb.top);
    const ix1 = Math.min(marquee.left + marquee.width, fb.left + fb.width);
    const iy1 = Math.min(marquee.top + marquee.height, fb.top + fb.height);
    out.push({ id: String(f.id), area: Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0) });
  }
  out.sort((a, b) => b.area - a.area);
  return out;
}

/** Synthetic selection id so frames share the same union chrome / transform path as nodes. */
const FRAME_SEL_PREFIX = '__frame__:';
function frameSelId(frameId: string) {
  return `${FRAME_SEL_PREFIX}${frameId}`;
}
export function parseFrameSelId(selId: string): string | null {
  return selId.startsWith(FRAME_SEL_PREFIX) ? selId.slice(FRAME_SEL_PREFIX.length) : null;
}

/** Single node or single frame — inspect / spacing primary target. */
function resolveInspectPrimaryId(
  selectedNodeIds: string[],
  selectedFrameIds: string[]
): string | null {
  if (selectedNodeIds.length === 1 && selectedFrameIds.length === 0) {
    return selectedNodeIds[0] ?? null;
  }
  if (selectedFrameIds.length === 1 && selectedNodeIds.length === 0) {
    return frameSelId(selectedFrameIds[0]);
  }
  return null;
}

function isHostInjectedSelection(
  singleNode: boolean,
  singleId: string | null,
  shapeOutlines: ShapeOutlineItem[],
  opts?: { inspectDev?: boolean; node?: any }
): boolean {
  if (!singleNode || !singleId) return false;
  // Host already paints the path silhouette (with or without handles / aux).
  if (shapeOutlines.some((o) => o.id === singleId)) return true;
  // Inspect: never fall back to world AABB SelectionChrome for path ink.
  if (opts?.inspectDev && nodeUsesPathChrome(opts.node)) return true;
  return false;
}

/** Near-full-bleed artboard plate ??must not block marquee (looks empty but hits as a shape). */
function frameForFullBleedPlate(doc: any, nodeId: string): string | null {
  const node = doc?.deltaSetLike?.[nodeId];
  if (!node || node.key !== 'shape') return null;
  const shapeType = String(node.attrs?.shapeType || 'rect');
  if (shapeType !== 'rect') return null;
  const frames = Array.isArray(doc?.frames) ? doc.frames : [];
  if (!frames.length) return null;
  const { left, top } = nodeLeftTop(doc, node);
  const w = Math.max(1, Number(node.width) || 1);
  const h = Math.max(1, Number(node.height) || 1);
  const area = w * h;
  for (const f of frames) {
    if (!f?.id) continue;
    const fx = Number(f.x) || 0;
    const fy = Number(f.y) || 0;
    const fw = Math.max(1, Number(f.width) || 1);
    const fh = Math.max(1, Number(f.height) || 1);
    const frameArea = fw * fh;
    const ow = Math.max(0, Math.min(left + w, fx + fw) - Math.max(left, fx));
    const oh = Math.max(0, Math.min(top + h, fy + fh) - Math.max(top, fy));
    const overlap = ow * oh;
    if (overlap >= frameArea * 0.9 && area >= frameArea * 0.85) {
      return String(f.id);
    }
  }
  return null;
}

/** Visual AABB in scene space via mounted SVG (matches what the user sees). */
function sceneBoxFromMountedNode(
  nodeId: string,
  toScene: (clientX: number, clientY: number) => { x: number; y: number }
): SceneBox | null {
  if (typeof document === 'undefined') return null;
  const shared = getSharedNodeEls()?.get(nodeId) as SVGGraphicsElement | undefined;
  let el: SVGGraphicsElement | null = shared || null;
  if (!el) {
    const safe =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(nodeId)
        : nodeId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    el = document.querySelector(
      `[data-scene-node-id="${safe}"]`
    ) as SVGGraphicsElement | null;
  }
  if (!el) return null;
  let r: DOMRect;
  try {
    r = el.getBoundingClientRect();
  } catch {
    return null;
  }
  if (!(r.width >= 0.5 || r.height >= 0.5)) return null;
  const a = toScene(r.left, r.top);
  const b = toScene(r.right, r.bottom);
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.max(1, Math.abs(b.x - a.x)),
    height: Math.max(1, Math.abs(b.y - a.y)),
  };
}

/** Point-in-AABB (inclusive). */
function pointInBox(x: number, y: number, box: SceneBox, pad = 0) {
  return (
    x >= box.left - pad &&
    x <= box.left + box.width + pad &&
    y >= box.top - pad &&
    y <= box.top + box.height + pad
  );
}

/**
 * Marquee hit ??match click semantics per type:
 * - rect / geo / text / image: AABB (same as click)
 * - pen / pencil / path: stroke/path sampling (click uses ink, not empty AABB gaps)
 * - line / arrow: shaft endpoints / mid
 */
function nodeHitsMarquee(
  doc: any,
  nodeId: string,
  marquee: SceneBox,
  getNodeBox: (id: string) => SceneBox | null,
  toScene: (clientX: number, clientY: number) => { x: number; y: number }
): boolean {
  const node = doc?.deltaSetLike?.[nodeId];
  if (!node || isNodeHidden(node)) return false;
  const dataBox = getNodeBox(nodeId);
  const domBox = sceneBoxFromMountedNode(nodeId, toScene);
  const box = domBox || dataBox;
  if (!box) return false;

  const shapeType = String(node.attrs?.shapeType || '');
  if (shapeType === 'line' || shapeType === 'arrow') {
    const ep = strokeEndpointsFromBox(box, Number(node.attrs?.angle) || 0);
    if (pointInBox(ep.x0, ep.y0, marquee, 2) || pointInBox(ep.x1, ep.y1, marquee, 2)) {
      return true;
    }
    const mx = (ep.x0 + ep.x1) / 2;
    const my = (ep.y0 + ep.y1) / 2;
    return pointInBox(mx, my, marquee, 2) || boxesIntersect(marquee, box);
  }

  if (shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'path') {
    const d = String(node.attrs?.path || node.attrs?.d || '');
    // Filled closed path: AABB is fine (same spirit as click fill hit).
    if (shapeType !== 'pen' && supportsFill(node) && boxesIntersect(marquee, box)) {
      return true;
    }
    if (d) {
      return pathStrokeHitsSceneBox(d, box, Number(node.attrs?.angle) || 0, marquee, 3);
    }
    return boxesIntersect(marquee, box);
  }

  // rect / ellipse / text / image / other geo ??AABB like click.
  return boxesIntersect(marquee, box);
}

function unionBoxes(boxes: SceneBox[]): SceneBox | null {
  if (!boxes.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  boxes.forEach((b) => {
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
  });
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

type GeometryPatch = {
  nodeId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type SelectionFeatureProps = {
  enabled: boolean;
  /** Share/preview: select + Dev annotations only ??no move/resize/edit. */
  readOnly?: boolean;
  document: any;
  selectedNodeIds: string[];
  /** Artboard frames in the same selection as nodes (union control box). */
  selectedFrameIds?: string[];
  paperEl: HTMLElement | null;
  /** Viewport element for infinite canvas (optional; camera context is preferred). */
  stageEl?: HTMLElement | null;
  artboard: { width: number; height: number };
  onSelect: (ids: string[], opts?: { additive?: boolean }) => void;
  /** Hit-test artboard frames in scene coords. */
  hitTestFrame?: (x: number, y: number) => string | null;
  onSelectFrame?: (frameId: string | null) => void;
  /** Marquee / multi artboard selection (frames only). */
  onSelectFrames?: (frameIds: string[]) => void;
  /** Marquee selecting nodes and/or frames together. */
  onSelectMixed?: (
    nodeIds: string[],
    frameIds: string[],
    opts?: { additive?: boolean }
  ) => void;
  onGeometryCommit: (
    patches: GeometryPatch[],
    options?: { textResizeMode?: TextResizeMode; skipHistory?: boolean }
  ) => void;
  /** Live DOM preview while dragging (does not write document). */
  onGeometryPreview?: (
    patches: GeometryPatch[],
    options?: { textResizeMode?: TextResizeMode }
  ) => void;
  onAngleCommit?: (
    nodeId: string,
    angleDeg: number,
    options?: { skipHistory?: boolean }
  ) => void;
  onAnglePreview?: (nodeId: string, angleDeg: number) => void;
  hitTest: (
    x: number,
    y: number,
    screen?: { clientX: number; clientY: number }
  ) => string | null;
  getNodeBox: (nodeId: string) => SceneBox | null;
  listNodeIds: () => string[];
  /**
   * Optional spatial prefilter for marquee (and similar rect queries).
   * Return candidate ids that may intersect `box`; fine hit still uses nodeHitsMarquee.
   */
  queryNodeIdsInRect?: (box: SceneBox) => string[];
  onOpenAgent?: (opts?: { prompt?: string }) => void;
  /** Double-click a text node to edit inline. */
  onEditText?: (nodeId: string) => void;
  /** Double-click a pen path to edit anchors / handles. */
  onEditPenPath?: (nodeId: string) => void;
  /** Hide selection chrome / toolbars (e.g. while inline text editing). */
  suppressChrome?: boolean;
  /** Fires when move / resize / rotate starts or ends (for hiding node titles). */
  onTransformingChange?: (transforming: boolean) => void;
  /**
   * Composer "Add from canvas" pick mode ??clicks attach via onSelect and must
   * not start a move (already-selected hits would otherwise skip onSelect).
   */
  attachPickActive?: boolean;
};

/**
 * Soft-click vs drag — **monitor travel**, not scene/world units.
 *
 * Equivalent check: screen-space Dist²(origin, current) > threshold
 * (same as pageDist² * zoom² > threshold when page and screen share zoom).
 *
 * 画布缩放到 1% 或 800% 时，门槛必须相同。禁止用场景距离（缩小时
 * 1 屏幕 px ≈ 很多场景单位，一点击就会“几千像素”误进框选）。
 */
const DRAG_SCREEN_PX = 10;
const DRAG_DISTANCE_SQUARED = DRAG_SCREEN_PX * DRAG_SCREEN_PX;
/**
 * Empty canvas → blue brush. Both gates use CSS client / screen px (not scene):
 * pointer travel since down, and marquee longer side × zoom (avoids hairline slips).
 */
const BRUSH_SCREEN_PX = 56;
const TOUCH_BRUSH_SCREEN_PX = 64;

function brushScreenPx(pointerType: string): number {
  return pointerType === 'touch' ? TOUCH_BRUSH_SCREEN_PX : BRUSH_SCREEN_PX;
}

type DragState = {
  /** pointing_canvas: empty press; marquee only after brush gate. */
  mode: 'move' | 'resize' | 'rotate' | 'marquee' | 'pointing_canvas' | 'blank';
  startX: number;
  startY: number;
  sceneX0: number;
  sceneY0: number;
  origins: Array<{ nodeId: string; box: SceneBox; angle0?: number }>;
  union: SceneBox;
  handle?: ResizeHandle;
  angle0?: number;
  aspectRatio?: number;
  center?: { x: number; y: number };
  pointerAngle0?: number;
  /**
   * Open pen/pencil/path: drag endpoint by uniform scale+rotate about the
   * opposite path end (local coords at gesture start).
   */
  pathEpLocal0?: [number, number];
  pathEpLocal1?: [number, number];
  /**
   * Composer canvas-pick gesture: attach already ran on pointerdown.
   * Skip pointerup onSelect so one-shot clearPick does not steal node selection.
   */
  skipSelectOnUp?: boolean;
  /** Visual/layout scale at pointerdown (from rcbViewportMetrics). */
  scaleX?: number;
  scaleY?: number;
  /**
   * Continuously updated from pointerdown/move.
   * End events (up/cancel) must not supply geometry — their clientX/Y can be 0,0.
   */
  currentClientX: number;
  currentClientY: number;
  currentShift?: boolean;
};

/** Shared seed for blank / pointing_canvas / move / resize / rotate drags. */
function makeDragSeed(
  mode: DragState['mode'],
  e: { clientX: number; clientY: number },
  p: { x: number; y: number },
  extras?: Partial<DragState>,
  viewport?: HTMLElement | null
): DragState {
  const m = viewport ? rcbViewportMetrics(viewport) : null;
  return {
    mode,
    startX: e.clientX,
    startY: e.clientY,
    sceneX0: p.x,
    sceneY0: p.y,
    scaleX: m?.scaleX ?? 1,
    scaleY: m?.scaleY ?? 1,
    currentClientX: e.clientX,
    currentClientY: e.clientY,
    origins: [],
    union: { left: p.x, top: p.y, width: 1, height: 1 },
    ...extras,
  };
}

/** Scene point / delta from pointerdown — stable if stage rect jitters mid-gesture. */
function sceneFromClientGesture(
  drag: Pick<DragState, 'sceneX0' | 'sceneY0' | 'startX' | 'startY' | 'scaleX' | 'scaleY'>,
  zoom: number,
  clientX: number,
  clientY: number
) {
  const d = rcbClientDeltaToScene(
    zoom,
    clientX - drag.startX,
    clientY - drag.startY,
    drag.scaleX ?? 1,
    drag.scaleY ?? 1
  );
  return { x: drag.sceneX0 + d.x, y: drag.sceneY0 + d.y, dx: d.x, dy: d.y };
}

/** Raw CSS client travel² since pointerdown (no layout-scale ÷, no scene/zoom). */
function screenDragDistSq(
  drag: Pick<DragState, 'startX' | 'startY'>,
  clientX: number,
  clientY: number
): number {
  const dx = clientX - drag.startX;
  const dy = clientY - drag.startY;
  return dx * dx + dy * dy;
}

/** Dual brush gate: pointer travel + on-screen marquee size. */
function evaluateBrushGate(
  drag: Pick<DragState, 'startX' | 'startY' | 'sceneX0' | 'sceneY0' | 'scaleX' | 'scaleY'>,
  zoom: number,
  clientX: number,
  clientY: number,
  pointerType: string
): { passed: boolean; box: SceneBox } {
  const brushPx = brushScreenPx(pointerType);
  const gesture = sceneFromClientGesture(drag, zoom, clientX, clientY);
  const box = normalizeBox(drag.sceneX0, drag.sceneY0, gesture.x, gesture.y);
  const z = Math.max(0.05, zoom || 1);
  const screenLong = Math.max(box.width, box.height) * z;
  const passed =
    screenDragDistSq(drag, clientX, clientY) >= brushPx * brushPx && screenLong >= brushPx;
  return { passed, box };
}

function softSelectFrameAt(
  toScene: (clientX: number, clientY: number) => { x: number; y: number },
  hitTestFrame: ((x: number, y: number) => string | null) | undefined,
  onSelectFrame: ((frameId: string | null) => void) | undefined,
  clientX: number,
  clientY: number
) {
  const abs = toScene(clientX, clientY);
  const frameId = hitTestFrame?.(abs.x, abs.y);
  if (frameId) onSelectFrame?.(frameId);
}

function isSelectionOriginsLocked(
  document: any,
  origins: Array<{ nodeId: string }> | null | undefined
): boolean {
  if (!origins?.length) return false;
  const frames = Array.isArray(document?.frames) ? document.frames : [];
  return origins.some((o) => {
    const fid = parseFrameSelId(o.nodeId);
    if (fid) return Boolean(frames.find((x: any) => x?.id === fid)?.locked);
    return isNodeLocked(document?.deltaSetLike?.[o.nodeId]);
  });
}

function isRecentNodeDoubleTap(
  prev: { id: string; t: number; x: number; y: number } | null,
  hitId: string,
  e: { clientX: number; clientY: number },
  ms = 400,
  distPx = 10
): boolean {
  if (!prev || prev.id !== hitId) return false;
  return Date.now() - prev.t < ms && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < distPx;
}

function buildMoveOriginsForHit(opts: {
  document: any;
  hitId: string;
  selectedIds: string[];
  expandedHit: string[];
  liveOriginsNow: Array<{ nodeId: string; box: SceneBox }> | null | undefined;
  getNodeBox: (id: string) => SceneBox | null | undefined;
  fallbackPoint: { x: number; y: number };
}): { origins: Array<{ nodeId: string; box: SceneBox }>; union: SceneBox } {
  const { document, hitId, selectedIds, expandedHit, liveOriginsNow, getNodeBox, fallbackPoint } =
    opts;
  const moveNodeIds = expandSelectionWithGroups(
    document,
    selectedIds.includes(hitId) ? selectedIds.filter((id) => !parseFrameSelId(id)) : expandedHit
  );
  const frameOrigins =
    selectedIds.includes(hitId) && liveOriginsNow
      ? liveOriginsNow.filter((o) => parseFrameSelId(o.nodeId))
      : [];
  const origins = [
    ...moveNodeIds
      .map((id) => {
        const box = liveOriginsNow?.find((o) => o.nodeId === id)?.box || getNodeBox(id);
        return box ? { nodeId: id, box: { ...box } } : null;
      })
      .filter(Boolean),
    ...frameOrigins.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })),
  ] as Array<{ nodeId: string; box: SceneBox }>;
  const union = unionOfBoxes(origins.map((o) => o.box)) || {
    left: fallbackPoint.x,
    top: fallbackPoint.y,
    width: 1,
    height: 1,
  };
  return { origins, union };
}

function filterMarqueeContentHits(document: any, rawHits: string[], frameHitSet: Set<string>) {
  return rawHits.filter((id) => {
    const plateFrame = frameForFullBleedPlate(document, id);
    if (!plateFrame) return true;
    if (frameHitSet.has(plateFrame)) return true;
    return rawHits.some((other) => other !== id && !frameForFullBleedPlate(document, other));
  });
}

function commitMarqueeSelection(opts: {
  contentHits: string[];
  frameHits: string[];
  rawHits: string[];
  shiftKey: boolean;
  onSelectMixed?: (
    nodeIds: string[],
    frameIds: string[],
    opts?: { additive?: boolean }
  ) => void;
  onSelectFrames?: (ids: string[]) => void;
  onSelectFrame?: (id: string | null) => void;
  onSelect: (ids: string[], opts?: { additive?: boolean }) => void;
}) {
  const {
    contentHits,
    frameHits,
    rawHits,
    shiftKey,
    onSelectMixed,
    onSelectFrames,
    onSelectFrame,
    onSelect,
  } = opts;
  if (!contentHits.length && !frameHits.length) {
    onSelect(rawHits, { additive: shiftKey });
    return;
  }
  if (onSelectMixed) {
    onSelectMixed(contentHits, frameHits, { additive: shiftKey });
    return;
  }
  if (frameHits.length && !contentHits.length) {
    if (onSelectFrames) onSelectFrames(frameHits);
    else if (onSelectFrame) onSelectFrame(frameHits[0]);
    return;
  }
  onSelect(contentHits.length ? contentHits : rawHits, { additive: shiftKey });
}

type MoveSnapContext = {
  union: SceneBox;
  dx: number;
  dy: number;
  disableGrid: boolean;
  gridSize: number;
};

function computeMovedUnion(ctx: MoveSnapContext): {
  nextUnion: SceneBox;
  sdx: number;
  sdy: number;
} {
  let nextUnion = {
    ...ctx.union,
    left: ctx.union.left + ctx.dx,
    top: ctx.union.top + ctx.dy,
  };
  if (!ctx.disableGrid) {
    nextUnion = snapBoxToGrid(nextUnion, ctx.gridSize);
  }
  return {
    nextUnion,
    sdx: nextUnion.left - ctx.union.left,
    sdy: nextUnion.top - ctx.union.top,
  };
}

type ResizeSnapContext = {
  document: any;
  drag: DragState;
  dx: number;
  dy: number;
  shiftKey: boolean;
  disableGrid: boolean;
  gridSize: number;
};

function computeResizedUnion(ctx: ResizeSnapContext): {
  next: SceneBox;
  textMode: TextResizeMode | undefined;
  lockAspect: boolean;
} {
  const handle = ctx.drag.handle!;
  const lockAspect = resolveLockAspect(ctx.document, ctx.drag.origins, handle, ctx.shiftKey);
  let next = resizeFromHandle(ctx.drag.union, handle, ctx.dx, ctx.dy, ctx.drag.angle0 || 0, {
    lockAspect,
    aspectRatio: ctx.drag.aspectRatio,
  });
  if (!ctx.disableGrid) {
    next = snapResizeToGrid(next, handle, ctx.gridSize, 8, {
      lockAspect,
      aspectRatio: ctx.drag.aspectRatio,
    });
  }
  next = {
    ...next,
    width: Math.max(1, next.width),
    height: Math.max(1, next.height),
  };
  if (ctx.drag.origins.length === 1) {
    next = applyTextWrapHeight(ctx.document, ctx.drag.origins[0].nodeId, next);
  }
  const textMode =
    ctx.drag.origins.length === 1 &&
    String(ctx.document?.deltaSetLike?.[ctx.drag.origins[0].nodeId]?.key || '') === 'text'
      ? textResizeModeForHandle(handle)
      : undefined;
  return { next, textMode, lockAspect };
}

function computeRotateDelta(
  drag: DragState,
  p: { x: number; y: number },
  shiftKey: boolean
): { next: number; delta: number } {
  const now = (Math.atan2(p.y - drag.center!.y, p.x - drag.center!.x) * 180) / Math.PI;
  let next = (drag.angle0 || 0) + (now - drag.pointerAngle0!);
  if (shiftKey) next = Math.round(next / 15) * 15;
  return { next, delta: next - (drag.angle0 || 0) };
}

function strokeEndpointBox(
  drag: DragState,
  document: any,
  sceneX: number,
  sceneY: number
): { next: SceneBox; angle: number; strokeId: string } | null {
  const strokeId = drag.origins.length === 1 ? drag.origins[0].nodeId : '';
  if (!strokeId || !drag.handle) return null;
  if (drag.handle !== 'e' && drag.handle !== 'w') return null;
  const shapeType = readNodeShapeType(document, strokeId);

  // Open pen/pencil/path: scale+rotate about the opposite path endpoint so the
  // grabbed tip follows the pointer (AABB edge resize would miss the tip).
  if (
    drag.pathEpLocal0 &&
    drag.pathEpLocal1 &&
    (shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'path')
  ) {
    const placed = resizeOpenPathByEndpoint(
      drag.union,
      drag.angle0 || 0,
      drag.pathEpLocal0,
      drag.pathEpLocal1,
      drag.handle,
      sceneX,
      sceneY
    );
    if (!placed) return null;
    return { strokeId, angle: placed.angle, next: placed.box };
  }

  if (!isStrokeShapeType(shapeType)) return null;
  const placed = resizeStrokeByEndpoint(drag.union, drag.angle0 || 0, drag.handle, sceneX, sceneY);
  return {
    strokeId,
    angle: placed.angle,
    next: { left: placed.x, top: placed.y, width: placed.width, height: placed.height },
  };
}

/**
 * Uniform scale + rotate about the fixed path end so the free end tracks the pointer.
 * Path local coords scale with the box (same as live geometry preview).
 */
function resizeOpenPathByEndpoint(
  box: SceneBox,
  angleDeg: number,
  ep0: [number, number],
  ep1: [number, number],
  handle: 'e' | 'w',
  pointerX: number,
  pointerY: number
): { box: SceneBox; angle: number } | null {
  const freeLocal = handle === 'w' ? ep0 : ep1;
  const fixedLocal = handle === 'w' ? ep1 : ep0;
  const fixedW = localPointToWorld(fixedLocal[0], fixedLocal[1], box, angleDeg);
  const free0W = localPointToWorld(freeLocal[0], freeLocal[1], box, angleDeg);
  const len0 = Math.hypot(free0W.x - fixedW.x, free0W.y - fixedW.y);
  if (!(len0 > 1e-4)) return null;
  const len1 = Math.hypot(pointerX - fixedW.x, pointerY - fixedW.y);
  const scale = Math.max(0.05, len1 / len0);
  const a0 = Math.atan2(free0W.y - fixedW.y, free0W.x - fixedW.x);
  const a1 = Math.atan2(pointerY - fixedW.y, pointerX - fixedW.x);
  const newAngle = angleDeg + ((a1 - a0) * 180) / Math.PI;
  const newW = Math.max(1, box.width * scale);
  const newH = Math.max(1, box.height * scale);
  // Path scales from local origin with the box — fixed/free locals scale too.
  const fixedLocal2: [number, number] = [fixedLocal[0] * scale, fixedLocal[1] * scale];
  const next = boxFromLocalAnchor(
    fixedLocal2[0],
    fixedLocal2[1],
    fixedW.x,
    fixedW.y,
    newW,
    newH,
    newAngle
  );
  return { box: next, angle: Number(newAngle.toFixed(2)) };
}

function readNodeAngle(document: any, nodeId: string) {
  const node = document?.deltaSetLike?.[nodeId];
  const n = Number(node?.attrs?.angle);
  return Number.isFinite(n) ? n : 0;
}

function readNodeShapeType(document: any, nodeId: string) {
  return String(document?.deltaSetLike?.[nodeId]?.attrs?.shapeType || '');
}

function isStrokeShapeType(t: string) {
  return t === 'line' || t === 'arrow';
}

/**
 * Selection: marquee / move / 8-way resize / rotate.
 */
function SelectionFeature({
  enabled,
  readOnly = false,
  document,
  selectedNodeIds,
  selectedFrameIds = [],
  paperEl,
  stageEl = null,
  artboard,
  onSelect,
  hitTestFrame,
  onSelectFrame,
  onSelectFrames,
  onSelectMixed,
  onGeometryCommit,
  onGeometryPreview,
  onAngleCommit,
  onAnglePreview,
  hitTest,
  getNodeBox,
  listNodeIds,
  queryNodeIdsInRect,
  onOpenAgent,
  onEditText,
  onEditPenPath,
  suppressChrome = false,
  onTransformingChange,
  attachPickActive = false,
}: SelectionFeatureProps) {
  const overlayRoot = useRcbOverlayRoot();
  const viewportEl = useRcbViewportEl();
  const toScene = useRcbScreenToScene();
  const camera = useRcbCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  const workspaceMode = useSelector(
    (s: any) => (s.editor.workspaceMode || 'design') as 'design' | 'dev'
  );
  const gridSize = getDocumentGridSize(document);
  /** Prefer live context viewport ??prop stageEl can go stale after resize remounts. */
  const hitEl = rcbResolveViewportEl(viewportEl, stageEl, paperEl);
  const dispatch = useDispatch();
  const shapeStylePanel = useSelector(
    (s: any) => s.editor.shapeStylePanel as null | { kind: string }
  );
  /** Radius panel keeps chrome (rounded outline) but hides floating toolbars. */
  const suppressToolbars = suppressChrome || shapeStylePanel?.kind === 'radius';
  /** Share preview / Dev: no edit chrome (spacing annotations removed). */
  const inspectDev = workspaceMode === 'dev' || readOnly;
  const dragRef = useRef<DragState | null>(null);
  const liveUnionRef = useRef<SceneBox | null>(null);
  const liveOriginsRef = useRef<Array<{ nodeId: string; box: SceneBox }> | null>(null);
  const liveAngleRef = useRef(0);
  /** Soft-click double-tap on text (counted on pointerup; native dblclick is the primary path). */
  const lastTextClickRef = useRef<{ id: string; at: number } | null>(null);
  const lastNodeTapRef = useRef<{ id: string; t: number; x: number; y: number } | null>(null);
  const onTransformingChangeRef = useRef(onTransformingChange);
  onTransformingChangeRef.current = onTransformingChange;

  // Keep pointer handlers stable — document identity churn must not tear down
  // window listeners mid-marquee (setMarquee re-render used to drop pointerup → stuck brush).
  const documentRef = useRef(document);
  const getNodeBoxRef = useRef(getNodeBox);
  const listNodeIdsRef = useRef(listNodeIds);
  const queryNodeIdsInRectRef = useRef(queryNodeIdsInRect);
  const hitTestRef = useRef(hitTest);
  const hitTestFrameRef = useRef(hitTestFrame);
  const onSelectRef = useRef(onSelect);
  const onSelectFrameRef = useRef(onSelectFrame);
  const onSelectMixedRef = useRef(onSelectMixed);
  const onSelectFramesRef = useRef(onSelectFrames);
  const toSceneRef = useRef(toScene);
  const onGeometryCommitRef = useRef(onGeometryCommit);
  const onGeometryPreviewRef = useRef(onGeometryPreview);
  const onAngleCommitRef = useRef(onAngleCommit);
  const onAnglePreviewRef = useRef(onAnglePreview);
  const onEditTextRef = useRef(onEditText);
  const onEditPenPathRef = useRef(onEditPenPath);
  const zoomRef = useRef(zoom);
  const gridSizeRef = useRef(gridSize);
  const readOnlyRef = useRef(readOnly);
  const attachPickActiveRef = useRef(attachPickActive);
  documentRef.current = document;
  getNodeBoxRef.current = getNodeBox;
  listNodeIdsRef.current = listNodeIds;
  queryNodeIdsInRectRef.current = queryNodeIdsInRect;
  hitTestRef.current = hitTest;
  hitTestFrameRef.current = hitTestFrame;
  onSelectRef.current = onSelect;
  onSelectFrameRef.current = onSelectFrame;
  onSelectMixedRef.current = onSelectMixed;
  onSelectFramesRef.current = onSelectFrames;
  toSceneRef.current = toScene;
  onGeometryCommitRef.current = onGeometryCommit;
  onGeometryPreviewRef.current = onGeometryPreview;
  onAngleCommitRef.current = onAngleCommit;
  onAnglePreviewRef.current = onAnglePreview;
  onEditTextRef.current = onEditText;
  onEditPenPathRef.current = onEditPenPath;
  zoomRef.current = zoom;
  gridSizeRef.current = gridSize;
  readOnlyRef.current = readOnly;
  attachPickActiveRef.current = attachPickActive;

  const [liveUnion, setLiveUnion] = useState<SceneBox | null>(null);
  const [liveOrigins, setLiveOrigins] = useState<Array<{ nodeId: string; box: SceneBox }> | null>(
    null
  );
  const [liveAngle, setLiveAngle] = useState(0);
  const [marquee, setMarquee] = useState<SceneBox | null>(null);
  /** Margin labels while moving / arrow-nudging (pink). */
  /** Neighbor boxes currently driving distance tips — orange outline. */
  /** Hide chrome/toolbars while move / resize / rotate is in progress. */
  const [transforming, setTransforming] = useState(false);
  /** Dev inspect: node under pointer (annotations follow mouse). */
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const hoverNodeIdRef = useRef<string | null>(null);
  /** Preview / Dev: previous single selection ??click A then B shows A?B spacing. */
  const [inspectPairNodeId, setInspectPairNodeId] = useState<string | null>(null);
  const prevInspectSelRef = useRef<string | null>(null);

  const setTransformingNotify = (next: boolean) => {
    setTransforming(next);
    onTransformingChangeRef.current?.(next);
  };

  liveUnionRef.current = liveUnion;
  liveOriginsRef.current = liveOrigins;
  liveAngleRef.current = liveAngle;

  const idsKey = selectedNodeIds.join('|');
  const frameIdsKey = selectedFrameIds.join('|');
  /** Bust chrome memo when stroke band attrs change (align / width). */
  const strokeChromeKey = selectedNodeIds
    .map((id) => {
      const a = document?.deltaSetLike?.[id]?.attrs || {};
      return `${a.strokeAlign ?? a['stroke-align']}:${a['border-width'] ?? a.strokeWidth}`;
    })
    .join('|');
  const selectionCount = selectedNodeIds.length + selectedFrameIds.length;
  const single = selectionCount === 1;
  const singleNode = selectedNodeIds.length === 1 && selectedFrameIds.length === 0;

  const baseOrigins = useMemo(() => {
    // Derive ids from keys so a new array reference does not recreate origins
    // every render (that caused Maximum update depth loops).
    const ids = idsKey ? idsKey.split('|').filter(Boolean) : [];
    const fids = frameIdsKey ? frameIdsKey.split('|').filter(Boolean) : [];
    const nodeOrigins = ids
      .map((id) => {
        const box = getNodeBox(id);
        if (!box) {
          const node = document?.deltaSetLike?.[id];
          if (!node) return null;
          const { left, top } = nodeLeftTop(document, node);
          return {
            nodeId: id,
            box: {
              left,
              top,
              width: Math.max(1, Number(node.width) || 1),
              height: Math.max(1, Number(node.height) || 1),
            },
          };
        }
        return { nodeId: id, box };
      })
      .filter(Boolean) as Array<{ nodeId: string; box: SceneBox }>;
    const frames = Array.isArray(document?.frames) ? document.frames : [];
    const frameOrigins = fids
      .map((fid) => {
        const f = frames.find((x: any) => x?.id === fid);
        if (!f) return null;
        return {
          nodeId: frameSelId(fid),
          box: {
            left: Number(f.x) || 0,
            top: Number(f.y) || 0,
            width: Math.max(1, Number(f.width) || 1),
            height: Math.max(1, Number(f.height) || 1),
          },
        };
      })
      .filter(Boolean) as Array<{ nodeId: string; box: SceneBox }>;
    return [...nodeOrigins, ...frameOrigins];
  }, [document, idsKey, frameIdsKey, getNodeBox, strokeChromeKey]);

  /** Same-render selection bounds — avoids one-frame chrome flash when switching. */
  const selectionUnion = useMemo(
    () => unionBoxes(baseOrigins.map((o) => o.box)),
    [baseOrigins]
  );

  useEffect(() => {
    if (dragRef.current) return;
    setLiveUnion(selectionUnion);
    setLiveOrigins(baseOrigins);
    const onlyNodeId =
      !frameIdsKey && idsKey && !idsKey.includes('|') ? idsKey : null;
    if (onlyNodeId) {
      setLiveAngle(readNodeAngle(document, onlyNodeId));
    } else {
      setLiveAngle(0);
    }
  }, [baseOrigins, document, idsKey, frameIdsKey, selectionUnion]);

  // Inspect: keep prior selection as pair target when clicking another element.
  useEffect(() => {
    const next = resolveInspectPrimaryId(selectedNodeIds, selectedFrameIds);
    const prev = prevInspectSelRef.current;
    if (next && prev && prev !== next) {
      setInspectPairNodeId(prev);
    } else if (!next) {
      setInspectPairNodeId(null);
    }
    prevInspectSelRef.current = next;
  }, [selectedNodeIds, selectedFrameIds]);

  useEffect(() => {
    if (!enabled || !hitEl) return undefined;

    const applyHover = (id: string | null) => {
      if (hoverNodeIdRef.current === id) return;
      hoverNodeIdRef.current = id;
      setHoverNodeId(id);
      // Dev / share inspect panel reads hover from Redux.
      if (workspaceMode === 'dev' || readOnly) {
        dispatch(setDevHoverNodeId(id));
      }
    };

    let hoverRaf = 0;
    let pending: PointerEvent | null = null;

    const runHoverHit = (e: PointerEvent) => {
      if (dragRef.current) {
        applyHover(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      const replaceHost = target?.closest?.(
        '[data-image-replace],[data-video-replace]'
      ) as HTMLElement | null;
      if (replaceHost) {
        const pinned =
          replaceHost.getAttribute('data-image-node-id') ||
          replaceHost.getAttribute('data-video-node-id');
        if (pinned) {
          applyHover(pinned);
          return;
        }
      }
      if (
        target?.closest?.(
          '[data-ctx-menu],[data-sel-toolbar],[data-export-panel],[data-frame-toolbar],[data-image-tool-panel],[data-image-variants],[data-image-quick-edit],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-dev-props],[data-video-playback-bar],[data-video-trim-toolbar],[data-radius-handle],[data-star-handle],[data-poly-handle],[data-circle-handle]'
        )
      ) {
        applyHover(null);
        return;
      }
      // Only hit-test when the pointer is over the stage / paper / selection chrome.
      if (
        target &&
        !hitEl.contains(target) &&
        !paperEl?.contains(target) &&
        !overlayRoot?.contains(target) &&
        !target.closest?.('[data-sel-box],[data-sel-handle]')
      ) {
        applyHover(null);
        return;
      }
      const p = toScene(e.clientX, e.clientY);
      const nodeHit = hitTestRef.current(p.x, p.y, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      if (nodeHit) {
        applyHover(nodeHit);
        return;
      }
      // Empty artboard / frame chrome: still measure select↔hover spacing.
      const frameHit = hitTestFrameRef.current?.(p.x, p.y) ?? null;
      applyHover(frameHit ? frameSelId(frameHit) : null);
    };

    const onHoverMove = (e: PointerEvent) => {
      pending = e;
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        const next = pending;
        pending = null;
        if (next) runHoverHit(next);
      });
    };

    const onLeave = () => {
      pending = null;
      if (hoverRaf) {
        cancelAnimationFrame(hoverRaf);
        hoverRaf = 0;
      }
      applyHover(null);
    };

    window.addEventListener('pointermove', onHoverMove, { passive: true });
    window.addEventListener('blur', onLeave);
    return () => {
      pending = null;
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      window.removeEventListener('pointermove', onHoverMove);
      window.removeEventListener('blur', onLeave);
    };
  }, [enabled, hitEl, paperEl, overlayRoot, artboard, hitTest, dispatch, toScene, workspaceMode, readOnly]);

  useEffect(() => {
    if (!enabled || !hitEl) return undefined;

    const getPointerCtx = () => ({
      document: documentRef.current,
      toScene: toSceneRef.current,
      zoom: zoomRef.current,
      gridSize: gridSizeRef.current,
      readOnly: readOnlyRef.current,
      attachPickActive: attachPickActiveRef.current,
      hitTest: hitTestRef.current,
      hitTestFrame: hitTestFrameRef.current,
      getNodeBox: getNodeBoxRef.current,
      listNodeIds: listNodeIdsRef.current,
      queryNodeIdsInRect: queryNodeIdsInRectRef.current,
      onSelect: onSelectRef.current,
      onSelectFrame: onSelectFrameRef.current,
      onSelectMixed: onSelectMixedRef.current,
      onSelectFrames: onSelectFramesRef.current,
      onGeometryCommit: onGeometryCommitRef.current,
      onGeometryPreview: onGeometryPreviewRef.current,
      onAngleCommit: onAngleCommitRef.current,
      onAnglePreview: onAnglePreviewRef.current,
      onEditText: onEditTextRef.current,
      onEditPenPath: onEditPenPathRef.current,
    });

    const TEXT_DBLCLICK_MS = 450;

    /**
     * Second completed soft-click (pointerup, no drag) on the same text opens edit.
     * Must not run on pointerdown ??otherwise one click (down+up) looks like a double-tap.
     */
    const tryOpenTextEdit = (id: string) => {
      const { document, onEditText, onSelect, readOnly } = getPointerCtx();
      if (readOnly) return false;
      const node = document?.deltaSetLike?.[id];
      if (node?.key !== 'text' || !onEditText) {
        lastTextClickRef.current = null;
        return false;
      }
      const now = performance.now();
      const prev = lastTextClickRef.current;
      if (prev && prev.id === id && now - prev.at < TEXT_DBLCLICK_MS) {
        lastTextClickRef.current = null;
        onSelect([id]);
        onEditText(id);
        return true;
      }
      lastTextClickRef.current = { id, at: now };
      return false;
    };

    const capture = (pointerId: number) => {
      hitEl.setPointerCapture?.(pointerId);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // New gesture — drop any brush left stuck after a lost pointerup.
      setMarquee(null);
      const {
        document,
        toScene,
        readOnly,
        attachPickActive,
        hitTest,
        hitTestFrame,
        getNodeBox,
        onSelect,
        onSelectFrame,
      } = getPointerCtx();
      const target = e.target as HTMLElement;
      if (
        target.closest(
          '[data-ctx-menu],[data-sel-toolbar],[data-frame-toolbar],[data-export-panel],[data-image-label],[data-frame-label],[data-crop-expand-overlay],[data-crop-expand-toolbar],[data-image-tool-panel],[data-image-variants],[data-image-quick-edit],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-color-panel],[data-text-inline-editor],[data-frame-handle],[data-image-generator],[data-video-generator],[data-video-playback-bar],[data-video-trim-toolbar],[data-radius-handle],[data-star-handle],[data-poly-handle],[data-circle-handle]'
        )
      )
        return;

      const seed = (
        mode: DragState['mode'],
        ev: { clientX: number; clientY: number },
        pt: { x: number; y: number },
        extras?: Partial<DragState>
      ) => makeDragSeed(mode, ev, pt, extras, hitEl);

      const p = toScene(e.clientX, e.clientY);
      const liveUnionNow = liveUnionRef.current;
      const liveOriginsNow = liveOriginsRef.current;
      const liveAngleNow = liveAngleRef.current;
      const lockedSelection = isSelectionOriginsLocked(document, liveOriginsNow);

      const rotateEl = target.closest('[data-sel-handle="rotate"]') as HTMLElement | null;
      if (rotateEl && liveUnionNow && liveOriginsNow?.length) {
        if (readOnly || lockedSelection) return;
        e.preventDefault();
        e.stopPropagation();
        const center = {
          x: liveUnionNow.left + liveUnionNow.width / 2,
          y: liveUnionNow.top + liveUnionNow.height / 2,
        };
        const angle0 =
          liveAngleNow ||
          (liveOriginsNow.length === 1
            ? readNodeAngle(document, liveOriginsNow[0].nodeId)
            : 0);
        const pointerAngle0 = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
        dragRef.current = seed('rotate', e, p, {
          origins: liveOriginsNow.map((o) => ({
            nodeId: o.nodeId,
            box: { ...o.box },
            angle0: readNodeAngle(document, o.nodeId),
          })),
          union: { ...liveUnionNow },
          angle0,
          center,
          pointerAngle0,
        });
        setTransformingNotify(true);
        capture(e.pointerId);
        return;
      }

      const resizeEl = target.closest('[data-sel-handle="resize"]') as HTMLElement | null;
      if (resizeEl && liveUnionNow && liveOriginsNow?.length) {
        if (readOnly || lockedSelection) return;
        e.preventDefault();
        e.stopPropagation();
        const handle = (resizeEl.getAttribute('data-resize') || 'se') as ResizeHandle;
        const singleId = liveOriginsNow.length === 1 ? liveOriginsNow[0].nodeId : '';
        const singleNode = singleId ? document?.deltaSetLike?.[singleId] : null;
        const shapeType = singleNode ? String(singleNode.attrs?.shapeType || '') : '';
        const angle0 =
          liveOriginsNow.length === 1 && !parseFrameSelId(liveOriginsNow[0].nodeId)
            ? liveAngleNow || readNodeAngle(document, liveOriginsNow[0].nodeId)
            : 0;
        let pathEpLocal0: [number, number] | undefined;
        let pathEpLocal1: [number, number] | undefined;
        // Open stroke tips: record path-local ends so resize tracks the grabbed tip.
        if (
          singleId &&
          (handle === 'e' || handle === 'w') &&
          nodeUsesOpenStrokeEndpoints(singleNode) &&
          shapeType !== 'line' &&
          shapeType !== 'arrow'
        ) {
          const box = liveOriginsNow[0].box;
          const d = String(singleNode?.attrs?.path || singleNode?.attrs?.d || '');
          const [a, b] = pathLocalEndpoints(d, box.width, box.height, 'path');
          pathEpLocal0 = a;
          pathEpLocal1 = b;
        }
        dragRef.current = seed('resize', e, p, {
          origins: liveOriginsNow.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })),
          union: { ...liveUnionNow },
          handle,
          // Multi-select union is axis-aligned; single keeps node angle for local resize.
          angle0,
          aspectRatio: liveUnionNow.width / Math.max(1, liveUnionNow.height),
          pathEpLocal0,
          pathEpLocal1,
        });
        setTransformingNotify(true);
        capture(e.pointerId);
        return;
      }

      const beginMoveSelection = () => {
        if (readOnly || !liveUnionNow || !liveOriginsNow?.length) return false;
        if (lockedSelection) return false;
        e.preventDefault();
        e.stopPropagation();
        const origins = liveOriginsNow.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } }));
        dragRef.current = seed('move', e, p, {
          origins,
          union: { ...liveUnionNow },
        });
        setLiveOrigins(origins);
        setLiveUnion(liveUnionNow);
        setTransformingNotify(true);
        capture(e.pointerId);
        return true;
      };

      const pointInLiveUnion =
        liveUnionNow &&
        p.x >= liveUnionNow.left &&
        p.x <= liveUnionNow.left + liveUnionNow.width &&
        p.y >= liveUnionNow.top &&
        p.y <= liveUnionNow.top + liveUnionNow.height;
      const selectionHasFrame = Boolean(
        liveOriginsNow?.some((o) => parseFrameSelId(o.nodeId))
      );

      // Drag control box (or anywhere on a frame-only / mixed selection chrome).
      const selBoxEl = target.closest('[data-sel-box]') as HTMLElement | null;
      if (selBoxEl && selectionHasFrame && !attachPickActive && beginMoveSelection()) return;

      // Hit-test scene nodes (selection chrome is non-blocking so empty clicks pass through).
      const hitId = hitTest(p.x, p.y, { clientX: e.clientX, clientY: e.clientY });
      const selectedIds = liveOriginsNow?.map((o) => o.nodeId) ?? [];
      const plateFrameId = hitId ? frameForFullBleedPlate(document, hitId) : null;

      // Composer pick: attach node or artboard; never move / never treat frame as blank cancel.
      if (attachPickActive) {
        e.preventDefault();
        e.stopPropagation();
        const frameUnder =
          plateFrameId ||
          (!hitId ? hitTestFrame?.(p.x, p.y) : null) ||
          (selectionHasFrame && pointInLiveUnion
            ? liveOriginsNow
                ?.map((o) => parseFrameSelId(o.nodeId))
                .find((fid): fid is string => Boolean(fid))
            : null);
        if (hitId && !plateFrameId) {
          // Do NOT call onSelectFrame(null) here ??during pick that clears pick mode.
          onSelect(expandSelectionWithGroups(document, [hitId]));
        } else if (frameUnder) {
          onSelectFrame?.(frameUnder);
        } else {
          // Truly empty canvas ??exit pick mode.
          onSelect([]);
        }
        dragRef.current = seed('blank', e, p, { skipSelectOnUp: true });
        capture(e.pointerId);
        return;
      }

      // Clicking a selected artboard (or its plate) moves the whole selection ??like a rect.
      if (
        !readOnly &&
        selectionHasFrame &&
        pointInLiveUnion &&
        (!hitId ||
          plateFrameId ||
          (hitId && selectedIds.includes(hitId)))
      ) {
        // Unselected content under the brush still gets normal select/move below.
        const plateSelected =
          plateFrameId &&
          liveOriginsNow!.some((o) => parseFrameSelId(o.nodeId) === plateFrameId);
        const emptyOrSelectedPlate = !hitId || Boolean(plateFrameId && plateSelected);
        const selectedNodeHit = Boolean(hitId && selectedIds.includes(hitId));
        if ((emptyOrSelectedPlate || selectedNodeHit) && beginMoveSelection()) return;
      }

      // Full-bleed background plate looks empty — start marquee, don't drag the plate.
      if (hitId && plateFrameId) {
        e.preventDefault();
        if (!e.shiftKey && !readOnly) {
          onSelectFrame?.(null);
          onSelect([]);
        }
        dragRef.current = seed('pointing_canvas', e, p);
        capture(e.pointerId);
        return;
      }

      // Shape under pointer ??select (if needed) then move. Never start a marquee on a shape.
      if (hitId) {
        e.preventDefault();
        e.stopPropagation();
        const additive = e.shiftKey;
        const expandedHit = expandSelectionWithGroups(document, [hitId]);

        if (readOnly) {
          // Preview / Dev inspect: select only (no move).
          onSelectFrame?.(null);
          onSelect(expandedHit, { additive });
          dragRef.current = seed('blank', e, p);
          capture(e.pointerId);
          return;
        }

        // Expand on down so pointerdown?move uses full group origins before Redux catches up.
        if (!selectedIds.includes(hitId)) {
          // Do not open text edit on pointerdown ??a single click's up would
          // otherwise count as a second tap and enter edit immediately.
          lastTextClickRef.current = null;
          onSelectFrame?.(null);
          onSelect(expandedHit, { additive });
        }
        // Shift-add only: wait for pointer-up; don't start a translate.
        if (additive && !selectedIds.includes(hitId)) {
          dragRef.current = seed('blank', e, p);
          capture(e.pointerId);
          return;
        }

        const { origins, union } = buildMoveOriginsForHit({
          document,
          hitId,
          selectedIds,
          expandedHit,
          liveOriginsNow,
          getNodeBox,
          fallbackPoint: p,
        });
        if (!origins.length) return;

        // Second click of a double-click: do not start a translate.
        if (isRecentNodeDoubleTap(lastNodeTapRef.current, hitId, e)) {
          lastNodeTapRef.current = null;
          dragRef.current = seed('blank', e, p);
          capture(e.pointerId);
          return;
        }
        lastNodeTapRef.current = { id: hitId, t: Date.now(), x: e.clientX, y: e.clientY };

        // Keep chrome rotation in sync ??transforming flips chromeAngle onto liveAngle.
        if (origins.length === 1 && !parseFrameSelId(origins[0].nodeId)) {
          setLiveAngle(readNodeAngle(document, origins[0].nodeId));
        }
        // Locked layers stay selectable but cannot start a drag.
        if (isSelectionOriginsLocked(document, origins)) {
          dragRef.current = seed('blank', e, p);
          capture(e.pointerId);
          return;
        }
        dragRef.current = seed('move', e, p, { origins, union });
        setLiveOrigins(origins);
        setLiveUnion(union);
        setTransformingNotify(true);
        capture(e.pointerId);
        return;
      }

      // Empty canvas / artboard interior — PointingCanvas → marquee after brush gate.
      // Soft-click on artboard selects the frame (on pointerup). Frame move is via title label
      // or by dragging inside an existing selection union (handled above).
      e.preventDefault();
      if (!readOnly && selectionHasFrame && pointInLiveUnion && beginMoveSelection()) {
        return;
      }
      if (!e.shiftKey) {
        onSelectFrame?.(null);
        onSelect([]);
      }
      dragRef.current = seed('pointing_canvas', e, p);
      capture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const {
        document,
        toScene,
        zoom,
        gridSize,
        readOnly,
        getNodeBox,
        onGeometryPreview,
        onAnglePreview,
      } = getPointerCtx();
      drag.currentClientX = e.clientX;
      drag.currentClientY = e.clientY;
      drag.currentShift = e.shiftKey;
      const screenDistSq = screenDragDistSq(drag, e.clientX, e.clientY);
      if (drag.mode === 'blank') {
        // Abandon soft click once past drag threshold.
        if (screenDistSq > DRAG_DISTANCE_SQUARED) {
          dragRef.current = null;
        }
        return;
      }
      // PointingCanvas → Brushing after dual screen-px gate.
      if (drag.mode === 'pointing_canvas') {
        if (readOnly) return;
        const { passed, box } = evaluateBrushGate(
          drag,
          zoom,
          e.clientX,
          e.clientY,
          e.pointerType || 'mouse'
        );
        if (!passed) return;
        drag.mode = 'marquee';
        setMarquee(box);
        return;
      }
      // Client-delta keeps the selection under the pointer when the stage rect
      // shifts (mobile chrome / small-viewport reflow). Rotate still needs an
      // absolute scene point for atan2 around the pivot.
      const gesture = sceneFromClientGesture(drag, zoom, e.clientX, e.clientY);
      const dx = gesture.dx;
      const dy = gesture.dy;
      const abs = toScene(e.clientX, e.clientY);
      const p =
        drag.mode === 'rotate' ? abs : { x: gesture.x, y: gesture.y };

      if (drag.mode === 'marquee') {
        setMarquee(normalizeBox(drag.sceneX0, drag.sceneY0, p.x, p.y));
        return;
      }

      if (drag.mode === 'rotate' && drag.center && drag.pointerAngle0 != null) {
        // Soft-click on rotate knob ??ignore OS pointer jitter.
        if (screenDistSq <= DRAG_DISTANCE_SQUARED) return;
        const { next, delta } = computeRotateDelta(drag, p, e.shiftKey);
        setLiveAngle(next);
        if (drag.origins.length === 1) {
          onAnglePreview?.(drag.origins[0].nodeId, next);
          return;
        }
        const moved = rotateBoxesAround(
          drag.origins.map((o) => o.box),
          drag.center,
          delta
        );
        const nextOrigins = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          box: moved[i],
          angle0: o.angle0,
        }));
        const nextUnion = unionOfBoxes(moved) || drag.union;
        setLiveOrigins(nextOrigins.map((o) => ({ nodeId: o.nodeId, box: o.box })));
        setLiveUnion(nextUnion);
        onGeometryPreview?.(
          nextOrigins.map((o) => ({
            nodeId: o.nodeId,
            left: o.box.left,
            top: o.box.top,
            width: o.box.width,
            height: o.box.height,
          }))
        );
        nextOrigins.forEach((o) => {
          onAnglePreview?.(o.nodeId, Number(o.angle0 || 0) + delta);
        });
        return;
      }

      if (drag.mode === 'move') {
        // Ignore pointer jitter until the pointer actually moves (protects dblclick).
        if (screenDistSq <= DRAG_DISTANCE_SQUARED) return;
        const { nextUnion, sdx, sdy } = computeMovedUnion({
          union: drag.union,
          dx,
          dy,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
        });
        const nextOrigins = drag.origins.map((o) => ({
          nodeId: o.nodeId,
          box: { ...o.box, left: o.box.left + sdx, top: o.box.top + sdy },
        }));
        setLiveUnion(nextUnion);
        setLiveOrigins(nextOrigins);
        onGeometryPreview?.(
          nextOrigins.map((o) => ({
            nodeId: o.nodeId,
            left: o.box.left,
            top: o.box.top,
            width: o.box.width,
            height: o.box.height,
          }))
        );
        return;
      }

      if (drag.mode === 'resize' && drag.handle) {
        // Soft-click on a handle must not resize: at 3% zoom, 2px jitter ??60+
        // scene units and snap threshold is huge (8/zoom), so the box jumps.
        if (screenDistSq <= DRAG_DISTANCE_SQUARED) return;
        const stroke = strokeEndpointBox(drag, document, p.x, p.y);
        if (stroke) {
          setLiveUnion(stroke.next);
          setLiveOrigins([{ nodeId: stroke.strokeId, box: stroke.next }]);
          setLiveAngle(stroke.angle);
          onGeometryPreview?.([
            {
              nodeId: stroke.strokeId,
              left: stroke.next.left,
              top: stroke.next.top,
              width: stroke.next.width,
              height: stroke.next.height,
            },
          ]);
          onAnglePreview?.(stroke.strokeId, stroke.angle);
          return;
        }
        const { next, textMode } = computeResizedUnion({
          document,
          drag,
          dx,
          dy,
          shiftKey: e.shiftKey,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
        });
        if (drag.origins.length === 1) {
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: drag.origins[0].nodeId, box: next }]);
          onGeometryPreview?.(
            [
              {
                nodeId: drag.origins[0].nodeId,
                left: next.left,
                top: next.top,
                width: next.width,
                height: next.height,
              },
            ],
            textMode ? { textResizeMode: textMode } : undefined
          );
          return;
        }
        const scaled = scaleBoxesToUnion(
          drag.origins.map((o) => o.box),
          drag.union,
          next
        );
        const nextOrigins = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          box: scaled[i],
        }));
        setLiveUnion(next);
        setLiveOrigins(nextOrigins);
        onGeometryPreview?.(
          nextOrigins.map((o) => ({
            nodeId: o.nodeId,
            left: o.box.left,
            top: o.box.top,
            width: o.box.width,
            height: o.box.height,
          }))
        );
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      // Always clear the brush — even if the gesture ref was lost mid-flight
      // (effect remount used to drop pointerup and leave the box stuck).
      setMarquee(null);
      if (!drag) return;
      dragRef.current = null;
      const {
        document,
        toScene,
        zoom,
        gridSize,
        readOnly,
        attachPickActive,
        hitTest,
        hitTestFrame,
        getNodeBox,
        listNodeIds,
        queryNodeIdsInRect,
        onSelect,
        onSelectFrame,
        onSelectMixed,
        onSelectFrames,
        onGeometryCommit,
        onAngleCommit,
      } = getPointerCtx();
      try {
        hitEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      // End events are lifecycle-only; geometry uses last down/move client point.
      const clientX = drag.currentClientX;
      const clientY = drag.currentClientY;
      const shiftKey = drag.currentShift ?? e.shiftKey;
      const gesture = sceneFromClientGesture(drag, zoom, clientX, clientY);
      const dx = gesture.dx;
      const dy = gesture.dy;
      const absEnd = toScene(clientX, clientY);
      // Move / resize / marquee: client-delta (stable if stage rect jitters).
      // Rotate: absolute scene point for atan2 around the pivot.
      let p = absEnd;
      if (drag.mode === 'move' || drag.mode === 'resize' || drag.mode === 'marquee') {
        p = { x: gesture.x, y: gesture.y };
      }
      const screenDistSq = screenDragDistSq(drag, clientX, clientY);

      const endTransform = () => setTransformingNotify(false);

      // Soft click on empty stage (never entered Brushing).
      if (drag.mode === 'pointing_canvas') {
        setMarquee(null);
        lastTextClickRef.current = null;
        softSelectFrameAt(toScene, hitTestFrame, onSelectFrame, clientX, clientY);
        endTransform();
        return;
      }

      if (drag.mode === 'marquee') {
        setMarquee(null);
        lastTextClickRef.current = null;
        const { passed, box } = evaluateBrushGate(
          drag,
          zoom,
          clientX,
          clientY,
          e.pointerType || 'mouse'
        );
        // Still under brush gate — treat as soft click (select artboard if any).
        if (!passed) {
          softSelectFrameAt(toScene, hitTestFrame, onSelectFrame, clientX, clientY);
          endTransform();
          return;
        }
        const candidates = queryNodeIdsInRect?.(box) ?? listNodeIds();
        const rawHits = candidates.filter((id) =>
          nodeHitsMarquee(document, id, box, getNodeBox, toScene)
        );
        const frameHits = framesHittingMarquee(document, box).map((f) => f.id);
        // Full-bleed plate: keep when artboard brushed, or other non-plate content hit.
        const contentHits = filterMarqueeContentHits(document, rawHits, new Set(frameHits));
        commitMarqueeSelection({
          contentHits,
          frameHits,
          rawHits,
          shiftKey,
          onSelectMixed,
          onSelectFrames,
          onSelectFrame,
          onSelect,
        });
        endTransform();
        return;
      }

      if (drag.mode === 'blank') {
        // Attach-pick already applied on pointerdown ??do not onSelect on up
        // (one-shot clearPick flips attachPickActive off before up; selecting
        // here would steal focus from the host node / double-add chips).
        if (
          !drag.skipSelectOnUp &&
          !attachPickActive &&
          screenDistSq <= DRAG_DISTANCE_SQUARED
        ) {
          const id = hitTest(p.x, p.y, { clientX, clientY });
          if (id && tryOpenTextEdit(id)) {
            endTransform();
            return;
          }
          if (id) onSelect([id], { additive: shiftKey });
        }
        endTransform();
        return;
      }

      if (drag.mode === 'rotate' && drag.center && drag.pointerAngle0 != null) {
        // Soft-click: restore start pose ??do not apply angle jitter.
        if (screenDistSq <= DRAG_DISTANCE_SQUARED) {
          setLiveAngle(drag.angle0 || 0);
          setLiveUnion({ ...drag.union });
          setLiveOrigins(drag.origins.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })));
          endTransform();
          return;
        }
        const { next, delta } = computeRotateDelta(drag, p, shiftKey);
        setLiveAngle(next);
        if (drag.origins.length === 1) {
          onAngleCommit?.(drag.origins[0].nodeId, next);
          endTransform();
          return;
        }
        const moved = rotateBoxesAround(
          drag.origins.map((o) => o.box),
          drag.center,
          delta
        );
        const patches = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          left: moved[i].left,
          top: moved[i].top,
          width: moved[i].width,
          height: moved[i].height,
        }));
        const nextUnion = unionOfBoxes(moved) || drag.union;
        setLiveUnion(nextUnion);
        setLiveOrigins(patches.map((pt) => ({ nodeId: pt.nodeId, box: pt })));
        if (Math.abs(delta) > 0.01) {
          // One history entry for the whole multi-rotate (geometry + angles).
          onGeometryCommit(patches);
          drag.origins.forEach((o) => {
            onAngleCommit?.(o.nodeId, Number(o.angle0 || 0) + delta, { skipHistory: true });
          });
        }
        // Multi chrome is axis-aligned; reset visual group angle after commit.
        setLiveAngle(0);
        endTransform();
        return;
      }

      if (drag.mode === 'move') {
        // Soft-click: never leave liveUnion on a snap-only nudge while the
        // document stays put ??that desyncs chrome from the shape (worst at
        // 3%/800% where 8px snap ??huge / visible scene delta).
        if (screenDistSq <= DRAG_DISTANCE_SQUARED) {
          setLiveUnion({ ...drag.union });
          setLiveOrigins(drag.origins.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })));
          if (drag.origins.length === 1 && tryOpenTextEdit(drag.origins[0].nodeId)) {
            endTransform();
            return;
          }
          endTransform();
          return;
        }
        const { nextUnion, sdx, sdy } = computeMovedUnion({
          union: drag.union,
          dx,
          dy,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
        });
        const patches = drag.origins.map((o) => ({
          nodeId: o.nodeId,
          left: o.box.left + sdx,
          top: o.box.top + sdy,
          width: o.box.width,
          height: o.box.height,
        }));
        setLiveUnion(nextUnion);
        setLiveOrigins(patches.map((pt) => ({ nodeId: pt.nodeId, box: pt })));
        if (Math.hypot(sdx, sdy) > 0.01) {
          lastTextClickRef.current = null;
          onGeometryCommit(patches);
        }
        endTransform();
        return;
      }

      if (drag.mode === 'resize' && drag.handle) {
        if (screenDistSq <= DRAG_DISTANCE_SQUARED) {
          setLiveUnion({ ...drag.union });
          setLiveOrigins(drag.origins.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })));
          endTransform();
          return;
        }
        const stroke = strokeEndpointBox(drag, document, p.x, p.y);
        if (stroke) {
          setLiveUnion(stroke.next);
          setLiveOrigins([{ nodeId: stroke.strokeId, box: stroke.next }]);
          setLiveAngle(stroke.angle);
          lastTextClickRef.current = null;
          // Bake angle into documentRef first so geometry rebuild reads attrs.angle;
          // one history entry via onGeometryCommit (do not patch angle into Redux first).
          onAnglePreview?.(stroke.strokeId, stroke.angle);
          onGeometryCommit([
            {
              nodeId: stroke.strokeId,
              left: stroke.next.left,
              top: stroke.next.top,
              width: stroke.next.width,
              height: stroke.next.height,
            },
          ]);
          endTransform();
          return;
        }
        const { next, textMode } = computeResizedUnion({
          document,
          drag,
          dx,
          dy,
          shiftKey,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
        });
        if (drag.origins.length === 1) {
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: drag.origins[0].nodeId, box: next }]);
          onGeometryCommit(
            [
              {
                nodeId: drag.origins[0].nodeId,
                left: next.left,
                top: next.top,
                width: next.width,
                height: next.height,
              },
            ],
            textMode ? { textResizeMode: textMode } : undefined
          );
          endTransform();
          return;
        }
        const scaled = scaleBoxesToUnion(
          drag.origins.map((o) => o.box),
          drag.union,
          next
        );
        const patches = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          left: scaled[i].left,
          top: scaled[i].top,
          width: scaled[i].width,
          height: scaled[i].height,
        }));
        setLiveUnion(next);
        setLiveOrigins(patches.map((pt) => ({ nodeId: pt.nodeId, box: pt })));
        onGeometryCommit(patches);
      }
      endTransform();
    };

    const onDblClick = (e: MouseEvent) => {
      const {
        document,
        toScene,
        readOnly,
        hitTest,
        onSelect,
        onEditText,
        onEditPenPath,
      } = getPointerCtx();
      if (readOnly) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-sel-toolbar],[data-frame-toolbar],[data-text-inline-editor]')) {
        return;
      }
      const p = toScene(e.clientX, e.clientY);
      let hit = hitTest(p.x, p.y, { clientX: e.clientX, clientY: e.clientY });
      // Selection chrome covers the glyph — fall back to the single selected node.
      if (!hit && target?.closest?.('[data-sel-box]')) {
        const ids = liveOriginsRef.current?.map((o) => o.nodeId) || [];
        if (ids.length === 1) hit = ids[0];
      }
      if (!hit) return;
      const node = document?.deltaSetLike?.[hit];
      if (node?.key === 'text') {
        e.preventDefault();
        e.stopPropagation();
        lastTextClickRef.current = null;
        onSelect([hit]);
        onEditText?.(hit);
        return;
      }
      if (isEditablePathNode(node)) {
        e.preventDefault();
        e.stopPropagation();
        lastNodeTapRef.current = null;
        onSelect([hit]);
        onEditPenPath?.(hit);
      }
    };

    // Chrome lives in the unscaled overlay — also listen there for resize/rotate / dblclick.
    // Infinite paper is 0×0; stage receives empty artboard / shape clicks.
    // Deps stay element/enabled-only: document/zoom/callbacks live in refs so a
    // setMarquee / onSelect re-render cannot tear down window pointerup mid-gesture
    // (that left the blue brush stuck on a soft click).
    hitEl.addEventListener('pointerdown', onDown);
    overlayRoot?.addEventListener('pointerdown', onDown);
    hitEl.addEventListener('dblclick', onDblClick);
    overlayRoot?.addEventListener('dblclick', onDblClick);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      hitEl.removeEventListener('pointerdown', onDown);
      overlayRoot?.removeEventListener('pointerdown', onDown);
      hitEl.removeEventListener('dblclick', onDblClick);
      overlayRoot?.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragRef.current = null;
      setMarquee(null);
    };
  }, [enabled, hitEl, overlayRoot]);

  /** Arrow keys nudge selection 1px (Shift = 10px). Grid mode: step = gridSize (Shift = 5×). */
  useEffect(() => {
    if (!enabled || suppressChrome || readOnly) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (dragRef.current) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          t.closest?.(
            '[data-fill-panel],[data-color-panel],[data-stroke-panel],[data-shape-style-panel],[data-sel-toolbar],[data-frame-toolbar],[data-text-inline-editor]'
          ))
      ) {
        return;
      }
      const origins = liveOriginsRef.current;
      const union = liveUnionRef.current;
      if (!origins?.length || !union) return;
      if (isSelectionOriginsLocked(document, origins)) return;

      e.preventDefault();
      const step = e.shiftKey ? Math.max(10, gridSize * 10) : Math.max(1, gridSize);
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      let nextUnion = { ...union, left: union.left + dx, top: union.top + dy };
      nextUnion = snapBoxToGrid(nextUnion, gridSize);
      const sdx = nextUnion.left - union.left;
      const sdy = nextUnion.top - union.top;
      const nextOrigins = origins.map((o) => ({
        nodeId: o.nodeId,
        box: { ...o.box, left: o.box.left + sdx, top: o.box.top + sdy },
      }));
      setLiveUnion(nextUnion);
      setLiveOrigins(nextOrigins);
      onGeometryCommit(
        nextOrigins.map((o) => ({
          nodeId: o.nodeId,
          left: o.box.left,
          top: o.box.top,
          width: o.box.width,
          height: o.box.height,
        }))
      );
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [
    enabled,
    readOnly,
    suppressChrome,
    document,
    listNodeIds,
    getNodeBox,
    onGeometryCommit,
    queryNodeIdsInRect,
    gridSize,
  ]);

  const singleId = singleNode ? selectedNodeIds[0] : null;
  const singleNodeData = singleId ? document?.deltaSetLike?.[singleId] : null;
  const selectedIsImageGen = Boolean(singleNodeData && isImageGeneratorNode(singleNodeData));
  const selectedIsVideoGen = Boolean(singleNodeData && isVideoGeneratorNode(singleNodeData));
  const selectedIsVideo = Boolean(singleNodeData && singleNodeData.key === 'video' && !selectedIsVideoGen);
  const singleShapeType = singleNodeData
    ? String(singleNodeData?.attrs?.shapeType || '')
    : '';
  const lineChrome =
    singleNode && (singleShapeType === 'line' || singleShapeType === 'arrow');

  /** While rotating (or free-angle stroke resize), show liveAngle; otherwise trust attrs. */
  const chromeAngle = (() => {
    if (!enabled) return 0;
    if (!singleNode) return 0;
    const id = selectedNodeIds[0];
    const fromDoc = readNodeAngle(document, id);
    if (!transforming) return fromDoc;
    const mode = dragRef.current?.mode;
    if (mode === 'rotate') return liveAngle;
    if (mode === 'resize' && isStrokeShapeType(readNodeShapeType(document, id))) {
      return liveAngle;
    }
    if (
      mode === 'resize' &&
      dragRef.current?.pathEpLocal0 &&
      dragRef.current?.pathEpLocal1
    ) {
      return liveAngle;
    }
    // Move / box-resize: always use stored angle ??avoids click flash when liveAngle lags at 0.
    return fromDoc;
  })();

  /** Single node or single frame — both get size badge + hover spacing. */
  const inspectPrimaryId = resolveInspectPrimaryId(selectedNodeIds, selectedFrameIds);

  /** Host path silhouette / handles / transform spacing aux for vector nodes. */
  const shapeOutlines = (() => {
    if (!enabled || suppressChrome) {
      return [] as ShapeOutlineItem[];
    }
    const ids: string[] = [];
    const handleIds = new Set<string>();
    /** Geom box override while dragging (host live origin). */
    const hostGuideBoxById = new Map<string, SceneBox>();
    /** Multi (nodes and/or frames): host silhouettes only — union handles live on SelectionChrome. */
    const hostHandlesOk =
      !readOnly &&
      selectedNodeIds.length === 1 &&
      selectedFrameIds.length === 0;

    const pushId = (id: string | null | undefined) => {
      if (!id || parseFrameSelId(id) || ids.includes(id)) return;
      ids.push(id);
    };

    const inspectPairId = (() => {
      if (!inspectDev || transforming) return null;
      if (
        hoverNodeId &&
        hoverNodeId !== inspectPrimaryId &&
        !selectedNodeIds.includes(hoverNodeId) &&
        !parseFrameSelId(hoverNodeId)
      ) {
        return hoverNodeId;
      }
      if (
        inspectPairNodeId &&
        inspectPairNodeId !== inspectPrimaryId &&
        !selectedNodeIds.includes(inspectPairNodeId) &&
        !parseFrameSelId(inspectPairNodeId)
      ) {
        return inspectPairNodeId;
      }
      return null;
    })();

    // Hover path silhouette — edit + inspect (same algorithm).
    if (!transforming && hoverNodeId && !selectedNodeIds.includes(hoverNodeId)) {
      pushId(hoverNodeId);
    }

    // Inspect click-pair silhouette when not hovering.
    if (inspectDev && !transforming && inspectPairId) {
      pushId(inspectPairId);
    }

    // Inspect select: path silhouette only (spacing/size badges removed — reimplement later).
    if (
      inspectDev &&
      !transforming &&
      inspectPrimaryId &&
      !parseFrameSelId(inspectPrimaryId) &&
      nodeUsesPathChrome(document?.deltaSetLike?.[inspectPrimaryId])
    ) {
      pushId(inspectPrimaryId);
    }

    // Edit idle: selected path chrome + handles (single).
    if (!inspectDev && !transforming) {
      for (const sid of selectedNodeIds) {
        const sn = document?.deltaSetLike?.[sid];
        if (!nodeUsesPathChrome(sn)) continue;
        pushId(sid);
        // Single only — multi uses one world SelectionChrome, not per-host knobs.
        if (hostHandlesOk) handleIds.add(sid);
      }
    }

    // Transform: keep mover path chrome mounted (geometry live-updates with drag).
    if (
      !inspectDev &&
      transforming &&
      selectedNodeIds.length === 1 &&
      selectedFrameIds.length === 0
    ) {
      const sid = selectedNodeIds[0];
      const sn = sid ? document?.deltaSetLike?.[sid] : null;
      if (sid && nodeUsesPathChrome(sn)) {
        pushId(sid);
        const hostGeom = liveShapeGeomBox(sid);
        const liveChrome = liveOrigins?.find((o) => o.nodeId === sid)?.box;
        const anchorBox =
          hostGeom ||
          (liveChrome ? deflateSelectionBox(liveChrome, sn) : null) ||
          (() => {
            const chrome = getNodeBox(sid);
            return chrome ? deflateSelectionBox(chrome, sn) : null;
          })();
        if (anchorBox) hostGuideBoxById.set(sid, anchorBox);
      }
    }

    const out: ShapeOutlineItem[] = [];
    for (const id of ids) {
      const node = document?.deltaSetLike?.[id];
      if (!nodeUsesPathChrome(node)) continue;
      const liveChrome =
        transforming && liveOrigins
          ? liveOrigins.find((o) => o.nodeId === id)?.box
          : null;
      const chromeBox = liveChrome || getNodeBox(id);
      if (!chromeBox) continue;
      const geomBox =
        hostGuideBoxById.get(id) ||
        (liveChrome
          ? deflateSelectionBox(liveChrome, node)
          : liveShapeGeomBox(id) || deflateSelectionBox(chromeBox, node));
      const gw = Math.max(1, geomBox.width);
      const gh = Math.max(1, geomBox.height);
      const rawPath = String(node.attrs?.path || node.attrs?.d || '');
      const shapeType = String(node.attrs?.shapeType || '');
      // Path / pen / pencil: always host-inject the real painted path — never AABB stand-in.
      const vectorStroke =
        shapeType === 'pencil' ||
        shapeType === 'pen' ||
        shapeType === 'path' ||
        shapeType === 'line' ||
        shapeType === 'arrow' ||
        String(node.key || '') === 'path' ||
        nodeUsesOpenStrokeEndpoints(node);
      const pathD = vectorStroke
        ? rawPath.trim().length >= 2
          ? rawPath
          : geometryIndicatorPathD(node, { width: gw, height: gh })
        : rawPath.length >= HEAVY_PATH_D_CHARS
          ? `M 0 0 H ${gw} V ${gh} H 0 Z`
          : geometryIndicatorPathD(node, { width: gw, height: gh });
      if (!pathD) continue;
      rememberNodePath2D(id, pathD);
      const angle =
        id === singleId ? chromeAngle : readNodeAngle(document, id);
      const lineMode = nodeUsesOpenStrokeEndpoints(node);
      const shaftEndpoints = shapeType === 'line' || shapeType === 'arrow';
      const withHandles = handleIds.has(id);
      out.push({
        id,
        pathD,
        box: geomBox,
        angle,
        color: '#3388ff',
        withHandles,
        // Selected with handles: control box only (no blue path silhouette).
        // Hover / inspect without handles still show the path line.
        showPath: !withHandles && !transforming,
        lineMode,
        shaftEndpoints,
        showRotate: withHandles && !lineMode && !selectedIsImageGen && !selectedIsVideoGen,
      });
    }
    return out;
  })();

  const hostInjectedSelection = isHostInjectedSelection(
    singleNode,
    singleId,
    shapeOutlines,
    { inspectDev, node: singleNodeData }
  );

  /** Scene pad beyond chrome to outer stroke ink (center → sw/2 outside the box). */
  const toolbarEdgePadScene = (() => {
    if (!singleNodeData) return 0;
    const visual = strokeVisualOutset(singleNodeData);
    const chrome = Math.max(0, strokeChromeOutset(singleNodeData));
    return Math.max(0, visual - chrome);
  })();

  /** SelectionChrome edge knobs: generators none; video/text L/R only; else all. */
  function selectionEdgeHandles(): 'all' | 'horizontal' | 'none' {
    if (selectedIsImageGen || selectedIsVideoGen) return 'none';
    // Video scrubber on bottom — keep L/R only so S handle does not steal events.
    if (selectedIsVideo) return 'horizontal';
    if (!lineChrome && singleNodeData?.key === 'text') return 'horizontal';
    return 'all';
  }

  // DPR seam diagnostics ??opt-in: window.__RCB_DPR_DEBUG__ = true
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (window.__RCB_DPR_DEBUG__ !== true) return;
    if (!selectedNodeIds.length) return;
    const dpr = window.devicePixelRatio || 1;
    const samples = selectedNodeIds
      .map((id) => {
        const b = getNodeBox(id);
        if (!b) return null;
        return sampleBoxEdges(id, b, camera, dpr);
      })
      .filter(Boolean) as ReturnType<typeof sampleBoxEdges>[];
    logEdgeSamples(`selection(${selectedNodeIds.length})`, samples, dpr, camera);
  }, [enabled, selectedNodeIds, camera.x, camera.y, camera.zoom, getNodeBox, camera]);

  // Idle selection bounds update in the same paint as Redux; liveUnion lags one
  // effect tick and used to flash empty chrome when switching frames in preview.
  const chromeUnion = (() => {
    const base = transforming ? liveUnion : selectionUnion;
    if (!base || transforming) return base;
    // Single node: prefer live host geom when it matches document (subpixel align
    // with path chrome). If the host lags a remount after move/resize, fall back
    // to selectionUnion so shape knobs don't stick at the old seat.
    if (selectedNodeIds.length === 1 && selectedFrameIds.length === 0) {
      const live = liveShapeGeomBox(selectedNodeIds[0]);
      if (
        live &&
        Math.abs(live.left - base.left) < 2 &&
        Math.abs(live.top - base.top) < 2 &&
        Math.abs(live.width - base.width) < 2 &&
        Math.abs(live.height - base.height) < 2
      ) {
        return live;
      }
    }
    return base;
  })();

  const hoverImageReplaceId = (() => {
    if (inspectDev || transforming || suppressToolbars) return null;
    if (!hoverNodeId || selectedNodeIds.includes(hoverNodeId) || parseFrameSelId(hoverNodeId)) {
      return null;
    }
    const node = document?.deltaSetLike?.[hoverNodeId];
    if (node?.key !== 'image') return null;
    if (isImageGeneratorNode(node) || isVideoGeneratorNode(node)) return null;
    if (String(node?.attrs?.processStatus || '') === 'running') return null;
    return hoverNodeId;
  })();
  const hoverImageReplaceBox = hoverImageReplaceId ? getNodeBox(hoverImageReplaceId) : null;

  const hoverVideoReplaceId = (() => {
    if (inspectDev || transforming || suppressToolbars || readOnly) return null;
    if (!hoverNodeId || selectedNodeIds.includes(hoverNodeId) || parseFrameSelId(hoverNodeId)) {
      return null;
    }
    const node = document?.deltaSetLike?.[hoverNodeId];
    if (node?.key !== 'video') return null;
    if (isVideoGeneratorNode(node)) return null;
    if (String(node?.attrs?.processStatus || '') === 'running') return null;
    return hoverNodeId;
  })();
  const hoverVideoReplaceBox = hoverVideoReplaceId ? getNodeBox(hoverVideoReplaceId) : null;

  // Marquee only — path multi-select uses host silhouettes + world union box.
  // Vector ink uses host path chrome; non-path uses SelectionChrome (handles / box).

  if (!enabled) return null;

  // Path chrome already covers single vector selection (and inspect path ink).
  const skipWorldSelectionChrome = hostInjectedSelection;

  return (
    <>
      <ShapeOutlineSvg outlines={shapeOutlines} />
      <BrushOverlay box={marquee} />

      {/* World SelectionChrome only when idle — no control box while moving/resizing.
          Multi: always the union box + corner handles. Single path: host silhouette. */}
      {chromeUnion &&
      !suppressChrome &&
      selectionCount > 0 &&
      !transforming &&
      !skipWorldSelectionChrome ? (
        <SelectionChrome
          box={chromeUnion}
          angle={chromeAngle}
          showHandles={!inspectDev && !readOnly && !selectedIsImageGen && !selectedIsVideoGen}
          cornerHandlesOnly={!single}
          variant={lineChrome ? 'line' : 'box'}
          showRotate={
            !inspectDev &&
            !readOnly &&
            !lineChrome &&
            singleNode &&
            !selectedIsImageGen &&
            !selectedIsVideoGen
          }
          showBoxStroke={!lineChrome}
          interactiveBox={selectedFrameIds.length > 0}
          edgeHandles={selectionEdgeHandles()}
        />
      ) : null}

      {!inspectDev &&
      !readOnly &&
      !transforming &&
      chromeUnion &&
      singleNode &&
      singleId &&
      singleNodeData &&
      supportsCornerRadius(singleNodeData) &&
      !supportsShapeSides(singleNodeData) &&
      !lineChrome &&
      !suppressChrome &&
      !selectedIsImageGen ? (
        <CornerRadiusHandlesOverlay
          box={chromeUnion}
          angle={chromeAngle}
          nodeId={singleId}
          node={singleNodeData}
          toScene={toScene}
          stageEl={hitEl}
          interactive
        />
      ) : null}

      {!inspectDev &&
      !readOnly &&
      !transforming &&
      chromeUnion &&
      singleNode &&
      singleId &&
      singleNodeData &&
      (String(singleNodeData?.attrs?.shapeType || '') === 'circle' ||
        singleNodeData?.key === 'ellipse') &&
      !lineChrome &&
      !suppressChrome &&
      !selectedIsImageGen ? (
        <CircleShapeHandlesOverlay
          box={chromeUnion}
          angle={chromeAngle}
          nodeId={singleId}
          node={singleNodeData}
          toScene={toScene}
          stageEl={hitEl}
          interactive
        />
      ) : null}

      {!inspectDev &&
      !readOnly &&
      !transforming &&
      chromeUnion &&
      singleNode &&
      singleId &&
      singleNodeData &&
      String(singleNodeData?.attrs?.shapeType || '') === 'polygon' &&
      !lineChrome &&
      !suppressChrome &&
      !selectedIsImageGen ? (
        <PolygonShapeHandlesOverlay
          box={chromeUnion}
          angle={chromeAngle}
          nodeId={singleId}
          node={singleNodeData}
          toScene={toScene}
          stageEl={hitEl}
          interactive
        />
      ) : null}

      {!inspectDev &&
      !readOnly &&
      !transforming &&
      chromeUnion &&
      singleNode &&
      singleId &&
      singleNodeData &&
      String(singleNodeData?.attrs?.shapeType || '') === 'star' &&
      !lineChrome &&
      !suppressChrome &&
      !selectedIsImageGen ? (
        <StarShapeHandlesOverlay
          box={chromeUnion}
          angle={chromeAngle}
          nodeId={singleId}
          node={singleNodeData}
          toScene={toScene}
          stageEl={hitEl}
          interactive
        />
      ) : null}

      {!inspectDev && chromeUnion && singleNode && !transforming && !suppressToolbars ? (
        <SelectionContextToolbar
          document={document}
          nodeId={selectedNodeIds[0]}
          box={chromeUnion}
          edgePadScene={toolbarEdgePadScene}
          onOpenAgent={onOpenAgent}
        />
      ) : null}

      {!inspectDev &&
      chromeUnion &&
      singleNode &&
      singleId &&
      !transforming &&
      !suppressToolbars &&
      (singleNodeData?.key === 'image' || singleNodeData?.key === 'video') ? (
        <NodeTitleLabel
          box={chromeUnion}
          angle={chromeAngle}
          name={String(
            singleNodeData?.attrs?.name ||
              (singleNodeData?.key === 'video' ? 'Video' : 'Image')
          )}
          sizeWidth={chromeUnion.width}
          sizeHeight={chromeUnion.height}
          dataAttr="image-label"
          icon={
            selectedIsVideoGen
              ? 'video-generator'
              : selectedIsVideo
                ? 'video'
                : selectedIsImageGen
                  ? 'image-generator'
                  : 'image'
          }
          dataProps={{ 'data-scene-node-id': singleId }}
          onRename={(name) =>
            dispatch(
              patchDocumentNode({
                nodeId: singleId,
                patch: { attrs: { name } },
              })
            )
          }
          renameAriaLabel={singleNodeData?.key === 'video' ? 'Video name' : 'Image name'}
        />
      ) : null}

      {!inspectDev &&
      liveUnion &&
      singleNode &&
      singleId &&
      !transforming &&
      !suppressToolbars &&
      singleNodeData?.key === 'image' &&
      !selectedIsImageGen &&
      String(singleNodeData?.attrs?.processStatus || '') !== 'running' ? (
        listImageVariantUrls(singleNodeData).length > 1 ? (
          <ImageVariantsOverlay
            document={document}
            nodeId={singleId}
            box={liveUnion}
            angle={chromeAngle}
            imageHovered={hoverNodeId === singleId}
            readOnly={readOnly}
          />
        ) : (
          <ImageReplaceCornerButton
            nodeId={singleId}
            box={liveUnion}
            angle={chromeAngle}
            imageHovered={hoverNodeId === singleId}
          />
        )
      ) : null}

      {singleId &&
      liveUnion &&
      !readOnly &&
      !transforming &&
      !suppressToolbars &&
      selectedIsVideo &&
      String(singleNodeData?.attrs?.processStatus || '') !== 'running' ? (
        <VideoReplaceCornerButton
          nodeId={singleId}
          box={liveUnion}
          angle={chromeAngle}
          videoHovered={hoverNodeId === singleId}
        />
      ) : null}

      {!inspectDev &&
      hoverImageReplaceId &&
      hoverImageReplaceBox &&
      !transforming &&
      !suppressToolbars ? (
        listImageVariantUrls(document.deltaSetLike[hoverImageReplaceId]).length > 1 ? (
          <ImageVariantsOverlay
            document={document}
            nodeId={hoverImageReplaceId}
            box={hoverImageReplaceBox}
            angle={readNodeAngle(document, hoverImageReplaceId)}
            imageHovered
            readOnly={readOnly}
          />
        ) : (
          <ImageReplaceCornerButton
            nodeId={hoverImageReplaceId}
            box={hoverImageReplaceBox}
            angle={readNodeAngle(document, hoverImageReplaceId)}
            imageHovered
          />
        )
      ) : null}

      {!inspectDev &&
      hoverVideoReplaceId &&
      hoverVideoReplaceBox &&
      !transforming &&
      !suppressToolbars ? (
        <VideoReplaceCornerButton
          nodeId={hoverVideoReplaceId}
          box={hoverVideoReplaceBox}
          angle={readNodeAngle(document, hoverVideoReplaceId)}
          videoHovered
        />
      ) : null}

      {/* Multi-select bar: show whenever the union has 2+ items and at least one
          scene node. Do not hide just because an artboard is co-selected. */}
      {!inspectDev &&
      liveUnion &&
      !single &&
      selectedNodeIds.length >= 1 &&
      !transforming &&
      !suppressToolbars ? (
        <MultiSelectionToolbar
          document={document}
          nodeIds={selectedNodeIds}
          frameIds={selectedFrameIds}
          box={liveUnion}
        />
      ) : null}
    </>
  );
}

export default memo(SelectionFeature);
