import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineHome,
  HiOutlineMap,
  HiOutlineShare,
  HiOutlineSquare3Stack3D,
} from 'react-icons/hi2';
import { LuKeyboard } from 'react-icons/lu';
import { TbMessage2Filled } from 'react-icons/tb';
import { Dropdown, Tooltip, message } from '@/components/base';
import type { MenuItemType } from '@/components/base';
import {
  peekHomeAgentBoot,
  clearHomeAgentBoot,
  attachmentsFromBoot,
  contextsFromBoot,
} from '@/utils/homeAgentBoot';
import { withReturnTo } from '@/utils/authReturnTo';
import { store } from '@/store';
import { useProjectCloudSync, flushCurrentProjectNow } from '@/components/editor/useProjectCloudSync';
import type { ComposerContext } from '@/components/editor/panels/AgentComposerInput';
import AgentDock from '@/components/editor/panels/AgentDock';
import DevPropertiesPanel, {
  getInspectDockWidth,
} from '@/components/editor/panels/DevPropertiesPanel';
import ShareDialog from '@/components/editor/panels/ShareDialog';
import { EditorTopExportButton } from '@/components/editor/panels/ExportSelectionPanel';
import { fetchShareApi, updateShareDocumentApi } from '@/apis/shares';
import EditorBootOverlay from '@/components/editor/chrome/EditorBootOverlay';
import {
  RcbCanvas,
  RcbSvgDefs,
  RCB_DEFAULT_CAMERA as DEFAULT_CAMERA,
  rcbFitCamera,
  zoomAtPoint,
  PENCIL_CURSOR,
  ERASER_CURSOR,
  PEN_CURSOR,
  BUCKET_CURSOR,
  type RcbCamera as CanvasCamera,
} from '@/components/rcb';
import LayerPanel from '@/components/editor/panels/LayerPanel';
import ImageProcessWatcher from '@/components/editor/nodes/ImageNode/ImageProcessWatcher';
import CropExpandSessionHost from '@/components/editor/nodes/ImageNode/cropExpand/CropExpandSessionHost';
import ImageToolPanelHost from '@/components/editor/nodes/ImageNode/toolPanels/ImageToolPanelHost';
import ShapeStylePanelHost from '@/components/editor/nodes/ShapeNode/ShapeStylePanelHost';
import VideoTrimSessionHost from '@/components/editor/nodes/VideoNode/VideoTrimSessionHost';
import MeshHandlesOverlay from '@/components/editor/nodes/ShapeNode/MeshHandlesOverlay';
import SvgCanvas from '@/components/editor/canvas/svg/SvgCanvas';
import EditorToolStrip from '@/components/editor/chrome/EditorToolStrip';
import EditorMinimap from '@/components/editor/chrome/EditorMinimap';
import EditorShortcutsPanel from '@/components/editor/chrome/EditorShortcutsPanel';
import PenStrokeToolbar from '@/components/editor/chrome/PenStrokeToolbar';
import BucketFillToolbar from '@/components/editor/chrome/BucketFillToolbar';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import PathEditToolbar, {
  type PathEditSubtool,
} from '@/components/editor/chrome/PathEditToolbar';
import AlignGuidesOverlay, {
  type AlignGuide,
} from '@/components/rcb/selection/AlignGuidesOverlay';
import {
  getDocumentGridSize,
  nodeGuideBoxes,
  snapBoxToGrid,
  snapBoxToGuides,
  snapResizeToGrid,
  snapResizeToGuides,
  getSnapThreshold,
} from '@/components/rcb/selection/alignGuides';
import type { ResizeHandle } from '@/components/rcb/selection/resizeGeometry';
import { cn } from '@/utils/classnames';
import { fetchProject } from '@/apis/projects';
import {
  getProjectDraft,
  getProjectSession,
  putProjectDraft,
  putProjectSession,
} from '@/components/editor/projectDraftStore';
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
  setGridMode,
  setSelectedNodeId,
  setSelectedNodeIds,
  setTemplateThumbnail,
  setWorkspaceMode,
  updateArtboardFrame,
  pushEditorHistory,
} from '@/store/modules/editor';
import { listSceneNodes, stackZIndex } from '@/components/rcb/scene/sceneDocument';
import { normalizeProjectThumbnailUrls } from '@/utils/projectThumb';
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
  '[data-video-playback-bar]',
  '[data-video-trim-toolbar]',
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

