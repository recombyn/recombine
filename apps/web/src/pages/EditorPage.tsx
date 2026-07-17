import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCodeBracket,
  HiOutlineHome,
  HiOutlineMap,
  HiOutlineMinus,
  HiOutlinePlus,
  HiOutlineQuestionMarkCircle,
  HiOutlineShare,
  HiOutlineSquare3Stack3D,
  HiOutlineViewfinderCircle,
} from 'react-icons/hi2';
import { TbMessage2Filled } from 'react-icons/tb';
import { Tooltip } from '@/components/base';
import {
  takeHomeAgentBoot,
  attachmentsFromBoot,
} from '@/lib/homeAgentBoot';
import { takePendingEditorNav } from '@/lib/pendingEditorNav';
import type { ComposerContext } from '@/components/editor/panels/AgentComposerInput';
import AgentDock from '@/components/editor/panels/AgentDock';
import DevPropertiesPanel from '@/components/editor/panels/DevPropertiesPanel';
import ShareDialog from '@/components/editor/panels/ShareDialog';
import EditorBootOverlay from '@/components/editor/chrome/EditorBootOverlay';
import InfiniteCanvasStage, {
  DEFAULT_CAMERA,
  zoomAtPoint,
  type CanvasCamera,
} from '@/components/editor/Canvas/stage/InfiniteCanvasStage';
import LayerPanel from '@/components/editor/panels/LayerPanel';
import ImageProcessWatcher from '@/components/editor/nodes/ImageNode/ImageProcessWatcher';
import CropExpandSessionHost from '@/components/editor/nodes/ImageNode/cropExpand/CropExpandSessionHost';
import ImageToolPanelHost from '@/components/editor/nodes/ImageNode/toolPanels/ImageToolPanelHost';
import ShapeStylePanelHost from '@/components/editor/nodes/ShapeNode/ShapeStylePanelHost';
import MeshHandlesOverlay from '@/components/editor/nodes/ShapeNode/MeshHandlesOverlay';
import SvgCanvas from '@/components/editor/Canvas/svg/SvgCanvas';
import EditorToolStrip from '@/components/editor/chrome/EditorToolStrip';
import PenStrokeToolbar from '@/components/editor/chrome/PenStrokeToolbar';
import AlignGuidesOverlay, {
  type AlignGuide,
} from '@/components/editor/Canvas/selection/AlignGuidesOverlay';
import {
  nodeGuideBoxes,
  snapBoxToGuides,
  snapResizeToGuides,
} from '@/components/editor/Canvas/selection/alignGuides';
import type { ResizeHandle } from '@/components/editor/Canvas/selection/resizeGeometry';
import { cn } from '@/utils/classnames';
import {
  createTemplate,
  renameTemplate,
  addArtboardFrame,
  setActiveFrameId,
  renameArtboardFrame,
  setCanvasMeta,
  setActiveTool,
  setSelectedNodeIds,
  setWorkspaceMode,
  updateArtboardFrame,
  pushEditorHistory,
} from '@/store/modules/editor';
import HtmlArtboardFrame from '@/components/editor/nodes/FrameNode/HtmlArtboardFrame';
import FrameContextToolbar from '@/components/editor/nodes/FrameNode/FrameContextToolbar';
import FrameDrawFeature from '@/components/editor/nodes/FrameNode/FrameDrawFeature';
import FrameMoveFeature from '@/components/editor/nodes/FrameNode/FrameMoveFeature';
import FrameSelectionChrome from '@/components/editor/nodes/FrameNode/FrameSelectionChrome';
import type { ArtboardFrame } from '@/store/modules/editor';
import CanvasBgPicker from '@/components/editor/chrome/CanvasBgPicker';
import {
  canvasFillToDocumentMeta,
  documentToCanvasFill,
} from '@/components/editor/chrome/canvasBgUtils';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';
import {
  cssPreviewForGradient,
  parseFillGradient,
  parseFillType,
  serializeFillGradient,
} from '@/store/scene/sceneFill';
import WalletAccountChip from '@/components/layout/WalletAccountChip';
import EditorOnboardingTour from '@/components/editor/chrome/EditorOnboardingTour';

