import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addNodeToDocument,
  createImageNode,
  createShapeNode,
  createSvgNode,
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
  supportsFill,
  type SceneClipboardPayload,
} from '@/components/rcb/scene/sceneDocument';
import {
  loadSceneOntoSvg,
  nodeLeftTop,
  clearSceneDragPreview,
  dedupeSceneNode,
  previewSvgNodeAngle,
  previewSvgNodeGeometry,
  purgeOrphanSceneNodes,
} from '@/components/rcb/scene/sceneToSvg';
import { patchNodesGeometry, sceneToDocumentCoords } from '@/components/rcb/scene/svgToScene';
import { strokeCenterlineToFilledOutline } from '@/components/rcb/scene/outlineToPath';
import { computeShapeBoolean, type ShapeBox } from '@/components/rcb/selection/shapeBoolean';
import {
  STROKE_HIT,
  distPointToPathD,
  distPointToSegment,
  hitTestSvgNodeAtClient,
  pathDContainsPoint,
  pathStrokeHitsSceneBox,
  strokeEndpointsFromBox,
  strokeNodeFromEndpoints,
} from '@/components/rcb/scene/sceneShapes';
import {
  deflateSelectionBox,
  inflateBoxByStrokeOutset,
  inflateSelectionBox,
} from '@/components/rcb/scene/sceneEffects';
import { setSceneHitTestBridge } from '@/components/rcb/scene/sceneHitBridge';
import { useSvgBoard } from '@/components/rcb/canvas/useSvgBoard';
import {
  RcbShapesLayer,
  replaceShapePaint,
  setSharedNodeEls,
  getShapeHost,
  listShapeHosts,
  rcbScreenToScene,
  type RcbCamera,
  type SvgBoardHandle,
} from '@/components/rcb';
import { uploadImageFile, readFileAsDataUrl } from '@/apis/upload';
import { message } from '@/components/base';
import {
  parseNodeText,
  parseNodeTextStyle,
} from '@/components/rcb/scene/sceneText';
import {
  cssPreviewForGradient,
  parseFillGradient,
  parseFillType,
} from '@/components/rcb/scene/sceneFill';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';
import {
  patchDocumentNode,
  removeArtboardFrames,
  setActiveFrameId,
  setSelectedFrameIds,
  setMixedSelection,
  updateArtboardFrame,
  setActiveTool,
  setDocument,
  setDocumentFromCanvas,
  pushEditorHistory,
  setPendingImageSrc,
  setSelectedNodeId,
  setSelectedNodeIds,
  startImageUploadPlaceholder,
  finishImageProcess,
  failImageProcess,
  undo,
  redo,
} from '@/store/modules/editor';
import { requestProjectFlush } from '@/components/editor/useProjectCloudSync';
import SvgPaper from './SvgPaper';
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
import type { PencilEraseStroke } from '@/components/rcb';
import { erasePencilNode } from '@/components/rcb';
import TextInlineEditor from '@/components/editor/nodes/TextNode/TextInlineEditor';
import CanvasContextMenu, {
  type ContextMenuState,
  type CtxAction,
} from '@/components/rcb/selection/CanvasContextMenu';
import {
  useRcbCamera,
  useRcbOverlayRoot,
} from '@/components/rcb';


type ArtboardRect = { x?: number; y?: number; width: number; height: number };

function pointerToWorld(
  camera: RcbCamera,
  opts: { stageEl?: HTMLElement | null; paperEl?: HTMLElement | null; artboard?: ArtboardRect },
  clientX: number,
  clientY: number
): { x: number; y: number } {
  if (opts.stageEl) return rcbScreenToScene(camera, opts.stageEl, clientX, clientY);
  if (opts.paperEl && opts.artboard) {
    const rect = opts.paperEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const w = Math.max(1, opts.artboard.width);
    const h = Math.max(1, opts.artboard.height);
    const ox = Number(opts.artboard.x) || 0;
    const oy = Number(opts.artboard.y) || 0;
    return {
      x: ox + ((clientX - rect.left) / rect.width) * w,
      y: oy + ((clientY - rect.top) / rect.height) * h,
    };
  }
  return { x: 0, y: 0 };
}

