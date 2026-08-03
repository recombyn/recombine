import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addNodeToDocument,
  createImageNode,
  createShapeNode,
  createTextNode,
  expandSelectionWithGroups,
  fitImageSize,
  groupNodesInDocument,
  isNodeHidden,
  isNodeLocked,
  measureImageNaturalSize,
  prepareVideoUploadPreview,
  removeNodesFromDocument,
  reorderNodesInDocument,
  listSceneNodes,
  resolveSelectionNodeIds,
  nodeIdsInsideFrames,
  selectionSharedGroupId,
  supportsFill,
  ungroupNodesInDocument,
  updateNodeInDocument,
  isVideoNode,
  isExportableSceneNode,
  isGeneratorNode,
  type SceneClipboardPayload,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  loadSceneOntoSvg,
  nodeLeftTop,
  clearSceneDragPreview,
  dedupeSceneNode,
  previewSvgNodeAngle,
  previewSvgNodeGeometry,
  purgeOrphanSceneNodes,
} from '@/components/rcb/scene/paint/sceneToSvg';
import { patchNodesGeometry, sceneToDocumentCoords } from '@/components/rcb/scene/paint/svgToScene';
import { strokeCenterlineToFilledOutline } from '@/components/rcb/scene/paint/outlineToPath';
import { computeShapeBoolean, type ShapeBox } from '@/components/rcb/selection/shapeBoolean';
import {
  HEAVY_PATH_D_CHARS,
  STROKE_HIT,
  distPointToPathD,
  distPointToSegment,
  hitTestSvgNodeAtClient,
  pathDContainsPoint,
  pathStrokeHitsSceneBox,
  strokeEndpointsFromBox,
  strokeNodeFromEndpoints,
} from '@/components/rcb/scene/document/sceneShapes';
import {
  deflateSelectionBox,
  inflateBoxByStrokeOutset,
  inflateSelectionBox,
} from '@/components/rcb/scene/document/sceneEffects';
import { setSceneHitTestBridge } from '@/components/rcb/scene/document/sceneHitBridge';
import { RcbSpatialIndex, nodeSceneAabb } from '@/components/rcb/core/spatialIndex';
import { useSvgBoard } from '@/components/rcb/canvas/useSvgBoard';
import {
  RcbShapesLayer,
  replaceShapePaint,
  setSharedNodeEls,
  getShapeHost,
  listShapeHosts,
  rcbFitImageIntoViewport,
  rcbScreenToScene,
  type SvgBoardHandle,
} from '@/components/rcb';
import {
  abortNodeUpload,
  beginNodeUpload,
  finishNodeUpload,
  isUploadAbortError,
  uploadImageFile,
  readFileAsDataUrl,
  waitForImageReady,
} from '@/utils/uploadImage';
import store from '@/store';
import { message } from '@/components/base';
import { exportFabricImage, exportCropSlots, type ExportImageFormat } from '@/components/rcb/scene/paint/exportImage';
import { useTranslation } from 'react-i18next';
import {
  parseNodeText,
  parseNodeTextStyle,
} from '@/components/rcb/scene/document/sceneText';
import {
  cssPreviewForGradient,
  parseFillGradient,
  parseFillType,
} from '@/components/rcb/scene/document/sceneFill';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';
import {
  patchDocumentNode,
  setActiveFrameId,
  setSelectedFrameIds,
  setMixedSelection,
  updateArtboardFrame,
  updateArtboardFrames,
  setActiveTool,
  setDocument,
  setDocumentFromCanvas,
  removeDocumentNodes,
  pushEditorHistory,
  setPendingImageSrc,
  setSelectedNodeId,
  setSelectedNodeIds,
  startImageUploadPlaceholder,
  startVideoUploadPlaceholder,
  finishImageProcess,
  failImageProcess,
  undo,
  redo,
  clearCanvasAttachPick,
  setCanvasAttachPickBlocked,
  setPendingCanvasAttach,
  setGridMode,
} from '@/store/modules/editor';
import { requestProjectFlush } from '@/components/editor/useProjectCloudSync';
import {
  canCollabRedo,
  canCollabUndo,
  collabRedo,
  collabUndo,
  getCollabUndoEpoch,
  getCollabViewEpoch,
  isCollabActive,
  isCollabViewOnly,
  subscribeCollabUndo,
  subscribeCollabView,
} from '@/components/editor/collab/collabRuntime';
import SvgPaper from './SvgPaper';
import { pointerToWorld, type ArtboardRect } from './pointerToWorld';
import { createDragWriteCoalescer } from './dragWriteCoalescer';
import {
  attachPickFilterOpts,
  ctxMenuSeedFrameIds,
  ctxMenuSeedNodeIds,
  filterChatAttachNodeIds,
  frameForFullBleedPlate,
  resolveAttachPickPayload,
} from './attachPick';
import {
  useCanvasClipboard,
  type CanvasClipboardApi,
} from './clipboard/useCanvasClipboard';
import { useCanvasContextMenu } from './contextMenu/useCanvasContextMenu';
import { useChatImageDrop } from './drop/useChatImageDrop';
import { useCanvasHotkeys } from './keyboard/useCanvasHotkeys';
import {
  SelectionFeature,
  ShapeDrawFeature,
  TextPlaceFeature,
  ImagePlaceFeature,
  PencilDrawFeature,
  PenDrawFeature,
  PenPathEditFeature,
  BucketFillFeature,
  findPencilBrush,
  STAMP_TINT_READY_EVENT,
  rcbCenterOnPoint,
} from '@/components/rcb';
import { parseFrameSelId } from '@/components/rcb/selection/SelectionFeature';
import ImageProcessOverlay from '@/components/editor/nodes/ImageNode/ImageProcessOverlay';
import ImageGeneratorOverlay from '@/components/editor/nodes/ImageGeneratorNode/ImageGeneratorOverlay';
import VideoGeneratorOverlay from '@/components/editor/nodes/VideoGeneratorNode/VideoGeneratorOverlay';
import VideoNodeOverlay, {
  type VideoGeomOverride,
} from '@/components/editor/nodes/VideoNode/VideoNodeOverlay';
import { downloadVideoNodeAsset } from '@/components/editor/nodes/VideoNode/VideoDownloadButton';
import type { PencilEraseStroke } from '@/components/rcb';
import { erasePencilNode } from '@/components/rcb';
import TextInlineEditor from '@/components/editor/nodes/TextNode/TextInlineEditor';
import CanvasContextMenu, {
  type ContextMenuState,
  type CtxAction,
} from '@/components/rcb/selection/chrome/CanvasContextMenu';
import {
  useRcbCamera,
  useRcbOverlayRoot,
  useRcbViewportEl,
} from '@/components/rcb';

type SceneBox = { left: number; top: number; width: number; height: number };

const EMPTY_NODE_IDS: string[] = [];

type SvgCanvasProps = {
  document: any;
  readOnly?: boolean;
  reloadToken?: number;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  documentPatchToken?: number;
  /** Nodes patched via Redux — refresh SVG even when selection is empty (e.g. agent busy). */
  lastPatchedNodeIds?: string[];
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onLoadStart?: () => void;
  onReady?: () => void;
  /** Open the editor AI agent dock (selection contextual bar). */
  onOpenAgent?: (opts?: { prompt?: string }) => void;
  /** Right-click 「添加到 Chat」— one node id, `frame:id`, or multiple selected ids as one group. */
  onAddToChat?: (target: string | string[]) => void;
  /** When true, paper has no outer shadow (hosted inside HtmlArtboardFrame). */
  embedded?: boolean;
  /** Full viewport stage — pencil/pen hit-test beyond the finite SVG paper. */
  stageEl?: HTMLElement | null;
  /**
   * Drawable paper in world units. Prefer origin at (0,0) and grow width/height
   * to cover the camera frustum — do not slide the origin with pan/zoom.
   */
  viewRect?: { x: number; y: number; width: number; height: number } | null;
};

/**
 * SVG.js editor shell ? mounts the board and composes feature components.
 */