const BOOT_MIN_MS = 520;
const BOOT_EXIT_MS = 280;

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
  const [attachToChatNodeId, setAttachToChatNodeId] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [canvasBgOpen, setCanvasBgOpen] = useState(false);
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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const [movingFrameId, setMovingFrameId] = useState<string | null>(null);
  const [frameGuides, setFrameGuides] = useState<AlignGuide[]>([]);
  const document = useSelector((state: any) => state.editor.document);
  const sceneReloadToken = useSelector((state: any) => state.editor.sceneReloadToken);
  const documentPatchToken = useSelector((state: any) => state.editor.documentPatchToken);
  const lastPatchedNodeIds = useSelector(
    (state: any) => (state.editor.lastPatchedNodeIds as string[]) || []
  );
  const selectedNodeId = useSelector((state: any) => state.editor.selectedNodeId);
  const selectedNodeIds = useSelector((state: any) => state.editor.selectedNodeIds || []);
  const agentBusy = useSelector((state: any) => Boolean(state.editor.agentBusy));
  const currentTemplate = useSelector((state: any) =>
    state.editor.templates.find((item: any) => item.id === state.editor.currentId)
  );
  const activeTool = useSelector((state: any) => state.editor.activeTool);
  const workspaceMode = useSelector(
    (state: any) => state.editor.workspaceMode || 'design'
  ) as 'design' | 'dev';

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

  // Keep the right dock open across Design ↔ Dev; only swap which panel is shown.
  const switchWorkspaceMode = (next: 'design' | 'dev') => {
    if (next === workspaceMode) return;
    if (next === 'dev') {
      setInspectOpen(agentOpen);
      // Dev is inspect-only: leave design tools / artboard chrome.
      dispatch(setActiveTool('select'));
      dispatch(setActiveFrameId(null));
      setCanvasBgOpen(false);
      setLayersOpen(false);
      setMinimapOpen(false);
    } else {
      setAgentOpen(inspectOpen);
    }
    dispatch(setWorkspaceMode(next));
  };

  const isDevMode = workspaceMode === 'dev';
  const panMode = activeTool === 'pan';
  const frameMode = !isDevMode && activeTool === 'frame';

  const frames: ArtboardFrame[] = Array.isArray(document?.frames) ? document.frames : [];
  const activeFrameId = document?.activeFrameId ?? null;
  const activeFrame = frames.find((f) => f.id === activeFrameId) ?? null;
  const worldSurface = document
    ? computeWorldSurface(document, frames)
    : { x: 0, y: 0, width: 3600, height: 2400 };
  // Camera autofit only around real content / frames; empty world keeps default zoom.
  const worldBounds = frames.length
    ? framesBounds(frames)
    : { x: 0, y: 0, width: 0, height: 0 };

  // Home "New project" / post-login pending intent → create here so the list
  // is not updated before leaving the home page.
  useEffect(() => {
    const pending = takePendingEditorNav();
    const state = (location.state as {
      createNew?: boolean;
      fromHomeAgent?: boolean;
    } | null) || {};
    const createNew = Boolean(state.createNew || pending?.createNew);
    const fromHomeAgent = Boolean(state.fromHomeAgent || pending?.fromHomeAgent);
    if (createNew) {
      dispatch(createTemplate({ emptyWorld: true }));
      if (fromHomeAgent) {
        const boot = takeHomeAgentBoot();
        if (boot?.prompt) {
          setAgentOpen(true);
          setAgentDraft(boot.prompt);
          setAgentAutoSubmit(Boolean(boot.autoSubmit));
          setAgentDraftAttachments(attachmentsFromBoot(boot));
          setAgentDraftModelId(boot.modelId ?? null);
          setAgentDraftImageAspect(boot.imageAspectRatio ?? null);
          setAgentDraftImageQuality(boot.imageQuality ?? null);
          setAgentDraftImageResolution(boot.imageResolution ?? null);
        }
      }
      navigate('/editor', { replace: true, state: {} });
      return;
    }
    if (!document) dispatch(createTemplate({ emptyWorld: true }));
  }, [dispatch, document, location.state, navigate]);

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
      // Snap artboard to scene nodes + sibling frames (same helpers as selection move).
      const snapped = snapBoxToGuides(moving, [...nodes, ...otherFrames], []);
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
    [dispatch, document, frames]
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
      const snapped = snapResizeToGuides(box, handle, [...nodes, ...otherFrames], [], undefined, 40);
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
    [dispatch, document, frames]
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
      dispatch(setSelectedNodeIds([]));
    },
    [dispatch]
  );

  const onClearCanvasSelection = useCallback(() => {
    dispatch(setSelectedNodeIds([]));
    dispatch(setActiveFrameId(null));
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
      setCamera((c) => ({ ...c, zoom: nextZoom }));
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
            <LayerPanel onClose={() => setLayersOpen(false)} />
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

          {/* Top-right: wallet + share + design/dev + chat (chat only in design) */}
          <div className="pointer-events-none absolute right-4 top-3 z-20">
            <div className="pointer-events-auto flex items-center gap-2">
              <WalletAccountChip />
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
              <div
                role="group"
                aria-label={t('editor.workspaceMode')}
                className="inline-flex h-8 items-center rounded-full bg-[var(--accent-soft)] p-0.5"
              >
                {(
                  [
                    { id: 'design' as const, label: t('editor.design') },
                    { id: 'dev' as const, label: t('editor.devMode') },
                  ] as const
                ).map((opt) => {
                  const active = workspaceMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => switchWorkspaceMode(opt.id)}
                      className={cn(
                        'inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:outline-none',
                        active
                          ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]'
                          : 'text-[var(--muted)] hover:text-[var(--ink)]'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {(workspaceMode === 'design' && !agentOpen) ||
              (workspaceMode === 'dev' && !inspectOpen) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (workspaceMode === 'dev') {
                      setInspectOpen(true);
                      return;
                    }
                    setAgentOpen(true);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
                >
                  {workspaceMode === 'dev' ? (
                    <HiOutlineCodeBracket className="h-4 w-4 shrink-0 text-[var(--ink)]" />
                  ) : (
                    <TbMessage2Filled className="h-4 w-4 shrink-0 text-[var(--ink)]" />
                  )}
                  {workspaceMode === 'dev' ? t('editor.devInspect') : t('editor.chat')}
                </button>
              ) : null}
            </div>
          </div>

          {!isDevMode && (activeTool === 'pen' || activeTool === 'pencil') ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
              <PenStrokeToolbar
                mode={activeTool === 'pen' ? 'pen' : 'pencil'}
                placement="dock"
              />
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            {document ? (
              <InfiniteCanvasStage
                artboard={worldBounds}
                camera={camera}
                onCameraChange={setCamera}
                panMode={panMode}
                // Select tool: empty left-drag is marquee; pan via Space / Hand / middle-mouse.
                emptyDragPans={false}
                background={stageBackground}
                stageRef={stageRef}
                cursor={frameMode ? 'crosshair' : undefined}
              >
                {frames.map((frame) => (
                  <HtmlArtboardFrame
                    key={`body-${frame.id}`}
                    frame={frame}
                    selected={!isDevMode && frame.id === activeFrameId}
                    layer="body"
                  />
                ))}

                <div
                  className="absolute left-0 top-0 z-[1]"
                  style={{ width: worldSurface.width, height: worldSurface.height }}
                >
                  <SvgCanvas
                    document={{
                      ...document,
                      x: 0,
                      y: 0,
                      width: worldSurface.width,
                      height: worldSurface.height,
                      backgroundColor: 'transparent',
                      backgroundFillType: 'solid',
                    }}
                    reloadToken={sceneReloadToken}
                    documentPatchToken={documentPatchToken}
                    lastPatchedNodeIds={lastPatchedNodeIds}
                    selectedNodeId={selectedNodeId}
                    selectedNodeIds={selectedNodeIds}
                    onZoomIn={onZoomIn}
                    onZoomOut={onZoomOut}
                    onReady={finishBoot}
                    embedded
                    onOpenAgent={(opts) => {
                      if (workspaceMode === 'dev') return;
                      setAgentOpen(true);
                      if (opts?.prompt) setAgentDraft(opts.prompt);
                    }}
                    onAddToChat={(nodeId) => {
                      if (workspaceMode === 'dev') return;
                      setAgentOpen(true);
                      setAttachToChatNodeId(nodeId);
                    }}
                  />
                </div>

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
                    selected={!isDevMode && frame.id === activeFrameId}
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
                activeFrame &&
                !agentBusy &&
                selectedNodeIds.length === 0 &&
                movingFrameId !== activeFrame.id ? (
                  <>
                    <FrameSelectionChrome frame={activeFrame} />
                    <FrameContextToolbar frame={activeFrame} />
                  </>
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
              </InfiniteCanvasStage>
            ) : null}
          </div>

          {/* Fig.2 bottom-center tools — Design only */}
          {!isDevMode ? (
            <div
              data-tour="editor-tools"
              className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
            >
              <div className="pointer-events-auto">
                <EditorToolStrip />
              </div>
            </div>
          ) : null}

          {/* Bottom-left HUD */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20">
            {minimapOpen ? (
              <div className="pointer-events-auto mb-2 w-[140px] rounded bg-[var(--surface)] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ring-1 ring-[var(--line)]">
                <div
                  className="h-[88px] rounded bg-[var(--canvas)]"
                  style={
                    stageBackground
                      ? { background: stageBackground }
                      : undefined
                  }
                />
                <p className="mt-1 text-center text-[10px] text-[var(--muted)]">
                  {'小地图'}
                </p>
              </div>
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
                  <HudBtn tip={'图层'} active={layersOpen} onClick={() => setLayersOpen((v) => !v)}>
                    <HiOutlineSquare3Stack3D className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                  </HudBtn>
                  <HudBtn tip={'小地图'} active={minimapOpen} onClick={() => setMinimapOpen((v) => !v)}>
                    <HiOutlineMap className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                  </HudBtn>
                  <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
                </>
              ) : null}
              <HudBtn tip={'适应画布'} onClick={() => zoomAtStageCenter(1)}>
                <HiOutlineViewfinderCircle className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
              </HudBtn>
              <HudBtn tip={'缩小'} onClick={onZoomOut}>
                <HiOutlineMinus className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
              </HudBtn>
              <HudBtn tip={'重置缩放'} onClick={() => zoomAtStageCenter(1)} className="w-auto min-w-[2.5rem] px-1">
                <span className="text-[12px] font-medium tabular-nums text-[var(--ink)]">
                  {zoomPercent}%
                </span>
              </HudBtn>
              <HudBtn tip={'放大'} onClick={onZoomIn}>
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
            onDraftConsumed={() => {
              setAgentDraft(null);
              setAgentAutoSubmit(false);
              setAgentDraftAttachments([]);
              setAgentDraftModelId(null);
              setAgentDraftImageAspect(null);
              setAgentDraftImageQuality(null);
              setAgentDraftImageResolution(null);
            }}
            attachNodeId={attachToChatNodeId}
            onAttachConsumed={() => setAttachToChatNodeId(null)}
            dataTour={agentOpen ? 'editor-agent' : undefined}
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
