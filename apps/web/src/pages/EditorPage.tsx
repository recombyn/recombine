import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/base';
import {
  peekHomeAgentBoot,
  clearHomeAgentBoot,
  attachmentsFromBoot,
  contextsFromBoot,
} from '@/utils/homeAgentBoot';
import { withReturnTo } from '@/utils/authReturnTo';
import { store } from '@/store';
import { useProjectCloudSync, flushCurrentProjectNow } from '@/components/editor/useProjectCloudSync';
import { CollabRoomProvider } from '@/components/editor/collab/CollabRoomProvider';
import { isCollabActive } from '@/components/editor/collab/collabRuntime';
import type { ComposerContext } from '@/components/editor/panels/AgentComposerInput';
import AgentDock from '@/components/editor/panels/AgentDock';
import DevPropertiesPanel from '@/components/editor/panels/DevPropertiesPanel';
import ShareDialog from '@/components/editor/panels/ShareDialog';
import { fetchShareApi, updateShareDocumentApi } from '@/apis/shares';
import EditorBootOverlay from '@/components/editor/chrome/EditorBootOverlay';
import {
  RCB_DEFAULT_CAMERA as DEFAULT_CAMERA,
  rcbFitCamera,
  rcbViewportSceneBounds,
  zoomAtPoint,
  PENCIL_CURSOR,
  ERASER_CURSOR,
  PEN_CURSOR,
  BUCKET_CURSOR,
  type RcbCamera as CanvasCamera,
} from '@/components/rcb';
import LayerPanel from '@/components/editor/panels/LayerPanel';
import EditorToolStrip from '@/components/editor/chrome/EditorToolStrip';
import type { PathEditSubtool } from '@/components/editor/chrome/PathEditToolbar';
import { getDocumentGridSize } from '@/components/rcb/selection/alignGuides';
import { cn } from '@/utils/classnames';
import { fetchProject } from '@/apis/projects';
import { createEmptyDocument, listSceneNodes } from '@/components/rcb/scene/document/sceneDocument';
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
  setActiveFrameId,
  setMixedSelection,
  setGridMode,
  setSelectedNodeId,
  setTemplateThumbnail,
  setWorkspaceMode,
  bakeDocumentOrigin,
  EMPTY_ID_LIST,
} from '@/store/modules/editor';
import { normalizeProjectThumbnailUrls } from '@/utils/projectThumb';
import type { ArtboardFrame } from '@/components/rcb/frames/types';
import type { FillPanelValue } from '@/components/editor/panels/FillPanel';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import {
  cssPreviewForGradient,
  DEFAULT_FILL_IMAGE_ADJUST,
  parseFillGradient,
  parseFillImageFit,
  parseFillType,
  type FillType,
} from '@/components/rcb/scene/document/sceneFill';
import EditorOnboardingTour from '@/components/editor/chrome/EditorOnboardingTour';
import EditorTopChrome, { flushAndGoHome } from '@/components/editor/page/EditorTopChrome';
import EditorToolDocks from '@/components/editor/page/EditorToolDocks';
import EditorBottomHud, { isThemeFollowCanvasBg } from '@/components/editor/page/EditorBottomHud';
import EditorStageWorld from '@/components/editor/page/EditorStageWorld';

const BOOT_MIN_MS = 520;
const BOOT_EXIT_MS = 280;

/** Jump diagnostics — console JSON lines + `window.__rcbJumpLog` / `__rcbJumpDump()`. */
function rcbJumpLog(event: string, data: Record<string, unknown> = {}) {
  const row = { event, t: Math.round(performance.now()), ...data };
  const w = window as Window & {
    __rcbJumpLog?: unknown[];
    __rcbJumpDump?: () => string;
  };
  if (!Array.isArray(w.__rcbJumpLog)) w.__rcbJumpLog = [];
  w.__rcbJumpLog.push(row);
  w.__rcbJumpDump = () => JSON.stringify(w.__rcbJumpLog, null, 2);
}

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

