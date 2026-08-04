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
import { toDomPrecision } from '@/components/rcb/core/dpr';
import { logEdgeSamples, sampleBoxEdges } from '@/components/rcb/core/dprDebug';
import { type AlignGuide } from './AlignGuidesOverlay';
import {
  chromeBandGuideBoxes,
  frameGuideBoxes,
  framesContainingBox,
  getDocumentGridSize,
  getSnapNeighborPad,
  getSnapThreshold,
  nodeGuideBoxes,
  nodeGuideBoxesForIds,
  snapBoxToGrid,
  snapBoxToGuides,
  snapResizeToGrid,
  snapResizeToGuides,
  type SceneBox,
} from './alignGuides';
import SelectionChrome from './SelectionChrome';
import SelectionContextToolbar from './chrome/SelectionContextToolbar';
import MultiSelectionToolbar from './chrome/MultiSelectionToolbar';
import NodeTitleLabel from './chrome/NodeTitleLabel';
import CornerRadiusHandlesOverlay from './chrome/CornerRadiusHandlesOverlay';
import SpacingInspectOverlay, {
  boxesInvolvedInGuides,
  computeMoveMarginResult,
  computePairSpacingMeasures,
  SPACING_MEASURE_COLOR,
  SPACING_SIZE_BADGE_COLOR,
  type SpacingMeasure,
} from './SpacingInspectOverlay';
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
  ChromeAlignGuidesSvg,
  liveShapeGeomBox,
  nodeUsesPathChrome,
  nodeUsesOpenStrokeEndpoints,
  pathLocalEndpoints,
  localPointToWorld,
  boxFromLocalAnchor,
  type ShapeOutlineItem,
} from './HostPathChrome';

const CORNER_HANDLES = new Set<ResizeHandle>(['nw', 'ne', 'sw', 'se']);

type HairlineItem = {
  box: SceneBox;
  color: string;
  dashed?: boolean;
  fill?: string;
};

function SelectionIndicatorsSvg({
  hairlines,
}: {
  hairlines: HairlineItem[];
}) {
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const stroke = 1.5 / z;

  const bounds = useMemo(() => {
    const boxes: SceneBox[] = [];
    for (const h of hairlines) boxes.push(h.box);
    return unionBoxes(boxes);
  }, [hairlines]);

  if (!bounds) return null;
  const left = toDomPrecision(bounds.left);
  const top = toDomPrecision(bounds.top);
  const w = toDomPrecision(Math.max(1, bounds.width));
  const h = toDomPrecision(Math.max(1, bounds.height));

  return (
    <svg
      className="pointer-events-none absolute z-[11] overflow-visible"
      width={w}
      height={h}
      viewBox={`${left} ${top} ${w} ${h}`}
      style={{
        left,
        top,
        width: w,
        height: h,
        overflow: 'visible',
      }}
      aria-hidden
    >
      {hairlines.map((item, i) => (
        <rect
          key={`hl-${i}-${item.box.left}-${item.box.top}`}
          x={item.box.left}
          y={item.box.top}
          width={Math.max(1, item.box.width)}
          height={Math.max(1, item.box.height)}
          fill={item.fill || 'none'}
          stroke={item.color}
          strokeWidth={stroke}
          strokeDasharray={item.dashed ? `${4 / z} ${3 / z}` : undefined}
        />
      ))}
    </svg>
  );
}

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

const MARQUEE_DEBUG =
  typeof window !== 'undefined' && (window as any).__RCB_MARQUEE_DEBUG__ === true;

