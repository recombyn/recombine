import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addNodeToDocument,
  createImageNode,
  createShapeNode,
  createTextNode,
  expandSelectionWithGroups,
  fitImageSize,
  measureImageNaturalSize,
  pasteClipboardIntoDocument,
  removeNodesFromDocument,
  reorderNodesInDocument,
  listSceneNodes,
  snapshotNodesForClipboard,
  clipboardNodesBounds,
  type SceneClipboardPayload,
} from '@/store/scene/sceneDocument';
import { findPencilBrush } from '@/components/editor/nodes/ShapeNode/pencilBrushes';
import { STAMP_TINT_READY_EVENT } from '@/components/editor/nodes/ShapeNode/stampTint';
import {
  loadSceneOntoSvg,
  nodeLeftTop,
  clearSceneDragPreview,
  dedupeSceneNode,
  previewSvgNodeAngle,
  previewSvgNodeGeometry,
  purgeOrphanSceneNodes,
  replaceSvgNode,
} from '@/store/scene/sceneToSvg';
import { patchNodesGeometry, sceneToDocumentCoords } from '@/store/scene/svgToScene';
import { STROKE_HIT, distPointToSegment, strokeEndpointsFromBox, strokeNodeFromEndpoints } from '@/store/scene/sceneShapes';
import { useSvgBoard } from '@/hooks/useSvgBoard';
import {
  cssPreviewForGradient,
  parseFillGradient,
  parseFillType,
} from '@/store/scene/sceneFill';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';
import {
  patchDocumentNode,
  removeArtboardFrames,
  setActiveFrameId,
  setActiveTool,
  setDocument,
  setDocumentFromCanvas,
  setPendingImageSrc,
  setSelectedNodeId,
  setSelectedNodeIds,
  undo,
  redo,
} from '@/store/modules/editor';
import SvgPaper from './SvgPaper';
import SelectionFeature from '../selection/SelectionFeature';
import ShapeDrawFeature from '@/components/editor/nodes/ShapeNode/ShapeDrawFeature';
import TextPlaceFeature from '@/components/editor/nodes/TextNode/TextPlaceFeature';
import ImagePlaceFeature from '@/components/editor/nodes/ImageNode/ImagePlaceFeature';
import ImageNodeLabels from '@/components/editor/nodes/ImageNode/ImageNodeLabels';
import ImageProcessOverlay from '@/components/editor/nodes/ImageNode/ImageProcessOverlay';
import PencilDrawFeature, {
  type PencilEraseStroke,
} from '@/components/editor/nodes/ShapeNode/PencilDrawFeature';
import { erasePencilNode } from '@/components/editor/nodes/ShapeNode/pencilErase';
import PenDrawFeature from '@/components/editor/nodes/ShapeNode/PenDrawFeature';
import TextInlineEditor from '@/components/editor/nodes/TextNode/TextInlineEditor';
import CanvasContextMenu, {
  type ContextMenuState,
  type CtxAction,
} from '../selection/CanvasContextMenu';
import { useCameraOverlayRoot } from '@/components/editor/Canvas/stage/CameraContext';

type SceneBox = { left: number; top: number; width: number; height: number };

function clientToScene(
  paperEl: HTMLElement | null,
  artboard: { width: number; height: number },
  clientX: number,
  clientY: number
) {
  if (!paperEl) return { x: 0, y: 0 };
  const rect = paperEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const w = Math.max(1, artboard.width);
  const h = Math.max(1, artboard.height);
  return {
    x: ((clientX - rect.left) / rect.width) * w,
    y: ((clientY - rect.top) / rect.height) * h,
  };
}

