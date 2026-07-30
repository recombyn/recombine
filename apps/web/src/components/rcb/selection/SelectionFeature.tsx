import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import ImageReplaceCornerButton from '@/components/editor/nodes/ImageNode/ImageReplaceCornerButton';
import ImageVariantsOverlay from '@/components/editor/nodes/ImageNode/ImageVariantsOverlay';
import VideoReplaceCornerButton from '@/components/editor/nodes/VideoNode/VideoReplaceCornerButton';
import {
  useRcbCamera,
  useRcbOverlayRoot,
  useRcbScreenToScene,
} from '@/components/rcb/camera/context';
import { logEdgeSamples, sampleBoxEdges } from '@/components/rcb/core/dprDebug';
import { cn } from '@/utils/classnames';
import AlignGuidesOverlay, { type AlignGuide } from './AlignGuidesOverlay';
import {
  chromeBandGuideBoxes,
  frameGuideBoxes,
  getDocumentGridSize,
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
import SelectionContextToolbar from './SelectionContextToolbar';
import MultiSelectionToolbar from './MultiSelectionToolbar';
import NodeTitleLabel from './NodeTitleLabel';
import SpacingInspectOverlay, {
  boxesInvolvedInGuides,
  computeMoveMarginResult,
  SPACING_MEASURE_COLOR,
  type SpacingMeasure,
} from './SpacingInspectOverlay';
import { resizeFromHandle, rotateBoxesAround, scaleBoxesToUnion, unionOfBoxes, type ResizeHandle } from './resizeGeometry';
import {
  pathStrokeHitsSceneBox,
  resizeStrokeByEndpoint,
  strokeEndpointsFromBox,
} from '@/components/rcb/scene/sceneShapes';
import {
  expandSelectionWithGroups,
  isImageGeneratorNode,
  isVideoGeneratorNode,
  isNodeHidden,
  isNodeLocked,
  listImageVariantUrls,
  supportsFill,
} from '@/components/rcb/scene/sceneDocument';
import { TEXT_SELECTION_PAD } from '@/components/rcb/scene/sceneEffects';
import { geometryIndicatorPathD, isEditablePathNode } from '@/components/rcb/scene/outlineToPath';
import { patchDocumentNode, setDevHoverNodeId } from '@/store/modules/editor';
import {
  measureWrappedTextSize,
  parseNodeText,
  parseNodeTextStyle,
} from '@/components/rcb/scene/sceneText';
import type { TextResizeMode } from '@/components/rcb/scene/svgToScene';

const CORNER_HANDLES = new Set<ResizeHandle>(['nw', 'ne', 'sw', 'se']);

/**
 * Hover baseline hairline in SCENE space (same camera layer as shapes).
 * Selected shapes use SelectionChrome box / line stroke instead.
 */
function ShapeIndicatorOverlay({
  box,
  pathD,
  angle = 0,
  baseWidth,
  baseHeight,
}: {
  box: SceneBox;
  pathD: string;
  angle?: number;
  baseWidth: number;
  baseHeight: number;
}) {
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const bw = Math.max(1, baseWidth);
  const bh = Math.max(1, baseHeight);
  if (!pathD.trim()) return null;
  // Stroke in page units = screenPx / zoom
  const stroke = 1.5 / z;

  return (
    <svg
      className="pointer-events-none absolute z-[11] overflow-visible"
      width={Math.max(1, box.width)}
      height={Math.max(1, box.height)}
      viewBox={`0 0 ${bw} ${bh}`}
      preserveAspectRatio="none"
      style={{
        left: box.left,
        top: box.top,
        transform: Math.abs(angle) > 0.001 ? `rotate(${angle}deg)` : undefined,
        transformOrigin: 'center center',
      }}
      aria-hidden
    >
      <path
        d={pathD}
        fill="none"
        stroke="#3388ff"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** World-layer rect outline — page stroke = screenPx / zoom. */
function WorldHairlineBox({
  box,
  color,
  dashed = false,
  fill,
  className,
  zClass = 'z-20',
}: {
  box: SceneBox;
  color: string;
  dashed?: boolean;
  fill?: string;
  className?: string;
  zClass?: string;
}) {
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const stroke = 1.5 / z;
  const dash = `${4 / z} ${3 / z}`;
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  return (
    <svg
      className={cn(
        'pointer-events-none absolute overflow-visible',
        zClass,
        className
      )}
      width={w}
      height={h}
      style={{ left: box.left, top: box.top }}
      aria-hidden
    >
      {fill ? <rect x={0} y={0} width={w} height={h} fill={fill} stroke="none" /> : null}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={dashed ? dash : undefined}
      />
    </svg>
  );
}

function textResizeModeForHandle(handle: ResizeHandle): TextResizeMode {
  return handle === 'e' || handle === 'w' ? 'wrap' : 'scale';
}

/**
 * Aspect lock while resizing.
 * - Multi-select / group: lock if any image is selected (unless a node was
 *   explicitly unlocked via the toolbar chain); Shift inverts.
 * - Single text corners: lock by default (Shift unlocks).
 * - Single image/video: `attrs.lockAspect` (default on) locks; Shift temporarily inverts.
 * - Other single nodes: free by default (Shift locks), unless `lockAspect` is set.
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
    if (key === 'text' && CORNER_HANDLES.has(handle)) return !shiftKey;
    const locked = readNodeAspectLocked(node);
    return shiftKey ? !locked : locked;
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
  return shiftKey ? !allLocked : allLocked;
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

/** Frame AABB ∩ marquee — same idea as selecting a rectangle. Locked frames are skipped. */
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

/** Near-full-bleed artboard plate — must not block marquee (looks empty but hits as a shape). */
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
  const safe =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(nodeId)
      : nodeId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const el = document.querySelector(
    `[data-scene-node-id="${safe}"]`
  ) as SVGGraphicsElement | null;
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
 * Marquee hit — match click semantics per type:
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

  // rect / ellipse / text / image / other geo — AABB like click.
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
  /** Share/preview: select + Dev annotations only — no move/resize/edit. */
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
   * Composer "Add from canvas" pick mode — clicks attach via onSelect and must
   * not start a move (already-selected hits would otherwise skip onSelect).
   */
  attachPickActive?: boolean;
};

/**
 * `dragDistanceSquared` default — screen px² before a
 * pointing_canvas gesture becomes brushing (marquee).
 */
const DRAG_DISTANCE_SQUARED = 16;

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
   * Composer canvas-pick gesture: attach already ran on pointerdown.
   * Skip pointerup onSelect so one-shot clearPick does not steal node selection.
   */
  skipSelectOnUp?: boolean;
};

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
 * Prefer spatial neighbors around `probe` (move / resize / nudge).
 * Pad covers snap threshold + nearby gap partners without scanning the whole doc.
 */
function siblingGuideBoxesNear(
  document: any,
  excludeIds: string[],
  probe: SceneBox,
  snapThreshold: number,
  queryNodeIdsInRect: ((box: SceneBox) => string[]) | undefined,
  fallback: () => SceneBox[]
): SceneBox[] {
  if (queryNodeIdsInRect) {
    const pad = Math.max(
      snapThreshold * 8,
      probe.width || 0,
      probe.height || 0,
      256
    );
    const ids = queryNodeIdsInRect({
      left: probe.left - pad,
      top: probe.top - pad,
      width: probe.width + pad * 2,
      height: probe.height + pad * 2,
    });
    const fromDoc = nodeGuideBoxesForIds(document, ids, { excludeIds });
    if (fromDoc.length) return fromDoc;
  }
  return siblingGuideBoxes(document, excludeIds, fallback);
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
export default function SelectionFeature({
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
  /** Infinite paper is 0×0 — listen on the stage so empty artboard clicks select. */
  const hitEl = stageEl || paperEl;
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

  // Keep pointer handlers stable — document identity churn must not tear down window listeners mid-marquee.
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
  /** Neighbor boxes currently driving distance tips — orange outline like MasterGo. */
  const [moveHighlights, setMoveHighlights] = useState<SceneBox[]>([]);
  /** Hide chrome/toolbars while move / resize / rotate is in progress. */
  const [transforming, setTransforming] = useState(false);
  /** Dev inspect: node under pointer (annotations follow mouse). */
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const hoverNodeIdRef = useRef<string | null>(null);
  /** Preview / Dev: previous single selection — click A then B shows A↔B spacing. */
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
  }, [document, idsKey, frameIdsKey, getNodeBox]);

  useEffect(() => {
    if (dragRef.current) return;
    const u = unionBoxes(baseOrigins.map((o) => o.box));
    setLiveUnion(u);
    setLiveOrigins(baseOrigins);
    setGuides([]);
    const onlyNodeId =
      !frameIdsKey && idsKey && !idsKey.includes('|') ? idsKey : null;
    if (onlyNodeId) {
      setLiveAngle(readNodeAngle(document, onlyNodeId));
    } else {
      setLiveAngle(0);
    }
  }, [baseOrigins, document, idsKey, frameIdsKey]);

  useEffect(() => {
    setMoveMargins(null);
    setMoveHighlights([]);
  }, [idsKey, frameIdsKey]);

  // Inspect: keep prior selection as pair target when clicking another element.
  useEffect(() => {
    if (!inspectDev) {
      prevInspectSelRef.current = null;
      setInspectPairNodeId(null);
      return;
    }
    const next =
      selectedNodeIds.length === 1 && selectedFrameIds.length === 0
        ? selectedNodeIds[0]
        : null;
    const prev = prevInspectSelRef.current;
    if (next && prev && prev !== next) {
      setInspectPairNodeId(prev);
    } else if (!next) {
      setInspectPairNodeId(null);
    }
    prevInspectSelRef.current = next;
  }, [inspectDev, selectedNodeIds, selectedFrameIds]);

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

    const onHoverMove = (e: PointerEvent) => {
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
          '[data-ctx-menu],[data-sel-toolbar],[data-export-panel],[data-frame-toolbar],[data-image-tool-panel],[data-image-variants],[data-image-quick-edit],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-dev-props],[data-video-playback-bar],[data-video-trim-toolbar]'
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
      applyHover(hitTest(p.x, p.y, { clientX: e.clientX, clientY: e.clientY }));
    };

    const onLeave = () => applyHover(null);

    window.addEventListener('pointermove', onHoverMove, { passive: true });
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onHoverMove);
      window.removeEventListener('blur', onLeave);
    };
  }, [enabled, hitEl, paperEl, overlayRoot, artboard, hitTest, dispatch, toScene, workspaceMode, readOnly]);

  useEffect(() => {
    if (!enabled || !hitEl) return undefined;

    const TEXT_DBLCLICK_MS = 450;

    /**
     * Second completed soft-click (pointerup, no drag) on the same text opens edit.
     * Must not run on pointerdown — otherwise one click (down+up) looks like a double-tap.
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
          '[data-ctx-menu],[data-sel-toolbar],[data-frame-toolbar],[data-export-panel],[data-image-label],[data-frame-label],[data-crop-expand-overlay],[data-crop-expand-toolbar],[data-image-tool-panel],[data-image-variants],[data-image-quick-edit],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-color-panel],[data-text-inline-editor],[data-frame-handle],[data-image-generator],[data-video-generator],[data-video-playback-bar],[data-video-trim-toolbar]'
        )
      )
        return;

      const p = toScene(e.clientX, e.clientY);
      const liveUnionNow = liveUnionRef.current;
      const liveOriginsNow = liveOriginsRef.current;
      const liveAngleNow = liveAngleRef.current;

      const selectionIsLocked = () => {
        if (!liveOriginsNow?.length) return false;
        const frames = Array.isArray(document?.frames) ? document.frames : [];
        return liveOriginsNow.some((o) => {
          const fid = parseFrameSelId(o.nodeId);
          if (fid) {
            const f = frames.find((x: any) => x?.id === fid);
            return Boolean(f?.locked);
          }
          return isNodeLocked(document?.deltaSetLike?.[o.nodeId]);
        });
      };

      const rotateEl = target.closest('[data-sel-handle="rotate"]') as HTMLElement | null;
      if (rotateEl && liveUnionNow && liveOriginsNow?.length) {
        if (readOnly || selectionIsLocked()) return;
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
        dragRef.current = {
          mode: 'rotate',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins: liveOriginsNow.map((o) => ({
            nodeId: o.nodeId,
            box: { ...o.box },
            angle0: readNodeAngle(document, o.nodeId),
          })),
          union: { ...liveUnionNow },
          angle0,
          center,
          pointerAngle0,
        };
        setTransformingNotify(true);
        capture(e.pointerId);
        return;
      }

      const resizeEl = target.closest('[data-sel-handle="resize"]') as HTMLElement | null;
      if (resizeEl && liveUnionNow && liveOriginsNow?.length) {
        if (readOnly || selectionIsLocked()) return;
        e.preventDefault();
        e.stopPropagation();
        const handle = (resizeEl.getAttribute('data-resize') || 'se') as ResizeHandle;
        dragRef.current = {
          mode: 'resize',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins: liveOriginsNow.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })),
          union: { ...liveUnionNow },
          handle,
          // Multi-select union is axis-aligned; single keeps node angle for local resize.
          angle0:
            liveOriginsNow.length === 1 && !parseFrameSelId(liveOriginsNow[0].nodeId)
              ? liveAngleNow || readNodeAngle(document, liveOriginsNow[0].nodeId)
              : 0,
          aspectRatio: liveUnionNow.width / Math.max(1, liveUnionNow.height),
        };
        setTransformingNotify(true);
        capture(e.pointerId);
        return;
      }

      const beginMoveSelection = () => {
        if (readOnly || !liveUnionNow || !liveOriginsNow?.length) return false;
        if (selectionIsLocked()) return false;
        e.preventDefault();
        e.stopPropagation();
        const origins = liveOriginsNow.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } }));
        dragRef.current = {
          mode: 'move',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins,
          union: { ...liveUnionNow },
        };
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
          // Do NOT call onSelectFrame(null) here — during pick that clears pick mode.
          const expandedHit = expandSelectionWithGroups(document, [hitId]);
          onSelect(expandedHit);
        } else if (frameUnder) {
          onSelectFrame?.(frameUnder);
        } else {
          // Truly empty canvas — exit pick mode.
          onSelect([]);
        }
        dragRef.current = {
          mode: 'blank',
          skipSelectOnUp: true,
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins: [],
          union: { left: p.x, top: p.y, width: 1, height: 1 },
        };
        capture(e.pointerId);
        return;
      }

      // Clicking a selected artboard (or its plate) moves the whole selection — like a rect.
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
        dragRef.current = {
          mode: 'pointing_canvas',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins: [],
          union: { left: p.x, top: p.y, width: 1, height: 1 },
        };
        marqueeLog('treat plate as empty → pointing_canvas');
        capture(e.pointerId);
        return;
      }

      // Shape under pointer — select (if needed) then move. Never start a marquee on a shape.
      if (hitId) {
        if (readOnly) {
          // Preview / Dev inspect: select only (no move). Select on down so Inspect fills immediately.
          e.preventDefault();
          e.stopPropagation();
          const additive = e.shiftKey;
          const expandedHit = expandSelectionWithGroups(document, [hitId]);
          onSelectFrame?.(null);
          onSelect(expandedHit, { additive });
          dragRef.current = {
            mode: 'blank',
            startX: e.clientX,
            startY: e.clientY,
            sceneX0: p.x,
            sceneY0: p.y,
            origins: [],
            union: { left: p.x, top: p.y, width: 1, height: 1 },
          };
          capture(e.pointerId);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const additive = e.shiftKey;
        // Clicking any group member selects / moves the whole group.
        // Expand here (not only in onSelect) so pointerdown→move uses full origins
        // before Redux selection catches up.
        const expandedHit = expandSelectionWithGroups(document, [hitId]);
        if (!selectedIds.includes(hitId)) {
          // Do not open text edit on pointerdown — a single click's up would
          // otherwise count as a second tap and enter edit immediately.
          lastTextClickRef.current = null;
          onSelectFrame?.(null);
          onSelect(expandedHit, { additive });
        }
        // Shift-add only: wait for pointer-up; don't start a translate.
        if (additive && !selectedIds.includes(hitId)) {
          dragRef.current = {
            mode: 'blank',
            startX: e.clientX,
            startY: e.clientY,
            sceneX0: p.x,
            sceneY0: p.y,
            origins: [],
            union: { left: p.x, top: p.y, width: 1, height: 1 },
          };
          capture(e.pointerId);
          return;
        }
        // Keep frames already in the live selection when dragging a selected node.
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
              const box =
                liveOriginsNow?.find((o) => o.nodeId === id)?.box || getNodeBox(id);
              return box ? { nodeId: id, box: { ...box } } : null;
            })
            .filter(Boolean),
          ...frameOrigins.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })),
        ] as Array<{ nodeId: string; box: SceneBox }>;
        const union = unionOfBoxes(origins.map((o) => o.box)) || {
          left: p.x,
          top: p.y,
          width: 1,
          height: 1,
        };
        if (!origins.length) return;
        // Second click of a double-click: do not start a translate.
        const prevTap = lastNodeTapRef.current;
        const nowTap = Date.now();
        if (
          prevTap &&
          prevTap.id === hitId &&
          nowTap - prevTap.t < 400 &&
          Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 10
        ) {
          lastNodeTapRef.current = null;
          dragRef.current = {
            mode: 'blank',
            startX: e.clientX,
            startY: e.clientY,
            sceneX0: p.x,
            sceneY0: p.y,
            origins: [],
            union: { left: p.x, top: p.y, width: 1, height: 1 },
          };
          capture(e.pointerId);
          return;
        }
        lastNodeTapRef.current = { id: hitId, t: nowTap, x: e.clientX, y: e.clientY };
        // Keep chrome rotation in sync — transforming flips chromeAngle onto liveAngle.
        if (origins.length === 1 && !parseFrameSelId(origins[0].nodeId)) {
          setLiveAngle(readNodeAngle(document, origins[0].nodeId));
        }
        // Locked layers stay selectable but cannot start a drag.
        if (
          origins.some((o) => {
            const fid = parseFrameSelId(o.nodeId);
            if (fid) {
              const frames = Array.isArray(document?.frames) ? document.frames : [];
              return Boolean(frames.find((x: any) => x?.id === fid)?.locked);
            }
            return isNodeLocked(document?.deltaSetLike?.[o.nodeId]);
          })
        ) {
          dragRef.current = {
            mode: 'blank',
            startX: e.clientX,
            startY: e.clientY,
            sceneX0: p.x,
            sceneY0: p.y,
            origins: [],
            union: { left: p.x, top: p.y, width: 1, height: 1 },
          };
          capture(e.pointerId);
          return;
        }
        dragRef.current = {
          mode: 'move',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins,
          union,
        };
        setLiveOrigins(origins);
        setLiveUnion(union);
        setTransformingNotify(true);
        capture(e.pointerId);
        return;
      }

      // Empty canvas / artboard interior → PointingCanvas → marquee after drag threshold.
      // Soft-click on artboard selects the frame (on pointerup). Frame move is via title label
      // or by dragging inside an existing selection union (handled above).
      e.preventDefault();
      if (
        !readOnly &&
        selectionHasFrame &&
        pointInLiveUnion &&
        beginMoveSelection()
      ) {
        return;
      }
      if (!e.shiftKey) {
        onSelectFrame?.(null);
        onSelect([]);
      }
      dragRef.current = {
        mode: 'pointing_canvas',
        startX: e.clientX,
        startY: e.clientY,
        sceneX0: p.x,
        sceneY0: p.y,
        origins: [],
        union: { left: p.x, top: p.y, width: 1, height: 1 },
      };
      marqueeLog('empty → pointing_canvas');
      capture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const clientDistSq =
        (e.clientX - drag.startX) ** 2 + (e.clientY - drag.startY) ** 2;
      if (drag.mode === 'blank') {
        // Abandon soft click once past drag threshold.
        if (clientDistSq > DRAG_DISTANCE_SQUARED) {
          dragRef.current = null;
        }
        return;
      }
      // PointingCanvas → Brushing only after dragDistanceSquared.
      if (drag.mode === 'pointing_canvas') {
        if (readOnly || clientDistSq < DRAG_DISTANCE_SQUARED) return;
        drag.mode = 'marquee';
        const p0 = toScene(e.clientX, e.clientY);
        setMarquee(normalizeBox(drag.sceneX0, drag.sceneY0, p0.x, p0.y));
        marqueeLog('enter marquee', { clientDistSq });
        return;
      }
      const p = toScene(e.clientX, e.clientY);
      const dx = p.x - drag.sceneX0;
      const dy = p.y - drag.sceneY0;

      if (drag.mode === 'marquee') {
        setMarquee(normalizeBox(drag.sceneX0, drag.sceneY0, p.x, p.y));
        return;
      }

      if (drag.mode === 'rotate' && drag.center && drag.pointerAngle0 != null) {
        // Soft-click on rotate knob — ignore OS pointer jitter.
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) return;
        const now = (Math.atan2(p.y - drag.center.y, p.x - drag.center.x) * 180) / Math.PI;
        let next = (drag.angle0 || 0) + (now - drag.pointerAngle0);
        if (e.shiftKey) next = Math.round(next / 15) * 15;
        const delta = next - (drag.angle0 || 0);
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
        let nextUnion = {
          ...drag.union,
          left: drag.union.left + dx,
          top: drag.union.top + dy,
        };
        // Grid first; align guides may still pull off-grid when nearby.
        // Ctrl/Cmd temporarily disables grid snap (accel).
        if (isGridMode && !e.ctrlKey && !e.metaKey) {
          nextUnion = snapBoxToGrid(nextUnion, gridSize);
        }
        const excludeIds = drag.origins.map((o) => o.nodeId);
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
        const frames = frameGuideBoxes(document);
        const edgeBoxes = movingGuideBoxes(
          nextUnion,
          document,
          excludeIds
        );
        const snapped = snapBoxToGuides(nextUnion, others, frames, snapThreshold, {
          edgeBoxes,
        });
        // Keep exact snapped visual edges — integer rounding in geometry commits
        // breaks flush align when stroke outset is *.5 (odd border-width).
        nextUnion = { ...snapped.box };
        setGuides(snapped.guides);
        // Distance tips are a kind of guide — show nearest gaps whenever
        // align/gap guides fire (not only when gap ≤ snap threshold).
        if (snapped.guides.length) {
          // Only measure / highlight objects that actually snapped (图1),
          // not every nearby frame on all four sides (图2 clutter).
          const related = boxesInvolvedInGuides(snapped.guides, [
            ...others,
            ...frames,
          ]);
          const margin = computeMoveMarginResult(nextUnion, related, []);
          setMoveMargins(margin.measures);
          setMoveHighlights(margin.highlights);
        } else {
          setMoveMargins([]);
          setMoveHighlights([]);
        }
        const sdx = nextUnion.left - drag.union.left;
        const sdy = nextUnion.top - drag.union.top;
        const nextOrigins = drag.origins.map((o) => ({
          nodeId: o.nodeId,
          box: {
            ...o.box,
            left: o.box.left + sdx,
            top: o.box.top + sdy,
          },
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
        // Soft-click on a handle must not resize: at 3% zoom, 2px jitter ≈ 60+
        // scene units and snap threshold is huge (8/zoom), so the box jumps.
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) return;
        const strokeId = drag.origins.length === 1 ? drag.origins[0].nodeId : '';
        const strokeType = strokeId ? readNodeShapeType(document, strokeId) : '';
        if (
          strokeId &&
          isStrokeShapeType(strokeType) &&
          (drag.handle === 'e' || drag.handle === 'w')
        ) {
          // Free endpoint: opposite end fixed → length + angle together.
          const placed = resizeStrokeByEndpoint(
            drag.union,
            drag.angle0 || 0,
            drag.handle,
            p.x,
            p.y
          );
          const next = {
            left: placed.x,
            top: placed.y,
            width: placed.width,
            height: placed.height,
          };
          setGuides([]);
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: strokeId, box: next }]);
          setLiveAngle(placed.angle);
          onGeometryPreview?.([
            {
              nodeId: strokeId,
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height,
            },
          ]);
          onAnglePreview?.(strokeId, placed.angle);
          return;
        }
        const lockAspect = resolveLockAspect(document, drag.origins, drag.handle, e.shiftKey);
        let next = resizeFromHandle(drag.union, drag.handle, dx, dy, drag.angle0 || 0, {
          lockAspect,
          aspectRatio: drag.aspectRatio,
        });
        if (isGridMode && !e.ctrlKey && !e.metaKey) {
          next = snapResizeToGrid(next, drag.handle, gridSize, 8, {
            lockAspect,
            aspectRatio: drag.aspectRatio,
          });
        }
        const excludeIds = drag.origins.map((o) => o.nodeId);
        const others = siblingGuideBoxesNear(
          document,
          excludeIds,
          next,
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
        const frames = frameGuideBoxes(document);
        // Snap + spacing labels against every sibling / frame (no type filter).
        const edgeBoxes = movingGuideBoxes(next, document, excludeIds);
        const snapped = snapResizeToGuides(next, drag.handle, others, frames, snapThreshold, 8, {
          edgeBoxes,
          lockAspect,
          aspectRatio: drag.aspectRatio,
        });
        next = {
          ...snapped.box,
          width: Math.max(1, snapped.box.width),
          height: Math.max(1, snapped.box.height),
        };
        setGuides(snapped.guides);
        if (snapped.guides.length) {
          const related = boxesInvolvedInGuides(snapped.guides, [
            ...others,
            ...frames,
          ]);
          const margin = computeMoveMarginResult(next, related, []);
          setMoveMargins(margin.measures);
          setMoveHighlights(margin.highlights);
        } else {
          setMoveMargins([]);
          setMoveHighlights([]);
        }
        const textMode =
          drag.origins.length === 1 &&
          document?.deltaSetLike?.[drag.origins[0].nodeId]?.key === 'text'
            ? textResizeModeForHandle(drag.handle)
            : undefined;
        if (textMode === 'wrap') {
          next = applyTextWrapHeight(document, drag.origins[0].nodeId, next);
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

      const p = toScene(e.clientX, e.clientY);
      const dx = p.x - drag.sceneX0;
      const dy = p.y - drag.sceneY0;
      const clientDistSq =
        (e.clientX - drag.startX) ** 2 + (e.clientY - drag.startY) ** 2;

      const endTransform = () => setTransformingNotify(false);

      // Soft click on empty stage (never entered Brushing).
      if (drag.mode === 'pointing_canvas') {
        setMarquee(null);
        lastTextClickRef.current = null;
        // Selection already cleared on pointerdown.
        // Soft-click inside an artboard → select that frame.
        if (!readOnly) {
          const frameId = hitTestFrame?.(p.x, p.y);
          if (frameId) onSelectFrame?.(frameId);
        }
        endTransform();
        return;
      }

      if (drag.mode === 'marquee') {
        const box = normalizeBox(drag.sceneX0, drag.sceneY0, p.x, p.y);
        setMarquee(null);
        lastTextClickRef.current = null;
        // Still under threshold somehow — treat as click, not brush.
        if (clientDistSq < DRAG_DISTANCE_SQUARED) {
          marqueeLog('marquee aborted (under threshold)');
          endTransform();
          return;
        }
        const candidates =
          queryNodeIdsInRect?.(box) ?? listNodeIds();
        const rawHits = candidates.filter((id) =>
          nodeHitsMarquee(document, id, box, getNodeBox, toScene)
        );
        const frameHits = framesHittingMarquee(document, box).map((f) => f.id);
        const frameHitSet = new Set(frameHits);
        // Full-bleed background plate: keep when artboard is brushed, or when other
        // content is also hit (so Select-all / delete clears the overlapping plate).
        const contentHits = rawHits.filter((id) => {
          const plateFrame = frameForFullBleedPlate(document, id);
          if (!plateFrame) return true;
          if (frameHitSet.has(plateFrame)) return true;
          return rawHits.some(
            (other) => other !== id && !frameForFullBleedPlate(document, other)
          );
        });
        // Artboards are just another selectable rect — combine with nodes in one selection.
        if (contentHits.length || frameHits.length) {
          marqueeLog('marquee up → mixed', { box, contentHits, frameHits });
          if (onSelectMixed) {
            onSelectMixed(contentHits, frameHits, { additive: e.shiftKey });
          } else if (frameHits.length && !contentHits.length) {
            if (onSelectFrames) onSelectFrames(frameHits);
            else if (onSelectFrame) onSelectFrame(frameHits[0]);
          } else {
            onSelect(contentHits.length ? contentHits : rawHits, { additive: e.shiftKey });
          }
          endTransform();
          return;
        }
        // Plate-only / empty brush.
        marqueeLog('marquee up → fallback', { box, rawHits });
        onSelect(rawHits, { additive: e.shiftKey });
        endTransform();
        return;
      }

      if (drag.mode === 'blank') {
        // Attach-pick already applied on pointerdown — do not onSelect on up
        // (one-shot clearPick flips attachPickActive off before up; selecting
        // here would steal focus from the host node / double-add chips).
        if (
          !drag.skipSelectOnUp &&
          !attachPickActive &&
          clientDistSq <= DRAG_DISTANCE_SQUARED
        ) {
          const id = hitTest(p.x, p.y, { clientX: e.clientX, clientY: e.clientY });
          if (id && tryOpenTextEdit(id)) {
            endTransform();
            return;
          }
          if (id) onSelect([id], { additive: e.shiftKey });
        }
        endTransform();
        return;
      }

      if (drag.mode === 'rotate' && drag.center && drag.pointerAngle0 != null) {
        // Soft-click: restore start pose — do not apply angle jitter.
        if (clientDistSq <= DRAG_DISTANCE_SQUARED) {
          setLiveAngle(drag.angle0 || 0);
          setLiveUnion({ ...drag.union });
          setLiveOrigins(drag.origins.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })));
          endTransform();
          return;
        }
        const now = (Math.atan2(p.y - drag.center.y, p.x - drag.center.x) * 180) / Math.PI;
        let next = (drag.angle0 || 0) + (now - drag.pointerAngle0);
        if (e.shiftKey) next = Math.round(next / 15) * 15;
        const delta = next - (drag.angle0 || 0);
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
        // document stays put — that desyncs chrome from the shape (worst at
        // 3%/800% where 8px snap ≈ huge / visible scene delta).
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
        let nextUnion = {
          ...drag.union,
          left: drag.union.left + dx,
          top: drag.union.top + dy,
        };
        if (isGridMode && !e.ctrlKey && !e.metaKey) {
          nextUnion = snapBoxToGrid(nextUnion, gridSize);
        }
        const excludeIds = drag.origins.map((o) => o.nodeId);
        const others = siblingGuideBoxesNear(
          document,
          excludeIds,
          nextUnion,
          snapThreshold,
          queryNodeIdsInRect,
          () =>
            listNodeIds()
              .filter((id) => !excludeIds.includes(id))
              .map((id) => getNodeBox(id))
              .filter(Boolean) as SceneBox[]
        );
        const snapped = snapBoxToGuides(
          nextUnion,
          others,
          frameGuideBoxes(document),
          snapThreshold,
          { edgeBoxes: movingGuideBoxes(nextUnion, document, excludeIds) }
        );
        nextUnion = { ...snapped.box };
        const sdx = nextUnion.left - drag.union.left;
        const sdy = nextUnion.top - drag.union.top;
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
        const strokeId = drag.origins.length === 1 ? drag.origins[0].nodeId : '';
        const strokeType = strokeId ? readNodeShapeType(document, strokeId) : '';
        if (
          strokeId &&
          isStrokeShapeType(strokeType) &&
          (drag.handle === 'e' || drag.handle === 'w')
        ) {
          const placed = resizeStrokeByEndpoint(
            drag.union,
            drag.angle0 || 0,
            drag.handle,
            p.x,
            p.y
          );
          const next = {
            left: placed.x,
            top: placed.y,
            width: placed.width,
            height: placed.height,
          };
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: strokeId, box: next }]);
          setLiveAngle(placed.angle);
          lastTextClickRef.current = null;
          // Bake angle into documentRef first so geometry rebuild reads attrs.angle;
          // one history entry via onGeometryCommit (do not patch angle into Redux first).
          onAnglePreview?.(strokeId, placed.angle);
          onGeometryCommit([
            {
              nodeId: strokeId,
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height,
            },
          ]);
          endTransform();
          return;
        }
        const lockAspect = resolveLockAspect(document, drag.origins, drag.handle, e.shiftKey);
        let next = resizeFromHandle(drag.union, drag.handle, dx, dy, drag.angle0 || 0, {
          lockAspect,
          aspectRatio: drag.aspectRatio,
        });
        if (isGridMode && !e.ctrlKey && !e.metaKey) {
          next = snapResizeToGrid(next, drag.handle, gridSize, 8, {
            lockAspect,
            aspectRatio: drag.aspectRatio,
          });
        }
        const excludeIds = drag.origins.map((o) => o.nodeId);
        const others = siblingGuideBoxesNear(
          document,
          excludeIds,
          next,
          snapThreshold,
          queryNodeIdsInRect,
          () =>
            listNodeIds()
              .filter((id) => !excludeIds.includes(id))
              .map((id) => getNodeBox(id))
              .filter(Boolean) as SceneBox[]
        );
        const frames = frameGuideBoxes(document);
        const snapped = snapResizeToGuides(next, drag.handle, others, frames, snapThreshold, 8, {
          edgeBoxes: movingGuideBoxes(next, document, excludeIds),
          lockAspect,
          aspectRatio: drag.aspectRatio,
        });
        next = {
          ...snapped.box,
          width: Math.max(1, snapped.box.width),
          height: Math.max(1, snapped.box.height),
        };
        const textMode =
          drag.origins.length === 1 &&
          document?.deltaSetLike?.[drag.origins[0].nodeId]?.key === 'text'
            ? textResizeModeForHandle(drag.handle)
            : undefined;
        if (textMode === 'wrap') {
          next = applyTextWrapHeight(document, drag.origins[0].nodeId, next);
        }
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
    snapThreshold,
    isGridMode,
    gridSize,
  ]);

  /** Arrow keys nudge selection 1px (Shift = 10px) and show margin labels.
   *  Grid mode: step = gridSize (Shift = 5×). */
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
      const docFrames = Array.isArray(document?.frames) ? document.frames : [];
      if (
        origins.some((o) => {
          const fid = parseFrameSelId(o.nodeId);
          if (fid) return Boolean(docFrames.find((x: any) => x?.id === fid)?.locked);
          return isNodeLocked(document?.deltaSetLike?.[o.nodeId]);
        })
      ) {
        return;
      }

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
      const frames = frameGuideBoxes(document);
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
    // Move / box-resize: always use stored angle — avoids click flash when liveAngle lags at 0.
    return fromDoc;
  })();

  /**
   * Hover baseline only. Selected shapes use SelectionChrome box stroke —
   * drawing both stacks a second blue path on top of white knobs (looks hollow).
   */
  const shapeIndicators = (() => {
    if (!enabled || suppressChrome || transforming) return [];
    const id =
      hoverNodeId && !selectedNodeIds.includes(hoverNodeId) ? hoverNodeId : null;
    if (!id) return [];
    const node = document?.deltaSetLike?.[id];
    if (!node) return [];
    const box = getNodeBox(id);
    if (!box) return [];
    const pathD = geometryIndicatorPathD(node, {
      width: box.width,
      height: box.height,
    });
    if (!pathD) return [];
    return [
      {
        id,
        pathD,
        box,
        angle: readNodeAngle(document, id),
        baseWidth: Math.max(1, box.width),
        baseHeight: Math.max(1, box.height),
        selected: false,
      },
    ];
  })();

  const selectedSingleId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;

  // DPR seam diagnostics — opt-in: window.__RCB_DPR_DEBUG__ = true
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

  if (!enabled) return null;

  const selectedBox = (() => {
    if (!selectedSingleId) return null;
    if (liveUnion && selectedSingleId === selectedNodeIds[0] && !transforming) {
      return liveUnion;
    }
    return getNodeBox(selectedSingleId);
  })();

  const hoverBox =
    inspectDev && hoverNodeId && hoverNodeId !== selectedSingleId
      ? getNodeBox(hoverNodeId)
      : null;

  const clickPairBox =
    inspectDev &&
    !hoverBox &&
    inspectPairNodeId &&
    inspectPairNodeId !== selectedSingleId
      ? getNodeBox(inspectPairNodeId)
      : null;

  const pairBox = hoverBox || clickPairBox;

  const hoverImageReplaceId = (() => {
    if (inspectDev || transforming || suppressToolbars) return null;
    if (!hoverNodeId || selectedNodeIds.includes(hoverNodeId)) return null;
    const node = document?.deltaSetLike?.[hoverNodeId];
    if (node?.key !== 'image') return null;
    if (isImageGeneratorNode(node) || isVideoGeneratorNode(node)) return null;
    if (String(node?.attrs?.processStatus || '') === 'running') return null;
    return hoverNodeId;
  })();
  const hoverImageReplaceBox = hoverImageReplaceId ? getNodeBox(hoverImageReplaceId) : null;

  const hoverVideoReplaceId = (() => {
    if (inspectDev || transforming || suppressToolbars || readOnly) return null;
    if (!hoverNodeId || selectedNodeIds.includes(hoverNodeId)) return null;
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
  const spacingOthers =
    selectedBox && !pairBox
      ? (listNodeIds()
          .filter((id) => {
            if (selectedSingleId ? id === selectedSingleId : selectedNodeIds.includes(id)) {
              return false;
            }
            return !isNodeHidden(document?.deltaSetLike?.[id]);
          })
          .map((id) => getNodeBox(id))
          .filter(Boolean) as SceneBox[])
      : [];

  const hoverOutline =
    inspectDev &&
    hoverBox &&
    hoverNodeId &&
    !selectedNodeIds.includes(hoverNodeId) &&
    !transforming
      ? hoverBox
      : null;

  const clickPairOutline =
    inspectDev &&
    clickPairBox &&
    inspectPairNodeId &&
    !selectedNodeIds.includes(inspectPairNodeId) &&
    !transforming
      ? clickPairBox
      : null;

  return (
    <>
      <AlignGuidesOverlay guides={guides} space="world" />

      {moveHighlights.map((hb, i) => (
        <WorldHairlineBox
          key={`mh-${i}-${Math.round(hb.left)}-${Math.round(hb.top)}`}
          box={hb}
          color={SPACING_MEASURE_COLOR}
          zClass="z-[25]"
        />
      ))}

      {moveMargins && liveUnion ? (
        <SpacingInspectOverlay
          box={liveUnion}
          others={[]}
          measures={moveMargins}
          showSizeBadge={false}
          color={SPACING_MEASURE_COLOR}
        />
      ) : null}

      {hoverOutline ? (
        <WorldHairlineBox
          box={hoverOutline}
          color="#3388ff"
          dashed
          zClass="z-[25]"
        />
      ) : null}

      {clickPairOutline ? (
        <WorldHairlineBox
          box={clickPairOutline}
          color="#3388ff"
          dashed
          zClass="z-[25]"
        />
      ) : null}

      {/* Design mode: spacing only while dragging (moveMargins). Idle gaps are Dev-inspect only. */}
      {inspectDev &&
      selectedBox &&
      selectedSingleId &&
      !suppressChrome &&
      !transforming &&
      !moveMargins ? (
        <SpacingInspectOverlay
          box={selectedBox}
          others={spacingOthers}
          pairBox={pairBox}
          showGaps
          showSizeBadge
          color="#FF6A00"
        />
      ) : null}

      {marquee ? (
        <WorldHairlineBox
          box={marquee}
          color="#3388ff"
          fill="rgba(51,136,255,0.08)"
          zClass="z-20"
        />
      ) : null}

      {liveOrigins && liveOrigins.length > 1 && !transforming
        ? liveOrigins.map((o) => (
            <WorldHairlineBox
              key={o.nodeId}
              box={o.box}
              color="rgba(51,136,255,0.55)"
              dashed
              zClass="z-[9]"
            />
          ))
        : null}

      {shapeIndicators.map((ind) => (
        <ShapeIndicatorOverlay
          key={`ind-${ind.id}`}
          box={ind.box}
          pathD={ind.pathD}
          angle={ind.angle}
          baseWidth={ind.baseWidth}
          baseHeight={ind.baseHeight}
        />
      ))}

      {/* Gate on selection: after deselect, Redux clears first but liveUnion
          lags one frame — without this, line chrome briefly falls back to AABB box.
          Image/video generator: blue stroke only (same #3388ff as hover), no resize knobs. */}
      {liveUnion && !suppressChrome && selectionCount > 0 ? (
        <SelectionChrome
          box={liveUnion}
          angle={chromeAngle}
          showHandles={!readOnly && !selectedIsImageGen && !selectedIsVideoGen}
          cornerHandlesOnly={!single}
          variant={lineChrome ? 'line' : 'box'}
          showRotate={!readOnly && !lineChrome && singleNode && !selectedIsImageGen && !selectedIsVideoGen}
          showLineStroke={lineChrome}
          showBoxStroke={!lineChrome}
          interactiveBox={selectedFrameIds.length > 0}
          edgeHandles={
            selectedIsImageGen || selectedIsVideoGen
              ? 'none'
              : !lineChrome && singleNodeData?.key === 'text'
                ? 'horizontal'
                : 'all'
          }
        />
      ) : null}

      {!inspectDev && liveUnion && singleNode && !transforming && !suppressToolbars ? (
        <SelectionContextToolbar
          document={document}
          nodeId={selectedNodeIds[0]}
          box={liveUnion}
          onOpenAgent={onOpenAgent}
        />
      ) : null}

      {!inspectDev &&
      liveUnion &&
      singleNode &&
      singleId &&
      !transforming &&
      !suppressToolbars &&
      (singleNodeData?.key === 'image' || singleNodeData?.key === 'video') ? (
        <NodeTitleLabel
          box={liveUnion}
          angle={chromeAngle}
          name={String(
            singleNodeData?.attrs?.name ||
              (singleNodeData?.key === 'video' ? 'Video' : 'Image')
          )}
          sizeWidth={liveUnion.width}
          sizeHeight={liveUnion.height}
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