function useViewportMatch(query: string) {
  const read = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
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
    <Tooltip tip={tip} placement="top">
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
/** Min gap between left HUD (at left-4) and centered toolstrip before stacking. */
const BOTTOM_HUD_TOOLS_GAP_PX = 12;

/** True when left HUD at bottom-left would horizontally collide with centered tools. */
function bottomHudCollidesWithTools(opts: {
  stage: DOMRect;
  hudWidth: number;
  toolsWidth: number;
}): boolean {
  const { stage, hudWidth, toolsWidth } = opts;
  if (!(hudWidth > 0) || !(toolsWidth > 0) || !(stage.width > 0)) return false;
  const hudRight = stage.left + 16 + hudWidth;
  const toolsLeft = stage.left + stage.width / 2 - toolsWidth / 2;
  return hudRight + BOTTOM_HUD_TOOLS_GAP_PX > toolsLeft;
}

type SceneBox = { x: number; y: number; width: number; height: number };

function unionSceneBox(a: SceneBox | null, b: SceneBox): SceneBox {
  if (!a) return { ...b };
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Union of artboards + scene nodes for zoom-to-fit. */
function editorContentBounds(doc: any, frames: ArtboardFrame[]): SceneBox {
  let box: SceneBox | null = null;
  for (const f of frames) {
    box = unionSceneBox(box, {
      x: f.x,
      y: f.y,
      width: Math.max(1, f.width),
      height: Math.max(1, f.height),
    });
  }
  for (const { node } of listSceneNodes(doc)) {
    if (!node) continue;
    const { left, top } = nodeLeftTop(doc, node);
    const w = Math.max(1, Number(node.width) || 0);
    const h = Math.max(1, Number(node.height) || 0);
    if (w < 2 && h < 2) continue;
    box = unionSceneBox(box, { x: left, y: top, width: w, height: h });
  }
  if (!box) return { x: 0, y: 0, width: 1200, height: 800 };
  return box;
}

function ZoomMenuLabel({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <span className="flex w-full min-w-[11rem] items-center justify-between gap-6">
      <span>{label}</span>
      {shortcut ? (
        <span className="shrink-0 text-[11px] font-normal tabular-nums text-[var(--muted)]">
          {shortcut}
        </span>
      ) : null}
    </span>
  );
}

const ZOOM_MENU_PRESETS = [
  { key: '50', zoom: 0.5 },
  { key: '100', zoom: 1 },
  { key: '200', zoom: 2 },
] as const;

function zoomMenuSelectedKeys(zoom: number): string[] {
  const hit = ZOOM_MENU_PRESETS.find((p) => Math.abs(zoom - p.zoom) < 0.001);
  return hit ? [hit.key] : [];
}

function zoomModShortcutLabel() {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
}

function resolveHomeAgentInteractionMode(
  mode: unknown
): 'agent' | 'ask' | 'image' | 'video' | null {
  if (mode === 'image') return 'image';
  if (mode === 'video') return 'video';
  if (mode === 'ask') return 'ask';
  if (mode === 'agent') return 'agent';
  return null;
}

function shouldApplyHomeAgentBoot(opts: {
  boot: ReturnType<typeof peekHomeAgentBoot>;
  fromFlag: boolean;
  alreadyApplied: boolean;
}): boolean {
  const { boot, fromFlag, alreadyApplied } = opts;
  if (!boot || alreadyApplied) return false;
  const hasPrompt = Boolean(boot.prompt?.trim());
  const hasChips =
    Boolean(boot.contexts?.length) || Boolean(boot.attachments?.length);
  if (!hasPrompt && !hasChips) return false;
  if (!fromFlag && !boot.autoSubmit && !hasChips) return false;
  return true;
}

const ZOOM_TRIGGER_BASE =
  'inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1.5 rounded px-2.5 transition-colors';
const ZOOM_TRIGGER_OPEN = 'bg-[var(--accent-soft)] text-[var(--ink)]';
const ZOOM_TRIGGER_IDLE =
  'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]';

function computeStageBackground(
  document: any,
  followThemeCanvas: boolean,
  themeCanvas: string
): string | undefined {
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
}

function resolveEditorCanvasCursor(
  frameMode: boolean,
  activeTool: string,
  pencilEraseMode: boolean,
  pickMode: { active: boolean; blocked: boolean }
): string | undefined {
  if (pickMode.active) return pickMode.blocked ? 'not-allowed' : 'copy';
  if (frameMode) return 'crosshair';
  if (activeTool === 'pencil') return pencilEraseMode ? ERASER_CURSOR : PENCIL_CURSOR;
  if (activeTool === 'pen') return PEN_CURSOR;
  if (activeTool === 'bucket') return BUCKET_CURSOR;
  return undefined;
}

type EditorProjectDraft = Awaited<ReturnType<typeof getProjectDraft>>;

function shouldPreferLocalDraft(
  draft: EditorProjectDraft,
  proj: { document?: unknown; updatedAt?: number } | null | undefined
): boolean {
  if (!draft?.document) return false;
  const cloudUpdated = Number(proj?.updatedAt) || 0;
  const draftUpdated = Number(draft.updatedAt) || 0;
  return (
    !proj?.document ||
    draftUpdated > cloudUpdated ||
    (draftUpdated === cloudUpdated && !draft.syncedAt)
  );
}

function persistUnsyncedDraft(
  targetId: string,
  draft: NonNullable<EditorProjectDraft>,
  name: string
) {
  void putProjectDraft({
    projectId: targetId,
    name,
    document: draft.document,
    updatedAt: draft.updatedAt || Date.now(),
    syncedAt: null,
    cloudRevision: null,
    baseDocument: null,
  });
}

async function hydrateShareTarget(
  targetId: string,
  dispatch: ReturnType<typeof useDispatch>,
  navigate: ReturnType<typeof useNavigate>,
  t: (key: string, opts?: Record<string, unknown>) => string,
  isCancelled: () => boolean
) {
  try {
    const res = await fetchShareApi(targetId);
    if (isCancelled()) return;
    const s = res.share;
    if (!s?.document || !s.viewerCanEdit) {
      message.warning(t('editor.shareNoEditAccess'));
      navigate(`/s/${encodeURIComponent(targetId)}`, { replace: true });
      return;
    }
    dispatch(
      importDocument({
        id: s.id,
        name: s.name || t('home.untitled'),
        document: s.document,
        source: 'scratch',
      })
    );
    dispatch(setWorkspaceMode('design'));
  } catch {
    if (isCancelled()) return;
    message.error(t('editor.shareCopyFailed'));
    navigate(`/s/${encodeURIComponent(targetId)}`, { replace: true });
  }
}

async function hydrateCloudProject(
  targetId: string,
  dispatch: ReturnType<typeof useDispatch>,
  t: (key: string, opts?: Record<string, unknown>) => string,
  isCancelled: () => boolean
) {
  const draft = await getProjectDraft(targetId).catch(() => null);
  try {
    const res = await fetchProject(targetId);
    if (isCancelled()) return;
    const proj = res.project;
    const cloudUpdated = Number(proj?.updatedAt) || 0;
    const cloudRev = Number(proj?.revision);
    const revision = Number.isFinite(cloudRev) && cloudRev >= 1 ? cloudRev : null;

    if (shouldPreferLocalDraft(draft, proj) && draft?.document) {
      const needsUpload = !draft.syncedAt;
      const name = draft.name || proj?.name || t('home.untitled');
      dispatch(
        importDocument({
          id: targetId,
          name,
          document: draft.document,
          source: 'user',
          dirty: needsUpload,
        })
      );
      if (needsUpload) persistUnsyncedDraft(targetId, draft, name);
      return;
    }

    if (!proj?.document) {
      if (draft?.document) {
        const name = draft.name || t('home.untitled');
        dispatch(
          importDocument({
            id: targetId,
            name,
            document: draft.document,
            source: 'user',
            dirty: !draft.syncedAt,
          })
        );
        if (!draft.syncedAt) persistUnsyncedDraft(targetId, draft, name);
        return;
      }
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
    {
      const thumbs = normalizeProjectThumbnailUrls(proj.thumbnailUrl, proj.updatedAt);
      if (thumbs.length) {
        dispatch(
          setTemplateThumbnail({
            id: proj.id,
            thumbnail: thumbs.length === 1 ? thumbs[0] : thumbs,
            custom: Boolean(proj.thumbnailCustom),
          })
        );
      }
    }
    void putProjectDraft({
      projectId: proj.id,
      name: proj.name || t('home.untitled'),
      document: proj.document,
      updatedAt: cloudUpdated || Date.now(),
      syncedAt: Date.now(),
      cloudRevision: revision,
      baseDocument: proj.document,
    });
  } catch {
    if (isCancelled()) return;
    if (draft?.document) {
      const name = draft.name || t('home.untitled');
      dispatch(
        importDocument({
          id: targetId,
          name,
          document: draft.document,
          source: 'user',
          dirty: true,
        })
      );
      persistUnsyncedDraft(targetId, draft, name);
      return;
    }
    dispatch(createTemplate({ emptyWorld: true }));
  }
}

function EditorPage() {
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
  const [agentDraftContexts, setAgentDraftContexts] = useState<ComposerContext[]>([]);
  const [agentDraftModelId, setAgentDraftModelId] = useState<string | null>(null);
  const [agentDraftInteractionMode, setAgentDraftInteractionMode] = useState<
    'agent' | 'ask' | 'image' | 'video' | null
  >(null);
  const [agentDraftImageAspect, setAgentDraftImageAspect] = useState<string | null>(null);
  const [agentDraftScene, setAgentDraftScene] = useState<
    'website' | 'mobile' | 'image' | 'poster' | 'drawing' | null
  >(null);
  const [attachToChat, setAttachToChat] = useState<string | string[] | null>(null);
  // Layers dock stays closed by default (open only via HUD toggle).
  const [layersOpen, setLayersOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [canvasBgOpen, setCanvasBgOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [pathEditOpen, setPathEditOpen] = useState(false);
  const [pathEditSubtool, setPathEditSubtool] = useState<PathEditSubtool>('select');
  const [canvasMeshSelectedIndex, setCanvasMeshSelectedIndex] = useState(0);
  const [canvasMeshShowGuides, setCanvasMeshShowGuides] = useState(true);
  const themeCanvas = useThemeCanvasColor();
  const isMobileViewport = useViewportMatch('(max-width: 767px)');
  const isTabletViewport = useViewportMatch('(max-width: 1279px)');
  const useCompactTooling = isTabletViewport;
  const [bootOpen, setBootOpen] = useState(true);
  const [bootExiting, setBootExiting] = useState(false);
  const [bootProgress, setBootProgress] = useState(8);
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

  // Persist share-edit sessions back to the shares API (not projects).
  const shareSaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!currentId?.startsWith('share_') || !document) return undefined;
    if (shareSaveTimer.current) window.clearTimeout(shareSaveTimer.current);
    const id = currentId;
    shareSaveTimer.current = window.setTimeout(() => {
      void updateShareDocumentApi(id, document).catch(() => undefined);
    }, 700);
    return () => {
      if (shareSaveTimer.current) window.clearTimeout(shareSaveTimer.current);
    };
  }, [currentId, document]);

  const activeTool = useSelector((state: any) => state.editor.activeTool);
  const pencilEraseMode = useSelector((state: any) => Boolean(state.editor.pencilEraseMode));
  const canvasAttachPick = useSelector(
    (state: any) => state.editor.canvasAttachPick as null | { target: string }
  );
  const canvasAttachPickBlocked = useSelector((state: any) =>
    Boolean(state.editor.canvasAttachPickBlocked)
  );
  const isGridMode = useSelector((state: any) => Boolean(state.editor.isGridMode));
  const gridSize = getDocumentGridSize(document);
  const workspaceMode = useSelector(
    (state: any) => state.editor.workspaceMode || 'design'
  ) as 'design' | 'dev';

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
  const stageBackground = useMemo(
    () => computeStageBackground(document, followThemeCanvas, themeCanvas),
    [
      document?.backgroundFillType,
      document?.backgroundColor,
      document?.backgroundOpacity,
      document?.backgroundGradient,
      document?.backgroundImageSrc,
      followThemeCanvas,
      themeCanvas,
    ]
  );

  /** Editor UI is design-only; hide legacy Design/Dev toggle. */
  useEffect(() => {
    dispatch(setWorkspaceMode('design'));
  }, [dispatch]);

  const isDevMode = workspaceMode === 'dev';
  const panMode = activeTool === 'pan';
  const frameMode = !isDevMode && activeTool === 'frame';
  const canvasCursor = resolveEditorCanvasCursor(frameMode, activeTool, pencilEraseMode, {
    active: Boolean(canvasAttachPick),
    blocked: canvasAttachPickBlocked,
  });

  const frames: ArtboardFrame[] = Array.isArray(document?.frames) ? document.frames : [];
  const activeFrameId = document?.activeFrameId ?? null;
  const activeFrame = frames.find((f) => f.id === activeFrameId) ?? null;
  const selectedFrames = frames.filter((f) =>
    !f.hidden &&
    (selectedFrameIds.length
      ? selectedFrameIds.includes(f.id)
      : Boolean(activeFrameId && f.id === activeFrameId))
  );
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const bottomHudRef = useRef<HTMLDivElement | null>(null);
  const [stackBottomHud, setStackBottomHud] = useState(false);
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

  useEffect(() => {
    if (isDevMode) {
      setStackBottomHud(false);
      return undefined;
    }
    const stage = stageEl;
    const hud = bottomHudRef.current;
    const tools = stage?.ownerDocument?.querySelector(
      '[data-tour="editor-tools"]'
    ) as HTMLElement | null;
    if (!stage || !hud || !tools) {
      setStackBottomHud(false);
      return undefined;
    }
    const measure = () => {
      const stageBox = stage.getBoundingClientRect();
      const hudBox = hud.getBoundingClientRect();
      const toolsBox = tools.getBoundingClientRect();
      setStackBottomHud(
        bottomHudCollidesWithTools({
          stage: stageBox,
          hudWidth: hudBox.width,
          toolsWidth: toolsBox.width,
        })
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(hud);
    ro.observe(tools);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isDevMode, stageEl, toolsExpanded, useCompactTooling, stageSize.width]);

  // Scene paper follows content bounds only. Camera pan/zoom is CSS on RcbCanvas —
  // never resize/slide SVG viewBox to chase the frustum.
  const worldSurface = document
    ? computeWorldSurface(document, frames)
    : { x: 0, y: 0, width: 3600, height: 2400 };
  const paperWorld = useMemo(
    () => ({ x: 0, y: 0, width: worldSurface.width, height: worldSurface.height }),
    [worldSurface.width, worldSurface.height]
  );
  // RcbCanvas autofit disabled here — we only center once on first load (below).
  const worldBounds = { x: 0, y: 0, width: 0, height: 0 };

  /** Stable embedded scene doc — avoid `document={{...}}` identity churn each render.
   * Paper fill is transparent here so SVG hosts don't paint over the stage CSS fill.
   * Reducers preserve real stage `backgroundColor` when this view doc is committed. */
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
      return () => {
        cancelled = true;
      };
    }

    if (targetId) {
      if (currentId === targetId && document) {
        return () => {
          cancelled = true;
        };
      }
      const local = templates.find((x) => x.id === targetId);
      if (local?.document) {
        dispatch(openTemplate(targetId));
        return () => {
          cancelled = true;
        };
      }

      // Shared document edit — same EditorPage chrome; persist via shares API.
      if (targetId.startsWith('share_')) {
        void hydrateShareTarget(targetId, dispatch, navigate, t, () => cancelled);
        return () => {
          cancelled = true;
        };
      }

      void hydrateCloudProject(targetId, dispatch, t, () => cancelled);
      return () => {
        cancelled = true;
      };
    }

    if (!document) dispatch(createTemplate({ emptyWorld: true }));
    return () => {
      cancelled = true;
    };
    // Only re-run when route / nav intent changes — not on every doc edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, routeProjectId, location.search, navigate, t]);

  /** Local session: selection + grid. Camera fits once on first canvas ready. */
  const sessionReadyForIdRef = useRef<string | null>(null);
  const didInitialFitRef = useRef(false);
  const gridUserTouchedRef = useRef(false);
  useEffect(() => {
    sessionReadyForIdRef.current = null;
    didInitialFitRef.current = false;
    gridUserTouchedRef.current = false;
    setCamera(DEFAULT_CAMERA);
    dispatch(setGridMode(false));
  }, [currentId, dispatch]);

  useEffect(() => {
    if (!currentId || !document) return;
    if (sessionReadyForIdRef.current === currentId) return;
    let cancelled = false;
    void (async () => {
      const session = await getProjectSession(currentId).catch(() => null);
      if (cancelled) return;
      // Do not restore session.camera — enter page always fits content once after load.
      if (!gridUserTouchedRef.current) {
        dispatch(setGridMode(Boolean(session?.isGridMode)));
      }
      const delta = document?.deltaSetLike || {};
      const nodeIds = (session?.selectedNodeIds || []).filter(
        (id) => id && id !== 'ROOT' && delta[id]
      );
      const frameValid = new Set(
        (Array.isArray(document?.frames) ? document.frames : [])
          .map((f: any) => String(f?.id || ''))
          .filter(Boolean)
      );
      const frameIds = (session?.selectedFrameIds || []).filter((id) =>
        frameValid.has(id)
      );
      if (nodeIds.length || frameIds.length) {
        dispatch(setMixedSelection({ nodeIds, frameIds }));
      }
      sessionReadyForIdRef.current = currentId;
    })();
    return () => {
      cancelled = true;
    };
  }, [currentId, document, dispatch]);

  useEffect(() => {
    if (!currentId) return;
    if (sessionReadyForIdRef.current !== currentId) return;
    const timer = window.setTimeout(() => {
      void putProjectSession({
        projectId: currentId,
        camera,
        selectedNodeIds,
        selectedFrameIds,
        isGridMode,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentId, camera, selectedNodeIds, selectedFrameIds, isGridMode]);

  /** Home agent / plaza 「做同款」— prefill composer chips / prompt (peek until AgentDock consumes). */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('createNew') === '1') return;

    const fromFlag = params.get('fromHomeAgent') === '1';
    const boot = peekHomeAgentBoot();

    if (fromFlag) {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }

    if (
      !shouldApplyHomeAgentBoot({
        boot,
        fromFlag,
        alreadyApplied: homeAgentBootAppliedRef.current,
      })
    ) {
      return;
    }

    const hasPrompt = Boolean(boot!.prompt?.trim());
    homeAgentBootAppliedRef.current = true;
    setAgentOpen(true);
    setAgentDraft(hasPrompt ? boot!.prompt : '');
    setAgentAutoSubmit(Boolean(boot!.autoSubmit && hasPrompt));
    setAgentDraftAttachments(attachmentsFromBoot(boot!));
    setAgentDraftContexts(contextsFromBoot(boot!));
    setAgentDraftModelId(boot!.modelId ?? null);
    setAgentDraftInteractionMode(resolveHomeAgentInteractionMode(boot!.interactionMode));
    setAgentDraftImageAspect(boot!.imageAspectRatio ?? null);
    setAgentDraftScene(boot!.scene ?? null);
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

  useEffect(() => {
    if (!isMobileViewport) return;
    if (agentOpen) setLayersOpen(false);
  }, [agentOpen, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (layersOpen) setLayersOpen(false);
  }, [isMobileViewport, layersOpen]);

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

  // Empty world has no SvgCanvas onReady — finish boot immediately.
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
    (id: string, x: number, y: number, opts?: { skipGrid?: boolean }) => {
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      let moving = {
        left: x,
        top: y,
        width: Math.max(1, Number(frame.width) || 1),
        height: Math.max(1, Number(frame.height) || 1),
      };
      if (isGridMode && !opts?.skipGrid) moving = snapBoxToGrid(moving, gridSize);
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
    [camera.zoom, dispatch, document, frames, gridSize, isGridMode]
  );

  const onResizeFrame = useCallback(
    (
      id: string,
      box: { left: number; top: number; width: number; height: number },
      handle: ResizeHandle,
      opts?: { skipGrid?: boolean; lockAspect?: boolean }
    ) => {
      let next = box;
      if (isGridMode && !opts?.skipGrid) {
        next = snapResizeToGrid(next, handle, gridSize, 40, {
          lockAspect: Boolean(opts?.lockAspect),
          aspectRatio: box.width / Math.max(1, box.height),
        });
      }
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
        next,
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
    [camera.zoom, dispatch, document, frames, gridSize, isGridMode]
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

  const onFitView = useCallback(() => {
    const el = stageRef.current;
    const vw = el?.clientWidth || el?.getBoundingClientRect().width || 0;
    const vh = el?.clientHeight || el?.getBoundingClientRect().height || 0;
    if (vw < 1 || vh < 1) {
      zoomAtStageCenter(1);
      return;
    }
    const doc = (store.getState() as any).editor?.document;
    const fr: ArtboardFrame[] = Array.isArray(doc?.frames) ? doc.frames : [];
    setCamera(rcbFitCamera({ width: vw, height: vh }, editorContentBounds(doc, fr), 48));
  }, [zoomAtStageCenter]);

  /** Under boot overlay: center once, then reveal — no top-left flash. */
  const onCanvasReady = useCallback(() => {
    if (!didInitialFitRef.current) {
      didInitialFitRef.current = true;
      onFitView();
    }
    finishBoot();
  }, [onFitView]);

  const zoomModLabel = zoomModShortcutLabel();

  const zoomMenuItems = useMemo<MenuItemType[]>(
    () => [
      {
        key: 'in',
        label: <ZoomMenuLabel label={t('editor.zoomIn')} shortcut={`${zoomModLabel} +`} />,
      },
      {
        key: 'out',
        label: <ZoomMenuLabel label={t('editor.zoomOut')} shortcut={`${zoomModLabel} -`} />,
      },
      {
        key: 'fit',
        label: <ZoomMenuLabel label={t('editor.fitCanvas')} shortcut="Shift 1" />,
      },
      {
        key: '50',
        label: <ZoomMenuLabel label={t('editor.zoomToPercent', { percent: 50 })} />,
      },
      {
        key: '100',
        label: (
          <ZoomMenuLabel label={t('editor.zoomToPercent', { percent: 100 })} shortcut={`${zoomModLabel} 0`} />
        ),
      },
      {
        key: '200',
        label: <ZoomMenuLabel label={t('editor.zoomToPercent', { percent: 200 })} />,
      },
    ],
    [t, zoomModLabel]
  );

  const zoomSelectedKeys = useMemo(() => zoomMenuSelectedKeys(camera.zoom), [camera.zoom]);

  const onZoomMenuClick = useCallback(
    (key: string) => {
      const actions: Record<string, () => void> = {
        in: onZoomIn,
        out: onZoomOut,
        fit: onFitView,
        '50': () => zoomAtStageCenter(0.5),
        '100': () => zoomAtStageCenter(1),
        '200': () => zoomAtStageCenter(2),
      };
      actions[key]?.();
      setZoomMenuOpen(false);
    },
    [onFitView, onZoomIn, onZoomOut, zoomAtStageCenter]
  );

  const toggleMinimap = useCallback(() => {
    setMinimapOpen((v) => !v);
    setShortcutsOpen(false);
  }, []);

  const toggleShortcuts = useCallback(() => {
    setShortcutsOpen((v) => !v);
    setMinimapOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        onZoomIn();
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        onZoomOut();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        zoomAtStageCenter(1);
        return;
      }
      if (e.shiftKey && !mod && !e.altKey && (e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault();
        onFitView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFitView, onZoomIn, onZoomOut, zoomAtStageCenter]);

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

  const focusLayerFrame = useCallback(
    (frameId: string) => {
      dispatch(setActiveFrameId(frameId));
      const frame = (document?.frames || []).find((f: any) => f?.id === frameId);
      if (!frame) return;
      const cx = Number(frame.x) + Math.max(1, Number(frame.width) || 1) / 2;
      const cy = Number(frame.y) + Math.max(1, Number(frame.height) || 1) / 2;
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
        {layersOpen && !isMobileViewport ? (
          <div className="relative z-30 h-full shrink-0">
            <LayerPanel
              onClose={() => setLayersOpen(false)}
              onSelectNode={focusLayerNode}
              onSelectFrame={focusLayerFrame}
            />
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
          <div className="pointer-events-none absolute left-4 top-3 z-20 hidden md:block">
            <div className="pointer-events-auto flex items-center gap-2">
              <Tooltip tip={t('editor.home', { defaultValue: '首页' })} placement="bottom">
                <button
                  type="button"
                  aria-label={t('editor.home', { defaultValue: '首页' })}
                  onClick={() => {
                    void (async () => {
                      try {
                        // Always push doc + auto cover on leave (dirty may already be clear).
                        await flushCurrentProjectNow({ force: true });
                      } catch {
                        /* still navigate — local draft already holds bytes */
                      }
                      navigate('/home');
                    })();
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--line)]"
                >
                  <HiOutlineHome className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </Tooltip>
              <span className="inline-grid min-w-0 max-w-[min(16rem,calc(100vw-18rem))] items-center overflow-hidden">
                <span
                  className="invisible col-start-1 row-start-1 max-w-full truncate whitespace-pre px-1 text-[14px] font-medium"
                  aria-hidden
                >
                  {projectName || ' '}
                </span>
                <input
                  value={projectName}
                  onChange={(e) => dispatch(renameTemplate(e.target.value))}
                  aria-label={t('home.untitled')}
                  title={projectName}
                  className="col-start-1 row-start-1 h-8 w-full min-w-0 truncate border-0 bg-transparent px-1 text-[14px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
                />
              </span>
            </div>
          </div>

          {/* Top-right: export + share + account + chat */}
          <div
            className="pointer-events-none absolute top-3 z-40 hidden md:block"
            style={{
              right:
                workspaceMode === 'dev' && inspectOpen
                  ? getInspectDockWidth() + 16
                  : 16,
            }}
          >
            <div className="pointer-events-auto flex items-center gap-2">
              <EditorTopExportButton />
              <Tooltip tip={t('editor.share')} placement="bottom">
                <button
                  type="button"
                  aria-label={t('editor.share')}
                  onClick={() => setShareOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
                >
                  <HiOutlineShare className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {t('editor.share')}
                </button>
              </Tooltip>
              <WalletAccountChip />
              {!agentOpen ? (
                <button
                  type="button"
                  onClick={() => setAgentOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
                >
                  <TbMessage2Filled className="h-4 w-4 shrink-0 text-[var(--ink)]" />
                  {t('editor.chat')}
                </button>
              ) : null}
            </div>
          </div>

          {!isDevMode && pathEditOpen ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2 hidden md:block">
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
            <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2 hidden md:block">
              <PenStrokeToolbar
                mode={activeTool === 'pencil' ? 'pencil' : 'pen'}
                placement="dock"
              />
            </div>
          ) : null}

          {!isDevMode && activeTool === 'bucket' ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2 hidden md:block">
              <BucketFillToolbar />
            </div>
          ) : null}

          <div
            className="relative min-h-0 flex-1"
            onPointerDown={(e) => {
              // Blur any focused input (e.g. agent composer) when clicking the canvas,
              // unless the pointer target is itself interactive.
              const active = window.document.activeElement as HTMLElement | null;
              if (
                active &&
                active !== e.currentTarget &&
                !e.currentTarget.contains(active) === false &&
                (active.tagName === 'INPUT' ||
                  active.tagName === 'TEXTAREA' ||
                  active.isContentEditable)
              ) {
                active.blur();
              }
            }}
          >
            {!isMobileViewport && document ? (
              <RcbCanvas
                artboard={worldBounds}
                camera={camera}
                onCameraChange={setCamera}
                panMode={panMode}
                emptyDragPans={false}
                panBlockSelector={EDITOR_PAN_BLOCK_SELECTOR}
                background={stageBackground}
                stageRef={stageRef}
                cursor={canvasCursor}
                defs={<RcbSvgDefs />}
                showGrid={isGridMode}
                gridSize={gridSize}
              >
                {frames.map((frame) =>
                  frame.hidden ? null : (
                  <HtmlArtboardFrame
                    key={`body-${frame.id}`}
                    frame={frame}
                    zIndex={stackZIndex(document, 'frame', frame.id)}
                    selected={
                      !isDevMode &&
                      (selectedFrameIds.length
                        ? selectedFrameIds.includes(frame.id)
                        : frame.id === activeFrameId)
                    }
                    layer="body"
                  />
                  )
                )}

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
                  onReady={onCanvasReady}
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
                <VideoTrimSessionHost document={document} />

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
                {frames.map((frame) =>
                  frame.hidden ? null : (
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
                    onMove={
                      isDevMode
                        ? undefined
                        : (x, y, opts) => onMoveFrame(frame.id, x, y, opts)
                    }
                    onMoveStart={isDevMode ? undefined : onFrameMoveStart}
                    onMoveEnd={isDevMode ? undefined : onFrameMoveEnd}
                    layer="label"
                  />
                  )
                )}

                {frameGuides.length ? (
                  <div
                    className="pointer-events-none absolute left-0 top-0 z-[50] overflow-visible"
                    style={{ width: worldSurface.width, height: worldSurface.height }}
                  >
                    <AlignGuidesOverlay guides={frameGuides} />
                  </div>
                ) : null}

                {/* Artboard toolbar: single-frame selection, or multi-frame with no nodes.
                    Mixed frame+nodes uses MultiSelectionToolbar in SelectionFeature. */}
                {!isDevMode &&
                selectedFrames.length >= 1 &&
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

          {/* Fig.2 bottom-center tools — desktop-style on all viewports */}
          {!isDevMode ? (
            <div
              data-tour="editor-tools"
              className={cn(
                'pointer-events-none absolute left-1/2 z-20 -translate-x-1/2',
                'bottom-4'
              )}
            >
              <div className="pointer-events-auto">
                <EditorToolStrip camera={camera} stageEl={stageEl} compact={false} />
              </div>
            </div>
          ) : null}

          {/* Bottom-left HUD — lift only when it would collide with the center toolstrip.
              Floating panels (minimap / shortcuts) sit inside the same container but
              bottomHudRef is pinned on FloatingToolbar only, so panel height does not
              affect the collision measurement. */}
          <div
            className={cn(
              'pointer-events-none absolute left-4 z-20 flex flex-col items-start gap-2',
              stackBottomHud ? 'bottom-[4.75rem]' : 'bottom-4'
            )}
          >
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
            {shortcutsOpen ? (
              <EditorShortcutsPanel onClose={() => setShortcutsOpen(false)} />
            ) : null}
            <FloatingToolbar ref={bottomHudRef} className="pointer-events-auto w-fit px-2 text-[12px] text-[var(--ink)] shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
              {!isDevMode ? (
                <>
                  {useCompactTooling ? (
                    <>
                      <HudBtn
                        tip={toolsExpanded ? t('editor.tools.hideTools', { defaultValue: '收起' }) : t('editor.tools.showTools', { defaultValue: '展开' })}
                        active={toolsExpanded}
                        onClick={() => setToolsExpanded((v) => !v)}
                      >
                        {toolsExpanded
                          ? <HiOutlineChevronDown className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                          : <HiOutlineChevronUp className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                        }
                      </HudBtn>
                      {toolsExpanded ? (
                        <>
                          <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
                          <HudBtn tip={t('editor.layers')} active={layersOpen} onClick={() => setLayersOpen((v) => !v)}>
                            <HiOutlineSquare3Stack3D className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                          </HudBtn>
                          <HudBtn tip={t('editor.minimap')} active={minimapOpen} onClick={toggleMinimap}>
                            <HiOutlineMap className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                          </HudBtn>
                          <span data-shortcuts-toggle>
                            <HudBtn
                              tip={t('editor.shortcuts.title')}
                              active={shortcutsOpen}
                              onClick={toggleShortcuts}
                            >
                              <LuKeyboard className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                            </HudBtn>
                          </span>
                          <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
                        </>
                      ) : null}
                    </>
                  ) : (
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
                      <HudBtn tip={t('editor.minimap')} active={minimapOpen} onClick={toggleMinimap}>
                        <HiOutlineMap className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                      </HudBtn>
                      <span data-shortcuts-toggle>
                        <HudBtn
                          tip={t('editor.shortcuts.title')}
                          active={shortcutsOpen}
                          onClick={toggleShortcuts}
                        >
                          <LuKeyboard className={HUD_ICON} strokeWidth={HUD_ICON_STROKE} />
                        </HudBtn>
                      </span>
                      <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
                    </>
                  )}
                </>
              ) : null}
              <Dropdown
                trigger="click"
                open={zoomMenuOpen}
                onOpenChange={setZoomMenuOpen}
                placement="top-start"
                strategy="fixed"
                items={zoomMenuItems}
                onClick={onZoomMenuClick}
                popupClassName="min-w-[12.5rem]"
                selectedKeys={zoomSelectedKeys}
              >
                <button
                  type="button"
                  aria-label={t('editor.zoomMenu')}
                  className={cn(
                    ZOOM_TRIGGER_BASE,
                    zoomMenuOpen ? ZOOM_TRIGGER_OPEN : ZOOM_TRIGGER_IDLE
                  )}
                >
                  <span className="text-[12px] font-medium tabular-nums text-[var(--ink)]">
                    {zoomPercent}%
                  </span>
                  <HiOutlineChevronDown className="h-3 w-3 shrink-0 text-[var(--muted)]" />
                </button>
              </Dropdown>
            </FloatingToolbar>
          </div>
        </main>

        {workspaceMode === 'dev' ? (
          inspectOpen ? (
            <DevPropertiesPanel onClose={() => setInspectOpen(false)} />
          ) : null
        ) : (
          <AgentDock
            open={isMobileViewport ? true : agentOpen}
            onClose={() => {
              if (!isMobileViewport) setAgentOpen(false);
            }}
            floating={isMobileViewport}
            allowedInteractionModes={isMobileViewport ? ['image'] : undefined}
            draftPrompt={agentDraft}
            autoSubmitDraft={agentAutoSubmit}
            draftAttachments={agentDraftAttachments}
            draftContexts={agentDraftContexts}
            draftModelId={agentDraftModelId}
            draftInteractionMode={agentDraftInteractionMode}
            draftImageAspectRatio={agentDraftImageAspect}
            draftScene={agentDraftScene}
            onDraftConsumed={() => {
              clearHomeAgentBoot();
              setAgentDraft(null);
              setAgentAutoSubmit(false);
              setAgentDraftAttachments([]);
              setAgentDraftContexts([]);
              setAgentDraftModelId(null);
              setAgentDraftInteractionMode(null);
              setAgentDraftImageAspect(null);
              setAgentDraftScene(null);
            }}
            attachToChat={attachToChat}
            onAttachConsumed={() => setAttachToChat(null)}
            dataTour={agentOpen ? 'editor-agent' : undefined}
            projectName={isMobileViewport ? projectName : undefined}
            onGoHome={isMobileViewport ? () => {
              void (async () => {
                try { await flushCurrentProjectNow({ force: true }); } catch { /* ignore */ }
                navigate('/home');
              })();
            } : undefined}
            canvasUi={{
              getZoom: () => camera.zoom,
              zoomIn: onZoomIn,
              zoomOut: onZoomOut,
              setZoom: (z) => zoomAtStageCenter(z),
              fitView: onFitView,
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

      {isMobileViewport && layersOpen ? (
        <>
          <button
            type="button"
            aria-label={t('editor.closePanel')}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setLayersOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50">
            <LayerPanel
              mobile
              onClose={() => setLayersOpen(false)}
              onSelectNode={(nodeId) => {
                focusLayerNode(nodeId);
                setLayersOpen(false);
              }}
              onSelectFrame={(frameId) => {
                focusLayerFrame(frameId);
                setLayersOpen(false);
              }}
            />
          </div>
        </>
      ) : null}

      {isMobileViewport && agentOpen ? (
        <button
          type="button"
          aria-label={t('agent.closePanel')}
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setAgentOpen(false)}
        />
      ) : null}

      {bootOpen ? <EditorBootOverlay progress={bootProgress} exiting={bootExiting} /> : null}
      {shareOpen ? (
        <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
      ) : null}
      <EditorOnboardingTour
        ready={!bootOpen}
        onOpenAgent={() => {
          dispatch(setWorkspaceMode('design'));
          setAgentOpen(true);
        }}
      />
    </div>
  );
}

export default memo(EditorPage);