type SvgCanvasProps = {
  document: any;
  readOnly?: boolean;
  reloadToken?: number;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  documentPatchToken?: number;
  /** Nodes patched via Redux — refresh SVG even when selection is empty (e.g. agent busy). */
  lastPatchedNodeIds?: string[];
  /** @deprecated Paper zoom is owned by InfiniteCanvasStage camera. */
  zoom?: number;
  /** @deprecated Prefer onZoomIn / onZoomOut for keyboard shortcuts. */
  onZoomChange?: (zoom: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onLoadStart?: () => void;
  onReady?: () => void;
  /** Open the editor AI agent dock (selection contextual bar). */
  onOpenAgent?: (opts?: { prompt?: string }) => void;
  /** Right-click 「添加到 Chat」— attach node to agent composer at caret. */
  onAddToChat?: (nodeId: string) => void;
  /** When true, paper has no outer shadow (hosted inside HtmlArtboardFrame). */
  embedded?: boolean;
};

/**
 * SVG.js editor shell ? mounts the board and composes feature components.
 */
export default function SvgCanvas({
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
}: SvgCanvasProps) {
  const dispatch = useDispatch();
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
  const workspaceMode = useSelector(
    (s: any) => (s.editor.workspaceMode || 'design') as 'design' | 'dev'
  );
  const [stampTintEpoch, setStampTintEpoch] = useState(0);
  const canUndo = useSelector((s: any) => (s.editor.historyPast?.length || 0) > 0);
  const canRedo = useSelector((s: any) => (s.editor.historyFuture?.length || 0) > 0);
  const imageToolPanelKind = useSelector((s: any) => s.editor.imageToolPanel?.kind as string | undefined);
  const shapeStylePanel = useSelector((s: any) => s.editor.shapeStylePanel as null | { kind: string });
  const shapeStylePanelOpen = Boolean(shapeStylePanel);
  const agentBusy = useSelector((s: any) => Boolean(s.editor.agentBusy));
  const cropExpandOpen = imageToolPanelKind === 'crop' || imageToolPanelKind === 'expand';
  const eraserOpen = imageToolPanelKind === 'eraser';
  const activeFrameId = useSelector(
    (s: any) => (s.editor.document?.activeFrameId as string | null) ?? null
  );

  const paperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef(document);
  const selectedIdsRef = useRef<string[]>([]);
  const activeFrameIdRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const lastLoadKeyRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imagePlaceAtRef = useRef<{ x: number; y: number } | null>(null);
  const [paperEl, setPaperEl] = useState<HTMLElement | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [clipboard, setClipboard] = useState<SceneClipboardPayload | null>(null);
  const clipboardRef = useRef<SceneClipboardPayload | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  /** After inline text commit, blank-canvas pointerup must not clear selection. */
  const keepSelectAfterTextEditRef = useRef<string | null>(null);
  const [geometryTransforming, setGeometryTransforming] = useState(false);
  const overlayRoot = useCameraOverlayRoot();

  documentRef.current = document;
  selectedIdsRef.current =
    selectedNodeIds?.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
  activeFrameIdRef.current = activeFrameId;

  const paperW = document?.width || 794;
  const paperH = document?.height || 1123;
  const artboard = useMemo(() => ({ width: paperW, height: paperH }), [paperW, paperH]);
  const modLabel = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '?' : 'Ctrl';
  const { boardRef, boardEpoch } = useSvgBoard(hostRef, paperW, paperH);

  useEffect(() => {
    setPaperEl(paperRef.current);
  }, [boardEpoch]);

  // Keep SVG viewBox in sync when the infinite world grows/shrinks ? do NOT full-reload
  // nodes on size-only changes (that races with move preview and leaves ghost copies).
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !document) return;
    const w = Math.round(document.width || 794);
    const h = Math.round(document.height || 1123);
    try {
      board.root.size(w, h).viewbox(0, 0, w, h);
    } catch {
      /* ignore */
    }
  }, [document?.width, document?.height, boardEpoch]);

  useEffect(() => {
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
    loadSceneOntoSvg(board.root, board.layer, document, seq, board as any).then((map) => {
      if (loadSeqRef.current !== seq) return;
      board.nodeEls = map || new Map();
      onReady?.();
    });
  }, [document, reloadToken, boardEpoch, onReady]);

  useEffect(() => {
    if (!documentPatchToken || geometryTransforming) return;
    const board = boardRef.current;
    const doc = documentRef.current;
    if (!board || !doc) return;
    const selected =
      selectedIdsRef.current?.length > 0
        ? selectedIdsRef.current
        : selectedNodeId
          ? [selectedNodeId]
          : [];
    const ids = [...new Set([...lastPatchedNodeIds, ...selected].filter(Boolean))];
    ids.forEach((id) => {
      void replaceSvgNode(board.root, board.layer, doc, board.nodeEls, id);
    });
  }, [documentPatchToken, selectedNodeId, lastPatchedNodeIds, geometryTransforming]);

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
      void replaceSvgNode(board.root, board.layer, doc, board.nodeEls, id);
    });
  }, [stampTintEpoch]);

  const listNodeIds = useCallback(() => {
    return [...(documentRef.current?.deltaSetLike?.ROOT?.children || [])];
  }, []);

  const getNodeBox = useCallback((nodeId: string): SceneBox | null => {
    const doc = documentRef.current;
    const node = doc?.deltaSetLike?.[nodeId];
    if (!node) return null;
    const { left, top } = nodeLeftTop(doc, node);
    return {
      left,
      top,
      width: Math.max(1, Number(node.width) || 1),
      height: Math.max(1, Number(node.height) || 1),
    };
  }, []);

  const hitTest = useCallback(
    (x: number, y: number) => {
      const doc = documentRef.current;
      const paper = paperRef.current;
      const rect = paper?.getBoundingClientRect();
      const zoom =
        rect && paperW > 0 ? Math.max(0.05, rect.width / paperW) : 1;
      // ~12px on screen, at least half the stroke hit pad in world units.
      const pad = Math.max(STROKE_HIT / 2, 12 / zoom);
      const order = [...listNodeIds()].reverse();
      for (const id of order) {
        const node = doc?.deltaSetLike?.[id];
        const box = getNodeBox(id);
        if (!node || !box) continue;
        const shapeType = String(node.attrs?.shapeType || '');
        if (shapeType === 'line' || shapeType === 'arrow') {
          const angle = Number(node.attrs?.angle) || 0;
          const ep = strokeEndpointsFromBox(box, angle);
          if (distPointToSegment(x, y, ep.x0, ep.y0, ep.x1, ep.y1) <= pad) {
            return id;
          }
          continue;
        }
        const angle = Number(node.attrs?.angle) || 0;
        if (Math.abs(angle) > 0.5) {
          // Rotated AABB ? local test
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          const rad = (-angle * Math.PI) / 180;
          const dx = x - cx;
          const dy = y - cy;
          const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
          if (
            Math.abs(lx) <= box.width / 2 + pad * 0.25 &&
            Math.abs(ly) <= box.height / 2 + pad * 0.25
          ) {
            return id;
          }
          continue;
        }
        if (
          x >= box.left - pad * 0.15 &&
          x <= box.left + box.width + pad * 0.15 &&
          y >= box.top - pad * 0.15 &&
          y <= box.top + box.height + pad * 0.15
        ) {
          return id;
        }
      }
      return null;
    },
    [getNodeBox, listNodeIds, paperW]
  );

  const onSelect = useCallback(
    (ids: string[], opts?: { additive?: boolean }) => {
      // Allow selection in read-only Dev/preview so inspect annotations work.
      // Do not re-select after text blur: blank click must clear focus/selection.
      keepSelectAfterTextEditRef.current = null;
      const doc = documentRef.current;
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
      }
      // Prefer setSelectedNodeIds only ? setSelectedNodeId clears multi-select to [id].
      dispatch(setSelectedNodeIds(next));
      // Node selection / empty-canvas click clears artboard frame highlight.
      dispatch(setActiveFrameId(null));
    },
    [dispatch]
  );

  const rebuildNodes = useCallback((doc: any, ids: string[]) => {
    const board = boardRef.current;
    if (!board || !doc) return;
    ids.forEach((id) => {
      void replaceSvgNode(board.root, board.layer, doc, board.nodeEls, id);
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

  const onGeometryCommit = useCallback(
    (patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>) => {
      const doc = documentRef.current;
      const board = boardRef.current;
      if (!doc || readOnly || !patches.length) return;
      const normalized = normalizeGeomPatches(doc, patches);
      const next = patchNodesGeometry(doc, normalized, { fitTextBox: true });
      documentRef.current = next;
      dispatch(setDocumentFromCanvas(next));
      // Prefer in-place sync; after live-resize scale preview, rebuild the node.
      if (!board) return;
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
        const isImage = next?.deltaSetLike?.[p.nodeId]?.key === 'image';
        const didResize = Boolean(el?.__sceneDidResize);
        clearSceneDragPreview(board.nodeEls, p.nodeId);
        // Line/arrow always rebuild on commit ? in-place preview can leave a ghost shaft.
        // Text always rebuilds so remasured width/height + font match the selection chrome.
        // Images must NOT rebuild ? recreating <image> reloads the bitmap and flashes.
        if ((didResize && !isImage) || isStrokeShape || isText) {
          void replaceSvgNode(board.root, board.layer, next, board.nodeEls, p.nodeId);
          return;
        }
        const synced = previewSvgNodeGeometry(board.nodeEls, p.nodeId, p);
        if (!synced && !isImage) {
          void replaceSvgNode(board.root, board.layer, next, board.nodeEls, p.nodeId);
          return;
        }
        // Strip any same-id orphans left by a superseded async load/replace.
        dedupeSceneNode(board.layer, p.nodeId, board.nodeEls.get(p.nodeId) ?? null);
      });
      const validIds = next?.deltaSetLike?.ROOT?.children || [];
      purgeOrphanSceneNodes(board.layer, board.nodeEls, validIds);
    },
    [dispatch, readOnly, normalizeGeomPatches]
  );

  /** Update SVG only ? never replace while dragging (replace races pile ghost copies). */
  const onGeometryPreview = useCallback(
    (patches: Array<{ nodeId: string; left: number; top: number; width: number; height: number }>) => {
      const doc = documentRef.current;
      const board = boardRef.current;
      if (!doc || !board || readOnly || !patches.length) return;
      const normalized = normalizeGeomPatches(doc, patches);
      const next = patchNodesGeometry(doc, normalized);
      documentRef.current = next;
      normalized.forEach((p) => {
        previewSvgNodeGeometry(board.nodeEls, p.nodeId, p);
      });
    },
    [readOnly, normalizeGeomPatches]
  );

  const onAngleCommit = useCallback(
    (nodeId: string, angleDeg: number) => {
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
        void replaceSvgNode(board.root, board.layer, documentRef.current, board.nodeEls, nodeId);
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
    (x: number, y: number) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return;
      // Place caret at click (top-left), empty ? no placeholder copy.
      const origin = sceneToDocumentCoords(doc, x, y);
      const { id, node } = createTextNode({
        x: origin.x,
        y: origin.y,
        text: '',
        width: 2,
        height: 20,
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
    (next: { attrs: Record<string, unknown>; width: number; height: number }) => {
      if (!editingTextId) return;
      const id = editingTextId;
      keepSelectAfterTextEditRef.current = null;
      dispatch(
        patchDocumentNode({
          nodeId: id,
          patch: {
            attrs: next.attrs,
            width: next.width,
            height: next.height,
          },
        })
      );
      setEditingTextId(null);
      // Do not force-select here: blank-canvas pointerup clears selection after blur.
      // If the node was already selected when editing started, it stays selected.
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
  useEffect(() => {
    if (!editingTextId) return undefined;
    let cancelled = false;
    let hidden: any = null;
    const tryHide = () => {
      const board = boardRef.current;
      const el = board?.nodeEls.get(editingTextId) as any;
      if (!el || typeof el.opacity !== 'function') return false;
      el.opacity(0);
      hidden = el;
      return true;
    };
    if (!tryHide()) {
      const timer = window.setInterval(() => {
        if (cancelled || tryHide()) window.clearInterval(timer);
      }, 32);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
        try {
          hidden?.opacity?.(1);
        } catch {
          /* ignore */
        }
      };
    }
    return () => {
      try {
        hidden?.opacity?.(1);
      } catch {
        /* ignore */
      }
    };
  }, [editingTextId, reloadToken, boardEpoch]);

  const placeImageAt = useCallback(
    (src: string, x: number, y: number) => {
      if (readOnly) return;
      void (async () => {
        try {
          const natural = await measureImageNaturalSize(src);
          const { width, height } = fitImageSize(natural.width, natural.height, 280);
          const latest = documentRef.current;
          if (!latest) return;
          const origin = sceneToDocumentCoords(latest, x - width / 2, y - height / 2);
          const { id, node } = createImageNode({
            x: origin.x,
            y: origin.y,
            width,
            height,
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
      })();
    },
    [dispatch, readOnly]
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
    const center = view
      ? clientToScene(paperEl, artboard, view.left + view.width / 2, view.top + view.height / 2)
      : { x: paperW / 2, y: paperH / 2 };
    placeImageAt(pendingImageSrc, center.x, center.y);
  }, [
    pendingImageSrc,
    paperW,
    paperH,
    paperEl,
    overlayRoot,
    artboard,
    placeImageAt,
    readOnly,
  ]);

  const onPencilCommit = useCallback(
    (pathD: string, box: { left: number; top: number; width: number; height: number }) => {
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
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      // Stay in pencil mode for continuous strokes; do not auto-select.
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
    },
    [dispatch, readOnly, penStrokeColor, penStrokeWidth, pencilBrushId]
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
        const fragments = erasePencilNode({
          pathD: String(node.attrs?.path || ''),
          left,
          top,
          strokeWidth: Number(node.attrs?.['border-width'] ?? node.attrs?.strokeWidth ?? 10) || 10,
          brushId: String(node.attrs?.brushStyle || 'solid'),
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
            borderWidth: Number(node.attrs?.['border-width'] ?? 10) || 10,
            path: frag.pathD,
            closed: false,
            brushStyle: String(node.attrs?.brushStyle || 'solid'),
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
        fill: closed ? '#FFFFFF' : 'transparent',
        stroke: penStrokeColor,
        borderWidth: penStrokeWidth,
        path: pathD,
        closed,
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      // Close / Enter finish ? leave pen mode (no need to click Done).
      dispatch(setSelectedNodeIds([id]));
      dispatch(setActiveTool('select'));
    },
    [dispatch, readOnly, penStrokeColor, penStrokeWidth]
  );

  const reorderLayer = useCallback(
    (action: 'front' | 'back' | 'forward' | 'backward', ids: string[]) => {
      const doc = documentRef.current;
      if (!doc || !ids.length) return;
      dispatch(setDocument(reorderNodesInDocument(doc, ids, action)));
    },
    [dispatch]
  );

  const deleteSelected = useCallback(
    (ids: string[]) => {
      if (!ids.length || !documentRef.current) return;
      dispatch(setDocument(removeNodesFromDocument(documentRef.current, ids)));
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
    },
    [dispatch]
  );

  const copySelected = useCallback((ids: string[]) => {
    const snap = snapshotNodesForClipboard(documentRef.current, ids);
    if (!snap) return false;
    clipboardRef.current = snap;
    setClipboard(snap);
    return true;
  }, []);

  const cutSelected = useCallback(
    (ids: string[]) => {
      if (!copySelected(ids)) return;
      deleteSelected(ids);
    },
    [copySelected, deleteSelected]
  );

  const pasteClipboard = useCallback(
    (opts?: { anchor?: { x: number; y: number } }) => {
      const doc = documentRef.current;
      const payload = clipboardRef.current;
      if (!doc || !payload?.nodes?.length || readOnly) return;
      const { document: next, ids: newIds } = pasteClipboardIntoDocument(doc, payload, {
        offsetX: 24,
        offsetY: 24,
        anchor: opts?.anchor,
      });
      if (!newIds.length) return;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds(newIds));
      dispatch(setSelectedNodeId(newIds.length === 1 ? newIds[0] : null));
    },
    [dispatch, readOnly]
  );

  /** Duplicate selection to the right with a 16px gap. */
  const duplicateSelected = useCallback(
    (ids: string[]) => {
      const doc = documentRef.current;
      if (!doc || !ids.length || readOnly) return;
      const snap = snapshotNodesForClipboard(doc, ids);
      if (!snap) return;
      const bounds = clipboardNodesBounds(snap);
      const gap = 16;
      const { document: next, ids: newIds } = pasteClipboardIntoDocument(doc, snap, {
        offsetX: (bounds?.width ?? 0) + gap,
        offsetY: 0,
      });
      if (!newIds.length) return;
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds(newIds));
      dispatch(setSelectedNodeId(newIds.length === 1 ? newIds[0] : null));
    },
    [dispatch, readOnly]
  );

  const deleteActiveFrame = useCallback(() => {
    const frameId = activeFrameIdRef.current;
    if (!frameId) return false;
    dispatch(removeArtboardFrames([frameId]));
    return true;
  }, [dispatch]);

  // Context menu ? listen on paper + camera overlay (selection chrome sits above the shape).
  useEffect(() => {
    if (readOnly || !paperEl) return undefined;

    const skipSel =
      '[data-sel-toolbar],[data-frame-toolbar],[data-ctx-menu],[data-export-panel],[data-image-label],[data-frame-label],[data-crop-expand-overlay],[data-crop-expand-toolbar],[data-image-tool-panel],[data-text-inline-editor]';

    const onCtx = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(skipSel)) return;

      e.preventDefault();
      e.stopPropagation();

      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      const id = hitTest(p.x, p.y);
      if (id && !selectedIdsRef.current.includes(id)) {
        dispatch(setSelectedNodeIds([id]));
        dispatch(setSelectedNodeId(id));
      }
      let frameId: string | null = activeFrameIdRef.current;
      if (!id) {
        const frames = Array.isArray(documentRef.current?.frames)
          ? documentRef.current.frames
          : [];
        for (let i = frames.length - 1; i >= 0; i -= 1) {
          const f = frames[i];
          if (!f) continue;
          const fx = Number(f.x) || 0;
          const fy = Number(f.y) || 0;
          const fw = Math.max(1, Number(f.width) || 1);
          const fh = Math.max(1, Number(f.height) || 1);
          if (p.x >= fx && p.x <= fx + fw && p.y >= fy && p.y <= fy + fh) {
            frameId = String(f.id);
            if (frameId !== activeFrameIdRef.current) {
              dispatch(setActiveFrameId(frameId));
              dispatch(setSelectedNodeIds([]));
              dispatch(setSelectedNodeId(null));
            }
            break;
          }
        }
      }
      setCtxMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        sceneX: p.x,
        sceneY: p.y,
        nodeId: id,
        frameId,
      });
    };

    const targets: HTMLElement[] = [paperEl];
    if (overlayRoot && overlayRoot !== paperEl) targets.push(overlayRoot);

    for (const el of targets) el.addEventListener('contextmenu', onCtx);
    return () => {
      for (const el of targets) el.removeEventListener('contextmenu', onCtx);
    };
  }, [paperEl, overlayRoot, readOnly, artboard, hitTest, dispatch]);

  const runCtxAction = (action: CtxAction) => {
    const ids =
      selectedIdsRef.current.length > 0
        ? selectedIdsRef.current
        : ctxMenu?.nodeId
          ? [ctxMenu.nodeId]
          : [];
    const placeAt =
      ctxMenu && Number.isFinite(ctxMenu.sceneX)
        ? { x: ctxMenu.sceneX, y: ctxMenu.sceneY }
        : null;
    const hitNodeId = ctxMenu?.nodeId ?? null;
    const menuFrameId = ctxMenu?.frameId || activeFrameIdRef.current;
    setCtxMenu(null);

    if (action === 'upload') {
      // Empty canvas only ? disabled when right-clicking a node.
      if (hitNodeId) return;
      imagePlaceAtRef.current = placeAt;
      imageInputRef.current?.click();
      return;
    }
    if (action === 'addToChat') {
      const id = hitNodeId || ids[0];
      if (id) {
        onAddToChat?.(id);
        return;
      }
      // Artboard selected (no node under cursor) — pin the frame into Chat.
      if (menuFrameId) {
        onAddToChat?.(`frame:${menuFrameId}`);
      }
      return;
    }
    if (action === 'undo') {
      dispatch(undo());
      return;
    }
    if (action === 'redo') {
      dispatch(redo());
      return;
    }
    if (action === 'copy') {
      copySelected(ids);
      return;
    }
    if (action === 'cut') {
      cutSelected(ids);
      return;
    }
    if (action === 'paste') {
      pasteClipboard(placeAt ? { anchor: placeAt } : undefined);
      return;
    }
    if (action === 'duplicate') {
      duplicateSelected(ids);
      return;
    }
    if (action === 'delete') {
      if (ids.length) deleteSelected(ids);
      else deleteActiveFrame();
      return;
    }
    if (action === 'front' || action === 'forward' || action === 'backward' || action === 'back') {
      reorderLayer(action, ids);
    }
  };

  const onImageFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      const at = imagePlaceAtRef.current;
      imagePlaceAtRef.current = null;
      if (at) placeImageAt(src, at.x, at.y);
      else dispatch(setPendingImageSrc(src));
    };
    reader.readAsDataURL(file);
  };

  // Keyboard (zoom shortcuts delegate to parent camera when callbacks provided)
  useEffect(() => {
    const isTypingTarget = (t: HTMLElement | null) =>
      Boolean(
        t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.isContentEditable ||
            t.closest?.(
              '[data-fill-panel], [data-color-panel], [data-select-dropdown], [data-frame-label], [data-text-inline-editor]'
            ))
      );

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target as HTMLElement | null);

      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        onZoomIn?.();
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        onZoomOut?.();
      }
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch(undo());
      }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        dispatch(redo());
      }
      if (mod && e.key.toLowerCase() === 'a' && activeTool === 'select' && !typing) {
        e.preventDefault();
        onSelect(listNodeIds());
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        imagePlaceAtRef.current = null;
        imageInputRef.current?.click();
      }
      if (mod && !typing && !readOnly) {
        const k = e.key.toLowerCase();
        if (k === 'c') {
          const ids = selectedIdsRef.current;
          if (!ids.length) return;
          e.preventDefault();
          copySelected(ids);
          return;
        }
        if (k === 'x') {
          const ids = selectedIdsRef.current;
          if (!ids.length) return;
          e.preventDefault();
          cutSelected(ids);
          return;
        }
        if (k === 'v') {
          if (!clipboardRef.current?.nodes?.length) return;
          e.preventDefault();
          pasteClipboard();
          return;
        }
        if (k === 'd') {
          const ids = selectedIdsRef.current;
          if (!ids.length) return;
          e.preventDefault();
          duplicateSelected(ids);
          return;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly) {
        if (typing) return;
        // Fill / color popovers handle Delete for gradient stops etc.
        if (document.querySelector('[data-fill-panel], [data-color-panel]')) return;
        const ids = selectedIdsRef.current;
        if (ids.length) {
          e.preventDefault();
          deleteSelected(ids);
          return;
        }
        if (activeFrameIdRef.current) {
          e.preventDefault();
          deleteActiveFrame();
        }
      }
      if (e.key === ']' || e.key === '[') {
        const ids = selectedIdsRef.current;
        if (!ids.length) return;
        e.preventDefault();
        if (e.key === ']' && mod) reorderLayer('forward', ids);
        else if (e.key === ']') reorderLayer('front', ids);
        else if (e.key === '[' && mod) reorderLayer('backward', ids);
        else reorderLayer('back', ids);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    onZoomIn,
    onZoomOut,
    dispatch,
    readOnly,
    activeTool,
    onSelect,
    listNodeIds,
    deleteSelected,
    deleteActiveFrame,
    reorderLayer,
    copySelected,
    cutSelected,
    pasteClipboard,
    duplicateSelected,
  ]);

  const bgType = parseFillType(document?.backgroundFillType);
  const paperBackground =
    bgType === 'solid'
      ? cssSolidWithOpacity(
          document?.backgroundColor || '#ffffff',
          Number(document?.backgroundOpacity ?? 100)
        )
      : cssPreviewForGradient(
          {
            ...parseFillGradient(
              document?.backgroundGradient,
              bgType,
              String(document?.backgroundColor || '#3B82F6')
            ),
            type: bgType,
          },
          Number(document?.backgroundOpacity ?? 100)
        );

  const ids =
    selectedNodeIds?.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];

  // Select / inspect: Dev+readOnly (share preview) still needs hit-test + spacing overlays.
  const selectMode =
    (activeTool === 'select' || activeTool === 'scale') &&
    (!readOnly || workspaceMode === 'dev');
  const shapeMode = !readOnly && activeTool === 'shape';
  const textMode = !readOnly && activeTool === 'text';
  const imageMode = !readOnly && activeTool === 'image';
  const pencilMode = !readOnly && activeTool === 'pencil';
  const penMode = !readOnly && activeTool === 'pen';

  return (
    <div className={embedded ? 'relative h-full w-full' : 'relative canvas-stage'}>
      <SvgPaper
        paperRef={paperRef}
        hostRef={hostRef}
        width={paperW}
        height={paperH}
        background={embedded ? 'transparent' : paperBackground}
        className={
          embedded
            ? 'canvas-world relative h-full w-full'
            : 'canvas-paper relative shadow-[0_8px_40px_rgba(15,23,42,0.12)] ring-1 ring-black/5'
        }
      >
        <SelectionFeature
          enabled={selectMode}
          readOnly={readOnly}
          document={document}
          selectedNodeIds={ids}
          paperEl={paperEl}
          artboard={artboard}
          onSelect={onSelect}
          onGeometryCommit={onGeometryCommit}
          onGeometryPreview={onGeometryPreview}
          onAngleCommit={onAngleCommit}
          onAnglePreview={onAnglePreview}
          hitTest={hitTest}
          getNodeBox={getNodeBox}
          listNodeIds={listNodeIds}
          onDeleteSelected={() => deleteSelected(ids)}
          onOpenAgent={onOpenAgent}
          onEditText={(id) => setEditingTextId(id)}
          suppressChrome={
            Boolean(editingTextId) ||
            cropExpandOpen ||
            eraserOpen ||
            // Keep chrome while editing radius so the outline can follow rounded corners.
            (shapeStylePanelOpen && shapeStylePanel?.kind !== 'radius') ||
            agentBusy
          }
          onTransformingChange={setGeometryTransforming}
        />
        {!readOnly ? (
          <ImageNodeLabels document={document} hidden={geometryTransforming} />
        ) : null}
        <ImageProcessOverlay document={document} hidden={geometryTransforming} />
        <ShapeDrawFeature
          enabled={shapeMode}
          shapeKind={shapeKind || 'rect'}
          artboard={artboard}
          paperEl={paperEl}
          onCreate={onCreateShape}
        />
        <TextPlaceFeature
          enabled={textMode}
          artboard={artboard}
          paperEl={paperEl}
          onPlace={onPlaceText}
        />
        <ImagePlaceFeature
          enabled={imageMode}
          artboard={artboard}
          paperEl={paperEl}
          pendingSrc={pendingImageSrc}
          onPlace={placeImageAt}
        />
        <PencilDrawFeature
          enabled={pencilMode}
          artboard={artboard}
          paperEl={paperEl}
          strokeColor={penStrokeColor}
          strokeWidth={penStrokeWidth}
          brushId={pencilBrushId}
          eraseMode={pencilEraseMode}
          eraseTargets={pencilEraseTargets}
          onCommit={onPencilCommit}
          onErase={onPencilErase}
        />
        <PenDrawFeature
          enabled={penMode}
          artboard={artboard}
          paperEl={paperEl}
          strokeColor={penStrokeColor}
          strokeWidth={penStrokeWidth}
          onCommit={onPenCommit}
          onCancel={finishToSelect}
        />
      </SvgPaper>

      {editingTextId ? (
        <TextInlineEditor
          document={document}
          nodeId={editingTextId}
          onCommit={onTextEditCommit}
          onCancel={onTextEditCancel}
        />
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onImageFile(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />

      <CanvasContextMenu
        menu={ctxMenu}
        hasNode={Boolean(ids.length || ctxMenu?.nodeId)}
        canAddToChat={Boolean(ids.length || ctxMenu?.nodeId || ctxMenu?.frameId || activeFrameId)}
        canDelete={Boolean(ids.length || ctxMenu?.nodeId || ctxMenu?.frameId || activeFrameId)}
        canUndo={canUndo}
        canRedo={canRedo}
        canPaste={Boolean(clipboard?.nodes?.length)}
        modLabel={modLabel}
        onAction={runCtxAction}
        onClose={() => setCtxMenu(null)}
      />
    </div>
  );
}
