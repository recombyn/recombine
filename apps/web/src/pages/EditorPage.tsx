import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineHome,
  HiOutlineMap,
  HiOutlineMinus,
  HiOutlinePlus,
  HiOutlineQuestionMarkCircle,
  HiOutlineShare,
  HiOutlineSquare3Stack3D,
} from 'react-icons/hi2';
import { TbMessage2Filled } from 'react-icons/tb';
import { Tooltip } from '@/components/base';
import {
  peekHomeAgentBoot,
  clearHomeAgentBoot,
  attachmentsFromBoot,
} from '@/utils/homeAgentBoot';
import { withReturnTo } from '@/utils/authReturnTo';
import { store } from '@/store';
import { useProjectCloudSync } from '@/components/editor/useProjectCloudSync';
import type { ComposerContext } from '@/components/editor/panels/AgentComposerInput';
import AgentDock from '@/components/editor/panels/AgentDock';
import DevPropertiesPanel from '@/components/editor/panels/DevPropertiesPanel';
import ShareDialog from '@/components/editor/panels/ShareDialog';
import { EditorTopExportButton } from '@/components/editor/panels/ExportSelectionPanel';
import EditorBootOverlay from '@/components/editor/chrome/EditorBootOverlay';
import {
  RcbCanvas,
  RcbSvgDefs,
  RCB_DEFAULT_CAMERA as DEFAULT_CAMERA,
  zoomAtPoint,
  type RcbCamera as CanvasCamera,
} from '@/components/rcb';
import LayerPanel from '@/components/editor/panels/LayerPanel';
import ImageProcessWatcher from '@/components/editor/nodes/ImageNode/ImageProcessWatcher';
import CropExpandSessionHost from '@/components/editor/nodes/ImageNode/cropExpand/CropExpandSessionHost';
import ImageToolPanelHost from '@/components/editor/nodes/ImageNode/toolPanels/ImageToolPanelHost';
import ShapeStylePanelHost from '@/components/editor/nodes/ShapeNode/ShapeStylePanelHost';
import MeshHandlesOverlay from '@/components/editor/nodes/ShapeNode/MeshHandlesOverlay';
import SvgCanvas from '@/components/editor/canvas/svg/SvgCanvas';
import EditorToolStrip from '@/components/editor/chrome/EditorToolStrip';
import EditorMinimap from '@/components/editor/chrome/EditorMinimap';
import PenStrokeToolbar from '@/components/editor/chrome/PenStrokeToolbar';
import BucketFillToolbar from '@/components/editor/chrome/BucketFillToolbar';
import { PathEditToolbar, type PathEditSubtool } from '@/components/editor/chrome/FloatingToolbar';
import AlignGuidesOverlay, {
  type AlignGuide,
} from '@/components/rcb/selection/AlignGuidesOverlay';
import {
  nodeGuideBoxes,
  snapBoxToGuides,
  snapResizeToGuides,
  getSnapThreshold,
} from '@/components/rcb/selection/alignGuides';
import type { ResizeHandle } from '@/components/rcb/selection/resizeGeometry';
import { cn } from '@/utils/classnames';
import { fetchProject } from '@/apis/projects';
import {
  createTemplate,
  importDocument,
  openTemplate,
  renameTemplate,
  addArtboardFrame,
  setActiveFrameId,
  setMixedSelection,
  renameArtboardFrame,
  setCanvasMeta,
  setActiveTool,
  setSelectedNodeId,
  setSelectedNodeIds,
  setWorkspaceMode,
  updateArtboardFrame,
  pushEditorHistory,
  undo,
  redo,
} from '@/store/modules/editor';
import {
  HtmlArtboardFrame,
  FrameDrawFeature,
  FrameMoveFeature,
} from '@/components/rcb';
import FrameContextToolbar from '@/components/editor/nodes/FrameNode/FrameContextToolbar';
import type { ArtboardFrame } from '@/components/rcb/frames/types';
import CanvasBgPicker from '@/components/editor/chrome/CanvasBgPicker';
import type { FillPanelValue } from '@/components/editor/panels/FillPanel';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import {
  cssPreviewForGradient,
  DEFAULT_FILL_IMAGE_ADJUST,
  parseFillGradient,
  parseFillImageFit,
  parseFillType,
  serializeFillGradient,
  type FillType,
} from '@/components/rcb/scene/sceneFill';
import WalletAccountChip from '@/components/layout/WalletAccountChip';
import EditorOnboardingTour from '@/components/editor/chrome/EditorOnboardingTour';

const BOOT_MIN_MS = 520;
const BOOT_EXIT_MS = 280;

function documentToCanvasFill(document: any, themeFallback: string): FillPanelValue {
  const raw = String(document?.backgroundColor || '').trim();
  const fillType = parseFillType(document?.backgroundFillType);
  const panelType = (
    fillType === 'linear' ||
    fillType === 'radial' ||
    fillType === 'angular' ||
    fillType === 'diffuse' ||
    fillType === 'image'
      ? fillType
      : 'solid'
  ) as FillType;

  return {
    fillType: panelType,
    fillColor: raw || themeFallback,
    fillOpacity: Number(document?.backgroundOpacity ?? 100),
    fillGradient: document?.backgroundGradient,
    fillImageSrc: document?.backgroundImageSrc,
    fillImageFit: parseFillImageFit(document?.backgroundImageFit),
    fillImageRotate: document?.backgroundImageRotate,
    fillImageAdjust: document?.backgroundImageAdjust || DEFAULT_FILL_IMAGE_ADJUST,
  };
}