function SvgCanvas({
  document,
  readOnly = false,
  reloadToken = 0,
  selectedNodeId = null,
  selectedNodeIds = [],
  documentPatchToken = 0,
  lastPatchedNodeIds = [],
  onZoomIn,
  onZoomOut,
  onReady,
  onOpenAgent,
  onAddToChat,
  embedded = false,
  stageEl = null,
  viewRect = null,
}: SvgCanvasProps) {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const camera = useRcbCamera();
  const viewportEl = useRcbViewportEl();
  useSyncExternalStore(subscribeCollabView, getCollabViewEpoch, getCollabViewEpoch);
  const collabViewOnly = isCollabViewOnly();
  // Collab share viewers: block mutations while still allowing pan/zoom/select chrome.
  readOnly = Boolean(readOnly || collabViewOnly);
  const activeTool = useSelector((s: any) => s.editor.activeTool);
  const shapeKind = useSelector((s: any) => s.editor.shapeKind);
  const pendingImageSrc = useSelector((s: any) => s.editor.pendingImageSrc);
  const penStrokeColor = useSelector((s: any) => String(s.editor.penStrokeColor || '#333333'));
  const penStrokeWidth = useSelector((s: any) => {
    const n = Number(s.editor.penStrokeWidth);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const pencilBrushId = useSelector((s: any) => String(s.editor.pencilBrushId || 'solid'));
  const pencilEraseMode = useSelector((s: any) => Boolean(s.editor.pencilEraseMode));
  const pencilPressureEnabled = useSelector((s: any) =>
    s.editor.pencilPressureEnabled !== false
  );
  const penStrokeOpacity = useSelector((s: any) => {
    const n = Number(s.editor.penStrokeOpacity);
    return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 100;
  });
  const bucketFill = useSelector((s: any) => s.editor.bucketFill || {
    fillType: 'solid',
    fillColor: '#333333',
    fillOpacity: 100,
  });
  const bucketFillRef = useRef(bucketFill);
  bucketFillRef.current = bucketFill;
  const workspaceMode = useSelector(
    (s: any) => (s.editor.workspaceMode || 'design') as 'design' | 'dev'
  );
  const canvasAttachPick = useSelector(
    (s: any) =>
      s.editor.canvasAttachPick as null | { target: string; accept?: 'image' | 'media' }
  );
  const canvasAttachPickRef = useRef(canvasAttachPick);
  canvasAttachPickRef.current = canvasAttachPick;
  const onAddToChatRef = useRef(onAddToChat);
  onAddToChatRef.current = onAddToChat;
  const hitTestRef = useRef<(x: number, y: number, screen?: { clientX: number; clientY: number }) => string | null>(
    () => null
  );
  const [stampTintEpoch, setStampTintEpoch] = useState(0);
  const reduxCanUndo = useSelector((s: any) => (s.editor.historyPast?.length || 0) > 0);
  const reduxCanRedo = useSelector((s: any) => (s.editor.historyFuture?.length || 0) > 0);
  useSyncExternalStore(subscribeCollabUndo, getCollabUndoEpoch, getCollabUndoEpoch);
  const canUndo = isCollabActive() ? canCollabUndo() : reduxCanUndo;
  const canRedo = isCollabActive() ? canCollabRedo() : reduxCanRedo;
  const isGridMode = useSelector((s: any) => Boolean(s.editor.isGridMode));
  const imageToolPanelKind = useSelector((s: any) => s.editor.imageToolPanel?.kind as string | undefined);
  const shapeStylePanel = useSelector((s: any) => s.editor.shapeStylePanel as null | { kind: string });
  const shapeStylePanelOpen = Boolean(shapeStylePanel);
  const cropExpandOpen = imageToolPanelKind === 'crop' || imageToolPanelKind === 'expand';
  const eraserOpen = imageToolPanelKind === 'eraser';
  const videoToolPanelKind = useSelector(
    (s: any) => s.editor.videoToolPanel?.kind as string | undefined
  );
  const videoToolOpen = videoToolPanelKind === 'trim';
  const activeFrameId = useSelector(
    (s: any) => (s.editor.document?.activeFrameId as string | null) ?? null
  );
  const selectedFrameIds = useSelector(
    (s: any) => (s.editor.selectedFrameIds as string[] | undefined) || []
  );

  const paperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Scene / selection refs (declared once — do not duplicate in this component).
  const documentRef = useRef(document);
  const selectedIdsRef = useRef<string[]>([]);
  const activeFrameIdRef = useRef<string | null>(null);
  const selectedFrameIdsRef = useRef<string[]>([]);
  const loadSeqRef = useRef(0);
  const lastLoadKeyRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imagePlaceAtRef = useRef<{ x: number; y: number } | null>(null);
  const [paperEl, setPaperEl] = useState<HTMLElement | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const clipboardRef = useRef<SceneClipboardPayload | null>(null);
  /** When the in-app node clipboard was last written (Ctrl+C / cut / context copy). */
  const internalClipboardAtRef = useRef(0);
  /** Last seen OS clipboard fingerprint + when it changed (for paste priority). */
  const osClipboardMetaRef = useRef<{ fingerprint: string; at: number }>({
    fingerprint: '',
    at: 0,
  });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  /** Double-click pen path → anchor / handle edit. */
  const [editingPenId, setEditingPenId] = useState<string | null>(null);
  const [pathEditSubtool, setPathEditSubtool] = useState<'select' | 'pen'>('select');
  /** After inline text commit, blank-canvas pointerup must not clear selection. */
  const keepSelectAfterTextEditRef = useRef<string | null>(null);
  /**
   * Mixed selection drag live-updates Redux frames (skipHistory) so artboard HTML
   * moves with the chrome. Snapshot history once before the first frame write so
   * commit does not push a half-new doc (new frames + old nodes).
   */
  const frameGeomHistoryPushedRef = useRef(false);
  const [geometryTransforming, setGeometryTransforming] = useState(false);
  /** Live video plate boxes while dragging — Redux only commits on gesture end. */
  const [videoLiveGeom, setVideoLiveGeom] = useState<Record<string, VideoGeomOverride> | null>(
    null
  );
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const setVideoLiveGeomRef = useRef(setVideoLiveGeom);
  setVideoLiveGeomRef.current = setVideoLiveGeom;
  const dragWriteCoalesceRef = useRef(
    createDragWriteCoalescer(({ frames, videoGeom }) => {
      if (frames.length) {
        dispatchRef.current(
          updateArtboardFrames({
            skipHistory: true,
            patches: frames.map((fp) => ({
              id: fp.id,
              patch: { x: fp.x, y: fp.y, width: fp.width, height: fp.height },
            })),
          })
        );
      }
      if (videoGeom !== undefined) setVideoLiveGeomRef.current(videoGeom);
    })
  );
  useEffect(
    () => () => {
      dragWriteCoalesceRef.current.cancel();
    },
    []
  );
  const overlayRoot = useRcbOverlayRoot();

  const publishVideoLiveGeom = useCallback((next: Record<string, VideoGeomOverride> | null) => {
    dragWriteCoalesceRef.current.queueVideoGeom(next);
  }, []);

  const onGeometryTransformingChange = useCallback((next: boolean) => {
    setGeometryTransforming(next);
    if (!next) {
      dragWriteCoalesceRef.current.cancel();
      setVideoLiveGeom(null);
    }
  }, []);
  documentRef.current = document;
  selectedIdsRef.current = ctxMenuSeedNodeIds(selectedNodeIds || [], selectedNodeId);
  activeFrameIdRef.current = activeFrameId;
  selectedFrameIdsRef.current = selectedFrameIds;

  // Content bounds (export / guides). Infinite embedded mode has no DOM paper size —
  // camera CSS on RcbCanvas world layer owns pan/zoom.
  const paperW = viewRect?.width || document?.width || 794;
  const paperH = viewRect?.height || document?.height || 1123;
  const infinite = Boolean(embedded);
  const artboard = useMemo(
    () => ({ x: 0, y: 0, width: paperW, height: paperH }),
    [paperW, paperH]
  );
  const modLabel = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '?' : 'Ctrl';
  // Embedded infinite canvas: per-shape hosts (RcbShapesLayer). Finite paper keeps mono board.
  const { boardRef: monoBoardRef, boardEpoch } = useSvgBoard(hostRef, paperW, paperH, {
    infinite,
    enabled: !infinite,
  });
  const nodeElsRef = useRef(new Map<string, any>());
  const perShapeBoardRef = useRef<SvgBoardHandle>({
    root: null as any,
    layer: null as any,
    nodeEls: nodeElsRef.current,
    getSvgElement: () => null,
    toSvgString: () => '',
  });
  const boardRef = infinite ? perShapeBoardRef : monoBoardRef;

  useEffect(() => {
    if (!infinite) return undefined;
    setSharedNodeEls(nodeElsRef.current);
    perShapeBoardRef.current.nodeEls = nodeElsRef.current;
    // Hosts that painted before shared map was set wrote into a throwaway Map.
    listShapeHosts().forEach((h) => {
      if (h.el) nodeElsRef.current.set(h.nodeId, h.el);
    });
    return () => setSharedNodeEls(null);
  }, [infinite]);

  useEffect(() => {
    setPaperEl(paperRef.current);
  }, [boardEpoch, infinite]);

  // Non-infinite only: keep a finite SVG paper. Embedded infinite must NOT re-apply viewBox.
  useEffect(() => {
    if (infinite) return;
    const board = boardRef.current;
    if (!board) return;
    const w = Math.max(1, Math.round(paperW));
    const h = Math.max(1, Math.round(paperH));
    try {
      board.root.setAttribute('width', String(w));
      board.root.setAttribute('height', String(h));
      board.root.setAttribute('viewBox', `0 0 ${w} ${h}`);
      board.root.setAttribute('preserveAspectRatio', 'none');
    } catch {
      /* ignore */
    }
  }, [infinite, paperW, paperH, boardEpoch]);

  useEffect(() => {
    if (infinite) {
      // Per-shape hosts mount via RcbShapesLayer; signal ready once children are known.
      onReady?.();
      return;
    }
    const board = boardRef.current;
    if (!board || !document) return;
    // Width/height omitted: world surface padding changes on every edge move.
    const key = `${reloadToken}:${boardEpoch}:${String(document.backgroundColor || '')}`;
    if (lastLoadKeyRef.current === key) return;
    lastLoadKeyRef.current = key;

    const seq = ++loadSeqRef.current;
    (board as any).loadSeq = seq;
    // Drop stale wrappers immediately so in-place preview cannot re-attach detached ghosts.
    board.nodeEls = new Map();
    loadSceneOntoSvg(board.root, board.layer, document, seq, board as any, { infinite }).then(
      (map) => {
        if (loadSeqRef.current !== seq) return;
        board.nodeEls = map || new Map();
        onReady?.();
      }
    );
  }, [document, reloadToken, boardEpoch, onReady, infinite]);

  useEffect(() => {
    if (!documentPatchToken || geometryTransforming) return;
    const board = boardRef.current;
    const doc = documentRef.current;
    if (!board || !doc) return;
    // Only nodes touched by the latest document patch — never repaint on selection
    // alone (re-setting a video poster flashes the first frame under the live <video>).
    lastPatchedNodeIds.forEach((id) => {
      if (!id) return;
      void replaceShapePaint(doc, board.nodeEls, id, board.root ? board : null);
    });
  }, [documentPatchToken, lastPatchedNodeIds, geometryTransforming]);

  // Stamp tip tint may resolve after first paint ? refresh pencil stamp strokes.
  useEffect(() => {
    const onReady = () => setStampTintEpoch((n) => n + 1);
    window.addEventListener(STAMP_TINT_READY_EVENT, onReady);
    return () => window.removeEventListener(STAMP_TINT_READY_EVENT, onReady);
  }, []);

  useEffect(() => {
    if (!stampTintEpoch) return;
    const board = boardRef.current;
    const doc = documentRef.current;
    if (!board || !doc) return;
    listSceneNodes(doc).forEach(({ id, node }) => {
      if (node?.key !== 'shape') return;
      if (String(node.attrs?.shapeType || '') !== 'pencil') return;
      const stamp = node.attrs?.brushStampSrc || findPencilBrush(node.attrs?.brushStyle).stampSrc;
      if (!stamp) return;
      void replaceShapePaint(doc, board.nodeEls, id, board.root ? board : null);
    });
  }, [stampTintEpoch]);

  const listNodeIds = useCallback(() => {
    const doc = documentRef.current;
    const page = doc?.pages?.find((p: any) => p.id === doc?.activePageId) || doc?.pages?.[0];
    const fromPage = page?.children;
    if (Array.isArray(fromPage) && fromPage.length) return [...fromPage];
    return [...(doc?.deltaSetLike?.ROOT?.children || [])];
  }, []);

  /** Spatial index — full rebuild on reload; incremental upsert on patched ids. */
  const spatialIndexRef = useRef(new RcbSpatialIndex(256));
  const spatialReloadRef = useRef<number | string | null>(null);
  const nodeSpatialIndex = useMemo(() => {
    const idx = spatialIndexRef.current;
    const doc = document;
    if (!doc) {
      idx.clear();
      spatialReloadRef.current = null;
      return idx;
    }
    const page = doc?.pages?.find((p: any) => p.id === doc?.activePageId) || doc?.pages?.[0];
    const fromPage = page?.children;
    const ids: string[] = Array.isArray(fromPage) && fromPage.length
      ? [...fromPage]
      : [...(doc?.deltaSetLike?.ROOT?.children || [])];
    // Drift (add/delete without reloadToken) → full rebuild so cull stays correct.
    const needFull =
      spatialReloadRef.current !== reloadToken ||
      idx.size === 0 ||
      ids.length < 48 ||
      Math.abs(idx.size - ids.length) > 0;
    if (needFull) {
      idx.clear();
      for (const id of ids) {
        const box = nodeSceneAabb(doc, id, 32);
        if (!box) continue;
        idx.upsert({ id, ...box });
      }
      spatialReloadRef.current = reloadToken;
      return idx;
    }
    // Incremental: refresh only nodes touched by the latest patch.
    if (!lastPatchedNodeIds.length) return idx;
    for (const id of lastPatchedNodeIds) {
      if (!doc.deltaSetLike?.[id]) {
        idx.remove(String(id));
        continue;
      }
      const box = nodeSceneAabb(doc, id, 32);
      if (!box) idx.remove(String(id));
      else idx.upsert({ id: String(id), ...box });
    }
    return idx;
  }, [document, documentPatchToken, reloadToken, lastPatchedNodeIds]);

  const queryNodeIdsInRect = useCallback(
    (box: { left: number; top: number; width: number; height: number }) => {
      const all = listNodeIds();
      // Always prefer spatial hits — returning every node on small docs made distant
      // posters steal center-align guides; keep snaps to nearby / same-artboard targets.
      const hits = nodeSpatialIndex.search(
        box.left,
        box.top,
        box.left + box.width,
        box.top + box.height
      );
      if (!hits.length) return [];
      const allow = new Set(hits.map((h) => h.id));
      // Keep document z-order.
      return all.filter((id) => allow.has(id));
    },
    [listNodeIds, nodeSpatialIndex]
  );

  const getNodeBox = useCallback((nodeId: string): SceneBox | null => {
    const doc = documentRef.current;
    const node = doc?.deltaSetLike?.[nodeId];
    if (!node) return null;
    const { left, top } = nodeLeftTop(doc, node);
    const geom: SceneBox = {
      left,
      top,
      width: Math.max(1, Number(node.width) || 1),
      height: Math.max(1, Number(node.height) || 1),
    };
    // Chrome / snap hug the vector baseline AABB (stroke is paint-only).
    return inflateSelectionBox(geom, node);
  }, []);

  /** Persist chrome box → stored path geometry. */
  const toGeometryPatches = useCallback(
    (
      doc: any,
      patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>
    ) =>
      patches.map((p) => {
        const node = doc?.deltaSetLike?.[p.nodeId];
        const deflated = deflateSelectionBox(p, node);
        return {
          ...p,
          left: deflated.left,
          top: deflated.top,
          width: deflated.width,
          height: deflated.height,
        };
      }),
    []
  );
  const hitTest = useCallback(
    (x: number, y: number, screen?: { clientX: number; clientY: number }) => {
      const doc = documentRef.current;
      const board = boardRef.current;
      // Infinite paper is 0×0 — always use camera zoom (page-space margin).
      const zoom = Math.max(0.05, camera.zoom || 1);
      // ~12px on screen, at least half the stroke hit pad in world units.
      const pad = Math.max(STROKE_HIT / 2, 12 / zoom);
      const allIds = listNodeIds();
      let order = [...allIds].reverse();
      // Large scenes: only test spatially nearby candidates (z-order preserved among them).
      // Falling through the full list made hover O(N) even with an index.
      if (allIds.length >= 48) {
        const nearby = nodeSpatialIndex.searchPoint(x, y, pad + 64);
        if (nearby.length) {
          const allow = new Set(nearby.map((n) => n.id));
          order = order.filter((id) => allow.has(id));
        }
      }
      for (const id of order) {
        const node = doc?.deltaSetLike?.[id];
        if (!node || isNodeHidden(node)) continue;
        const box = getNodeBox(id);
        if (!box) continue;
        const shapeType = String(node.attrs?.shapeType || '');
        if (shapeType === 'line' || shapeType === 'arrow') {
          const angle = Number(node.attrs?.angle) || 0;
          const ep = strokeEndpointsFromBox(box, angle);
          if (distPointToSegment(x, y, ep.x0, ep.y0, ep.x1, ep.y1) <= pad) {
            return id;
          }
          continue;
        }
        // Pen: stroke only. Pencil / closed filled path (e.g. boolean): fill + stroke.
        if (shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'path') {
          const sw = Math.max(
            1,
            Number(node.attrs?.borderWidth ?? node.attrs?.['border-width'] ?? 2) || 2
          );
          const pathPad = Math.max(sw / 2 + 2, 10 / zoom);
          // Closed boolean/path fills: hit interior, not only the outline.
          const fillHit = shapeType !== 'pen' && supportsFill(node);
          const inLooseBox =
            x >= box.left - pathPad &&
            x <= box.left + box.width + pathPad &&
            y >= box.top - pathPad &&
            y <= box.top + box.height + pathPad;
          if (!inLooseBox) continue;

          const svgEl = board?.nodeEls?.get(id);
          const d = String(node.attrs?.path || node.attrs?.d || '');
          const heavyPath = d.length >= HEAVY_PATH_D_CHARS;
          if (svgEl && screen) {
            const mode = shapeType === 'pencil' || fillHit ? 'auto' : 'stroke';
            // Cap temporary stroke width — huge values ≈ AABB at low zoom.
            const hitW = Math.min(Math.max(sw * 2, pathPad * 2), sw + 24 / zoom);
            if (
              hitTestSvgNodeAtClient(svgEl, screen.clientX, screen.clientY, {
                mode,
                strokeHitWidth: hitW,
              })
            ) {
              return id;
            }
            // Outlined text: trust DOM isPointInFill/Stroke — re-parsing the full
            // multi-glyph `d` on every pointermove freezes the page.
            if (heavyPath) continue;
          }

          // Path centerline / fill sample (also used when DOM hit misses / node not mounted).
          const angle = Number(node.attrs?.angle) || 0;
          let lx = x - box.left;
          let ly = y - box.top;
          if (Math.abs(angle) > 0.5) {
            const cx = box.width / 2;
            const cy = box.height / 2;
            const rad = (-angle * Math.PI) / 180;
            const dx = lx - cx;
            const dy = ly - cy;
            lx = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
            ly = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;
          }
          // Unmounted / DOM miss: heavy paths → AABB only (never sample 12KB+ d).
          if (heavyPath) {
            if (
              fillHit &&
              lx >= 0 &&
              ly >= 0 &&
              lx <= box.width &&
              ly <= box.height
            ) {
              return id;
            }
            continue;
          }
          if (fillHit) {
            const rule = String(node.attrs?.['fill-rule'] || 'nonzero');
            if (pathDContainsPoint(lx, ly, d, rule)) return id;
          }
          if (distPointToPathD(lx, ly, d) <= pathPad) return id;
          continue;
        }
        // Geo shapes: chrome = baseline; hit uses visual stroke outset so thick ink stays clickable.
        const hitBox = inflateBoxByStrokeOutset(box, node);
        const hitPad = pad;
        const angle = Number(node.attrs?.angle) || 0;
        if (Math.abs(angle) > 0.5) {
          // Rotated AABB → local test
          const cx = hitBox.left + hitBox.width / 2;
          const cy = hitBox.top + hitBox.height / 2;
          const rad = (-angle * Math.PI) / 180;
          const dx = x - cx;
          const dy = y - cy;
          const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
          if (
            Math.abs(lx) <= hitBox.width / 2 + hitPad * 0.25 &&
            Math.abs(ly) <= hitBox.height / 2 + hitPad * 0.25
          ) {
            return id;
          }
          continue;
        }
        if (
          x >= hitBox.left - hitPad * 0.15 &&
          x <= hitBox.left + hitBox.width + hitPad * 0.15 &&
          y >= hitBox.top - hitPad * 0.15 &&
          y <= hitBox.top + hitBox.height + hitPad * 0.15
        ) {
          return id;
        }
      }
      return null;
    },
    [getNodeBox, listNodeIds, camera.zoom, nodeSpatialIndex]
  );

  useEffect(() => {
    setSceneHitTestBridge(hitTest);
    return () => setSceneHitTestBridge(null);
  }, [hitTest]);

  hitTestRef.current = hitTest;

  /** Apply one canvas pick into composer, then exit pick mode (one pick per activation). */
  const completeCanvasAttachPick = useCallback(
    (pickTarget: string, payload: string | string[]) => {
      if (pickTarget === 'agent') {
        onAddToChatRef.current?.(payload);
      } else {
        // Pending attach keeps the node composer open via the payload — do not
        // steal selection onto the host plate (that feels like exiting pick).
        dispatch(setPendingCanvasAttach({ target: pickTarget, payload }));
      }
      dispatch(clearCanvasAttachPick());
    },
    [dispatch]
  );

  // Plus / not-allowed cursor while picking for Chat.
  useEffect(() => {
    if (!canvasAttachPick || !stageEl) {
      dispatch(setCanvasAttachPickBlocked(false));
      return undefined;
    }
    const onMove = (e: PointerEvent) => {
      const pt = rcbScreenToScene(camera, stageEl, e.clientX, e.clientY);
      const id = hitTestRef.current(pt.x, pt.y, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      if (!id) {
        dispatch(setCanvasAttachPickBlocked(false));
        return;
      }
      const doc = documentRef.current;
      const seed = expandSelectionWithGroups(doc, [id]);
      const attachable = filterChatAttachNodeIds(
        doc,
        seed,
        attachPickFilterOpts(canvasAttachPickRef.current)
      );
      dispatch(setCanvasAttachPickBlocked(seed.length > 0 && attachable.length === 0));
    };
    stageEl.addEventListener('pointermove', onMove);
    return () => {
      stageEl.removeEventListener('pointermove', onMove);
      dispatch(setCanvasAttachPickBlocked(false));
    };
  }, [canvasAttachPick, stageEl, dispatch, camera]);

  const hitTestFrame = useCallback((x: number, y: number) => {
    const frames: any[] = Array.isArray(documentRef.current?.frames)
      ? documentRef.current.frames
      : [];
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const frame = frames[i];
      if (!frame || frame.locked || frame.hidden) continue;
      const fx = Number(frame.x) || 0;
      const fy = Number(frame.y) || 0;
      const fw = Math.max(1, Number(frame.width) || 1);
      const fh = Math.max(1, Number(frame.height) || 1);
      if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) {
        return String(frame.id);
      }
    }
    return null;
  }, []);

  const onSelectFrame = useCallback(
    (frameId: string | null) => {
      const pick = canvasAttachPickRef.current;
      if (pick?.target) {
        if (!frameId) {
          dispatch(clearCanvasAttachPick());
          return;
        }
        completeCanvasAttachPick(pick.target, `frame:${frameId}`);
        return;
      }
      if (!frameId) {
        dispatch(setActiveFrameId(null));
        return;
      }
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
      dispatch(setActiveFrameId(frameId));
    },
    [dispatch, completeCanvasAttachPick]
  );

  const onSelectFrames = useCallback(
    (frameIds: string[]) => {
      const pick = canvasAttachPickRef.current;
      const ids = Array.isArray(frameIds) ? frameIds.filter(Boolean) : [];
      if (pick?.target) {
        if (!ids.length) {
          dispatch(clearCanvasAttachPick());
          return;
        }
        completeCanvasAttachPick(pick.target, `frame:${ids[0]}`);
        return;
      }
      if (!ids.length) {
        dispatch(setActiveFrameId(null));
        return;
      }
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedFrameIds(ids));
    },
    [dispatch, completeCanvasAttachPick]
  );

  const onSelectMixed = useCallback(
    (nodeIds: string[], frameIds: string[], opts?: { additive?: boolean }) => {
      const pick = canvasAttachPickRef.current;
      if (pick?.target && !opts?.additive) {
        const resolved = resolveAttachPickPayload(
          documentRef.current,
          nodeIds || [],
          (frameIds || [])[0],
          attachPickFilterOpts(pick)
        );
        if (!resolved) {
          dispatch(clearCanvasAttachPick());
          return;
        }
        if (resolved.blockedOnly) return; // stay in pick mode
        completeCanvasAttachPick(pick.target, resolved.payload);
        return;
      }
      keepSelectAfterTextEditRef.current = null;
      let nextNodes = expandSelectionWithGroups(documentRef.current, nodeIds || []);
      let nextFrames = [...new Set((frameIds || []).filter(Boolean))];
      if (opts?.additive) {
        const curNodes = new Set(selectedIdsRef.current);
        nextNodes.forEach((id) => {
          if (curNodes.has(id)) curNodes.delete(id);
          else curNodes.add(id);
        });
        nextNodes = [...curNodes];
        const curFrames = new Set(selectedFrameIdsRef.current);
        nextFrames.forEach((id) => {
          if (curFrames.has(id)) curFrames.delete(id);
          else curFrames.add(id);
        });
        nextFrames = [...curFrames];
      }
      dispatch(setMixedSelection({ nodeIds: nextNodes, frameIds: nextFrames }));
    },
    [dispatch, completeCanvasAttachPick]
  );

  const onSelect = useCallback(
    (ids: string[], opts?: { additive?: boolean }) => {
      // Allow selection in read-only Dev/preview so inspect annotations work.
      // Do not re-select after text blur: blank click must clear focus/selection.
      keepSelectAfterTextEditRef.current = null;
      const doc = documentRef.current;
      const pick = canvasAttachPickRef.current;

      // Composer pick mode — attach hit (group-expanded); blocked nodes keep pick active.
      if (pick?.target && !opts?.additive) {
        if (!ids.length) {
          dispatch(clearCanvasAttachPick());
          return;
        }
        if (ids.length === 1) {
          const plateFrame = frameForFullBleedPlate(doc, ids[0]);
          if (plateFrame) {
            completeCanvasAttachPick(pick.target, `frame:${plateFrame.id}`);
            return;
          }
        }
        const resolved = resolveAttachPickPayload(
          doc,
          ids,
          undefined,
          attachPickFilterOpts(pick)
        );
        if (!resolved) {
          dispatch(clearCanvasAttachPick());
          return;
        }
        if (resolved.blockedOnly) return;
        completeCanvasAttachPick(pick.target, resolved.payload);
        return;
      }

      // Soft-click a near-full-bleed background plate → select the artboard instead
      // (avoids a white+stroke rect looking like a UI overlay on the poster).
      if (!opts?.additive && ids.length === 1) {
        const plateFrame = frameForFullBleedPlate(doc, ids[0]);
        if (plateFrame) {
          const plate = doc?.deltaSetLike?.[ids[0]];
          const border = String(plate?.attrs?.['border-color'] || '')
            .replace(/\s/g, '')
            .toLowerCase();
          const bw = Number(plate?.attrs?.['border-width'] ?? 1);
          // Heal legacy agent plates that used the old default #333 stroke.
          const strokeOn = String(plate?.attrs?.['stroke-enabled'] ?? 'true') !== 'false';
          if (
            plate &&
            strokeOn &&
            bw > 0 &&
            (border === '#333333' || border === '#333' || border === 'rgb(51,51,51)')
          ) {
            dispatch(
              patchDocumentNode({
                nodeId: ids[0],
                skipHistory: true,
                patch: {
                  attrs: {
                    'stroke-enabled': 'false',
                    'stroke-visible': 'false',
                    'border-width': 0,
                  },
                },
              })
            );
          }
          dispatch(setSelectedNodeIds([]));
          dispatch(setActiveFrameId(plateFrame.id));
          return;
        }
      }
      // Clicking any grouped member selects the whole group.
      let seed = expandSelectionWithGroups(doc, ids);
      let next = seed;
      if (opts?.additive) {
        const cur = new Set(selectedIdsRef.current);
        seed.forEach((id) => {
          if (cur.has(id)) cur.delete(id);
          else cur.add(id);
        });
        next = [...cur];
        // Keep frames when shift-adding nodes.
        dispatch(setSelectedNodeIds(next));
        return;
      }
      // Prefer setSelectedNodeIds only — setSelectedNodeId clears multi-select to [id].
      dispatch(setMixedSelection({ nodeIds: next, frameIds: [] }));
    },
    [dispatch, completeCanvasAttachPick]
  );

  const rebuildNodes = useCallback((doc: any, ids: string[]) => {
    const board = boardRef.current;
    if (!board || !doc) return;
    ids.forEach((id) => {
      void replaceShapePaint(doc, board.nodeEls, id, board.root ? board : null);
    });
  }, []);

  /** Line/arrow keep a fixed hit height ? length changes via width only. */
  const normalizeGeomPatches = useCallback(
    (
      doc: any,
      patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>
    ) =>
      patches.map((p) => {
        const t = String(doc?.deltaSetLike?.[p.nodeId]?.attrs?.shapeType || '');
        if (t !== 'line' && t !== 'arrow') return p;
        const midY = p.top + p.height / 2;
        return {
          ...p,
          height: STROKE_HIT,
          top: midY - STROKE_HIT / 2,
          width: Math.max(1, p.width),
        };
      }),
    []
  );

  const applyFrameGeometryPatches = useCallback(
    (
      patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>,
      opts?: { preview?: boolean }
    ) => {
      const nodePatches: typeof patches = [];
      const frames: Array<{ id: string; x: number; y: number; width: number; height: number }> =
        [];
      for (const p of patches) {
        const fid = parseFrameSelId(p.nodeId);
        if (fid) {
          frames.push({
            id: fid,
            x: p.left,
            y: p.top,
            width: Math.max(1, p.width),
            height: Math.max(1, p.height),
          });
        } else {
          nodePatches.push(p);
        }
      }
      if (!frames.length) return { nodePatches, frames };
      // Live preview only — commit merges frames into the document object below.
      if (opts?.preview) {
        // Push pre-gesture doc before the first Redux frame write (same as title-bar
        // onFrameMoveStart). Nodes are still pre-gesture in Redux during preview.
        if (!frameGeomHistoryPushedRef.current) {
          dispatch(pushEditorHistory());
          frameGeomHistoryPushedRef.current = true;
        }
        dragWriteCoalesceRef.current.queueFrames(frames);
      }
      return { nodePatches, frames };
    },
    [dispatch]
  );

  const onGeometryCommit = useCallback(
    (
      patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>,
      options?: { textResizeMode?: 'scale' | 'wrap'; skipHistory?: boolean }
    ) => {
      // Drop coalesced previews — commit writes the final document once.
      dragWriteCoalesceRef.current.cancel();
      const doc = documentRef.current;
      const board = boardRef.current;
      if (!doc || readOnly || !patches.length) return;
      const { nodePatches, frames } = applyFrameGeometryPatches(patches);
      let next = doc;
      if (nodePatches.length) {
        const normalized = normalizeGeomPatches(doc, toGeometryPatches(doc, nodePatches));
        next = patchNodesGeometry(doc, normalized, {
          fitTextBox: true,
          textResizeMode: options?.textResizeMode,
        });
        // Sync SVG for node patches (below). Keep normalized in scope via rebuild from next.
        documentRef.current = next;
        if (board) {
          normalized.forEach((p) => {
            const el = board.nodeEls.get(p.nodeId) as any;
            const shapeType = String(
              el?.sceneShapeType ||
                el?.attr?.('data-scene-shape-type') ||
                next?.deltaSetLike?.[p.nodeId]?.attrs?.shapeType ||
                ''
            );
            const isStrokeShape = shapeType === 'line' || shapeType === 'arrow';
            const isText = next?.deltaSetLike?.[p.nodeId]?.key === 'text';
            const didResize = Boolean(el?.__sceneDidResize);
            clearSceneDragPreview(board.nodeEls, p.nodeId);
            // Images/svg use scale preview while dragging — remount to bake
            // width/height (and refresh the infinite SVG viewport) on commit.
            if (didResize || isStrokeShape || isText) {
              void replaceShapePaint(next, board.nodeEls, p.nodeId, board.root ? board : null);
              return;
            }
            const synced = previewSvgNodeGeometry(board.nodeEls, p.nodeId, p);
            if (!synced) {
              void replaceShapePaint(next, board.nodeEls, p.nodeId, board.root ? board : null);
              return;
            }
            const host = getShapeHost(p.nodeId);
            if (host) {
              dedupeSceneNode(host.layer, p.nodeId, board.nodeEls.get(p.nodeId) ?? null);
            } else if (board.layer) {
              dedupeSceneNode(board.layer, p.nodeId, board.nodeEls.get(p.nodeId) ?? null);
            }
          });
          const validIds = next?.deltaSetLike?.ROOT?.children || [];
          if (board.layer) {
            purgeOrphanSceneNodes(board.layer, board.nodeEls, validIds);
          } else {
            [...board.nodeEls.keys()].forEach((id) => {
              if (!validIds.includes(id)) board.nodeEls.delete(id);
            });
          }
        }
      }
      // Merge frame boxes into the same document write so nodes don't clobber frames.
      if (frames.length) {
        const byId = new Map(frames.map((f) => [f.id, f]));
        next = {
          ...next,
          frames: (Array.isArray(next.frames) ? next.frames : []).map((f: any) => {
            const hit = byId.get(String(f?.id));
            if (!hit) return f;
            return { ...f, x: hit.x, y: hit.y, width: hit.width, height: hit.height };
          }),
        };
      }
      documentRef.current = next;
      // Node-only preview leaves Redux pristine; frame preview already pushed history.
      if (!options?.skipHistory && !frameGeomHistoryPushedRef.current) {
        dispatch(pushEditorHistory());
      }
      frameGeomHistoryPushedRef.current = false;
      dispatch(setDocumentFromCanvas(next));
    },
    [dispatch, readOnly, normalizeGeomPatches, toGeometryPatches, applyFrameGeometryPatches]
  );

  /** Update SVG only — never replace while dragging (replace races pile ghost copies). */
  const onGeometryPreview = useCallback(
    (
      patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>,
      options?: { textResizeMode?: 'scale' | 'wrap' }
    ) => {
      const doc = documentRef.current;
      const board = boardRef.current;
      if (!doc || readOnly || !patches.length) return;
      const { nodePatches } = applyFrameGeometryPatches(patches, { preview: true });
      if (!nodePatches.length || !board) return;
      const normalized = normalizeGeomPatches(doc, toGeometryPatches(doc, nodePatches));
      const next = patchNodesGeometry(doc, normalized, {
        textResizeMode: options?.textResizeMode,
      });
      documentRef.current = next;
      const videoOverrides: Record<string, VideoGeomOverride> = {};
      let hasVideo = false;
      normalized.forEach((p) => {
        const node = next?.deltaSetLike?.[p.nodeId];
        const isText = node?.key === 'text';
        const box =
          isText && options?.textResizeMode === 'wrap'
            ? {
                left: p.left,
                top: p.top,
                width: Math.max(1, Number(node.width) || p.width),
                height: Math.max(1, Number(node.height) || p.height),
              }
            : p;
        if (node?.key === 'video') {
          hasVideo = true;
          videoOverrides[p.nodeId] = {
            left: box.left,
            top: box.top,
            width: Math.max(1, box.width),
            height: Math.max(1, box.height),
          };
        }
        // Per-shape hosts may register before shared nodeEls is wired — recover.
        if (!board.nodeEls.get(p.nodeId)) {
          const hostEl = getShapeHost(p.nodeId)?.el;
          if (hostEl) board.nodeEls.set(p.nodeId, hostEl);
        }
        previewSvgNodeGeometry(board.nodeEls, p.nodeId, box, {
          textResizeMode: options?.textResizeMode,
          plainText: isText ? parseNodeText(node.attrs || {}) : undefined,
          textStyle: isText ? parseNodeTextStyle(node.attrs || {}) : undefined,
        });
      });
      // Keep HTML <video> plates glued to chrome (Redux doc is still pre-gesture).
      if (hasVideo) {
        publishVideoLiveGeom({
          ...(dragWriteCoalesceRef.current.getPendingVideoGeom() || {}),
          ...videoOverrides,
        });
      }
    },
    [readOnly, normalizeGeomPatches, toGeometryPatches, applyFrameGeometryPatches, publishVideoLiveGeom]
  );

  const onAngleCommit = useCallback(
    (nodeId: string, angleDeg: number, options?: { skipHistory?: boolean }) => {
      if (readOnly || !nodeId) return;
      const nextAngle = Number(angleDeg.toFixed(2));
      const doc = documentRef.current;
      if (doc?.deltaSetLike?.[nodeId]) {
        const node = doc.deltaSetLike[nodeId];
        documentRef.current = {
          ...doc,
          deltaSetLike: {
            ...doc.deltaSetLike,
            [nodeId]: {
              ...node,
              attrs: { ...node.attrs, angle: nextAngle },
            },
          },
        };
      }
      dispatch(
        patchDocumentNode({
          nodeId,
          patch: { attrs: { angle: nextAngle } },
          skipHistory: Boolean(options?.skipHistory),
        })
      );
    },
    [dispatch, readOnly]
  );

  const onAnglePreview = useCallback(
    (nodeId: string, angleDeg: number) => {
      const doc = documentRef.current;
      const board = boardRef.current;
      if (!doc || !board || readOnly || !nodeId) return;
      const node = doc.deltaSetLike?.[nodeId];
      if (!node) return;
      const nextAngle = Number(angleDeg.toFixed(2));
      documentRef.current = {
        ...doc,
        deltaSetLike: {
          ...doc.deltaSetLike,
          [nodeId]: {
            ...node,
            attrs: { ...node.attrs, angle: nextAngle },
          },
        },
      };
      const synced = previewSvgNodeAngle(board.nodeEls, nodeId, nextAngle);
      if (!synced) {
        void replaceShapePaint(
          documentRef.current,
          board.nodeEls,
          nodeId,
          board.root ? board : null
        );
      }
    },
    [readOnly]
  );

  const finishToSelect = () => dispatch(setActiveTool('select'));

  const onCreateShape = useCallback(
    (
      kind: string,
      box: {
        left: number;
        top: number;
        width: number;
        height: number;
        x0?: number;
        y0?: number;
        x1?: number;
        y1?: number;
      }
    ) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return;
      const isStroke = kind === 'line' || kind === 'arrow';

      if (isStroke && box.x0 != null && box.y0 != null && box.x1 != null && box.y1 != null) {
        const a = sceneToDocumentCoords(doc, box.x0, box.y0);
        const b = sceneToDocumentCoords(doc, box.x1, box.y1);
        const placed = strokeNodeFromEndpoints({
          x0: a.x,
          y0: a.y,
          x1: b.x,
          y1: b.y,
        });
        const { id, node } = createShapeNode({
          x: placed.x,
          y: placed.y,
          width: placed.width,
          height: placed.height,
          shapeType: kind,
          fill: 'transparent',
          angle: placed.angle,
        });
        const next = addNodeToDocument(doc, id, node);
        documentRef.current = next;
        dispatch(setDocument(next));
        dispatch(setSelectedNodeIds([id]));
        dispatch(setSelectedNodeId(id));
        finishToSelect();
        return;
      }

      // Circles / regular polygons / stars stay proportional: lock to a square.
      let width = box.width;
      let height = box.height;
      let left = box.left;
      let top = box.top;
      if (kind === 'circle' || kind === 'polygon' || kind === 'star') {
        const size = Math.max(3, Math.max(box.width, box.height));
        left = box.left + (box.width - size) / 2;
        top = box.top + (box.height - size) / 2;
        width = size;
        height = size;
      }
      const origin = sceneToDocumentCoords(doc, left, top);
      const { id, node } = createShapeNode({
        x: origin.x,
        y: origin.y,
        width,
        height,
        shapeType: kind,
        fill: '#FFFFFF',
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([id]));
      dispatch(setSelectedNodeId(id));
      finishToSelect();
    },
    [dispatch, readOnly]
  );

  const onPlaceText = useCallback(
    (point: { x: number; y: number; width?: number; autoSize?: boolean }) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return;
      const autoSize = point.autoSize !== false;
      const origin = sceneToDocumentCoords(doc, point.x, point.y);
      const { id, node } = createTextNode({
        x: origin.x,
        y: origin.y,
        text: '',
        width: autoSize ? 2 : Math.max(16, Math.round(point.width || 160)),
        height: 20,
        autoSize,
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([id]));
      dispatch(setSelectedNodeId(id));
      setEditingTextId(id);
      finishToSelect();
    },
    [dispatch, readOnly]
  );

  const onTextEditCommit = useCallback(
    (next: {
      attrs: Record<string, unknown>;
      width: number;
      height: number;
      left?: number;
    }) => {
      if (!editingTextId) return;
      const id = editingTextId;
      const doc = documentRef.current;
      keepSelectAfterTextEditRef.current = null;
      const patch: Record<string, unknown> = {
        attrs: next.attrs,
        width: next.width,
        height: next.height,
      };
      if (next.left != null && doc) {
        const coords = sceneToDocumentCoords(doc, next.left, 0);
        patch.x = coords.x;
      }
      dispatch(
        patchDocumentNode({
          nodeId: id,
          patch,
        })
      );
      setEditingTextId(null);
    },
    [dispatch, editingTextId]
  );

  const onTextLiveSize = useCallback(
    (next: { width: number; height: number; left?: number; autoSize?: boolean }) => {
      if (!editingTextId) return;
      const doc = documentRef.current;
      const patch: Record<string, unknown> = {
        width: next.width,
        height: next.height,
      };
      if (next.autoSize != null) {
        patch.attrs = { autoSize: next.autoSize ? 'true' : 'false' };
      }
      if (next.left != null && doc) {
        const coords = sceneToDocumentCoords(doc, next.left, 0);
        patch.x = coords.x;
      }
      dispatch(
        patchDocumentNode({
          nodeId: editingTextId,
          patch,
          skipHistory: true,
        })
      );
    },
    [dispatch, editingTextId]
  );

  const onTextEditCancel = useCallback(() => {
    const id = editingTextId;
    keepSelectAfterTextEditRef.current = null;
    setEditingTextId(null);
    if (!id || !documentRef.current) return;
    const node = documentRef.current.deltaSetLike?.[id];
    const md = String(node?.attrs?.markdown ?? '').trim();
    // Delete empty / freshly placed text that was cancelled.
    if (!md) {
      const next = removeNodesFromDocument(documentRef.current, [id]);
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
    } else {
      // Discard edits but keep the node selected (same as blur-to-select).
      dispatch(setSelectedNodeIds([id]));
      dispatch(setSelectedNodeId(id));
    }
  }, [dispatch, editingTextId]);

  // Hide SVG text glyph while the caret editor is open (avoid double text).
  // Native SVGElement has no SVG.js `.opacity()` — use style/attribute.
  useEffect(() => {
    if (!editingTextId) return undefined;
    const applyHidden = (hidden: boolean) => {
      const el = boardRef.current?.nodeEls.get(editingTextId) as SVGElement | undefined;
      if (!el) return false;
      const v = hidden ? '0' : '1';
      el.style.opacity = v;
      el.setAttribute('opacity', v);
      // Legacy SVG.js wrappers (if any still linger).
      const anyEl = el as any;
      if (typeof anyEl.opacity === 'function') anyEl.opacity(hidden ? 0 : 1);
      return true;
    };
    applyHidden(true);
    // Host remounts on width/height paintToken — keep forcing hide while editing.
    const timer = window.setInterval(() => applyHidden(true), 48);
    return () => {
      window.clearInterval(timer);
      applyHidden(false);
    };
  }, [editingTextId, reloadToken, boardEpoch]);

  /**
   * Size an incoming image against what is actually on screen, so the same file
   * lands at a usable size whether the user is zoomed way in or way out.
   */
  const imageSizeForViewport = useCallback(
    (natural: { width: number; height: number }) => {
      const view =
        overlayRoot?.getBoundingClientRect() ||
        paperEl?.parentElement?.getBoundingClientRect() ||
        null;
      if (!view || view.width < 1 || view.height < 1) {
        return fitImageSize(natural.width, natural.height, 2400);
      }
      return rcbFitImageIntoViewport(natural, view, camera.zoom);
    },
    [camera.zoom, overlayRoot, paperEl]
  );

  const placeImageAt = useCallback(
    async (src: string, x: number, y: number) => {
      if (readOnly) return;
      try {
        const natural = await measureImageNaturalSize(src);
        const { width, height } = imageSizeForViewport(natural);
        const latest = documentRef.current;
        if (!latest) return;
        const placed = rcbCenterOnPoint({ x, y }, { width, height });
        const origin = sceneToDocumentCoords(latest, placed.left, placed.top);
        const { id, node } = createImageNode({
          x: origin.x,
          y: origin.y,
          width: placed.width,
          height: placed.height,
          src,
        });
        dispatch(setDocument(addNodeToDocument(latest, id, node)));
        dispatch(setSelectedNodeId(id));
        dispatch(setPendingImageSrc(null));
        finishToSelect();
      } catch {
        dispatch(setPendingImageSrc(null));
        finishToSelect();
      }
    },
    [dispatch, imageSizeForViewport, readOnly]
  );

  // Upload: place immediately at the visible viewport center (not world paper center).
  const autoPlaceSrcRef = useRef<string | null>(null);
  useEffect(() => {
    if (readOnly || !pendingImageSrc) {
      autoPlaceSrcRef.current = null;
      return;
    }
    if (autoPlaceSrcRef.current === pendingImageSrc) return;
    autoPlaceSrcRef.current = pendingImageSrc;

    const view =
      overlayRoot?.getBoundingClientRect() ||
      paperEl?.parentElement?.getBoundingClientRect() ||
      null;
    const center = view && (stageEl || paperEl)
      ? pointerToWorld(
          camera,
          { viewportEl, stageEl, paperEl, artboard },
          view.left + view.width / 2,
          view.top + view.height / 2
        )
      : { x: paperW / 2, y: paperH / 2 };
    placeImageAt(pendingImageSrc, center.x, center.y);
  }, [
    pendingImageSrc,
    paperW,
    paperH,
    paperEl,
    stageEl,
    viewportEl,
    camera,
    overlayRoot,
    artboard,
    placeImageAt,
    readOnly,
  ]);

  const onPencilCommit = useCallback(
    (
      pathD: string,
      box: { left: number; top: number; width: number; height: number },
      meta?: { pathPressure?: string }
    ) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return;
      const origin = sceneToDocumentCoords(doc, box.left, box.top);
      const brush = findPencilBrush(pencilBrushId || 'solid');
      const { id, node } = createShapeNode({
        x: origin.x,
        y: origin.y,
        width: box.width,
        height: box.height,
        shapeType: 'pencil',
        fill: 'transparent',
        stroke: penStrokeColor,
        borderWidth: penStrokeWidth,
        path: pathD,
        closed: false,
        brushStyle: pencilBrushId || 'solid',
        brushStampSrc: brush.kind === 'stamp' ? brush.stampSrc : undefined,
        opacity: penStrokeOpacity / 100,
      });
      if (meta?.pathPressure) {
        (node.attrs as Record<string, unknown>).pathPressure = meta.pathPressure;
      }
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      // Stay in pencil mode for continuous strokes; do not auto-select.
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
    },
    [dispatch, readOnly, penStrokeColor, penStrokeWidth, pencilBrushId, penStrokeOpacity]
  );

  const onBucketFill = useCallback(
    (nodeId: string) => {
      if (readOnly || !nodeId) return;
      const fill = bucketFillRef.current;
      const fillType = String(fill.fillType || 'solid');
      const attrs: Record<string, unknown> = {
        'fill-color': String(fill.fillColor || '#333333'),
        'fill-type': fillType,
        'fill-opacity': Math.max(0, Math.min(100, Number(fill.fillOpacity) || 100)),
        'fill-enabled': 'true',
        'fill-visible': 'true',
      };
      if (fillType !== 'solid' && fillType !== 'image' && fill.fillGradient) {
        attrs['fill-gradient'] = String(fill.fillGradient);
      } else {
        attrs['fill-gradient'] = undefined;
      }
      if (fillType === 'image') {
        attrs['fill-image-src'] = fill.fillImageSrc || '';
        attrs['fill-image-fit'] = fill.fillImageFit ?? 'fill';
        attrs['fill-image-rotate'] = fill.fillImageRotate ?? 0;
        if (fill.fillImageAdjust) attrs['fill-image-adjust'] = fill.fillImageAdjust;
      }
      dispatch(
        patchDocumentNode({
          nodeId,
          patch: { attrs },
        })
      );
    },
    [dispatch, readOnly]
  );

  const pencilEraseTargets = useMemo(() => {
    const doc = document;
    if (!doc) return [];
    return listSceneNodes(doc)
      .filter(({ node }) => {
        if (node?.key !== 'shape') return false;
        return String(node.attrs?.shapeType || '') === 'pencil';
      })
      .map(({ id, node }) => {
        const { left, top } = nodeLeftTop(doc, node);
        return {
          id,
          left,
          top,
          width: Math.max(1, Number(node.width) || 1),
          height: Math.max(1, Number(node.height) || 1),
        };
      });
  }, [document]);

  const onPencilErase = useCallback(
    (stroke: PencilEraseStroke) => {
      const doc = documentRef.current;
      if (!doc || readOnly || !stroke.points.length) return;

      const pencils = listSceneNodes(doc).filter(({ node }) => {
        if (node?.key !== 'shape') return false;
        return String(node.attrs?.shapeType || '') === 'pencil';
      });
      if (!pencils.length) return;

      let next = doc;
      let changed = false;
      for (const { id, node } of pencils) {
        const { left, top } = nodeLeftTop(next, node);
        const strokeWidth =
          Number(node.attrs?.['border-width'] ?? node.attrs?.strokeWidth ?? 10) || 10;
        const brushId = String(node.attrs?.brushStyle || 'solid');
        const srcPressure =
          node.attrs?.pathPressure != null ? String(node.attrs.pathPressure) : undefined;
        const fragments = erasePencilNode({
          pathD: String(node.attrs?.path || ''),
          left,
          top,
          strokeWidth,
          brushId,
          pathPressure: srcPressure,
          eraseScene: stroke.points,
          eraseRadius: stroke.radius,
        });
        if (fragments == null) continue;

        changed = true;
        next = removeNodesFromDocument(next, [id]);
        for (const frag of fragments) {
          const origin = sceneToDocumentCoords(next, frag.left, frag.top);
          const { id: nid, node: nnode } = createShapeNode({
            x: origin.x,
            y: origin.y,
            width: frag.width,
            height: frag.height,
            shapeType: 'pencil',
            fill: 'transparent',
            stroke: String(node.attrs?.['border-color'] || node.attrs?.stroke || '#333333'),
            borderWidth: strokeWidth,
            path: frag.pathD,
            closed: false,
            brushStyle: brushId,
            brushStampSrc:
              node.attrs?.brushStampSrc != null ? String(node.attrs.brushStampSrc) : undefined,
          });
          nnode.z = Number(node.z) || 0;
          // Keep stroke visibility / opacity attrs from the source stroke.
          const src = node.attrs || {};
          for (const key of [
            'stroke-enabled',
            'stroke-visible',
            'stroke-opacity',
            'opacity',
            'blendMode',
            'strokeLinecap',
            'stroke-linecap',
            'strokeLinejoin',
            'stroke-linejoin',
          ]) {
            if (src[key] != null) (nnode.attrs as any)[key] = src[key];
          }
          if (frag.pathPressure) {
            (nnode.attrs as Record<string, unknown>).pathPressure = frag.pathPressure;
          }
          next = addNodeToDocument(next, nid, nnode);
        }
      }

      if (!changed) return;
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
    },
    [dispatch, readOnly]
  );

  const onPenCommit = useCallback(
    (
      pathD: string,
      box: { left: number; top: number; width: number; height: number },
      closed: boolean
    ) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return;
      const origin = sceneToDocumentCoords(doc, box.left, box.top);
      const { id, node } = createShapeNode({
        x: origin.x,
        y: origin.y,
        width: box.width,
        height: box.height,
        shapeType: 'pen',
        fill: 'transparent',
        stroke: penStrokeColor,
        borderWidth: penStrokeWidth,
        path: pathD,
        closed,
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      // Close / Enter finish — keep pen tool so the next click starts a new path.
      dispatch(setSelectedNodeIds([id]));
    },
    [dispatch, readOnly, penStrokeColor, penStrokeWidth]
  );

  const onPenPathEditCommit = useCallback(
    (payload: {
      nodeId: string;
      pathD: string;
      box: { left: number; top: number; width: number; height: number };
      closed: boolean;
    }) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return;
      const origin = sceneToDocumentCoords(doc, payload.box.left, payload.box.top);
      const prev = doc.deltaSetLike?.[payload.nodeId];
      const prevType = String(prev?.attrs?.shapeType || 'path');
      const shapeType = prevType === 'pen' ? 'pen' : 'path';
      dispatch(pushEditorHistory());
      dispatch(
        patchDocumentNode({
          nodeId: payload.nodeId,
          patch: {
            x: origin.x,
            y: origin.y,
            width: Math.max(1, payload.box.width),
            height: Math.max(1, payload.box.height),
            attrs: {
              shapeType,
              path: payload.pathD,
              closed: payload.closed ? 'true' : 'false',
            },
          },
        })
      );
    },
    [dispatch, readOnly]
  );

  const onPathEditUnionNewShape = useCallback(
    (
      editingId: string,
      addition: {
        pathD: string;
        box: { left: number; top: number; width: number; height: number };
        closed: boolean;
      },
      strokeWidth: number
    ) => {
      const doc = documentRef.current;
      if (!doc || readOnly || !editingId) return;
      const baseNode = doc.deltaSetLike?.[editingId];
      if (!baseNode) return;

      const ink = String(
        baseNode.attrs?.['border-color'] ||
          baseNode.attrs?.stroke ||
          penStrokeColor ||
          '#333333'
      );
      const sw = Math.max(1, Number(strokeWidth) || penStrokeWidth || 2);
      const baseType = String(baseNode.attrs?.shapeType || 'path');
      const basePath = String(baseNode.attrs?.path || baseNode.attrs?.d || '').trim();
      const baseClosed =
        baseNode.attrs?.closed === true ||
        baseNode.attrs?.closed === 'true' ||
        /\sZ\s*$/i.test(basePath);
      // Open stroke pens must stay stroked siblings — boolean-union turns them into
      // fill-only silhouettes (stroke-enabled=false) and they disappear if fill is clear.
      const baseIsOpenStroke =
        baseType === 'pen' || baseType === 'pencil' || !baseClosed;

      if (!addition.closed || baseIsOpenStroke) {
        const origin = sceneToDocumentCoords(doc, addition.box.left, addition.box.top);
        const { id, node } = createShapeNode({
          x: origin.x,
          y: origin.y,
          width: Math.max(1, addition.box.width),
          height: Math.max(1, addition.box.height),
          shapeType: 'pen',
          fill: 'transparent',
          stroke: ink,
          borderWidth: sw,
          path: addition.pathD,
          closed: addition.closed,
        });
        const next = addNodeToDocument(doc, id, node);
        documentRef.current = next;
        dispatch(pushEditorHistory());
        dispatch(setDocument(next));
        dispatch(setSelectedNodeIds([id]));
        dispatch(setSelectedNodeId(id));
        return;
      }

      const { left: bx, top: by } = nodeLeftTop(doc, baseNode);
      if (!basePath) return;

      const baseBox: ShapeBox = {
        left: bx,
        top: by,
        width: Math.max(1, Number(baseNode.width) || 1),
        height: Math.max(1, Number(baseNode.height) || 1),
        shapeType: 'path',
        path: basePath,
        angle: Number(baseNode.attrs?.angle) || 0,
      };

      const addBox: ShapeBox = {
        left: addition.box.left,
        top: addition.box.top,
        width: addition.box.width,
        height: addition.box.height,
        shapeType: 'path',
        path: addition.pathD,
        angle: 0,
      };

      const { result } = computeShapeBoolean([baseBox, addBox], 'union');
      if (!result?.path) return;

      const fillKeep = String(
        baseNode.attrs?.['fill-color'] || baseNode.attrs?.fill || ink
      );
      const origin = sceneToDocumentCoords(doc, result.x, result.y);
      dispatch(pushEditorHistory());
      dispatch(
        patchDocumentNode({
          nodeId: editingId,
          patch: {
            x: origin.x,
            y: origin.y,
            width: Math.max(1, result.width),
            height: Math.max(1, result.height),
            attrs: {
              shapeType: 'path',
              path: result.path,
              closed: 'true',
              'fill-rule': result.fillRule,
              'fill-enabled': 'true',
              'fill-visible': 'true',
              'fill-color': fillKeep === 'transparent' ? ink : fillKeep,
              'fill-type': 'solid',
              'stroke-enabled': 'false',
              'border-width': 0,
            },
          },
        })
      );
      dispatch(setSelectedNodeIds([editingId]));
      dispatch(setSelectedNodeId(editingId));
    },
    [dispatch, readOnly, penStrokeColor, penStrokeWidth]
  );

  const reorderLayer = useCallback(
    (action: 'front' | 'back' | 'forward' | 'backward', ids: string[]) => {
      const doc = documentRef.current;
      if (!doc || !ids.length) return;
      const next = reorderNodesInDocument(doc, ids, action);
      // Reorder only changes z-order — do not bump sceneReloadToken (full remount).
      // Hosts keep their SVG; CSS z-index + DOM order update instead.
      documentRef.current = next;
      dispatch(pushEditorHistory());
      dispatch(setDocumentFromCanvas(next));
    },
    [dispatch]
  );

  const deleteSelected = useCallback(
    (ids: string[]) => {
      if (!ids.length || !documentRef.current) return;
      // Abort in-flight placeholder uploads so finishImageProcess cannot resurrect them.
      ids.forEach((id) => abortNodeUpload(id));
      dispatch(removeDocumentNodes({ nodeIds: ids }));
      // Persist ASAP — refresh must not restore deleted nodes from a stale cloud doc.
      requestProjectFlush();
    },
    [dispatch]
  );

  /**
   * Delete selected nodes and/or artboards in one history step so Undo restores
   * frame + content together (Ctrl+A → Delete must not split into two undos).
   * Upload placeholders are scrubbed from history (not restorable via Undo).
   */
  const deleteCanvasSelection = useCallback(
    (opts?: { nodeIds?: string[]; frameIds?: string[] }) => {
      const doc0 = documentRef.current;
      if (!doc0) return false;
      const nodeIds = opts?.nodeIds ? [...opts.nodeIds] : [...selectedIdsRef.current];
      let frameIds = opts?.frameIds ? [...opts.frameIds] : [...selectedFrameIdsRef.current];
      if (!frameIds.length && !nodeIds.length && activeFrameIdRef.current) {
        frameIds = [activeFrameIdRef.current];
      }
      if (!nodeIds.length && !frameIds.length) return false;

      const inside = frameIds.length ? nodeIdsInsideFrames(doc0, frameIds) : [];
      const allNodes = [...new Set([...nodeIds, ...inside])];
      allNodes.forEach((id) => abortNodeUpload(id));

      dispatch(removeDocumentNodes({ nodeIds: allNodes, frameIds }));
      requestProjectFlush();
      return true;
    },
    [dispatch]
  );


  useCanvasContextMenu({
    readOnly,
    camera,
    artboard,
    viewportEl,
    stageEl,
    paperEl,
    documentRef,
    selectedIdsRef,
    selectedFrameIdsRef,
    activeFrameIdRef,
    hitTest,
    setCtxMenu,
  });

  useChatImageDrop({
    readOnly,
    camera,
    artboard,
    viewportEl,
    stageEl,
    paperEl,
    documentRef,
    imageSizeForViewport,
    finishToSelect,
  });

  const clipboardApiRef = useRef<CanvasClipboardApi | null>(null);

  const runCtxAction = (action: CtxAction) => {
    let ids = selectedIdsRef.current;
    if (!ids.length && ctxMenu?.nodeId) ids = [ctxMenu.nodeId];

    let placeAt: { x: number; y: number } | null = null;
    if (ctxMenu && Number.isFinite(ctxMenu.sceneX) && Number.isFinite(ctxMenu.sceneY)) {
      placeAt = { x: ctxMenu.sceneX, y: ctxMenu.sceneY };
    }

    const hitNodeId = ctxMenu?.nodeId ?? null;
    const menuFrameId = ctxMenu?.frameId || activeFrameIdRef.current;
    // Only expand via artboards that are actually in the selection (or the
    // frame under the context-menu cursor). Do not use activeFrameId alone —
    // that would pull unrelated board content into group / lock / export.
    let frameIdsForAction = selectedFrameIdsRef.current;
    if (!frameIdsForAction.length && ctxMenu?.frameId) {
      frameIdsForAction = [String(ctxMenu.frameId)];
    }
    setCtxMenu(null);

    if (action === 'upload') {
      // Empty canvas only — disabled when right-clicking a node.
      if (hitNodeId) return;
      imagePlaceAtRef.current = placeAt;
      imageInputRef.current?.click();
      return;
    }
    if (action === 'addToChat') {
      const clearAfter = () => {
        dispatch(setSelectedNodeIds([]));
        dispatch(setSelectedNodeId(null));
        dispatch(setSelectedFrameIds([]));
        dispatch(setActiveFrameId(null));
      };
      const seedNodes = ctxMenuSeedNodeIds(ids, hitNodeId);
      const expanded = resolveSelectionNodeIds(
        documentRef.current,
        seedNodes,
        frameIdsForAction
      );
      // Box / multi-select → one group chip (unless right-click landed on an unselected node).
      if (
        seedNodes.length &&
        expanded.length > 1 &&
        (!hitNodeId || expanded.includes(hitNodeId) || ids.includes(hitNodeId))
      ) {
        const attachable = filterChatAttachNodeIds(documentRef.current, expanded);
        if (!attachable.length) return;
        onAddToChat?.(attachable.length === 1 ? attachable[0]! : attachable);
        clearAfter();
        return;
      }
      const id = hitNodeId || ids[0];
      if (id) {
        const attachable = filterChatAttachNodeIds(documentRef.current, [id]);
        if (!attachable.length) return;
        onAddToChat?.(attachable[0]!);
        clearAfter();
        return;
      }
      const frameChip = frameIdsForAction[0] || menuFrameId;
      if (frameChip) {
        // Artboard selected (no node under cursor) — pin the frame into Chat.
        onAddToChat?.(`frame:${frameChip}`);
        clearAfter();
      }
      return;
    }
    if (action === 'group') {
      const targetIds = resolveSelectionNodeIds(documentRef.current, ids, frameIdsForAction);
      if (targetIds.length < 2) return;
      const next = groupNodesInDocument(documentRef.current, targetIds);
      dispatch(setDocument(next));
      dispatch(setMixedSelection({ nodeIds: targetIds, frameIds: frameIdsForAction }));
      return;
    }
    if (action === 'ungroup') {
      const targetIds = resolveSelectionNodeIds(documentRef.current, ids, frameIdsForAction);
      if (!targetIds.length) return;
      const next = ungroupNodesInDocument(documentRef.current, targetIds);
      dispatch(setDocument(next));
      dispatch(setMixedSelection({ nodeIds: targetIds, frameIds: frameIdsForAction }));
      return;
    }
    if (action === 'undo') {
      if (!collabUndo()) dispatch(undo());
      return;
    }
    if (action === 'redo') {
      if (!collabRedo()) dispatch(redo());
      return;
    }
    if (action === 'copy') {
      clipboardApiRef.current?.copySelected(ids, frameIdsForAction);
      return;
    }
    if (action === 'cut') {
      clipboardApiRef.current?.cutSelected(ids, frameIdsForAction);
      return;
    }
    if (action === 'paste') {
      void clipboardApiRef.current?.pasteFromOsOrInternal(
        placeAt ? { anchor: placeAt } : undefined
      );
      return;
    }
    if (action === 'duplicate') {
      clipboardApiRef.current?.duplicateSelected(ids, frameIdsForAction);
      return;
    }
    if (action === 'delete') {
      let frameIds = selectedFrameIdsRef.current;
      if (!frameIds.length && !ids.length) {
        const fid = menuFrameId || activeFrameIdRef.current;
        if (fid) frameIds = [String(fid)];
      }
      deleteCanvasSelection({ nodeIds: ids, frameIds });
      return;
    }
    if (action === 'front' || action === 'forward' || action === 'backward' || action === 'back') {
      const targetIds = resolveSelectionNodeIds(documentRef.current, ids, frameIdsForAction);
      reorderLayer(action, targetIds.length ? targetIds : ids);
      return;
    }
    if (action === 'toggleHidden') {
      const seedNodes = ctxMenuSeedNodeIds(ids, hitNodeId);
      // Frame-only selection has no hide target (artboards are not scene nodes).
      if (!seedNodes.length) return;
      const targetIds = resolveSelectionNodeIds(
        documentRef.current,
        seedNodes,
        frameIdsForAction
      ).filter((id) => !isGeneratorNode(documentRef.current?.deltaSetLike?.[id]));
      if (!targetIds.length) return;
      const doc = documentRef.current;
      if (!doc) return;
      // Hide if any target is visible; show only when all are hidden.
      const anyVisible = targetIds.some((id) => !isNodeHidden(doc?.deltaSetLike?.[id]));
      dispatch(pushEditorHistory());
      let next = doc;
      for (const id of targetIds) {
        next = updateNodeInDocument(next, id, {
          attrs: { hidden: anyVisible ? 'true' : 'false' },
        });
      }
      dispatch(setDocumentFromCanvas(next));
      // Drop selection on hide so the canvas cannot keep interacting with it.
      // Unhide via layers eye, or re-select the layer then Show.
      if (anyVisible) {
        dispatch(setSelectedNodeIds([]));
        dispatch(setSelectedNodeId(null));
      }
      return;
    }
    if (action === 'toggleLocked') {
      const seedNodes = ctxMenuSeedNodeIds(ids, hitNodeId);
      const targetIds = seedNodes.length
        ? resolveSelectionNodeIds(documentRef.current, seedNodes, frameIdsForAction).filter(
            (id) => !isGeneratorNode(documentRef.current?.deltaSetLike?.[id])
          )
        : [];
      const doc = documentRef.current;
      if (targetIds.length && doc) {
        const anyUnlocked = targetIds.some((id) => !isNodeLocked(doc?.deltaSetLike?.[id]));
        dispatch(pushEditorHistory());
        let next = doc;
        for (const id of targetIds) {
          next = updateNodeInDocument(next, id, {
            attrs: { locked: anyUnlocked ? 'true' : 'false' },
          });
        }
        dispatch(setDocumentFromCanvas(next));
      }
      // Also toggle co-selected artboards (same gesture as node lock).
      if (frameIdsForAction.length) {
        const frames = Array.isArray(documentRef.current?.frames)
          ? documentRef.current.frames
          : [];
        const anyFrameUnlocked = frameIdsForAction.some((fid) => {
          const frame = frames.find((f: any) => f?.id === fid);
          return frame && !frame.locked;
        });
        dispatch(
          updateArtboardFrames({
            patches: frameIdsForAction.map((fid) => ({
              id: fid,
              patch: { locked: anyFrameUnlocked },
            })),
          })
        );
        return;
      }
      if (!targetIds.length && menuFrameId) {
        const frames = Array.isArray(documentRef.current?.frames)
          ? documentRef.current.frames
          : [];
        const frame = frames.find((f: any) => f?.id === menuFrameId);
        dispatch(
          updateArtboardFrame({
            id: menuFrameId,
            patch: { locked: !Boolean(frame?.locked) },
          })
        );
      }
      return;
    }
    if (action === 'toggleGrid') {
      dispatch(setGridMode(!isGridMode));
      return;
    }
    if (action === 'exportMp4' || action === 'exportMp3') {
      const doc = documentRef.current;
      const seedNodes = ctxMenuSeedNodeIds(ids, hitNodeId);
      const targetIds = resolveSelectionNodeIds(
        doc,
        seedNodes,
        frameIdsForAction
      );
      const videoNodes = targetIds
        .map((id) => doc?.deltaSetLike?.[id])
        .filter((node: any) => isVideoNode(node) && String(node?.attrs?.src || '').trim());
      if (!videoNodes.length) {
        message.warning(t('editor.noSelectionExport'));
        return;
      }
      const mode = action === 'exportMp3' ? 'audio' : 'video';
      const hideLoading = message.loading(
        t(
          mode === 'audio'
            ? 'editor.videoToolbar.exportingAudio'
            : 'editor.videoToolbar.exporting',
          {
            defaultValue: mode === 'audio' ? '正在导出音频…' : '正在导出视频…',
          }
        ),
        0
      );
      const exportSelectedVideos = async () => {
        try {
          for (const node of videoNodes) {
            const attrs = node?.attrs || {};
            await downloadVideoNodeAsset({
              src: String(attrs.src || ''),
              name: String(node?.name || attrs.name || 'video'),
              uploadKey: attrs.uploadKey != null ? String(attrs.uploadKey) : null,
              cropX: attrs.cropX,
              cropY: attrs.cropY,
              cropW: attrs.cropW,
              cropH: attrs.cropH,
              trimStart: attrs.trimStart,
              trimEnd: attrs.trimEnd,
              flipX: attrs.flipX === true || attrs.flipX === 'true',
              flipY: attrs.flipY === true || attrs.flipY === 'true',
              mode,
            });
          }
          hideLoading();
          message.success(
            t(mode === 'audio' ? 'editor.exportedAudio' : 'editor.exportedVideo', {
              defaultValue: mode === 'audio' ? '已导出音频' : '已导出视频',
            })
          );
        } catch (err) {
          hideLoading();
          console.warn('[ctx-video-export]', err);
          message.error(
            t(
              mode === 'audio'
                ? 'editor.videoToolbar.exportAudioFail'
                : 'editor.videoToolbar.downloadFail',
              {
                defaultValue: mode === 'audio' ? '音频导出失败（可能无音轨）' : '下载失败',
              }
            )
          );
        }
      };
      exportSelectedVideos();
      return;
    }
    if (action === 'exportPng' || action === 'exportJpg' || action === 'exportSvg') {
      let format: ExportImageFormat = 'png';
      if (action === 'exportJpg') format = 'jpeg';
      else if (action === 'exportSvg') format = 'svg';
      const doc = documentRef.current;
      const seedNodes = ctxMenuSeedNodeIds(ids, hitNodeId);
      // Mixed / node selection: export expanded nodes. Frame-only keeps crop export
      // so artboard background is preserved.
      if (seedNodes.length) {
        const targetIds = resolveSelectionNodeIds(
          documentRef.current,
          seedNodes,
          frameIdsForAction
        );
        if (targetIds.length) {
          const ok = exportFabricImage({
            selectionOnly: true,
            nodeIds: targetIds,
            document: doc,
            format,
            filename: t('editor.layerExportName'),
          });
          if (ok) {
            message.success(t(format === 'svg' ? 'editor.exportedSvg' : 'editor.exportedImage'));
          } else {
            message.error(t('editor.exportFailed'));
          }
          return;
        }
      }
      const exportFrameId = frameIdsForAction[0] || menuFrameId;
      if (exportFrameId) {
        const frames = Array.isArray(doc?.frames) ? doc.frames : [];
        const frame = frames.find((f: any) => f?.id === exportFrameId);
        if (frame && frame.width > 0 && frame.height > 0) {
          void exportCropSlots({
            crop: {
              x: Number(frame.x) || 0,
              y: Number(frame.y) || 0,
              width: Number(frame.width) || 1,
              height: Number(frame.height) || 1,
            },
            backgroundColor: frame.backgroundColor,
            baseName: String(frame.name || t('editor.pageExportName')),
            compress: false,
            document: doc,
            slots: [
              {
                id: 'ctx',
                scale: 1,
                affixMode: 'suffix',
                affix: '',
                format,
              },
            ],
          }).then((n) => {
            if (n > 0) {
              message.success(
                t(format === 'svg' ? 'editor.exportedSvg' : 'editor.exportedImage')
              );
            } else {
              message.error(t('editor.exportFailed'));
            }
          });
        }
      }
    }
  };
  const runCtxActionRef = useRef(runCtxAction);
  runCtxActionRef.current = runCtxAction;

  /** Document x/y so a box of given size is centered on anchor or viewport. */
  const placeOriginForSize = useCallback(
    (
      size: { width: number; height: number },
      anchor?: { x: number; y: number } | null
    ): { x: number; y: number } | null => {
      const doc = documentRef.current;
      if (!doc) return null;
      if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
        const placed = rcbCenterOnPoint({ x: anchor.x, y: anchor.y }, size);
        return sceneToDocumentCoords(doc, placed.left, placed.top);
      }
      const view =
        overlayRoot?.getBoundingClientRect() ||
        paperEl?.parentElement?.getBoundingClientRect() ||
        null;
      if (view && (stageEl || paperEl)) {
        const center = pointerToWorld(
          camera,
          { viewportEl, stageEl, paperEl, artboard },
          view.left + view.width / 2,
          view.top + view.height / 2
        );
        const placed = rcbCenterOnPoint(center, size);
        return sceneToDocumentCoords(doc, placed.left, placed.top);
      }
      return { x: 40, y: 40 };
    },
    [artboard, camera, overlayRoot, paperEl, stageEl, viewportEl]
  );

  const onImageFile = async (file: File | null) => {
    if (!file) return;
    const at = imagePlaceAtRef.current;
    imagePlaceAtRef.current = null;
    try {
      const preview = await readFileAsDataUrl(file);
      const natural = await measureImageNaturalSize(preview);
      const { width, height } = imageSizeForViewport(natural);
      const origin = placeOriginForSize({ width, height }, at);
      dispatch(
        startImageUploadPlaceholder({
          src: preview,
          width,
          height,
          x: origin?.x,
          y: origin?.y,
          label: '上传中',
          name: file.name?.replace(/\.[^.]+$/, '') || 'Image',
        })
      );
      finishToSelect();
      const spawnedId = String(
        (store.getState() as any).editor?.pendingImageProcessId || ''
      );
      const signal = spawnedId ? beginNodeUpload(spawnedId) : undefined;
      try {
        const uploaded = await uploadImageFile(file, { signal });
        if (signal?.aborted) return;
        const remoteReady = await waitForImageReady(uploaded.url, { signal });
        if (signal?.aborted) return;
        dispatch(
          finishImageProcess({
            nodeId: spawnedId || undefined,
            // Keep local preview until the remote URL is fully decoded.
            ...(remoteReady ? { src: uploaded.url } : {}),
            attrs: uploaded.key ? { uploadKey: uploaded.key } : undefined,
          })
        );
      } finally {
        finishNodeUpload(spawnedId);
      }
    } catch (err: any) {
      if (isUploadAbortError(err)) return;
      dispatch(failImageProcess({}));
      const detail = err?.response?.data?.detail || err?.message || '图片上传失败';
      message.error(typeof detail === 'string' ? detail : '图片上传失败');
    }
  };

  const onVideoFile = async (file: File | null) => {
    if (!file) return;
    const at = imagePlaceAtRef.current;
    imagePlaceAtRef.current = null;
    try {
      const prepared = await prepareVideoUploadPreview(file);
      const { width, height } = imageSizeForViewport({
        width: prepared.width,
        height: prepared.height,
      });
      const origin = placeOriginForSize({ width, height }, at);
      dispatch(
        startVideoUploadPlaceholder({
          src: prepared.preview,
          poster: prepared.poster,
          width,
          height,
          x: origin?.x,
          y: origin?.y,
          label: '上传中',
          name: prepared.name,
          duration: prepared.duration,
        })
      );
      finishToSelect();
      const uploaded = await uploadImageFile(file);
      dispatch(
        finishImageProcess({
          src: uploaded.url,
          attrs: {
            ...(uploaded.key ? { uploadKey: uploaded.key } : {}),
            ...(prepared.poster ? { poster: prepared.poster } : {}),
            ...(Number.isFinite(prepared.duration) && prepared.duration > 0
              ? { duration: prepared.duration }
              : {}),
            assetKind: 'video',
          },
        })
      );
    } catch (err: any) {
      dispatch(failImageProcess({}));
      const detail = err?.response?.data?.detail || err?.message || '视频上传失败';
      message.error(typeof detail === 'string' ? detail : '视频上传失败');
    }
  };

  const onMediaFile = (file: File | null) => {
    if (!file) return;
    if (file.type.startsWith('video/')) {
      onVideoFile(file);
      return;
    }
    onImageFile(file);
  };


  const clipboardApi = useCanvasClipboard({
    readOnly,
    artboardWidth: artboard?.width,
    documentRef,
    selectedIdsRef,
    selectedFrameIdsRef,
    activeFrameIdRef,
    clipboardRef,
    internalClipboardAtRef,
    osClipboardMetaRef,
    imagePlaceAtRef,
    deleteCanvasSelection,
    placeOriginForSize,
    finishToSelect,
    onImageFile,
    onVideoFile,
  });
  clipboardApiRef.current = clipboardApi;

  useCanvasHotkeys({
    readOnly,
    activeTool,
    documentRef,
    selectedIdsRef,
    selectedFrameIdsRef,
    activeFrameIdRef,
    canvasAttachPickRef,
    imagePlaceAtRef,
    imageInputRef,
    runCtxActionRef,
    onZoomIn,
    onZoomOut,
    onSelectMixed,
    listNodeIds,
    deleteCanvasSelection,
    reorderLayer,
    copySelected: clipboardApi.copySelected,
    cutSelected: clipboardApi.cutSelected,
    duplicateSelected: clipboardApi.duplicateSelected,
    onAddToChat,
  });

  const bgType = parseFillType(document?.backgroundFillType);
  const bgOpacity = Number(document?.backgroundOpacity ?? 100);
  const bgColor = String(document?.backgroundColor || '#ffffff');
  let paperBackground = cssSolidWithOpacity(bgColor, bgOpacity);
  if (bgType === 'image') {
    const src = String(document?.backgroundImageSrc || '');
    if (src) paperBackground = `url(${src}) center / cover no-repeat`;
  } else if (bgType !== 'solid') {
    paperBackground = cssPreviewForGradient(
      {
        ...parseFillGradient(
          document?.backgroundGradient,
          bgType,
          String(document?.backgroundColor || '#3B82F6')
        ),
        type: bgType,
      },
      bgOpacity
    );
  }

  const ids = useMemo(() => {
    if (selectedNodeIds?.length > 0) return selectedNodeIds;
    if (selectedNodeId) return [selectedNodeId];
    return EMPTY_NODE_IDS;
  }, [selectedNodeIds, selectedNodeId]);

  const keepVisibleIds = useMemo(() => {
    const out = [...ids];
    if (editingTextId) out.push(editingTextId);
    if (editingPenId) out.push(editingPenId);
    return out;
  }, [ids, editingTextId, editingPenId]);

  // Path-edit stays open on empty selection (blank click must not dismiss).
  // Only leave when the user selects a *different* node.
  useEffect(() => {
    if (!editingPenId) return;
    if (!ids.length) return;
    if (!ids.includes(editingPenId)) setEditingPenId(null);
  }, [editingPenId, ids]);

  // Outline / toolbar: enter path-edit chrome for a node.
  useEffect(() => {
    const onEnter = (e: Event) => {
      const nodeId = String((e as CustomEvent).detail?.nodeId || '');
      if (!nodeId || readOnly) return;
      setEditingTextId(null);
      setEditingPenId(nodeId);
      dispatch(setSelectedNodeIds([nodeId]));
      dispatch(setActiveTool('select'));
      // Outline / enter path-edit: default to Select (edit anchors), not Pen (draw).
      setPathEditSubtool('select');
      window.dispatchEvent(
        new CustomEvent('resume:path-edit-subtool', { detail: { subtool: 'select' } })
      );
    };
    window.addEventListener('resume:enter-path-edit', onEnter);
    return () => window.removeEventListener('resume:enter-path-edit', onEnter);
  }, [dispatch, readOnly]);

  useEffect(() => {
    const onSub = (e: Event) => {
      const s = (e as CustomEvent).detail?.subtool;
      setPathEditSubtool(s === 'pen' ? 'pen' : 'select');
    };
    window.addEventListener('resume:path-edit-subtool', onSub);
    return () => window.removeEventListener('resume:path-edit-subtool', onSub);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('resume:path-edit', { detail: { active: Boolean(editingPenId) } })
    );
    return () => {
      if (editingPenId) {
        window.dispatchEvent(new CustomEvent('resume:path-edit', { detail: { active: false } }));
      }
    };
  }, [editingPenId]);

  // Dim the underlying pen SVG while path-edit overlay is active.
  useEffect(() => {
    const nodeId = editingPenId;
    if (!nodeId) return;
    const board = boardRef.current;
    if (!board?.nodeEls) return;
    const el = board.nodeEls.get(nodeId);
    if (!el) return;
    el.setAttribute('opacity', '0.12');
    return () => {
      try {
        board.nodeEls.get(nodeId)?.removeAttribute('opacity');
      } catch {
        /* ignore */
      }
    };
  }, [editingPenId]);

  // Select / inspect: share preview is readOnly — always allow hit-test + chrome
  // (workspaceMode may briefly lag behind 'dev'). Path-edit owns the pointer
  // (anchors / draft pen) — do not let SelectionFeature clear selection on empty
  // click (that unmounts path-edit and looks like “auto exit”).
  const selectToolActive = activeTool === 'select' || activeTool === 'scale';
  const selectMode = selectToolActive && !editingPenId;
  const shapeMode = !readOnly && activeTool === 'shape';
  const textMode = !readOnly && activeTool === 'text';
  const imageMode = !readOnly && activeTool === 'image';
  const pencilMode = !readOnly && activeTool === 'pencil';
  const penMode = !readOnly && activeTool === 'pen';

  return (
    <div className={embedded ? 'contents' : 'relative rcb-canvas-stage'}>
      <SvgPaper
        paperRef={paperRef}
        hostRef={hostRef}
        width={paperW}
        height={paperH}
        infinite={infinite}
        background={embedded ? 'transparent' : paperBackground}
        className={
          embedded
            ? 'rcb-shapes relative overflow-visible'
            : 'rcb-canvas-paper relative shadow-[0_8px_40px_rgba(15,23,42,0.12)] ring-1 ring-black/5'
        }
      >
        {infinite ? (
          <RcbShapesLayer
            document={document}
            reloadToken={reloadToken}
            documentPatchToken={documentPatchToken}
            lastPatchedNodeIds={lastPatchedNodeIds}
            hiddenNodeId={editingTextId}
            keepVisibleIds={keepVisibleIds}
            spatialIndex={nodeSpatialIndex}
          />
        ) : null}
        {/* Stable HTML <video> plates; SVG poster is underlay / export only. */}
        {infinite ? (
          <VideoNodeOverlay
            document={document}
            geometryOverrides={videoLiveGeom}
            readOnly={readOnly}
          />
        ) : null}
        {/* Scene-space HTML overlays (selection / draw previews). Origin matches SVG. */}
        {/* Above frame/node stackOrder so preview select/hover strokes aren't covered. */}
        <div className="absolute left-0 top-0 z-[10000] h-0 w-0 overflow-visible">
          <SelectionFeature
            enabled={selectMode}
            readOnly={readOnly}
            attachPickActive={Boolean(canvasAttachPick)}
            document={document}
            selectedNodeIds={ids}
            selectedFrameIds={selectedFrameIds}
            paperEl={paperEl}
            stageEl={stageEl}
            artboard={artboard}
            onSelect={onSelect}
            onGeometryCommit={onGeometryCommit}
            onGeometryPreview={onGeometryPreview}
            onAngleCommit={onAngleCommit}
            onAnglePreview={onAnglePreview}
            hitTest={hitTest}
            hitTestFrame={hitTestFrame}
            onSelectFrame={onSelectFrame}
            onSelectFrames={onSelectFrames}
            onSelectMixed={onSelectMixed}
            getNodeBox={getNodeBox}
            listNodeIds={listNodeIds}
            queryNodeIdsInRect={queryNodeIdsInRect}
            onOpenAgent={onOpenAgent}
            onEditText={(id) => {
              setEditingPenId(null);
              setEditingTextId(id);
            }}
            onEditPenPath={(id) => {
              setEditingTextId(null);
              setEditingPenId(id);
              setPathEditSubtool('select');
              window.dispatchEvent(
                new CustomEvent('resume:path-edit-subtool', { detail: { subtool: 'select' } })
              );
            }}
            suppressChrome={
              Boolean(editingTextId) ||
              Boolean(editingPenId) ||
              cropExpandOpen ||
              eraserOpen ||
              videoToolOpen ||
              // Keep chrome while editing radius so the outline can follow rounded corners.
              (shapeStylePanelOpen && shapeStylePanel?.kind !== 'radius')
            }
            onTransformingChange={onGeometryTransformingChange}
          />
          <ImageProcessOverlay document={document} hidden={geometryTransforming} />
          <ImageGeneratorOverlay
            document={document}
            hidden={geometryTransforming}
            readOnly={readOnly}
          />
          <VideoGeneratorOverlay
            document={document}
            hidden={geometryTransforming}
            readOnly={readOnly}
          />
          <ShapeDrawFeature
            enabled={shapeMode}
            shapeKind={shapeKind || 'rect'}
            artboard={artboard}
            paperEl={paperEl}
            stageEl={stageEl}
            onCreate={onCreateShape}
          />
          <TextPlaceFeature
            enabled={textMode}
            artboard={artboard}
            paperEl={paperEl}
            stageEl={stageEl}
            onPlace={onPlaceText}
          />
          <ImagePlaceFeature
            enabled={imageMode}
            artboard={artboard}
            paperEl={paperEl}
            stageEl={stageEl}
            pendingSrc={pendingImageSrc}
            onPlace={placeImageAt}
          />
          <PencilDrawFeature
            enabled={pencilMode}
            artboard={artboard}
            paperEl={paperEl}
            stageEl={stageEl}
            strokeColor={penStrokeColor}
            strokeWidth={penStrokeWidth}
            strokeOpacity={penStrokeOpacity / 100}
            brushId={pencilBrushId}
            pressureEnabled={pencilPressureEnabled}
            eraseMode={pencilEraseMode}
            eraseTargets={pencilEraseTargets}
            onCommit={onPencilCommit}
            onErase={onPencilErase}
          />
          <BucketFillFeature
            enabled={!readOnly && activeTool === 'bucket'}
            artboard={artboard}
            paperEl={paperEl}
            stageEl={stageEl}
            fillColor={String(bucketFill.fillColor || '#333333')}
            hitTest={hitTest}
            onFill={onBucketFill}
          />
          <PenDrawFeature
            enabled={penMode && !editingPenId}
            artboard={artboard}
            paperEl={paperEl}
            stageEl={stageEl}
            strokeColor={penStrokeColor}
            strokeWidth={penStrokeWidth}
            onCommit={onPenCommit}
            onCancel={finishToSelect}
            hitTest={hitTest}
            document={document}
            onEditExistingPath={(id) => {
              setEditingTextId(null);
              setEditingPenId(id);
              setPathEditSubtool('select');
              window.dispatchEvent(
                new CustomEvent('resume:path-edit-subtool', { detail: { subtool: 'select' } })
              );
              dispatch(setActiveTool('select'));
            }}
          />
          {editingPenId ? (
            <PenPathEditFeature
              enabled={!readOnly}
              nodeId={editingPenId}
              document={document}
              paperEl={paperEl}
              stageEl={stageEl}
              drawNewShapeMode={pathEditSubtool === 'pen'}
              newStrokeColor={penStrokeColor}
              newStrokeWidth={penStrokeWidth}
              onCommitNewShape={({ pathD, box, closed }) => {
                if (!editingPenId) return;
                onPathEditUnionNewShape(editingPenId, { pathD, box, closed }, penStrokeWidth);
              }}
              onCommit={onPenPathEditCommit}
              onExit={() => setEditingPenId(null)}
            />
          ) : null}
        </div>
      </SvgPaper>

      {editingTextId ? (
        <TextInlineEditor
          document={document}
          nodeId={editingTextId}
          onCommit={onTextEditCommit}
          onLiveSize={onTextLiveSize}
          onCancel={onTextEditCancel}
        />
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          onMediaFile(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />

      <CanvasContextMenu
        menu={ctxMenu}
        hasNode={Boolean(
          ids.length ||
            ctxMenu?.nodeId ||
            selectedFrameIds.length ||
            ctxMenu?.frameId ||
            activeFrameId
        )}
        canAddToChat={(() => {
          const targetIds = resolveSelectionNodeIds(
            document,
            ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId),
            ctxMenuSeedFrameIds(selectedFrameIds, ctxMenu?.frameId)
          );
          if (targetIds.length) {
            return filterChatAttachNodeIds(document, targetIds).length > 0;
          }
          return Boolean(ctxMenu?.frameId || activeFrameId);
        })()}
        canDelete={Boolean(
          ids.length ||
            ctxMenu?.nodeId ||
            ctxMenu?.frameId ||
            selectedFrameIds.length ||
            activeFrameId
        )}
        canLayerActions={Boolean(
          ids.length || ctxMenu?.nodeId || ctxMenu?.frameId || selectedFrameIds.length || activeFrameId
        )}
        canExport={(() => {
          const seedNodes = ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId);
          const seedFrames = ctxMenuSeedFrameIds(selectedFrameIds, ctxMenu?.frameId);
          const targetIds = resolveSelectionNodeIds(document, seedNodes, seedFrames);
          if (targetIds.length) {
            // Generators / process shimmer have nothing to export.
            return targetIds.some((id) => isExportableSceneNode(document?.deltaSetLike?.[id]));
          }
          // Frame-only / empty artboard → crop export still makes sense.
          return Boolean(seedFrames.length || ctxMenu?.frameId || activeFrameId);
        })()}
        canToggleHidden={(() => {
          const targetIds = ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId);
          if (!targetIds.length) return false;
          // Generators have no hide — same as export.
          return targetIds.some((id) => !isGeneratorNode(document?.deltaSetLike?.[id]));
        })()}
        canToggleLocked={(() => {
          const targetIds = ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId);
          if (targetIds.length) {
            return targetIds.some((id) => !isGeneratorNode(document?.deltaSetLike?.[id]));
          }
          return Boolean(
            ctxMenu?.frameId || selectedFrameIds.length || activeFrameId
          );
        })()}
        canGroup={(() => {
          const targetIds = resolveSelectionNodeIds(
            document,
            ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId),
            ctxMenuSeedFrameIds(selectedFrameIds, ctxMenu?.frameId)
          );
          if (targetIds.length < 2) return false;
          return !selectionSharedGroupId(document, targetIds);
        })()}
        canUngroup={(() => {
          const targetIds = resolveSelectionNodeIds(
            document,
            ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId),
            ctxMenuSeedFrameIds(selectedFrameIds, ctxMenu?.frameId)
          );
          if (targetIds.length < 2) return false;
          return Boolean(selectionSharedGroupId(document, targetIds));
        })()}
        targetHidden={(() => {
          const targetIds = ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId);
          if (!targetIds.length) return false;
          return targetIds.every((id) => isNodeHidden(document?.deltaSetLike?.[id]));
        })()}
        targetLocked={(() => {
          const targetIds = ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId);
          if (targetIds.length) {
            return targetIds.every((id) => isNodeLocked(document?.deltaSetLike?.[id]));
          }
          const fid = ctxMenu?.frameId || activeFrameId;
          if (!fid) return false;
          const frame = (Array.isArray(document?.frames) ? document.frames : []).find(
            (f: any) => f?.id === fid
          );
          return Boolean(frame?.locked);
        })()}
        gridOn={isGridMode}
        exportKind={(() => {
          const targetIds = resolveSelectionNodeIds(
            document,
            ctxMenuSeedNodeIds(ids, ctxMenu?.nodeId),
            ctxMenuSeedFrameIds(selectedFrameIds, ctxMenu?.frameId)
          );
          if (!targetIds.length) return 'image';
          const allVideo = targetIds.every((id) => {
            const node = document?.deltaSetLike?.[id];
            return isVideoNode(node) && Boolean(String(node?.attrs?.src || '').trim());
          });
          return allVideo ? 'video' : 'image';
        })()}
        canUndo={canUndo}
        canRedo={canRedo}
        canPaste
        modLabel={modLabel}
        onAction={runCtxAction}
        onClose={() => setCtxMenu(null)}
      />
    </div>
  );
}

export default memo(SvgCanvas);