function marqueeLog(...args: unknown[]) {
  if (!MARQUEE_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log('[marquee]', ...args);
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
 * `dragDistanceSquared` — screen px² before a pointing_canvas gesture becomes
 * brushing (marquee). Keep ≥~8–10px so a soft click / OS jitter never flashes
 * a blue marquee or steals artboard soft-select.
 */
const DRAG_DISTANCE_SQUARED = 100;

type DragState = {
  /** pointing_canvas: empty press; marquee only after DRAG_DISTANCE_SQUARED. */
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
   * End events (up/cancel) must not supply geometry ? their clientX/Y can be 0,0.
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

/** Scene point / delta from pointerdown ??stable if stage rect jitters mid-gesture. */
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
  document: any;
  union: SceneBox;
  dx: number;
  dy: number;
  originIds: string[];
  isGridMode: boolean;
  disableGrid: boolean;
  gridSize: number;
  snapThreshold: number;
  queryNodeIdsInRect?: (box: SceneBox) => string[];
  listNodeIds: () => string[];
  getNodeBox: (id: string) => SceneBox | null | undefined;
  /** Move preview skips hidden nodes in the spatial fallback. */
  skipHiddenInFallback?: boolean;
};

function computeMovedUnion(ctx: MoveSnapContext): {
  nextUnion: SceneBox;
  sdx: number;
  sdy: number;
  guides: AlignGuide[];
  others: SceneBox[];
  frames: SceneBox[];
} {
  let nextUnion = {
    ...ctx.union,
    left: ctx.union.left + ctx.dx,
    top: ctx.union.top + ctx.dy,
  };
  if (ctx.isGridMode && !ctx.disableGrid) {
    nextUnion = snapBoxToGrid(nextUnion, ctx.gridSize);
  }
  const others = siblingGuideBoxesNear(
    ctx.document,
    ctx.originIds,
    nextUnion,
    ctx.snapThreshold,
    ctx.queryNodeIdsInRect,
    () =>
      ctx
        .listNodeIds()
        .filter((id) => {
          if (ctx.originIds.includes(id)) return false;
          if (ctx.skipHiddenInFallback && isNodeHidden(ctx.document?.deltaSetLike?.[id])) {
            return false;
          }
          return true;
        })
        .map((id) => ctx.getNodeBox(id))
        .filter(Boolean) as SceneBox[]
  );
  const frames = snapContainerFrames(ctx.document, nextUnion, ctx.snapThreshold);
  const snapped = snapBoxToGuides(nextUnion, others, frames, ctx.snapThreshold, {
    edgeBoxes: movingGuideBoxes(nextUnion, ctx.document, ctx.originIds),
  });
  nextUnion = { ...snapped.box };
  return {
    nextUnion,
    sdx: nextUnion.left - ctx.union.left,
    sdy: nextUnion.top - ctx.union.top,
    guides: snapped.guides,
    others,
    frames,
  };
}

type ResizeSnapContext = {
  document: any;
  drag: DragState;
  dx: number;
  dy: number;
  shiftKey: boolean;
  isGridMode: boolean;
  disableGrid: boolean;
  gridSize: number;
  snapThreshold: number;
  queryNodeIdsInRect?: (box: SceneBox) => string[];
  listNodeIds: () => string[];
  getNodeBox: (id: string) => SceneBox | null | undefined;
  skipHiddenInFallback?: boolean;
};

function computeResizedUnion(ctx: ResizeSnapContext): {
  next: SceneBox;
  guides: AlignGuide[];
  others: SceneBox[];
  frames: SceneBox[];
  textMode: TextResizeMode | undefined;
  lockAspect: boolean;
} {
  const handle = ctx.drag.handle!;
  const lockAspect = resolveLockAspect(ctx.document, ctx.drag.origins, handle, ctx.shiftKey);
  let next = resizeFromHandle(ctx.drag.union, handle, ctx.dx, ctx.dy, ctx.drag.angle0 || 0, {
    lockAspect,
    aspectRatio: ctx.drag.aspectRatio,
  });
  if (ctx.isGridMode && !ctx.disableGrid) {
    next = snapResizeToGrid(next, handle, ctx.gridSize, 8, {
      lockAspect,
      aspectRatio: ctx.drag.aspectRatio,
    });
  }
  const originIds = ctx.drag.origins.map((o) => o.nodeId);
  const others = siblingGuideBoxesNear(
    ctx.document,
    originIds,
    next,
    ctx.snapThreshold,
    ctx.queryNodeIdsInRect,
    () =>
      ctx
        .listNodeIds()
        .filter((id) => {
          if (originIds.includes(id)) return false;
          if (ctx.skipHiddenInFallback && isNodeHidden(ctx.document?.deltaSetLike?.[id])) {
            return false;
          }
          return true;
        })
        .map((id) => ctx.getNodeBox(id))
        .filter(Boolean) as SceneBox[]
  );
  const frames = snapContainerFrames(ctx.document, next, ctx.snapThreshold);
  const snapped = snapResizeToGuides(next, handle, others, frames, ctx.snapThreshold, 8, {
    edgeBoxes: movingGuideBoxes(next, ctx.document, originIds),
    lockAspect,
    aspectRatio: ctx.drag.aspectRatio,
  });
  next = {
    ...snapped.box,
    width: Math.max(1, snapped.box.width),
    height: Math.max(1, snapped.box.height),
  };
  const textMode =
    ctx.drag.origins.length === 1 &&
    ctx.document?.deltaSetLike?.[ctx.drag.origins[0].nodeId]?.key === 'text'
      ? textResizeModeForHandle(handle)
      : undefined;
  if (textMode === 'wrap') {
    next = applyTextWrapHeight(ctx.document, ctx.drag.origins[0].nodeId, next);
  }
  return { next, guides: snapped.guides, others, frames, textMode, lockAspect };
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

/** Sibling stroke-band faces for snap / spacing (not chrome-only AABB). */
function siblingGuideBoxes(
  document: any,
  excludeIds: string[],
  fallback: () => SceneBox[]
): SceneBox[] {
  const fromDoc = nodeGuideBoxes(document, { excludeIds });
  return fromDoc.length ? fromDoc : fallback();
}

/**
 * Prefer local snap targets:
 * - siblings inside the containing artboard(s)
 * - plus spatial neighbors within ~192 screen px
 * Avoid scanning distant posters that steal center-align guides.
 */
function siblingGuideBoxesNear(
  document: any,
  excludeIds: string[],
  probe: SceneBox,
  snapThreshold: number,
  queryNodeIdsInRect: ((box: SceneBox) => string[]) | undefined,
  fallback: () => SceneBox[]
): SceneBox[] {
  const containing = framesContainingBox(document, probe);
  const insideIds = containing.length
    ? nodeIdsInsideFrames(
        document,
        containing.map((f) => f.id)
      )
    : [];
  const pad = getSnapNeighborPad(snapThreshold);
  const nearIds = queryNodeIdsInRect
    ? queryNodeIdsInRect({
        left: probe.left - pad,
        top: probe.top - pad,
        width: probe.width + pad * 2,
        height: probe.height + pad * 2,
      })
    : [];
  const idSet = new Set<string>([...insideIds, ...nearIds]);
  if (idSet.size) {
    const fromDoc = nodeGuideBoxesForIds(document, [...idSet], { excludeIds });
    if (fromDoc.length) return fromDoc;
  }
  // Inside a frame with no siblings yet ??empty is OK (still snap to the frame).
  if (containing.length) return [];
  return siblingGuideBoxes(document, excludeIds, fallback);
}

/** Containers for snap: containing artboard(s), else nearby frames only. */
function snapContainerFrames(
  document: any,
  probe: SceneBox,
  snapThreshold: number
): SceneBox[] {
  const containing = framesContainingBox(document, probe);
  if (containing.length) {
    return containing.map(({ left, top, width, height }) => ({
      left,
      top,
      width,
      height,
    }));
  }
  const pad = getSnapNeighborPad(snapThreshold);
  const all = frameGuideBoxes(document);
  return all.filter((f) => {
    const ol =
      Math.min(probe.left + probe.width + pad, f.left + f.width) -
      Math.max(probe.left - pad, f.left);
    const ot =
      Math.min(probe.top + probe.height + pad, f.top + f.height) -
      Math.max(probe.top - pad, f.top);
    return ol > 0 && ot > 0;
  });
}

/** Moving selection's stroke-band faces (single node) or chrome union (multi). */
function movingGuideBoxes(
  chrome: SceneBox,
  document: any,
  originIds: string[]
): SceneBox[] {
  if (originIds.length !== 1) return [chrome];
  const node = document?.deltaSetLike?.[originIds[0]];
  return chromeBandGuideBoxes(chrome, node);
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
  /** ~8px on screen. */
  const snapThreshold = getSnapThreshold(zoom);
  const isGridMode = useSelector((state: any) => Boolean(state.editor.isGridMode));
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
  /** Share preview / Dev: spacing badges + no edit chrome. */
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

  // Keep pointer handlers stable ??document identity churn must not tear down window listeners mid-marquee.
  const documentRef = useRef(document);
  const getNodeBoxRef = useRef(getNodeBox);
  const listNodeIdsRef = useRef(listNodeIds);
  const queryNodeIdsInRectRef = useRef(queryNodeIdsInRect);
  const hitTestRef = useRef(hitTest);
  const hitTestFrameRef = useRef(hitTestFrame);
  const onSelectRef = useRef(onSelect);
  const onSelectFrameRef = useRef(onSelectFrame);
  const toSceneRef = useRef(toScene);
  const onGeometryCommitRef = useRef(onGeometryCommit);
  const onGeometryPreviewRef = useRef(onGeometryPreview);
  const onAngleCommitRef = useRef(onAngleCommit);
  const onAnglePreviewRef = useRef(onAnglePreview);
  const onEditTextRef = useRef(onEditText);
  const onEditPenPathRef = useRef(onEditPenPath);
  documentRef.current = document;
  getNodeBoxRef.current = getNodeBox;
  listNodeIdsRef.current = listNodeIds;
  queryNodeIdsInRectRef.current = queryNodeIdsInRect;
  hitTestRef.current = hitTest;
  hitTestFrameRef.current = hitTestFrame;
  onSelectRef.current = onSelect;
  onSelectFrameRef.current = onSelectFrame;
  toSceneRef.current = toScene;
  onGeometryCommitRef.current = onGeometryCommit;
  onGeometryPreviewRef.current = onGeometryPreview;
  onAngleCommitRef.current = onAngleCommit;
  onAnglePreviewRef.current = onAnglePreview;
  onEditTextRef.current = onEditText;
  onEditPenPathRef.current = onEditPenPath;

  const [liveUnion, setLiveUnion] = useState<SceneBox | null>(null);
  const [liveOrigins, setLiveOrigins] = useState<Array<{ nodeId: string; box: SceneBox }> | null>(
    null
  );
  const [liveAngle, setLiveAngle] = useState(0);
  const [marquee, setMarquee] = useState<SceneBox | null>(null);
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  /** Margin labels while moving / arrow-nudging (fig.1 pink). */
  const [moveMargins, setMoveMargins] = useState<SpacingMeasure[] | null>(null);
  /** Neighbor boxes currently driving distance tips ??orange outline like MasterGo. */
  const [moveHighlights, setMoveHighlights] = useState<SceneBox[]>([]);
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
    setGuides([]);
    const onlyNodeId =
      !frameIdsKey && idsKey && !idsKey.includes('|') ? idsKey : null;
    if (onlyNodeId) {
      setLiveAngle(readNodeAngle(document, onlyNodeId));
    } else {
      setLiveAngle(0);
    }
  }, [baseOrigins, document, idsKey, frameIdsKey, selectionUnion]);

  useEffect(() => {
    setMoveMargins(null);
    setMoveHighlights([]);
  }, [idsKey, frameIdsKey]);

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
          '[data-ctx-menu],[data-sel-toolbar],[data-export-panel],[data-frame-toolbar],[data-image-tool-panel],[data-image-variants],[data-image-quick-edit],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-dev-props],[data-video-playback-bar],[data-video-trim-toolbar],[data-radius-handle]'
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
      // Empty artboard / frame chrome: still measure select↔hover like Figma.
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

    const TEXT_DBLCLICK_MS = 450;

    /**
     * Second completed soft-click (pointerup, no drag) on the same text opens edit.
     * Must not run on pointerdown ??otherwise one click (down+up) looks like a double-tap.
     */
    const tryOpenTextEdit = (id: string) => {
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
      const target = e.target as HTMLElement;
      if (
        target.closest(
          '[data-ctx-menu],[data-sel-toolbar],[data-frame-toolbar],[data-export-panel],[data-image-label],[data-frame-label],[data-crop-expand-overlay],[data-crop-expand-toolbar],[data-image-tool-panel],[data-image-variants],[data-image-quick-edit],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-color-panel],[data-text-inline-editor],[data-frame-handle],[data-image-generator],[data-video-generator],[data-video-playback-bar],[data-video-trim-toolbar],[data-radius-handle]'
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
      marqueeLog('pointerdown', {
        hitId,
        plateFrameId,
        scene: { x: p.x, y: p.y },
        target: (target as HTMLElement)?.tagName,
      });

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

      // Full-bleed background plate looks empty ??start marquee, don't drag the plate.
      if (hitId && plateFrameId) {
        e.preventDefault();
        if (!e.shiftKey && !readOnly) {
          onSelectFrame?.(null);
          onSelect([]);
        }
        dragRef.current = seed('pointing_canvas', e, p);
        marqueeLog('treat plate as empty ??pointing_canvas');
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

      // Empty canvas / artboard interior ??PointingCanvas ??marquee after drag threshold.
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
      marqueeLog('empty ??pointing_canvas');
      capture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.currentClientX = e.clientX;
      drag.currentClientY = e.clientY;
      drag.currentShift = e.shiftKey;
      const clientDistSq =
        (e.clientX - drag.startX) ** 2 + (e.clientY - drag.startY) ** 2;
      if (drag.mode === 'blank') {
        // Abandon soft click once past drag threshold.
        if (clientDistSq > DRAG_DISTANCE_SQUARED) {
          dragRef.current = null;
        }
        return;
      }
      // PointingCanvas ??Brushing only after dragDistanceSquared.
      if (drag.mode === 'pointing_canvas') {
        if (readOnly || clientDistSq < DRAG_DISTANCE_SQUARED) return;
        drag.mode = 'marquee';
        // Absolute toScene (not client-delta): matches cursor under 800% + browser zoom.
        const p0 = toScene(e.clientX, e.clientY);
        setMarquee(normalizeBox(drag.sceneX0, drag.sceneY0, p0.x, p0.y));
        marqueeLog('enter marquee', { clientDistSq });
        return;
      }
      // Client-delta keeps the selection under the pointer when the stage rect
      // shifts (mobile chrome / small-viewport reflow). Rotate still needs an
      // absolute scene point for atan2 around the pivot. Marquee also uses abs.
      const gesture = sceneFromClientGesture(drag, zoom, e.clientX, e.clientY);
      const dx = gesture.dx;
      const dy = gesture.dy;
      const abs = toScene(e.clientX, e.clientY);
      const p =
        drag.mode === 'rotate' || drag.mode === 'marquee'
          ? abs
          : { x: gesture.x, y: gesture.y };

      if (drag.mode === 'marquee') {
        setMarquee(normalizeBox(drag.sceneX0, drag.sceneY0, p.x, p.y));
        return;
      }

      if (drag.mode === 'rotate' && drag.center && drag.pointerAngle0 != null) {
        // Soft-click on rotate knob ??ignore OS pointer jitter.
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) return;
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
        // Ignore snap jitter until the pointer actually moves (protects dblclick).
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) return;
        // Grid first; align guides may still pull off-grid. Ctrl/Cmd disables grid.
        const { nextUnion, sdx, sdy, guides, others, frames } = computeMovedUnion({
          document,
          union: drag.union,
          dx,
          dy,
          originIds: drag.origins.map((o) => o.nodeId),
          isGridMode,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
          snapThreshold,
          queryNodeIdsInRect,
          listNodeIds,
          getNodeBox,
          skipHiddenInFallback: true,
        });
        // Keep exact snapped visual edges ??integer rounding in geometry commits
        // breaks flush align when stroke outset is *.5 (odd border-width).
        setGuides(guides);
        if (guides.length) {
          const related = boxesInvolvedInGuides(guides, [...others, ...frames]);
          const margin = computeMoveMarginResult(nextUnion, related, []);
          setMoveMargins(margin.measures);
          setMoveHighlights(margin.highlights);
        } else {
          setMoveMargins([]);
          setMoveHighlights([]);
        }
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
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) return;
        const stroke = strokeEndpointBox(drag, document, p.x, p.y);
        if (stroke) {
          setGuides([]);
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
        const { next, guides, others, frames, textMode } = computeResizedUnion({
          document,
          drag,
          dx,
          dy,
          shiftKey: e.shiftKey,
          isGridMode,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
          snapThreshold,
          queryNodeIdsInRect,
          listNodeIds,
          getNodeBox,
          skipHiddenInFallback: true,
        });
        setGuides(guides);
        if (guides.length) {
          const related = boxesInvolvedInGuides(guides, [...others, ...frames]);
          const margin = computeMoveMarginResult(next, related, []);
          setMoveMargins(margin.measures);
          setMoveHighlights(margin.highlights);
        } else {
          setMoveMargins([]);
          setMoveHighlights([]);
        }
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
      if (!drag) return;
      dragRef.current = null;
      setMoveMargins(null);
      setMoveHighlights([]);
      setGuides([]);
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
      const p =
        drag.mode === 'marquee' || drag.mode === 'rotate'
          ? absEnd
          : drag.mode === 'move' || drag.mode === 'resize'
            ? { x: gesture.x, y: gesture.y }
            : absEnd;
      const clientDistSq =
        (clientX - drag.startX) ** 2 + (clientY - drag.startY) ** 2;

      const endTransform = () => setTransformingNotify(false);

      // Soft click on empty stage (never entered Brushing).
      if (drag.mode === 'pointing_canvas') {
        setMarquee(null);
        lastTextClickRef.current = null;
        // Selection already cleared on pointerdown.
        // Soft-click inside an artboard — select that frame (edit + preview inspect).
        const abs = toScene(clientX, clientY);
        const frameId = hitTestFrame?.(abs.x, abs.y);
        if (frameId) onSelectFrame?.(frameId);
        endTransform();
        return;
      }

      if (drag.mode === 'marquee') {
        const box = normalizeBox(drag.sceneX0, drag.sceneY0, p.x, p.y);
        setMarquee(null);
        lastTextClickRef.current = null;
        // Still under threshold somehow — treat as soft click, not brush.
        if (clientDistSq < DRAG_DISTANCE_SQUARED) {
          marqueeLog('marquee aborted (under threshold)');
          const frameId = hitTestFrame?.(absEnd.x, absEnd.y);
          if (frameId) onSelectFrame?.(frameId);
          endTransform();
          return;
        }
        // Tiny brush from jitter past threshold — still a click, not a marquee.
        if (box.width < 8 && box.height < 8) {
          marqueeLog('marquee aborted (tiny box)');
          const frameId = hitTestFrame?.(drag.sceneX0, drag.sceneY0);
          if (frameId) onSelectFrame?.(frameId);
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
        marqueeLog(
          contentHits.length || frameHits.length ? 'marquee up ??mixed' : 'marquee up ??fallback',
          { box, contentHits, frameHits, rawHits }
        );
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
          clientDistSq <= DRAG_DISTANCE_SQUARED
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
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) {
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
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) {
          setGuides([]);
          setMoveMargins(null);
          setMoveHighlights([]);
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
          document,
          union: drag.union,
          dx,
          dy,
          originIds: drag.origins.map((o) => o.nodeId),
          isGridMode,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
          snapThreshold,
          queryNodeIdsInRect,
          listNodeIds,
          getNodeBox,
          skipHiddenInFallback: false,
        });
        const patches = drag.origins.map((o) => ({
          nodeId: o.nodeId,
          left: o.box.left + sdx,
          top: o.box.top + sdy,
          width: o.box.width,
          height: o.box.height,
        }));
        setGuides([]);
        setMoveMargins(null);
        setMoveHighlights([]);
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
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) {
          setGuides([]);
          setMoveMargins(null);
          setMoveHighlights([]);
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
          isGridMode,
          disableGrid: e.ctrlKey || e.metaKey,
          gridSize,
          snapThreshold,
          queryNodeIdsInRect,
          listNodeIds,
          getNodeBox,
          skipHiddenInFallback: false,
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
      if (readOnly) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-sel-toolbar],[data-frame-toolbar],[data-text-inline-editor]')) {
        return;
      }
      const p = toScene(e.clientX, e.clientY);
      let hit = hitTest(p.x, p.y, { clientX: e.clientX, clientY: e.clientY });
      // Selection chrome covers the glyph ??fall back to the single selected node.
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

    // Chrome lives in the unscaled overlay ??also listen there for resize/rotate / dblclick.
    // Infinite paper is 0?0; stage receives empty artboard / shape clicks.
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
    };
  }, [
    enabled,
    readOnly,
    attachPickActive,
    hitEl,
    viewportEl,
    paperEl,
    overlayRoot,
    artboard,
    document,
    onSelect,
    onSelectMixed,
    onSelectFrames,
    onGeometryCommit,
    onGeometryPreview,
    onAngleCommit,
    onAnglePreview,
    onEditText,
    onEditPenPath,
    hitTest,
    hitTestFrame,
    onSelectFrame,
    getNodeBox,
    listNodeIds,
    queryNodeIdsInRect,
    toScene,
    zoom,
    camera,
    snapThreshold,
    isGridMode,
    gridSize,
  ]);

  /** Arrow keys nudge selection 1px (Shift = 10px) and show margin labels.
   *  Grid mode: step = gridSize (Shift = 5?). */
  useEffect(() => {
    if (!enabled || suppressChrome || readOnly) return undefined;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

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
      const step = isGridMode
        ? e.shiftKey
          ? gridSize * 5
          : gridSize
        : e.shiftKey
          ? 10
          : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      let nextUnion = { ...union, left: union.left + dx, top: union.top + dy };
      if (isGridMode) nextUnion = snapBoxToGrid(nextUnion, gridSize);
      const sdx = nextUnion.left - union.left;
      const sdy = nextUnion.top - union.top;
      const nextOrigins = origins.map((o) => ({
        nodeId: o.nodeId,
        box: { ...o.box, left: o.box.left + sdx, top: o.box.top + sdy },
      }));
      const excludeIds = origins.map((o) => o.nodeId);
      const others = siblingGuideBoxesNear(
        document,
        excludeIds,
        nextUnion,
        snapThreshold,
        queryNodeIdsInRect,
        () =>
          listNodeIds()
            .filter(
              (id) =>
                !excludeIds.includes(id) &&
                !isNodeHidden(document?.deltaSetLike?.[id])
            )
            .map((id) => getNodeBox(id))
            .filter(Boolean) as SceneBox[]
      );
      const frames = snapContainerFrames(document, nextUnion, snapThreshold);
      setLiveUnion(nextUnion);
      setLiveOrigins(nextOrigins);
      // Arrow-key nudge: show nearest gaps as measure guides (orange + arrows).
      const margin = computeMoveMarginResult(nextUnion, others, frames);
      setMoveMargins(margin.measures);
      setMoveHighlights(margin.highlights);
      onGeometryCommit(
        nextOrigins.map((o) => ({
          nodeId: o.nodeId,
          left: o.box.left,
          top: o.box.top,
          width: o.box.width,
          height: o.box.height,
        }))
      );
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        setMoveMargins(null);
        setMoveHighlights([]);
      }, 600);
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (hideTimer) clearTimeout(hideTimer);
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
    snapThreshold,
    isGridMode,
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
  const { shapeOutlines, guideBadgeMeasures } = (() => {
    if (!enabled || suppressChrome) {
      return {
        shapeOutlines: [] as ShapeOutlineItem[],
        guideBadgeMeasures: null as SpacingMeasure[] | null,
      };
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

    // Inspect select: path silhouette only (spacing/size badges on world overlay — top z).
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
        // Single only — multi uses one world SelectionChrome (fig.2), not per-host knobs.
        if (hostHandlesOk) handleIds.add(sid);
      }
    }

    // Transform: keep mover path chrome mounted (guides paint on chrome layer separately).
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
    return {
      shapeOutlines: out,
      guideBadgeMeasures: moveMargins?.length ? moveMargins : null,
    };
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

  const getInspectBox = (id: string | null): SceneBox | null => {
    if (!id) return null;
    const fid = parseFrameSelId(id);
    if (fid) {
      const frames = Array.isArray(document?.frames) ? document.frames : [];
      const f = frames.find((x: any) => x?.id === fid);
      if (!f) return null;
      return {
        left: Number(f.x) || 0,
        top: Number(f.y) || 0,
        width: Math.max(1, Number(f.width) || 1),
        height: Math.max(1, Number(f.height) || 1),
      };
    }
    return getNodeBox(id);
  };

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
    // Single node: lock chrome AABB to the same live host geom path chrome uses.
    if (selectedNodeIds.length === 1 && selectedFrameIds.length === 0) {
      const live = liveShapeGeomBox(selectedNodeIds[0]);
      if (live) return live;
    }
    return base;
  })();

  const selectedBox = (() => {
    if (!inspectPrimaryId) return null;
    if (chromeUnion && !transforming) return chromeUnion;
    return getInspectBox(inspectPrimaryId);
  })();

  // Hover outline in all modes; pair spacing only in inspect (Dev / share preview).
  const hoverBox = (() => {
    if (!hoverNodeId || hoverNodeId === inspectPrimaryId) return null;
    return getInspectBox(hoverNodeId);
  })();

  const clickPairBox = (() => {
    if (!inspectDev || hoverBox) return null;
    if (!inspectPairNodeId || inspectPairNodeId === inspectPrimaryId) return null;
    return getInspectBox(inspectPairNodeId);
  })();

  const pairBox = inspectDev ? hoverBox || clickPairBox : null;

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

  // Idle spacing: sibling chrome boxes only (not stroke-band faces, not frames).
  // Frames often sit off-screen; measuring to their edge draws a pink gap across
  // empty dotted canvas and looks like a phantom guide. Frame margins still show
  // while dragging via computeMoveMarginResult(containers).
  // Skip hidden layers — same phantom-guide issue when measuring into empty space.
  const spacingOthers = (() => {
    if (!selectedBox || pairBox) return [] as SceneBox[];
    const skipPrimary =
      inspectPrimaryId && !parseFrameSelId(inspectPrimaryId) ? inspectPrimaryId : null;
    return listNodeIds()
      .filter((id) => {
        if (skipPrimary && id === skipPrimary) return false;
        if (selectedNodeIds.includes(id)) return false;
        return !isNodeHidden(document?.deltaSetLike?.[id]);
      })
      .map((id) => getNodeBox(id))
      .filter(Boolean) as SceneBox[];
  })();

  // Marquee only — path multi-select uses host silhouettes + world union box (fig.2).
  // Vector ink uses host path chrome; non-path uses SelectionChrome (handles / box).
  const indicatorHairlines = useMemo(() => {
    const list: HairlineItem[] = [];
    if (marquee) {
      list.push({
        box: marquee,
        color: '#3388ff',
        fill: 'rgba(51,136,255,0.08)',
      });
    }
    return list;
  }, [marquee]);

  if (!enabled) return null;

  // Path chrome already covers single vector selection (and inspect path ink).
  const skipWorldSelectionChrome = hostInjectedSelection;

  return (
    <>
      {/* Align guides on chrome layer (same parent as path control box — no browser-zoom drift). */}
      <ChromeAlignGuidesSvg guides={guides} />

      {moveMargins && liveUnion ? (
        <SpacingInspectOverlay
          box={liveUnion}
          others={[]}
          measures={guideBadgeMeasures || moveMargins}
          showSizeBadge={false}
          color={SPACING_MEASURE_COLOR}
        />
      ) : null}

      {inspectDev &&
      selectedBox &&
      inspectPrimaryId &&
      !suppressChrome &&
      !transforming &&
      !moveMargins ? (
        <SpacingInspectOverlay
          box={selectedBox}
          others={spacingOthers}
          pairBox={pairBox}
          showGaps={Boolean(pairBox)}
          showSizeBadge
          color={SPACING_MEASURE_COLOR}
          sizeBadgeColor={SPACING_SIZE_BADGE_COLOR}
        />
      ) : null}

      <ShapeOutlineSvg outlines={shapeOutlines} />
      <SelectionIndicatorsSvg hairlines={indicatorHairlines} />

      {/* World SelectionChrome only when idle — no control box while moving/resizing.
          Multi: always the union box + corner handles (fig.2). Single path: host silhouette. */}
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
      chromeUnion &&
      singleNode &&
      singleId &&
      singleNodeData &&
      supportsCornerRadius(singleNodeData) &&
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
          interactive={!transforming}
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