function canvasFillToDocumentMeta(next: FillPanelValue, followTheme: boolean) {
  return {
    backgroundColor: followTheme ? '' : next.fillColor,
    backgroundFillType: next.fillType,
    backgroundOpacity: next.fillOpacity,
    backgroundGradient: next.fillGradient,
    backgroundImageSrc: next.fillImageSrc,
    backgroundImageFit: next.fillImageFit,
    backgroundImageRotate: next.fillImageRotate,
    backgroundImageAdjust: next.fillImageAdjust,
  };
}

function framesBounds(frames: ArtboardFrame[]) {
  if (!frames.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of frames) {
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.width);
    maxY = Math.max(maxY, f.y + f.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

const EDITOR_PAN_BLOCK_SELECTOR = [
  '[data-scene-node-id]',
  '[data-sel-box]',
  '[data-sel-handle]',
  '[data-frame-label]',
  '[data-image-label]',
  '[data-frame-toolbar]',
  '[data-sel-toolbar]',
  '[data-ctx-menu]',
  '[data-crop-expand-overlay]',
  '[data-crop-expand-toolbar]',
  '[data-image-tool-panel]',
  '[data-gradient-handles]',
  '[data-mesh-handles]',
  '[data-shape-style-panel]',
].join(',');

function computeWorldSurface(doc: any, frames: ArtboardFrame[]) {
  let maxX = 3600;
  let maxY = 2400;
  for (const f of frames) {
    maxX = Math.max(maxX, f.x + f.width + 400);
    maxY = Math.max(maxY, f.y + f.height + 400);
  }
  const children: string[] = doc?.deltaSetLike?.ROOT?.children || [];
  for (const id of children) {
    const node = doc?.deltaSetLike?.[id];
    if (!node) continue;
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const w = Math.max(1, Number(node.width) || 0);
    const h = Math.max(1, Number(node.height) || 0);
    maxX = Math.max(maxX, x + w + 400);
    maxY = Math.max(maxY, y + h + 400);
  }
  return { x: 0, y: 0, width: Math.ceil(maxX), height: Math.ceil(maxY) };
}

/** Legacy / empty document canvas colors ? follow `--canvas` with the active theme. */
const THEME_FOLLOW_CANVAS_BGS = new Set([
  '',
  'transparent',
  '#fff',
  '#ffffff',
  '#f0f0f0',
  '#f3f3f3',
  '#f5f5f5',
  '#fafafa',
]);

function isThemeFollowCanvasBg(raw: string) {
  return THEME_FOLLOW_CANVAS_BGS.has(String(raw || '').trim().toLowerCase());
}

function useThemeCanvasColor() {
  const [color, setColor] = useState('#f5f5f5');
  useEffect(() => {
    const read = () => {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--canvas')
        .trim();
      if (v) setColor(v);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => obs.disconnect();
  }, []);
  return color;
}

function HudBtn({
  tip,
  active,
  disabled,
  onClick,
  children,
  className,
  'data-tour': dataTour,
}: {
  tip: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  'data-tour'?: string;
}) {
  return (
    <Tooltip title={tip} placement="top">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        data-tour={dataTour}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded transition-colors',
          active
            ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
            : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
          'disabled:cursor-not-allowed disabled:opacity-35',
          className
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Shared optical size for bottom-left HUD glyphs. */
const HUD_ICON = 'h-[15px] w-[15px] shrink-0';
const HUD_ICON_STROKE = 1.75;

export default function EditorPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const [camera, setCamera] = useState<CanvasCamera>(DEFAULT_CAMERA);
  const [agentOpen, setAgentOpen] = useState(true);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [agentDraft, setAgentDraft] = useState<string | null>(null);
  const [agentAutoSubmit, setAgentAutoSubmit] = useState(false);
  const [agentDraftAttachments, setAgentDraftAttachments] = useState<ComposerContext[]>([]);
  const [agentDraftModelId, setAgentDraftModelId] = useState<string | null>(null);
  const [agentDraftImageAspect, setAgentDraftImageAspect] = useState<string | null>(null);
  const [agentDraftImageQuality, setAgentDraftImageQuality] = useState<string | null>(null);
  const [agentDraftImageResolution, setAgentDraftImageResolution] = useState<string | null>(null);
  const [agentDraftScene, setAgentDraftScene] = useState<
    'website' | 'mobile' | 'image' | 'poster' | null
  >(null);
  const [attachToChat, setAttachToChat] = useState<string | string[] | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [canvasBgOpen, setCanvasBgOpen] = useState(false);
  const [pathEditOpen, setPathEditOpen] = useState(false);
  const [pathEditSubtool, setPathEditSubtool] = useState<PathEditSubtool>('select');
  const [canvasMeshSelectedIndex, setCanvasMeshSelectedIndex] = useState(0);
  const [canvasMeshShowGuides, setCanvasMeshShowGuides] = useState(true);
  const themeCanvas = useThemeCanvasColor();
  const [bootOpen, setBootOpen] = useState(true);
  const [bootExiting, setBootExiting] = useState(false);
  const [bootProgress, setBootProgress] = useState(8);
  const [forceTour, setForceTour] = useState(false);
  const bootStartedAt = useRef(Date.now());
  const bootOpenRef = useRef(true);
  const bootFinishingRef = useRef(false);
  const bootExitTimer = useRef<number | null>(null);
  /** Apply sessionStorage home boot at most once per EditorPage lifetime. */
  const homeAgentBootAppliedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const [movingFrameId, setMovingFrameId] = useState<string | null>(null);
  const [frameGuides, setFrameGuides] = useState<AlignGuide[]>([]);
  const document = useSelector((state: any) => state.editor.document);
  useProjectCloudSync();
  const sceneReloadToken = useSelector((state: any) => state.editor.sceneReloadToken);
  const documentPatchToken = useSelector((state: any) => state.editor.documentPatchToken);
  const lastPatchedNodeIds = useSelector(
    (state: any) => (state.editor.lastPatchedNodeIds as string[]) || []
  );
  const selectedNodeId = useSelector((state: any) => state.editor.selectedNodeId);
  const selectedNodeIds = useSelector((state: any) => state.editor.selectedNodeIds || []);
  const selectedFrameIds = useSelector(
    (state: any) => (state.editor.selectedFrameIds as string[] | undefined) || []
  );
  const currentId = useSelector((state: any) => state.editor.currentId as string | null);
  const templates = useSelector((state: any) => state.editor.templates as any[]);
  const currentTemplate = useSelector((state: any) =>
    state.editor.templates.find((item: any) => item.id === state.editor.currentId)
  );
  const activeTool = useSelector((state: any) => state.editor.activeTool);
  const workspaceMode = useSelector(
    (state: any) => state.editor.workspaceMode || 'design'
  ) as 'design' | 'dev';
  const canUndo = useSelector((state: any) => (state.editor.historyPast?.length || 0) > 0);
  const canRedo = useSelector((state: any) => (state.editor.historyFuture?.length || 0) > 0);

  useEffect(() => {
    const onPathEdit = (e: Event) => {
      const active = Boolean((e as CustomEvent).detail?.active);
      setPathEditOpen(active);
      // Keep toolbar in sync with canvas: Select is the default when entering path edit.
      if (active) setPathEditSubtool('select');
    };
    const onSubtool = (e: Event) => {
      const s = (e as CustomEvent).detail?.subtool;
      setPathEditSubtool(s === 'pen' ? 'pen' : 'select');
    };
    window.addEventListener('resume:path-edit', onPathEdit);
    window.addEventListener('resume:path-edit-subtool', onSubtool);
    return () => {
      window.removeEventListener('resume:path-edit', onPathEdit);
      window.removeEventListener('resume:path-edit-subtool', onSubtool);
    };
  }, []);

  const followThemeCanvas = isThemeFollowCanvasBg(String(document?.backgroundColor || ''));
  const canvasFillValue = useMemo(
    () => documentToCanvasFill(document, themeCanvas),
    [document, themeCanvas]
  );
  const stageBackground = useMemo(() => {
    const type = parseFillType(document?.backgroundFillType);
    const opacity = Number(document?.backgroundOpacity ?? 100);
    const baseColor = followThemeCanvas
      ? themeCanvas
      : String(document?.backgroundColor || '').trim() || themeCanvas;

    if (followThemeCanvas && type === 'solid' && opacity >= 100) return undefined;

    if (type === 'solid' || !document?.backgroundFillType) {
      return cssSolidWithOpacity(baseColor, opacity);
    }
    if (type === 'image') {
      const src = String(document?.backgroundImageSrc || '');
      if (!src) return cssSolidWithOpacity(baseColor, opacity);
      return `url(${src}) center / cover no-repeat`;
    }
    const gradient = parseFillGradient(document?.backgroundGradient, type, baseColor);
    return cssPreviewForGradient({ ...gradient, type }, opacity);
  }, [
    document?.backgroundFillType,
    document?.backgroundColor,
    document?.backgroundOpacity,
    document?.backgroundGradient,
    document?.backgroundImageSrc,
    followThemeCanvas,
    themeCanvas,
  ]);

  /** Editor UI is design-only; hide legacy Design/Dev toggle. */
  useEffect(() => {
    dispatch(setWorkspaceMode('design'));
  }, [dispatch]);

  const isDevMode = workspaceMode === 'dev';
  const panMode = activeTool === 'pan';
  const frameMode = !isDevMode && activeTool === 'frame';

  const frames: ArtboardFrame[] = Array.isArray(document?.frames) ? document.frames : [];
  const activeFrameId = document?.activeFrameId ?? null;
  const activeFrame = frames.find((f) => f.id === activeFrameId) ?? null;
  const selectedFrames = frames.filter((f) =>
    selectedFrameIds.length
      ? selectedFrameIds.includes(f.id)
      : Boolean(activeFrameId && f.id === activeFrameId)
  );
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageEl;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setStageSize({ width: Math.max(1, r.width), height: Math.max(1, r.height) });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageEl]);
  // Scene paper follows content bounds only. Camera pan/zoom is CSS on RcbCanvas —
  // never resize/slide SVG viewBox to chase the frustum.
  const worldSurface = document
    ? computeWorldSurface(document, frames)
    : { x: 0, y: 0, width: 3600, height: 2400 };
  const paperWorld = useMemo(
    () => ({ x: 0, y: 0, width: worldSurface.width, height: worldSurface.height }),
    [worldSurface.width, worldSurface.height]
  );
  // Camera autofit only around real content / frames; empty world keeps default zoom.
  const worldBounds = frames.length
    ? framesBounds(frames)
    : { x: 0, y: 0, width: 0, height: 0 };

  /** Stable embedded scene doc — avoid `document={{...}}` identity churn each render. */
  const canvasDocument = useMemo(() => {
    if (!document) return null;
    return {
      ...document,
      x: 0,
      y: 0,
      // Content bounds only — viewport coverage is handled by viewRect, not doc size.
      width: worldSurface.width,
      height: worldSurface.height,
      backgroundColor: 'transparent',
      backgroundFillType: 'solid' as const,
    };
  }, [document, worldSurface.width, worldSurface.height]);

  // Home "New project" / URL projectId / post-login ?from= intent (URL query).
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const createNew = params.get('createNew') === '1';
    const fromHomeAgent = params.get('fromHomeAgent') === '1';
    const targetId = decodeURIComponent((routeProjectId || '').trim());

    if (createNew) {
      dispatch(createTemplate({ emptyWorld: true }));
      const id = ((store.getState() as any).editor?.currentId as string | null) || '';
      // Jump straight to /editor/:id so we never rely on a second remounting route.
      if (id) {
        navigate(
          fromHomeAgent
            ? `/editor/${encodeURIComponent(id)}?fromHomeAgent=1`
            : `/editor/${encodeURIComponent(id)}`,
          { replace: true }
        );
      } else {
        navigate(fromHomeAgent ? '/editor?fromHomeAgent=1' : '/editor', { replace: true });
      }
      return;
    }

    if (targetId) {
      if (currentId === targetId && document) return;
      const local = templates.find((x) => x.id === targetId);
      if (local?.document) {
        dispatch(openTemplate(targetId));
        return;
      }
      void fetchProject(targetId)
        .then((res) => {
          if (cancelled) return;
          const proj = res.project;
          if (!proj?.document) {
            dispatch(createTemplate({ emptyWorld: true }));
            return;
          }
          dispatch(
            importDocument({
              id: proj.id,
              name: proj.name || t('home.untitled'),
              document: proj.document,
              source: 'user',
            })
          );
        })
        .catch(() => {
          if (!cancelled) dispatch(createTemplate({ emptyWorld: true }));
        });
      return;
    }

    if (!document) dispatch(createTemplate({ emptyWorld: true }));
    return () => {
      cancelled = true;
    };
    // Only re-run when route / nav intent changes — not on every doc edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, routeProjectId, location.search, navigate, t]);

  /** Home agent / plaza 「做同款」— prefill composer (peek until AgentDock consumes). */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('createNew') === '1') return;

    const fromFlag = params.get('fromHomeAgent') === '1';
    const boot = peekHomeAgentBoot();

    if (fromFlag) {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }

    if (!boot?.prompt || homeAgentBootAppliedRef.current) return;
    // URL flag, or orphaned auto-submit after a failed handoff.
    if (!fromFlag && !boot.autoSubmit) return;

    homeAgentBootAppliedRef.current = true;
    setAgentOpen(true);
    setAgentDraft(boot.prompt);
    setAgentAutoSubmit(Boolean(boot.autoSubmit));
    setAgentDraftAttachments(attachmentsFromBoot(boot));
    setAgentDraftModelId(boot.modelId ?? null);
    setAgentDraftImageAspect(boot.imageAspectRatio ?? null);
    setAgentDraftImageQuality(boot.imageQuality ?? null);
    setAgentDraftImageResolution(boot.imageResolution ?? null);
    setAgentDraftScene(boot.scene ?? null);
  }, [location.search, location.pathname, navigate]);

  // Keep /editor/:projectId in sync so refresh can reload the same project.
  useEffect(() => {
    if (!currentId) return;
    const pathId = decodeURIComponent((routeProjectId || '').trim());
    if (pathId === currentId) return;
    const params = new URLSearchParams(location.search);
    const q = new URLSearchParams();
    if (params.get('fromHomeAgent') === '1') q.set('fromHomeAgent', '1');
    const search = q.toString();
    navigate(
      {
        pathname: `/editor/${encodeURIComponent(currentId)}`,
        search: search ? `?${search}` : '',
      },
      { replace: true }
    );
  }, [currentId, routeProjectId, navigate, location.search]);

  useEffect(() => {
    setStageEl(stageRef.current);
  }, [document, frames.length, bootOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (workspaceMode === 'dev') return;
        e.preventDefault();
        setAgentOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setAgentOpen(false);
        setInspectOpen(false);
        setLayersOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspaceMode]);

  const finishBoot = () => {
    if (!bootOpenRef.current || bootFinishingRef.current) return;
    bootFinishingRef.current = true;
    const wait = Math.max(0, BOOT_MIN_MS - (Date.now() - bootStartedAt.current));
    window.setTimeout(() => {
      setBootProgress(100);
      setBootExiting(true);
      bootExitTimer.current = window.setTimeout(() => {
        bootOpenRef.current = false;
        setBootOpen(false);
        setBootExiting(false);
        bootExitTimer.current = null;
      }, BOOT_EXIT_MS);
    }, wait);
  };

  // Empty world has no SvgCanvas onReady ? finish boot immediately.
  useEffect(() => {
    if (document && frames.length === 0) finishBoot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, frames.length]);

  const onCommitFrame = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      dispatch(addArtboardFrame(rect));
      // Leave draw mode ? newly created frame is already activeFrameId.
      dispatch(setActiveTool('select'));
      dispatch(setSelectedNodeIds([]));
    },
    [dispatch]
  );

  const onMoveFrame = useCallback(
    (id: string, x: number, y: number) => {
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      const moving = {
        left: x,
        top: y,
        width: Math.max(1, Number(frame.width) || 1),
        height: Math.max(1, Number(frame.height) || 1),
      };
      const nodes = nodeGuideBoxes(document);
      const otherFrames = frames
        .filter((f) => f.id !== id)
        .map((f) => ({
          left: Number(f.x) || 0,
          top: Number(f.y) || 0,
          width: Math.max(1, Number(f.width) || 1),
          height: Math.max(1, Number(f.height) || 1),
        }));
      const threshold = getSnapThreshold(camera.zoom);
      // Snap artboard to scene nodes + sibling frames (same helpers as selection move).
      const snapped = snapBoxToGuides(moving, [...nodes, ...otherFrames], [], threshold);
      setFrameGuides(snapped.guides);
      dispatch(
        updateArtboardFrame({
          id,
          patch: {
            x: Math.round(snapped.box.left),
            y: Math.round(snapped.box.top),
          },
          skipHistory: true,
        })
      );
    },
    [camera.zoom, dispatch, document, frames]
  );

  const onResizeFrame = useCallback(
    (
      id: string,
      box: { left: number; top: number; width: number; height: number },
      handle: ResizeHandle
    ) => {
      const nodes = nodeGuideBoxes(document);
      const otherFrames = frames
        .filter((f) => f.id !== id)
        .map((f) => ({
          left: Number(f.x) || 0,
          top: Number(f.y) || 0,
          width: Math.max(1, Number(f.width) || 1),
          height: Math.max(1, Number(f.height) || 1),
        }));
      const threshold = getSnapThreshold(camera.zoom);
      const snapped = snapResizeToGuides(
        box,
        handle,
        [...nodes, ...otherFrames],
        [],
        threshold,
        40
      );
      setFrameGuides(snapped.guides);
      dispatch(
        updateArtboardFrame({
          id,
          patch: {
            x: Math.round(snapped.box.left),
            y: Math.round(snapped.box.top),
            width: Math.max(40, Math.round(snapped.box.width)),
            height: Math.max(40, Math.round(snapped.box.height)),
          },
          skipHistory: true,
        })
      );
    },
    [camera.zoom, dispatch, document, frames]
  );

  const frameContentBoxes = useMemo(() => nodeGuideBoxes(document), [document]);

  const onFrameMoveStart = useCallback(() => {
    dispatch(pushEditorHistory());
  }, [dispatch]);

  const onFrameMoveEnd = useCallback(() => {
    setMovingFrameId(null);
    setFrameGuides([]);
  }, []);

  const onFrameDraggingChange = useCallback((id: string | null) => {
    setMovingFrameId(id);
    if (!id) setFrameGuides([]);
  }, []);

  const onSelectFrame = useCallback(
    (id: string) => {
      dispatch(setActiveFrameId(id));
    },
    [dispatch]
  );

  const onClearCanvasSelection = useCallback(() => {
    dispatch(setMixedSelection({ nodeIds: [], frameIds: [] }));
  }, [dispatch]);

  useEffect(() => {
    if (!bootOpen || bootExiting) return undefined;
    const id = window.setInterval(() => {
      setBootProgress((p) => {
        if (p >= 90) return p;
        const step = 4 + Math.random() * 10;
        return Math.min(90, p + step);
      });
    }, 380);
    return () => window.clearInterval(id);
  }, [bootOpen, bootExiting]);

  useEffect(() => {
    if (!bootOpen) return undefined;
    const failSafe = window.setTimeout(() => finishBoot(), 12000);
    return () => window.clearTimeout(failSafe);
  }, [bootOpen]);

  useEffect(
    () => () => {
      if (bootExitTimer.current) window.clearTimeout(bootExitTimer.current);
    },
    []
  );

  const zoomAtStageCenter = useCallback((nextZoom: number) => {
    const el = stageRef.current;
    if (!el) {
      setCamera((c) => zoomAtPoint(c, nextZoom, 0, 0));
      return;
    }
    const r = el.getBoundingClientRect();
    setCamera((c) => zoomAtPoint(c, nextZoom, r.width / 2, r.height / 2));
  }, []);

  const onZoomIn = useCallback(() => {
    setCamera((c) => {
      const el = stageRef.current;
      const next = Math.min(8, Number((c.zoom * 1.1).toFixed(4)));
      if (!el) return { ...c, zoom: next };
      const r = el.getBoundingClientRect();
      return zoomAtPoint(c, next, r.width / 2, r.height / 2);
    });
  }, []);

  const onZoomOut = useCallback(() => {
    setCamera((c) => {
      const el = stageRef.current;
      const next = Math.max(0.05, Number((c.zoom / 1.1).toFixed(4)));
      if (!el) return { ...c, zoom: next };
      const r = el.getBoundingClientRect();
      return zoomAtPoint(c, next, r.width / 2, r.height / 2);
    });
  }, []);

  /** Select a layer and pan so its center sits in the current viewport (keep zoom). */
  const focusLayerNode = useCallback(
    (nodeId: string) => {
      dispatch(setSelectedNodeId(nodeId));
      const node = document?.deltaSetLike?.[nodeId];
      if (!node || !document) return;
      const { left, top } = nodeLeftTop(document, node);
      const w = Math.max(1, Number(node.width) || 1);
      const h = Math.max(1, Number(node.height) || 1);
      const cx = left + w / 2;
      const cy = top + h / 2;
      const el = stageRef.current;
      const vw = el?.clientWidth || el?.getBoundingClientRect().width || 0;
      const vh = el?.clientHeight || el?.getBoundingClientRect().height || 0;
      if (vw < 1 || vh < 1) return;
      setCamera((c) => {
        const z = Math.max(0.05, c.zoom || 1);
        return {
          zoom: c.zoom,
          x: vw / 2 - cx * z,
          y: vh / 2 - cy * z,
        };
      });
    },
    [dispatch, document]
  );

  const zoomPercent = Math.round(camera.zoom * 100);
  const projectName = currentTemplate?.name || t('home.untitled');

  return (
    <div
      className={cn(
        'relative flex h-screen flex-col overflow-hidden',
        followThemeCanvas && 'bg-[var(--canvas)]'
      )}
      style={stageBackground ? { background: stageBackground } : undefined}
    >
      <div className="relative flex min-h-0 flex-1">
        {layersOpen ? (
          <div className="relative z-30 h-full shrink-0">
            <LayerPanel onClose={() => setLayersOpen(false)} onSelectNode={focusLayerNode} />
          </div>
        ) : null}

        <main
          className={cn(
            'relative flex min-w-0 flex-1 flex-col overflow-hidden',
            followThemeCanvas && 'bg-[var(--canvas)]'
          )}
          style={stageBackground ? { background: stageBackground } : undefined}
        >
          {/* Top-left: home + title (no dropdown) */}
          <div className="pointer-events-none absolute left-4 top-3 z-20">
            <div className="pointer-events-auto flex items-center gap-2">
              <Tooltip title={t('editor.home', { defaultValue: '首页' })} placement="bottom">
                <button
                  type="button"
                  aria-label={t('editor.home', { defaultValue: '首页' })}
                  onClick={() => navigate('/home')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--line)]"
                >
                  <HiOutlineHome className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </Tooltip>
              <span className="inline-grid max-w-[min(16rem,40vw)] items-center">
                <span
                  className="invisible col-start-1 row-start-1 whitespace-pre px-1 text-[14px] font-medium"
                  aria-hidden
                >
                  {projectName || ' '}
                </span>
                <input
                  value={projectName}
                  onChange={(e) => dispatch(renameTemplate(e.target.value))}
                  aria-label={t('home.untitled')}
                  className="col-start-1 row-start-1 h-8 min-w-[2ch] border-0 bg-transparent px-1 text-[14px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
                />
              </span>
            </div>
          </div>

          {/* Top-right: export + share + chat + account */}
          <div className="pointer-events-none absolute right-4 top-3 z-20">
            <div className="pointer-events-auto flex items-center gap-2">
              <EditorTopExportButton />
              <Tooltip title={t('editor.share')} placement="bottom">
                <button
                  type="button"
                  aria-label={t('editor.share')}
                  onClick={() => setShareOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
                >
                  <HiOutlineShare className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {t('editor.share')}
                </button>
              </Tooltip>
              {!agentOpen ? (
                <button
                  type="button"
                  onClick={() => setAgentOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
                >
                  <TbMessage2Filled className="h-4 w-4 shrink-0 text-[var(--ink)]" />
                  {t('editor.chat')}
                </button>
              ) : null}
              <WalletAccountChip />
            </div>
          </div>

          {!isDevMode && pathEditOpen ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2">
              <PathEditToolbar
                subtool={pathEditSubtool}
                onSubtoolChange={(s) => {
                  setPathEditSubtool(s);
                  window.dispatchEvent(
                    new CustomEvent('resume:path-edit-subtool', { detail: { subtool: s } })
                  );
                  // Path-edit Pen is local — do not activate the bottom toolstrip Pen.
                  dispatch(setActiveTool('select'));
                }}
                onExit={() => {
                  window.dispatchEvent(new Event('resume:exit-path-edit'));
                  setPathEditOpen(false);
                }}
              />
            </div>
          ) : null}

          {!isDevMode && !pathEditOpen && (activeTool === 'pen' || activeTool === 'pencil') ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2">
              <PenStrokeToolbar
                mode={activeTool === 'pencil' ? 'pencil' : 'pen'}
                placement="dock"
              />
            </div>
          ) : null}

          {!isDevMode && activeTool === 'bucket' ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2">
              <BucketFillToolbar />
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            {document ? (
              <RcbCanvas
                artboard={worldBounds}
                camera={camera}
                onCameraChange={setCamera}
                panMode={panMode}
                emptyDragPans={false}
                panBlockSelector={EDITOR_PAN_BLOCK_SELECTOR}
                background={stageBackground}
                stageRef={stageRef}
                cursor={frameMode ? 'crosshair' : undefined}
                defs={<RcbSvgDefs />}
              >
                {frames.map((frame) => (
                  <HtmlArtboardFrame
                    key={`body-${frame.id}`}
                    frame={frame}
                    selected={
                      !isDevMode &&
                      (selectedFrameIds.length
                        ? selectedFrameIds.includes(frame.id)
                        : frame.id === activeFrameId)
                    }
                    layer="body"
                  />
                ))}

                {/* Shapes live directly under the camera world layer — no fixed paper size. */}
                <SvgCanvas
                  document={canvasDocument}
                  reloadToken={sceneReloadToken}
                  documentPatchToken={documentPatchToken}
                  lastPatchedNodeIds={lastPatchedNodeIds}
                  selectedNodeId={selectedNodeId}
                  selectedNodeIds={selectedNodeIds}
                  onZoomIn={onZoomIn}
                  onZoomOut={onZoomOut}
                  onReady={finishBoot}
                  embedded
                  stageEl={stageEl}
                  onOpenAgent={(opts) => {
                    if (workspaceMode === 'dev') return;
                    setAgentOpen(true);
                    if (opts?.prompt) setAgentDraft(opts.prompt);
                  }}
                  onAddToChat={(target) => {
                    if (workspaceMode === 'dev') return;
                    setAgentOpen(true);
                    setAttachToChat(target);
                  }}
                />

                <ImageProcessWatcher />
                <ImageToolPanelHost document={document} />
                <ShapeStylePanelHost document={document} />
                <CropExpandSessionHost document={document} />

                {canvasBgOpen && canvasFillValue.fillType === 'diffuse' ? (
                  <MeshHandlesOverlay
                    box={{
                      left: 0,
                      top: 0,
                      width: worldSurface.width,
                      height: worldSurface.height,
                    }}
                    gradient={{
                      ...parseFillGradient(
                        canvasFillValue.fillGradient,
                        'diffuse',
                        canvasFillValue.fillColor
                      ),
                      type: 'diffuse',
                    }}
                    selectedIndex={canvasMeshSelectedIndex}
                    showGuides={canvasMeshShowGuides}
                    onActivePointChange={setCanvasMeshSelectedIndex}
                    onChange={(next) => {
                      dispatch(
                        setCanvasMeta(
                          canvasFillToDocumentMeta(
                            {
                              ...canvasFillValue,
                              fillType: 'diffuse',
                              fillGradient: serializeFillGradient(next),
                              fillColor:
                                next.meshPoints?.[0]?.color || canvasFillValue.fillColor,
                            },
                            false
                          )
                        )
                      );
                    }}
                  />
                ) : null}
                {frames.map((frame) => (
                  <HtmlArtboardFrame
                    key={`label-${frame.id}`}
                    frame={frame}
                    selected={
                      !isDevMode &&
                      (selectedFrameIds.length
                        ? selectedFrameIds.includes(frame.id)
                        : frame.id === activeFrameId)
                    }
                    hideTitle={isDevMode || movingFrameId === frame.id}
                    onSelect={isDevMode ? undefined : () => onSelectFrame(frame.id)}
                    onRename={
                      isDevMode
                        ? undefined
                        : (name) => dispatch(renameArtboardFrame({ id: frame.id, name }))
                    }
                    onMove={isDevMode ? undefined : (x, y) => onMoveFrame(frame.id, x, y)}
                    onMoveStart={isDevMode ? undefined : onFrameMoveStart}
                    onMoveEnd={isDevMode ? undefined : onFrameMoveEnd}
                    layer="label"
                  />
                ))}

                {frameGuides.length ? (
                  <div
                    className="pointer-events-none absolute left-0 top-0 z-[50] overflow-visible"
                    style={{ width: worldSurface.width, height: worldSurface.height }}
                  >
                    <AlignGuidesOverlay guides={frameGuides} />
                  </div>
                ) : null}

                {!isDevMode &&
                selectedFrames.length === 1 &&
                selectedNodeIds.length === 0 &&
                activeFrame &&
                movingFrameId !== activeFrame.id ? (
                  <FrameContextToolbar frame={activeFrame} />
                ) : null}

                <FrameMoveFeature
                  enabled={!isDevMode && activeTool === 'select' && !panMode}
                  frames={frames}
                  camera={camera}
                  stageEl={stageEl}
                  activeFrameId={activeFrameId}
                  onSelect={onSelectFrame}
                  onClearSelection={onClearCanvasSelection}
                  onMoveStart={onFrameMoveStart}
                  onMove={onMoveFrame}
                  onResize={onResizeFrame}
                  onDraggingChange={onFrameDraggingChange}
                  contentBoxes={frameContentBoxes}
                />

                <FrameDrawFeature
                  enabled={!isDevMode && frameMode}
                  camera={camera}
                  stageEl={stageEl}
                  onCommit={onCommitFrame}
                />
              </RcbCanvas>
            ) : null}
          </div>

          {/* Fig.2 bottom-center tools — Design only */}
          {!isDevMode ? (
            <div
              data-tour="editor-tools"
              className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
            >
              <div className="pointer-events-auto">
                <EditorToolStrip camera={camera} stageEl={stageEl} />
              </div>
            </div>
          ) : null}

          {/* Bottom-left HUD */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20">
            {minimapOpen ? (
              <EditorMinimap
                document={document}
                frames={frames}
                camera={camera}
                stageEl={stageEl}
                activeFrameId={activeFrameId}
                selectedFrameIds={selectedFrameIds}
                selectedNodeIds={selectedNodeIds}
                onCameraChange={setCamera}
                canvasBg={stageBackground}
              />
            ) : null}
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-[var(--surface)] px-1.5 py-1 text-[12px] text-[var(--ink)] shadow-[0_8px_24px_rgba(0,0,0,0.14)] ring-1 ring-[var(--line)]">
              {!isDevMode ? (
                <>
                  <CanvasBgPicker
                    value={canvasFillValue}
                    open={canvasBgOpen}
                    onOpenChange={(next) => {
                      setCanvasBgOpen(next);
                      if (next) setCanvasMeshSelectedIndex(0);
                    }}
                    meshSelectedIndex={canvasMeshSelectedIndex}
                    onMeshSelectedIndexChange={setCanvasMeshSelectedIndex}
                    meshShowGuides={canvasMeshShowGuides}
                    onMeshShowGuidesChange={setCanvasMeshShowGuides}
                    onChange={(next) => {
                      const follow =
                        next.fillType === 'solid' && isThemeFollowCanvasBg(next.fillColor);
                      dispatch(setCanvasMeta(canvasFillToDocumentMeta(next, follow)));
                    }}
                  />
                  <HudBtn tip={t('editor.layers')} active={layersOpen} onClick={() => setLayersOpen((v) => !v)}>
                    <HiOutlineSquare3Stack3D className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                  </HudBtn>
                  <HudBtn tip={t('editor.minimap')} active={minimapOpen} onClick={() => setMinimapOpen((v) => !v)}>
                    <HiOutlineMap className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                  </HudBtn>
                  <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
                </>
              ) : null}
              <HudBtn
                tip={`${t('editor.undo')} (Ctrl+Z)`}
                disabled={!canUndo}
                onClick={() => dispatch(undo())}
              >
                <HiOutlineArrowUturnLeft className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
              </HudBtn>
              <HudBtn
                tip={`${t('editor.redo')} (Ctrl+Shift+Z)`}
                disabled={!canRedo}
                onClick={() => dispatch(redo())}
              >
                <HiOutlineArrowUturnRight className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
              </HudBtn>
              <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
              <HudBtn tip={t('editor.zoomOut')} onClick={onZoomOut}>
                <HiOutlineMinus className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
              </HudBtn>
              <HudBtn tip={t('editor.zoomReset')} onClick={() => zoomAtStageCenter(1)} className="w-auto min-w-[2.5rem] px-1">
                <span className="text-[12px] font-medium tabular-nums text-[var(--ink)]">
                  {zoomPercent}%
                </span>
              </HudBtn>
              <HudBtn tip={t('editor.zoomIn')} onClick={onZoomIn}>
                <HiOutlinePlus className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
              </HudBtn>
              {!isDevMode ? (
                <>
                  <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
                  <HudBtn
                    tip={t('editor.tour.replay')}
                    onClick={() => setForceTour(true)}
                    data-tour="editor-help"
                  >
                    <HiOutlineQuestionMarkCircle className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                  </HudBtn>
                </>
              ) : null}
            </div>
          </div>
        </main>

        {workspaceMode === 'dev' ? (
          inspectOpen ? (
            <DevPropertiesPanel onClose={() => setInspectOpen(false)} />
          ) : null
        ) : (
          <AgentDock
            open={agentOpen}
            onClose={() => setAgentOpen(false)}
            draftPrompt={agentDraft}
            autoSubmitDraft={agentAutoSubmit}
            draftAttachments={agentDraftAttachments}
            draftModelId={agentDraftModelId}
            draftImageAspectRatio={agentDraftImageAspect}
            draftImageQuality={agentDraftImageQuality}
            draftImageResolution={agentDraftImageResolution}
            draftScene={agentDraftScene}
            onDraftConsumed={() => {
              clearHomeAgentBoot();
              setAgentDraft(null);
              setAgentAutoSubmit(false);
              setAgentDraftAttachments([]);
              setAgentDraftModelId(null);
              setAgentDraftImageAspect(null);
              setAgentDraftImageQuality(null);
              setAgentDraftImageResolution(null);
              setAgentDraftScene(null);
            }}
            attachToChat={attachToChat}
            onAttachConsumed={() => setAttachToChat(null)}
            dataTour={agentOpen ? 'editor-agent' : undefined}
            canvasUi={{
              getZoom: () => camera.zoom,
              zoomIn: onZoomIn,
              zoomOut: onZoomOut,
              setZoom: (z) => zoomAtStageCenter(z),
              fitView: () => zoomAtStageCenter(1),
              setLayersOpen,
              setMinimapOpen,
              getLayersOpen: () => layersOpen,
              getMinimapOpen: () => minimapOpen,
              openAccountAgent: () => {
                const from = `${location.pathname}${location.search}${location.hash}`;
                navigate(withReturnTo('/account?tab=agent', from));
              },
            }}
          />
        )}
      </div>

      {bootOpen ? <EditorBootOverlay progress={bootProgress} exiting={bootExiting} /> : null}
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
      <EditorOnboardingTour
        ready={!bootOpen}
        forceOpen={forceTour}
        onForceOpenConsumed={() => setForceTour(false)}
        onOpenAgent={() => {
          dispatch(setWorkspaceMode('design'));
          setAgentOpen(true);
        }}
      />
    </div>
  );
}