function looksLikeSvgMarkup(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^data:image\/svg\+xml/i.test(t)) return true;
  if (/^<\?xml[\s\S]*?<svg[\s>]/i.test(t)) return true;
  return /^<svg[\s>]/i.test(t);
}

function decodeClipboardSvgText(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (/^data:image\/svg\+xml/i.test(t)) {
    const comma = t.indexOf(',');
    const payload = comma >= 0 ? t.slice(comma + 1) : '';
    const header = comma >= 0 ? t.slice(0, comma) : '';
    try {
      return header.toLowerCase().includes(';base64')
        ? decodeURIComponent(escape(atob(payload)))
        : decodeURIComponent(payload.replace(/\+/g, ' '));
    } catch {
      return '';
    }
  }
  return t;
}

/** Size SVG icon from viewBox / width / height attrs (default 48, soft-cap 280). */
function measureSvgMarkupSize(markup: string): { width: number; height: number; svg: string } {
  const trimmed = String(markup || '').trim();
  const svg = /^<svg[\s>]/i.test(trimmed)
    ? trimmed
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${trimmed}</svg>`;
  let vbW = 24;
  let vbH = 24;
  try {
    const doc = new DOMParser().parseFromString(
      /^<svg[\s>]/i.test(svg)
        ? svg
        : `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`,
      'image/svg+xml'
    );
    const root = doc.querySelector('svg');
    if (root && !doc.querySelector('parsererror')) {
      const vb = String(root.getAttribute('viewBox') || '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        vbW = vb[2];
        vbH = vb[3];
      } else {
        const wAttr = Number.parseFloat(String(root.getAttribute('width') || ''));
        const hAttr = Number.parseFloat(String(root.getAttribute('height') || ''));
        if (wAttr > 0 && hAttr > 0) {
          vbW = wAttr;
          vbH = hAttr;
        }
      }
    }
  } catch {
    /* keep defaults */
  }
  const fitted = fitImageSize(vbW, vbH, 280);
  return {
    width: Math.max(16, fitted.width),
    height: Math.max(16, fitted.height),
    svg,
  };
}

type SystemPastePayload =
  | { kind: 'image'; file: File }
  | { kind: 'svg'; markup: string }
  | { kind: 'text'; text: string };

function fileLooksLikeSvg(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.includes('svg')) return true;
  return /\.svg$/i.test(file.name || '');
}

/** Prefer image → SVG markup → plain text from a ClipboardEvent / ClipboardItem list. */
async function readSystemPastePayload(
  data: DataTransfer | null | undefined
): Promise<SystemPastePayload | null> {
  if (!data) return null;

  const fromItems: File[] = [];
  try {
    for (const item of Array.from(data.items || [])) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f) fromItems.push(f);
    }
  } catch {
    /* ignore */
  }
  const files = fromItems.length ? fromItems : Array.from(data.files || []);
  for (const file of files) {
    if (fileLooksLikeSvg(file)) {
      try {
        const markup = decodeClipboardSvgText(await file.text());
        if (looksLikeSvgMarkup(markup)) return { kind: 'svg', markup };
      } catch {
        /* fall through to image upload */
      }
    }
    if ((file.type || '').startsWith('image/')) {
      return { kind: 'image', file };
    }
  }

  const plain = String(data.getData('text/plain') || '').trim();
  if (plain) {
    const markup = decodeClipboardSvgText(plain);
    if (looksLikeSvgMarkup(markup)) return { kind: 'svg', markup };
    return { kind: 'text', text: plain };
  }

  const html = String(data.getData('text/html') || '');
  if (html) {
    const m = html.match(/<svg[\s\S]*?<\/svg>/i);
    if (m?.[0] && looksLikeSvgMarkup(m[0])) {
      return { kind: 'svg', markup: m[0] };
    }
  }

  return null;
}

async function readSystemPasteFromNavigator(): Promise<SystemPastePayload | null> {
  const clip = navigator.clipboard;
  if (!clip) return null;

  if (typeof clip.read === 'function') {
    try {
      const items = await clip.read();
      for (const item of items) {
        const types = item.types || [];
        const svgType = types.find((t) => t.includes('svg'));
        if (svgType) {
          const blob = await item.getType(svgType);
          const markup = decodeClipboardSvgText(await blob.text());
          if (looksLikeSvgMarkup(markup)) return { kind: 'svg', markup };
        }
        const imageType = types.find((t) => t.startsWith('image/') && !t.includes('svg'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.includes('jpeg') || imageType.includes('jpg') ? 'jpg' : 'png';
          return {
            kind: 'image',
            file: new File([blob], `paste.${ext}`, { type: imageType }),
          };
        }
        if (types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const plain = String(await blob.text()).trim();
          if (!plain) continue;
          const markup = decodeClipboardSvgText(plain);
          if (looksLikeSvgMarkup(markup)) return { kind: 'svg', markup };
          return { kind: 'text', text: plain };
        }
      }
    } catch {
      /* permission / unsupported — try readText */
    }
  }

  if (typeof clip.readText === 'function') {
    try {
      const plain = String(await clip.readText()).trim();
      if (!plain) return null;
      const markup = decodeClipboardSvgText(plain);
      if (looksLikeSvgMarkup(markup)) return { kind: 'svg', markup };
      return { kind: 'text', text: plain };
    } catch {
      return null;
    }
  }
  return null;
}

type SceneBox = { left: number; top: number; width: number; height: number };

const EMPTY_NODE_IDS: string[] = [];

/** Near-full-bleed rect covering an artboard — treat click as frame select. */
function frameForFullBleedPlate(doc: any, nodeId: string): { id: string } | null {
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
      return { id: String(f.id) };
    }
  }
  return null;
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
  stageEl = null,
  viewRect = null,
}: SvgCanvasProps) {
  const dispatch = useDispatch();
  const camera = useRcbCamera();
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
  const [stampTintEpoch, setStampTintEpoch] = useState(0);
  const canUndo = useSelector((s: any) => (s.editor.historyPast?.length || 0) > 0);
  const canRedo = useSelector((s: any) => (s.editor.historyFuture?.length || 0) > 0);
  const imageToolPanelKind = useSelector((s: any) => s.editor.imageToolPanel?.kind as string | undefined);
  const shapeStylePanel = useSelector((s: any) => s.editor.shapeStylePanel as null | { kind: string });
  const shapeStylePanelOpen = Boolean(shapeStylePanel);
  const cropExpandOpen = imageToolPanelKind === 'crop' || imageToolPanelKind === 'expand';
  const eraserOpen = imageToolPanelKind === 'eraser';
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
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  /** Double-click pen path → anchor / handle edit. */
  const [editingPenId, setEditingPenId] = useState<string | null>(null);
  const [pathEditSubtool, setPathEditSubtool] = useState<'select' | 'pen'>('select');
  /** After inline text commit, blank-canvas pointerup must not clear selection. */
  const keepSelectAfterTextEditRef = useRef<string | null>(null);
  const [geometryTransforming, setGeometryTransforming] = useState(false);
  const overlayRoot = useRcbOverlayRoot();

  documentRef.current = document;
  selectedIdsRef.current =
    selectedNodeIds?.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
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
    const selected =
      selectedIdsRef.current?.length > 0
        ? selectedIdsRef.current
        : selectedNodeId
          ? [selectedNodeId]
          : [];
    const ids = [...new Set([...lastPatchedNodeIds, ...selected].filter(Boolean))];
    ids.forEach((id) => {
      void replaceShapePaint(doc, board.nodeEls, id, board.root ? board : null);
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
          const d = String(node.attrs?.path || node.attrs?.d || '');
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
    [getNodeBox, listNodeIds, camera.zoom]
  );

  useEffect(() => {
    setSceneHitTestBridge(hitTest);
    return () => setSceneHitTestBridge(null);
  }, [hitTest]);


  const hitTestFrame = useCallback((x: number, y: number) => {
    const frames: any[] = Array.isArray(documentRef.current?.frames)
      ? documentRef.current.frames
      : [];
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const frame = frames[i];
      if (!frame || frame.locked) continue;
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
      if (!frameId) {
        dispatch(setActiveFrameId(null));
        return;
      }
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
      dispatch(setActiveFrameId(frameId));
    },
    [dispatch]
  );

  const onSelectFrames = useCallback(
    (frameIds: string[]) => {
      const ids = Array.isArray(frameIds) ? frameIds.filter(Boolean) : [];
      if (!ids.length) {
        dispatch(setActiveFrameId(null));
        return;
      }
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedFrameIds(ids));
    },
    [dispatch]
  );

  const onSelectMixed = useCallback(
    (nodeIds: string[], frameIds: string[], opts?: { additive?: boolean }) => {
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
    [dispatch]
  );

  const onSelect = useCallback(
    (ids: string[], opts?: { additive?: boolean }) => {
      // Allow selection in read-only Dev/preview so inspect annotations work.
      // Do not re-select after text blur: blank click must clear focus/selection.
      keepSelectAfterTextEditRef.current = null;
      const doc = documentRef.current;
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
    [dispatch]
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
        frames.forEach((fp) => {
          dispatch(
            updateArtboardFrame({
              id: fp.id,
              skipHistory: true,
              patch: { x: fp.x, y: fp.y, width: fp.width, height: fp.height },
            })
          );
        });
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
            const isImage = next?.deltaSetLike?.[p.nodeId]?.key === 'image';
            const didResize = Boolean(el?.__sceneDidResize);
            clearSceneDragPreview(board.nodeEls, p.nodeId);
            if ((didResize && !isImage) || isStrokeShape || isText) {
              void replaceShapePaint(next, board.nodeEls, p.nodeId, board.root ? board : null);
              return;
            }
            const synced = previewSvgNodeGeometry(board.nodeEls, p.nodeId, p);
            if (!synced && !isImage) {
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
      // Preview mutates documentRef only — Redux still holds the pre-gesture doc.
      if (!options?.skipHistory) dispatch(pushEditorHistory());
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
    },
    [readOnly, normalizeGeomPatches, toGeometryPatches, applyFrameGeometryPatches]
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

  const placeImageAt = useCallback(
    (src: string, x: number, y: number) => {
      if (readOnly) return;
      void (async () => {
        try {
          const natural = await measureImageNaturalSize(src);
          const { width, height } = fitImageSize(natural.width, natural.height, 2400);
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
    const center = view && (stageEl || paperEl)
      ? pointerToWorld(
          camera,
          { stageEl, paperEl, artboard },
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

        console.log('[pencil-erase] apply', {
          id,
          brushId,
          strokeWidth,
          srcPathPressure: Boolean(srcPressure),
          srcPathPressureParts: srcPressure ? srcPressure.split(',').length : 0,
          fragments: fragments.length,
          eraseRadius: stroke.radius,
          erasePts: stroke.points.length,
        });

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
          console.log('[pencil-erase] node', {
            nid,
            borderWidth: nnode.attrs?.['border-width'] ?? nnode.attrs?.strokeWidth,
            brushStyle: nnode.attrs?.brushStyle,
            hasPathPressure: Boolean(nnode.attrs?.pathPressure),
            pathPts: String(nnode.attrs?.path || '').match(/[ML]/gi)?.length ?? 0,
            pressureParts: frag.pathPressure ? frag.pathPressure.split(',').length : 0,
          });
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
      dispatch(setDocument(removeNodesFromDocument(documentRef.current, ids)));
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
      // Persist ASAP — refresh must not restore deleted nodes from a stale cloud doc.
      requestProjectFlush();
    },
    [dispatch]
  );

  const copySelected = useCallback((ids: string[]) => {
    const snap = snapshotNodesForClipboard(documentRef.current, ids);
    if (!snap) return false;
    clipboardRef.current = snap;
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
    const ids = selectedFrameIdsRef.current.length
      ? selectedFrameIdsRef.current
      : activeFrameIdRef.current
        ? [activeFrameIdRef.current]
        : [];
    if (!ids.length) return false;
    dispatch(removeArtboardFrames(ids));
    requestProjectFlush();
    return true;
  }, [dispatch]);

  // Context menu: infinite paper is 0×0 — listen on stage (same as SelectionFeature).
  useEffect(() => {
    const hitEl = stageEl || paperEl;
    if (readOnly || !hitEl) return undefined;

    const skipSel =
      '[data-sel-toolbar],[data-frame-toolbar],[data-ctx-menu],[data-export-panel],[data-image-label],[data-frame-label],[data-crop-expand-overlay],[data-crop-expand-toolbar],[data-image-tool-panel],[data-text-inline-editor]';

    const onCtx = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(skipSel)) return;
      // Ignore right-clicks outside the canvas stage (e.g. side panels).
      if (stageEl && target && !stageEl.contains(target) && target !== stageEl) return;

      e.preventDefault();
      e.stopPropagation();

      const p = pointerToWorld(camera, { stageEl, paperEl, artboard }, e.clientX, e.clientY);
      const id = hitTest(p.x, p.y, { clientX: e.clientX, clientY: e.clientY });
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
            // Keep multi-frame selection if this frame is already in the set.
            if (!selectedFrameIdsRef.current.includes(frameId)) {
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

    hitEl.addEventListener('contextmenu', onCtx);
    return () => hitEl.removeEventListener('contextmenu', onCtx);
  }, [paperEl, stageEl, camera, readOnly, artboard, hitTest, dispatch]);

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
      // Box / multi-select → one group chip (unless right-click landed on an unselected node).
      if (
        ids.length > 1 &&
        (!hitNodeId || ids.includes(hitNodeId))
      ) {
        onAddToChat?.(ids);
      } else {
        const id = hitNodeId || ids[0];
        if (id) {
          onAddToChat?.(id);
        } else if (menuFrameId) {
          // Artboard selected (no node under cursor) — pin the frame into Chat.
          onAddToChat?.(`frame:${menuFrameId}`);
        }
      }
      dispatch(setSelectedNodeIds([]));
      dispatch(setSelectedNodeId(null));
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
      void pasteFromOsOrInternal(placeAt ? { anchor: placeAt } : undefined);
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
    void (async () => {
      const at = imagePlaceAtRef.current;
      imagePlaceAtRef.current = null;
      try {
        const preview = await readFileAsDataUrl(file);
        const natural = await measureImageNaturalSize(preview);
        const { width, height } = fitImageSize(natural.width, natural.height, 2400);
        let x: number | undefined;
        let y: number | undefined;
        if (at) {
          const placed = rcbCenterOnPoint({ x: at.x, y: at.y }, { width, height });
          const latest = documentRef.current;
          if (latest) {
            const origin = sceneToDocumentCoords(latest, placed.left, placed.top);
            x = origin.x;
            y = origin.y;
          }
        } else {
          // Viewport center (same as pendingImageSrc auto-place).
          const view =
            overlayRoot?.getBoundingClientRect() ||
            paperEl?.parentElement?.getBoundingClientRect() ||
            null;
          if (view && (stageEl || paperEl)) {
            const center = pointerToWorld(
              camera,
              { stageEl, paperEl, artboard },
              view.left + view.width / 2,
              view.top + view.height / 2
            );
            const placed = rcbCenterOnPoint(center, { width, height });
            const latest = documentRef.current;
            if (latest) {
              const origin = sceneToDocumentCoords(latest, placed.left, placed.top);
              x = origin.x;
              y = origin.y;
            }
          }
        }
        dispatch(
          startImageUploadPlaceholder({
            src: preview,
            width,
            height,
            x,
            y,
            label: '上传中',
            name: file.name?.replace(/\.[^.]+$/, '') || 'Image',
          })
        );
        finishToSelect();
        const uploaded = await uploadImageFile(file);
        dispatch(
          finishImageProcess({
            src: uploaded.url,
            attrs: uploaded.key ? { uploadKey: uploaded.key } : undefined,
          })
        );
      } catch (err: any) {
        dispatch(failImageProcess({}));
        const detail = err?.response?.data?.detail || err?.message || '图片上传失败';
        message.error(typeof detail === 'string' ? detail : '图片上传失败');
      }
    })();
  };

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
          { stageEl, paperEl, artboard },
          view.left + view.width / 2,
          view.top + view.height / 2
        );
        const placed = rcbCenterOnPoint(center, size);
        return sceneToDocumentCoords(doc, placed.left, placed.top);
      }
      return { x: 40, y: 40 };
    },
    [artboard, camera, overlayRoot, paperEl, stageEl]
  );

  const insertPastedText = useCallback(
    (text: string, anchor?: { x: number; y: number } | null) => {
      const doc = documentRef.current;
      const content = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (!doc || readOnly || !content.trim()) return false;
      const probe = createTextNode({ text: content, autoSize: true });
      const origin =
        placeOriginForSize(
          { width: Number(probe.node.width) || 160, height: Number(probe.node.height) || 24 },
          anchor
        ) || { x: 40, y: 40 };
      const { id, node } = createTextNode({
        x: origin.x,
        y: origin.y,
        text: content,
        autoSize: true,
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([id]));
      dispatch(setSelectedNodeId(id));
      finishToSelect();
      return true;
    },
    [dispatch, placeOriginForSize, readOnly]
  );

  const insertPastedSvg = useCallback(
    (markup: string, anchor?: { x: number; y: number } | null) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return false;
      const decoded = decodeClipboardSvgText(markup);
      if (!looksLikeSvgMarkup(decoded)) return false;
      const { width, height, svg } = measureSvgMarkupSize(decoded);
      const origin = placeOriginForSize({ width, height }, anchor) || { x: 40, y: 40 };
      const { id, node } = createSvgNode({
        x: origin.x,
        y: origin.y,
        width,
        height,
        svg,
        name: 'SVG',
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([id]));
      dispatch(setSelectedNodeId(id));
      finishToSelect();
      return true;
    },
    [dispatch, placeOriginForSize, readOnly]
  );

  const pasteSystemPayload = useCallback(
    async (
      payload: SystemPastePayload,
      opts?: { anchor?: { x: number; y: number } | null }
    ): Promise<boolean> => {
      if (readOnly) return false;
      const anchor = opts?.anchor ?? null;
      if (payload.kind === 'text') return insertPastedText(payload.text, anchor);
      if (payload.kind === 'svg') return insertPastedSvg(payload.markup, anchor);
      if (payload.kind === 'image') {
        if (fileLooksLikeSvg(payload.file)) {
          try {
            const markup = decodeClipboardSvgText(await payload.file.text());
            if (looksLikeSvgMarkup(markup)) return insertPastedSvg(markup, anchor);
          } catch {
            /* fall through to raster upload */
          }
        }
        imagePlaceAtRef.current = anchor;
        onImageFile(payload.file);
        return true;
      }
      return false;
    },
    [insertPastedSvg, insertPastedText, readOnly]
  );

  /** OS clipboard (image / SVG / text) first, then in-app node clipboard. */
  const pasteFromOsOrInternal = useCallback(
    async (opts?: {
      anchor?: { x: number; y: number } | null;
      data?: DataTransfer | null;
    }) => {
      if (readOnly) return;
      const hasInternal = Boolean(clipboardRef.current?.nodes?.length);
      const fromEvent = await readSystemPastePayload(opts?.data ?? null);
      const fromNav =
        !fromEvent && !opts?.data ? await readSystemPasteFromNavigator() : null;
      const system = fromEvent || fromNav;

      // Images / SVG icons always win over in-app node clipboard.
      if (system && (system.kind === 'image' || system.kind === 'svg')) {
        const ok = await pasteSystemPayload(system, { anchor: opts?.anchor });
        if (ok) return;
      }

      // In-app copy/paste of scene nodes (Ctrl+C then Ctrl+V).
      if (hasInternal) {
        pasteClipboard(opts?.anchor ? { anchor: opts.anchor } : undefined);
        return;
      }

      // Plain text only when nothing was copied inside the editor.
      if (system?.kind === 'text') {
        await pasteSystemPayload(system, { anchor: opts?.anchor });
      }
    },
    [pasteClipboard, pasteSystemPayload, readOnly]
  );

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

    /** Agent composer steals focus when selection syncs chips — still allow canvas Delete. */
    const isAgentComposerTarget = (t: HTMLElement | null) =>
      Boolean(t?.closest?.('[data-agent-composer]'));

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing = isTypingTarget(target);
      const inAgentComposer = isAgentComposerTarget(target);

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
      if (mod && e.shiftKey && e.key.toLowerCase() === 'l' && !typing) {
        const ids = selectedIdsRef.current;
        if (ids.length > 1) {
          e.preventDefault();
          onAddToChat?.(ids);
          dispatch(setSelectedNodeIds([]));
          dispatch(setSelectedNodeId(null));
          return;
        }
        const id = ids[0];
        if (id) {
          e.preventDefault();
          onAddToChat?.(id);
          dispatch(setSelectedNodeIds([]));
          dispatch(setSelectedNodeId(null));
          return;
        }
        if (activeFrameIdRef.current) {
          e.preventDefault();
          onAddToChat?.(`frame:${activeFrameIdRef.current}`);
          dispatch(setSelectedNodeIds([]));
          dispatch(setSelectedNodeId(null));
        }
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
          // System paste (image / text / SVG) is handled by the `paste` listener.
          // Do not preventDefault here or clipboardData is lost.
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
        // Real text fields / inline editors — never steal Delete.
        if (typing && !inAgentComposer) return;
        // Agent composer: if the user is typing a prompt, keep Backspace for text.
        // Empty / chip-only composer still deletes the canvas selection (Delete always).
        if (inAgentComposer && e.key === 'Backspace') {
          const el = target?.closest?.('[data-agent-composer]') as HTMLElement | null;
          const text = (el?.innerText || '').replace(/\u200b/g, '').trim();
          if (text) return;
        }
        // Fill / color panels handle Delete for gradient stops etc. (only while focused inside).
        if (target?.closest?.('[data-fill-panel], [data-color-panel]')) return;
        const ids = selectedIdsRef.current;
        const frameIds = selectedFrameIdsRef.current;
        if (ids.length || frameIds.length || activeFrameIdRef.current) {
          e.preventDefault();
          if (ids.length) deleteSelected(ids);
          if (frameIds.length || (!ids.length && activeFrameIdRef.current)) {
            deleteActiveFrame();
          }
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
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
    pasteFromOsOrInternal,
    duplicateSelected,
    onAddToChat,
  ]);

  // System clipboard: paste images (auto-upload), SVG icons, or plain text onto the canvas.
  useEffect(() => {
    if (readOnly) return undefined;

    const isTypingTarget = (t: HTMLElement | null) =>
      Boolean(
        t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.isContentEditable ||
            t.closest?.(
              '[data-fill-panel], [data-color-panel], [data-select-dropdown], [data-frame-label], [data-text-inline-editor], [data-agent-composer]'
            ))
      );

    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target)) return;

      const hasInternal = Boolean(clipboardRef.current?.nodes?.length);
      const data = e.clipboardData;
      // Peek synchronously so we know whether to claim the event.
      let likelyOs = false;
      if (data) {
        if (data.files?.length) likelyOs = true;
        else {
          try {
            for (const item of Array.from(data.items || [])) {
              if (item.kind === 'file' || item.type.startsWith('image/')) {
                likelyOs = true;
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (!likelyOs) {
          const plain = String(data.getData('text/plain') || '').trim();
          if (plain) likelyOs = true;
        }
      }

      if (!likelyOs && !hasInternal) return;

      e.preventDefault();
      e.stopPropagation();
      void pasteFromOsOrInternal({ data });
    };

    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [pasteFromOsOrInternal, readOnly]);

  const bgType = parseFillType(document?.backgroundFillType);
  const bgOpacity = Number(document?.backgroundOpacity ?? 100);
  const bgColor = String(document?.backgroundColor || '#ffffff');
  const paperBackground =
    bgType === 'solid'
      ? cssSolidWithOpacity(bgColor, bgOpacity)
      : bgType === 'image'
        ? (() => {
            const src = String(document?.backgroundImageSrc || '');
            if (!src) return cssSolidWithOpacity(bgColor, bgOpacity);
            return `url(${src}) center / cover no-repeat`;
          })()
        : cssPreviewForGradient(
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

  const ids = useMemo(() => {
    if (selectedNodeIds?.length > 0) return selectedNodeIds;
    if (selectedNodeId) return [selectedNodeId];
    return EMPTY_NODE_IDS;
  }, [selectedNodeIds, selectedNodeId]);

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

  // Select / inspect: Dev+readOnly (share preview) still needs hit-test + spacing overlays.
  // Path-edit owns the pointer (anchors / draft pen) — do not let SelectionFeature
  // clear selection on empty click (that unmounts path-edit and looks like “auto exit”).
  const selectMode =
    (activeTool === 'select' || activeTool === 'scale') &&
    (!readOnly || workspaceMode === 'dev') &&
    !editingPenId;
  const shapeMode = !readOnly && activeTool === 'shape';
  const textMode = !readOnly && activeTool === 'text';
  const imageMode = !readOnly && activeTool === 'image';
  const pencilMode = !readOnly && activeTool === 'pencil';
  const penMode = !readOnly && activeTool === 'pen';

  return (
    <div className={embedded ? 'contents' : 'relative canvas-stage'}>
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
            : 'canvas-paper relative shadow-[0_8px_40px_rgba(15,23,42,0.12)] ring-1 ring-black/5'
        }
      >
        {infinite ? (
          <RcbShapesLayer
            document={document}
            reloadToken={reloadToken}
            documentPatchToken={documentPatchToken}
            lastPatchedNodeIds={lastPatchedNodeIds}
            hiddenNodeId={editingTextId}
          />
        ) : null}
        {/* Scene-space HTML overlays (selection / draw previews). Origin matches SVG. */}
        <div className="absolute left-0 top-0 z-20 h-0 w-0 overflow-visible">
          <SelectionFeature
            enabled={selectMode}
            readOnly={readOnly}
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
            onDeleteSelected={() => deleteSelected(ids)}
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
              // Keep chrome while editing radius so the outline can follow rounded corners.
              (shapeStylePanelOpen && shapeStylePanel?.kind !== 'radius')
            }
            onTransformingChange={setGeometryTransforming}
          />
          <ImageProcessOverlay document={document} hidden={geometryTransforming} />
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
        canDelete={Boolean(
          ids.length ||
            ctxMenu?.nodeId ||
            ctxMenu?.frameId ||
            selectedFrameIds.length ||
            activeFrameId
        )}
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