/** True when the scene has real artboards/nodes — not the empty-doc fallback box. */
function editorHasFitContent(doc: any, frames: ArtboardFrame[]): boolean {
  for (const f of frames) {
    if ((Number(f.width) || 0) >= 2 && (Number(f.height) || 0) >= 2) return true;
  }
  for (const { node } of listSceneNodes(doc)) {
    if (!node) continue;
    const w = Math.max(0, Number(node.width) || 0);
    const h = Math.max(0, Number(node.height) || 0);
    if (w >= 2 && h >= 2) return true;
  }
  return false;
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

/** Keep /editor/:id when cloud has no row yet — never mint a second nanoid. */
function seedLocalProjectForUrl(
  targetId: string,
  dispatch: ReturnType<typeof useDispatch>,
  name: string,
  document: unknown
) {
  dispatch(
    importDocument({
      id: targetId,
      name,
      document,
      source: 'user',
      dirty: true,
    })
  );
  void putProjectDraft({
    projectId: targetId,
    name,
    document,
    updatedAt: Date.now(),
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
  // Local-only id (nanoid before first successful PUT): GET would always 404.
  if (draft?.document && !draft.syncedAt) {
    if (isCancelled()) return;
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
      seedLocalProjectForUrl(
        targetId,
        dispatch,
        t('home.untitled'),
        createEmptyDocument({ emptyWorld: true })
      );
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
    seedLocalProjectForUrl(
      targetId,
      dispatch,
      t('home.untitled'),
      createEmptyDocument({ emptyWorld: true })
    );
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
  /** Enter page / fit-to-canvas — menu highlights「适应画布」until user picks another zoom. */
  const [zoomFitActive, setZoomFitActive] = useState(true);
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
  /** Local session: selection + grid. Camera fits once after stage layout (below). */
  const sessionReadyForIdRef = useRef<string | null>(null);
  const didInitialFitRef = useRef(false);
  /** User pan/zoom — do not overwrite with auto-fit. */
  const cameraUserTouchedRef = useRef(false);
  const gridUserTouchedRef = useRef(false);
  /** Apply sessionStorage home boot at most once per EditorPage lifetime. */
  const homeAgentBootAppliedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const document = useSelector((state: any) => state.editor.document);
  useProjectCloudSync();
  const sceneReloadToken = useSelector((state: any) => state.editor.sceneReloadToken);
  const documentPatchToken = useSelector((state: any) => state.editor.documentPatchToken);
  const lastPatchedNodeIds = useSelector(
    (state: any) => (state.editor.lastPatchedNodeIds as string[]) ?? EMPTY_ID_LIST
  );
  const selectedNodeId = useSelector((state: any) => state.editor.selectedNodeId);
  const selectedNodeIds = useSelector(
    (state: any) => (state.editor.selectedNodeIds as string[]) ?? EMPTY_ID_LIST
  );
  const selectedFrameIds = useSelector(
    (state: any) => (state.editor.selectedFrameIds as string[]) ?? EMPTY_ID_LIST
  );
  const currentId = useSelector((state: any) => state.editor.currentId as string | null);
  const templates = useSelector((state: any) => state.editor.templates as any[]);
  const currentTemplate = useSelector((state: any) =>
    state.editor.templates.find((item: any) => item.id === state.editor.currentId)
  );

  // Persist share-edit sessions back to the shares API (not projects).
  // When a Yjs room is active, CollabRoomProvider owns the debounced write.
  const shareSaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!currentId?.startsWith('share_') || !document) return undefined;
    if (isCollabActive()) return undefined;
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
  const selectedFrames = frames.filter(
    (f) => !f.hidden && selectedFrameIds.includes(f.id)
  );
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageEl;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const apply = () => {
      const next = {
        width: Math.max(1, el.clientWidth),
        height: Math.max(1, el.clientHeight),
      };
      setStageSize((prev) => {
        if (prev.width === next.width && prev.height === next.height) return prev;
        rcbJumpLog('stageSize', {
          prev,
          next,
          bootOpen: bootOpenRef.current,
          didFit: didInitialFitRef.current,
        });
        return next;
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageEl]);

  /**
   * Catch late auto-fit / collab camera writes AFTER boot.
   * Skip when the user already owns the camera — otherwise every wheel zoom
   * spam-logs as `afterReveal` and looks like a reveal fight (it is not).
   */
  useEffect(() => {
    if (bootOpen) return;
    if (cameraUserTouchedRef.current) return;
    rcbJumpLog('camera.afterReveal', {
      x: Number(camera.x.toFixed(2)),
      y: Number(camera.y.toFixed(2)),
      zoom: Number(camera.zoom.toFixed(4)),
      userTouched: false,
      stageW: stageSize.width,
      stageH: stageSize.height,
      stack: (new Error().stack || '')
        .split('\n')
        .slice(2, 10)
        .map((s) => s.trim()),
    });
  }, [bootOpen, camera.x, camera.y, camera.zoom, stageSize.width, stageSize.height]);

  // Scene paper follows content bounds only. Camera pan/zoom is CSS on RcbCanvas —
  // never resize/slide SVG viewBox to chase the frustum.
  const worldSurface = document
    ? computeWorldSurface(document, frames)
    : { x: 0, y: 0, width: 3600, height: 2400 };
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
      const ed = (store.getState() as any).editor as {
        currentId?: string | null;
        document?: unknown;
        templates?: { id: string; name?: string }[];
      };
      const id = String(ed?.currentId || '');
      // Persist before first edit so refresh / hydrate won't GET a missing cloud row.
      if (id && ed.document) {
        const name =
          ed.templates?.find((x) => x.id === id)?.name || t('home.untitled');
        void putProjectDraft({
          projectId: id,
          name,
          document: ed.document,
          updatedAt: Date.now(),
          syncedAt: null,
          cloudRevision: null,
          baseDocument: null,
        });
      }
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

  /** Local session: selection + grid. Camera fits once after stage layout (below). */
  useEffect(() => {
    sessionReadyForIdRef.current = null;
    didInitialFitRef.current = false;
    cameraUserTouchedRef.current = false;
    gridUserTouchedRef.current = false;
    setZoomFitActive(true);
    // Keep previous camera until fit — snapping to DEFAULT here causes a visible jump.
    dispatch(setGridMode(false));
  }, [currentId, dispatch]);

  useEffect(() => {
    if (!currentId || !document) return;
    if (sessionReadyForIdRef.current === currentId) return;
    let cancelled = false;
    async function restoreSession() {
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
    }
    restoreSession();
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
    const el = stageRef.current;
    rcbJumpLog('finishBoot.start', {
      waitMs: Math.max(0, BOOT_MIN_MS - (Date.now() - bootStartedAt.current)),
      stageW: el?.clientWidth || 0,
      stageH: el?.clientHeight || 0,
      camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    });
    const wait = Math.max(0, BOOT_MIN_MS - (Date.now() - bootStartedAt.current));
    window.setTimeout(() => {
      setBootProgress(100);
      setBootExiting(true);
      rcbJumpLog('finishBoot.exiting', {
        stageW: stageRef.current?.clientWidth || 0,
        stageH: stageRef.current?.clientHeight || 0,
      });
      bootExitTimer.current = window.setTimeout(() => {
        bootOpenRef.current = false;
        setBootOpen(false);
        setBootExiting(false);
        bootExitTimer.current = null;
        rcbJumpLog('finishBoot.revealed', {
          stageW: stageRef.current?.clientWidth || 0,
          stageH: stageRef.current?.clientHeight || 0,
        });
      }, BOOT_EXIT_MS);
    }, wait);
  };

  // Empty / content fit + boot reveal are handled by the stage-layout initial-fit effect.

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
    if (!el) return;
    cameraUserTouchedRef.current = true;
    setZoomFitActive(false);
    // Layout px (clientWidth) — same space as camera.x/y. getBoundingClientRect is visual
    // and drifts under browser zoom / CSS scale, which makes content jump off-screen.
    setCamera((c) =>
      zoomAtPoint(c, nextZoom, el.clientWidth / 2, el.clientHeight / 2)
    );
  }, []);

  const onZoomIn = useCallback(() => {
    cameraUserTouchedRef.current = true;
    setZoomFitActive(false);
    setCamera((c) => {
      const el = stageRef.current;
      if (!el) return c;
      const next = Math.min(8, Number((c.zoom * 1.1).toFixed(4)));
      return zoomAtPoint(c, next, el.clientWidth / 2, el.clientHeight / 2);
    });
  }, []);

  const onZoomOut = useCallback(() => {
    cameraUserTouchedRef.current = true;
    setZoomFitActive(false);
    setCamera((c) => {
      const el = stageRef.current;
      if (!el) return c;
      const next = Math.max(0.05, Number((c.zoom / 1.1).toFixed(4)));
      return zoomAtPoint(c, next, el.clientWidth / 2, el.clientHeight / 2);
    });
  }, []);

  const onFitView = useCallback((): boolean => {
    const el = stageRef.current;
    const vw = el?.clientWidth || 0;
    const vh = el?.clientHeight || 0;
    // Match RcbCanvas autofit gate — tiny/unlaid-out stages must not count as fitted.
    if (vw < 40 || vh < 40) {
      rcbJumpLog('fitView.skipTiny', { vw, vh });
      return false;
    }
    const doc = (store.getState() as any).editor?.document;
    const fr: ArtboardFrame[] = Array.isArray(doc?.frames) ? doc.frames : [];
    // Empty scene → 100%. With content → fit all artboards/nodes with 120px margins.
    if (!editorHasFitContent(doc, fr)) {
      const next = { ...DEFAULT_CAMERA, zoom: 1 };
      rcbJumpLog('fitView.empty100', { vw, vh, next });
      setCamera(next);
      setZoomFitActive(true);
      return true;
    }
    const bounds = editorContentBounds(doc, fr);
    const next = rcbFitCamera({ width: vw, height: vh }, bounds, 120, 1);
    rcbJumpLog('fitView', {
      vw,
      vh,
      bounds,
      docOrigin: { x: Number(doc?.x) || 0, y: Number(doc?.y) || 0 },
      next: {
        x: Number(next.x.toFixed(2)),
        y: Number(next.y.toFixed(2)),
        zoom: Number(next.zoom.toFixed(4)),
      },
      bootOpen: bootOpenRef.current,
      userTouched: cameraUserTouchedRef.current,
    });
    // Camera pan/zoom only — never move node/frame scene coordinates.
    setCamera(next);
    setZoomFitActive(true);
    return true;
  }, []);

  /** Manual fit (toolbar / shortcut) — stop auto re-fit after this. */
  const onFitViewManual = useCallback((): boolean => {
    cameraUserTouchedRef.current = true;
    return onFitView();
  }, [onFitView]);

  /** Pan/zoom from the canvas — marks camera as user-owned. */
  const onCanvasCameraChange = useCallback((next: CanvasCamera) => {
    cameraUserTouchedRef.current = true;
    setZoomFitActive(false);
    rcbJumpLog('camera.user', {
      x: Number(next.x.toFixed(2)),
      y: Number(next.y.toFixed(2)),
      zoom: Number(next.zoom.toFixed(4)),
    });
    setCamera(next);
  }, []);

  /**
   * Fit camera **before** boot overlay dismisses — once content is visible, never
   * auto-adjust again (no post-reveal re-fit when AgentDock width settles).
   */
  useEffect(() => {
    if (!document || !currentId) return;
    if (didInitialFitRef.current) return;

    // Bake store origin before first fit — canvasDocument paints at 0,0; a late
    // align remount would jump every host after the overlay lifts.
    const ox = Number(document.x) || 0;
    const oy = Number(document.y) || 0;
    if (ox !== 0 || oy !== 0) {
      rcbJumpLog('bakeDocumentOrigin', { ox, oy, currentId });
      dispatch(bakeDocumentOrigin());
      return;
    }

    const hasContent = editorHasFitContent(document, frames);
    if (!hasContent) {
      // Empty project: enter at 100% zoom (no content fit).
      const el = stageRef.current;
      if (el && el.clientWidth >= 40 && el.clientHeight >= 40) {
        setCamera({ ...DEFAULT_CAMERA, zoom: 1 });
        didInitialFitRef.current = true;
        finishBoot();
      }
      return;
    }

    // Boot already gone (e.g. empty → agent added nodes): skip auto-fit to avoid jump.
    if (!bootOpenRef.current) {
      didInitialFitRef.current = true;
      return;
    }

    let cancelled = false;
    let tries = 0;
    let lastW = 0;
    let lastH = 0;
    let stableFrames = 0;

    const finishOnce = (fitted: boolean) => {
      if (cancelled) return;
      didInitialFitRef.current = true;
      rcbJumpLog('initialFit.done', {
        fitted,
        stageW: stageRef.current?.clientWidth || 0,
        stageH: stageRef.current?.clientHeight || 0,
        tries,
        stableFrames,
      });
      finishBoot();
    };

    const tick = () => {
      if (cancelled || didInitialFitRef.current) return;
      const el = stageRef.current;
      if (!el || el.clientWidth < 40 || el.clientHeight < 40) {
        if (tries++ < 90) {
          requestAnimationFrame(tick);
          return;
        }
        finishOnce(false);
        return;
      }

      const w = el.clientWidth;
      const h = el.clientHeight;
      // Wait until stage size stops changing (AgentDock flex) while boot still covers.
      if (Math.abs(w - lastW) <= 1 && Math.abs(h - lastH) <= 1) {
        stableFrames += 1;
      } else {
        if (lastW || lastH) {
          rcbJumpLog('initialFit.stageUnstable', {
            from: { w: lastW, h: lastH },
            to: { w, h },
            tries,
          });
        }
        stableFrames = 0;
        lastW = w;
        lastH = h;
      }
      if (stableFrames < 4) {
        if (tries++ < 90) {
          requestAnimationFrame(tick);
          return;
        }
      }

      if (!onFitView()) {
        if (tries++ < 90) {
          requestAnimationFrame(tick);
          return;
        }
        finishOnce(false);
        return;
      }
      // One more frame so the camera transform paints under the overlay, then reveal.
      requestAnimationFrame(() => {
        if (cancelled) return;
        finishOnce(true);
      });
    };

    tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, currentId, frames.length, stageEl, stageSize.width, stageSize.height, onFitView]);

  /** SvgCanvas ready is no longer the fit trigger (see initial-fit effect above). */
  const onCanvasReady = useCallback(() => {
    if (didInitialFitRef.current) finishBoot();
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
        onFitViewManual();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFitViewManual, onZoomIn, onZoomOut, zoomAtStageCenter]);

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
    <CollabRoomProvider stageEl={stageEl} camera={camera} onCameraChange={setCamera}>
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
            <EditorTopChrome
              projectName={projectName}
              workspaceMode={workspaceMode}
              inspectOpen={inspectOpen}
              agentOpen={agentOpen}
              onGoHome={() => void flushAndGoHome(navigate)}
              onRename={(name) => dispatch(renameTemplate(name))}
              onShare={() => setShareOpen(true)}
              onOpenAgent={() => setAgentOpen(true)}
            />

            <EditorToolDocks
              isDevMode={isDevMode}
              pathEditOpen={pathEditOpen}
              pathEditSubtool={pathEditSubtool}
              onPathEditSubtool={setPathEditSubtool}
              onPathEditExit={() => setPathEditOpen(false)}
              activeTool={activeTool}
            />

            <EditorStageWorld
              document={document}
              worldBounds={worldBounds}
              worldSurface={worldSurface}
              camera={camera}
              onCameraChange={onCanvasCameraChange}
              panMode={panMode}
              frameMode={frameMode}
              stageBackground={stageBackground}
              stageRef={stageRef}
              onViewportEl={setStageEl}
              stageEl={stageEl}
              canvasCursor={canvasCursor}
              gridSize={gridSize}
              isDevMode={isDevMode}
              isMobileViewport={isMobileViewport}
              activeTool={activeTool}
              canvasDocument={canvasDocument}
              sceneReloadToken={sceneReloadToken}
              documentPatchToken={documentPatchToken}
              lastPatchedNodeIds={lastPatchedNodeIds}
              selectedNodeId={selectedNodeId}
              selectedNodeIds={selectedNodeIds}
              selectedFrameIds={selectedFrameIds}
              frames={frames}
              selectedFrames={selectedFrames}
              activeFrame={activeFrame}
              canvasFillValue={canvasFillValue}
              canvasBgOpen={canvasBgOpen}
              canvasMeshSelectedIndex={canvasMeshSelectedIndex}
              setCanvasMeshSelectedIndex={setCanvasMeshSelectedIndex}
              canvasMeshShowGuides={canvasMeshShowGuides}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onCanvasReady={onCanvasReady}
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

            <div
              data-tour="editor-tools"
              className={cn(
                'pointer-events-none absolute left-1/2 z-20 -translate-x-1/2',
                'bottom-4'
              )}
            >
              <div className="pointer-events-auto">
                <EditorToolStrip
                  camera={camera}
                  stageEl={stageEl}
                  compact={false}
                  selectOnly={isDevMode}
                />
              </div>
            </div>

            <EditorBottomHud
              document={document}
              frames={frames}
              camera={camera}
              stageEl={stageEl}
              stageBackground={stageBackground}
              activeFrameId={activeFrameId}
              selectedFrameIds={selectedFrameIds}
              selectedNodeIds={selectedNodeIds}
              onCameraChange={onCanvasCameraChange}
              isDevMode={isDevMode}
              useCompactTooling={useCompactTooling}
              layersOpen={layersOpen}
              setLayersOpen={setLayersOpen}
              minimapOpen={minimapOpen}
              setMinimapOpen={setMinimapOpen}
              shortcutsOpen={shortcutsOpen}
              setShortcutsOpen={setShortcutsOpen}
              toolsExpanded={toolsExpanded}
              setToolsExpanded={setToolsExpanded}
              canvasFillValue={canvasFillValue}
              canvasBgOpen={canvasBgOpen}
              setCanvasBgOpen={setCanvasBgOpen}
              canvasMeshSelectedIndex={canvasMeshSelectedIndex}
              setCanvasMeshSelectedIndex={setCanvasMeshSelectedIndex}
              canvasMeshShowGuides={canvasMeshShowGuides}
              setCanvasMeshShowGuides={setCanvasMeshShowGuides}
              zoomPercent={zoomPercent}
              zoomFitActive={zoomFitActive}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onFitView={onFitViewManual}
              zoomAtStageCenter={zoomAtStageCenter}
            />
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
              allowedInteractionModes={isMobileViewport ? ['image', 'video'] : undefined}
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
              onGoHome={
                isMobileViewport
                  ? async () => {
                      try {
                        await flushCurrentProjectNow({ force: true });
                      } catch {
                        /* ignore */
                      }
                      navigate('/home');
                    }
                  : undefined
              }
              canvasUi={{
                getZoom: () => camera.zoom,
                zoomIn: onZoomIn,
                zoomOut: onZoomOut,
                setZoom: (z) => zoomAtStageCenter(z),
                fitView: onFitViewManual,
                getViewportSceneBounds: () => {
                  const w = stageSize.width;
                  const h = stageSize.height;
                  if (!(w > 8 && h > 8)) return null;
                  const b = rcbViewportSceneBounds(camera, { width: w, height: h });
                  return {
                    x: b.x,
                    y: b.y,
                    width: b.width,
                    height: b.height,
                  };
                },
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
    </CollabRoomProvider>
  );

}

export default memo(EditorPage);
