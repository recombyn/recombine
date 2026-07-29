import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineChevronDown,
  HiOutlineCodeBracket,
  HiOutlineMap,
} from 'react-icons/hi2';
import DevPropertiesPanel, {
  getInspectDockWidth,
} from '@/components/editor/panels/DevPropertiesPanel';
import { EditorTopExportButton } from '@/components/editor/panels/ExportSelectionPanel';
import WalletAccountChip from '@/components/layout/WalletAccountChip';
import {
  RcbCanvas,
  RcbSvgDefs,
  RCB_DEFAULT_CAMERA as DEFAULT_CAMERA,
  zoomAtPoint,
  type RcbCamera as CanvasCamera,
} from '@/components/rcb';
import SvgCanvas from '@/components/editor/canvas/svg/SvgCanvas';
import HtmlArtboardFrame from '@/components/rcb/frames/HtmlArtboardFrame';
import { stackZIndex } from '@/components/rcb/scene/sceneDocument';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import EditorMinimap from '@/components/editor/chrome/EditorMinimap';
import { Dropdown, Tooltip } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import { cn } from '@/utils/classnames';
import {
  setActiveTool,
  setDocument,
  setSelectedNodeIds,
  setWorkspaceMode,
  type ArtboardFrame,
} from '@/store/modules/editor';
import { normalizeDocument } from '@/components/rcb/scene/sceneDocument';
import { fetchShareApi, type ShareDto } from '@/apis/shares';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';

const ZOOM_TRIGGER_BASE =
  'inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1.5 rounded px-2.5 transition-colors';
const ZOOM_TRIGGER_OPEN = 'bg-[var(--accent-soft)] text-[var(--ink)]';
const ZOOM_TRIGGER_IDLE =
  'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]';
const HUD_ICON = 'h-4 w-4';

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
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/**
 * Public / ACL share viewer (preview / inspect).
 * Authorized editors redirect into the normal EditorPage.
 */
export default function SharePage() {
  const { shareId = '' } = useParams();
  const { t } = useTranslation();
  const location = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const viewerId = useSelector((s: any) => s.auth?.user?.id as string | undefined);
  const document = useSelector((s: any) => s.editor.document);
  const selectedNodeId = useSelector((s: any) => s.editor.selectedNodeId);
  const selectedNodeIds = useSelector((s: any) => s.editor.selectedNodeIds || []);
  const documentPatchToken = useSelector((s: any) => s.editor.documentPatchToken);
  const lastPatchedNodeIds = useSelector(
    (s: any) => (s.editor.lastPatchedNodeIds as string[]) || []
  );
  const sceneReloadToken = useSelector((s: any) => s.editor.sceneReloadToken);
  const [record, setRecord] = useState<ShareDto | null>(null);
  const [missing, setMissing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [camera, setCamera] = useState<CanvasCamera>(DEFAULT_CAMERA);
  const [inspectOpen, setInspectOpen] = useState(true);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setStageEl(stageRef.current);
  }, []);

  const canEdit = Boolean(record?.viewerCanEdit);
  const canView = Boolean(record?.viewerCanView);
  const loginUrl = buildLoginUrl(location.pathname + location.search);

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
  const zoomMenuItems = useMemo<MenuItemType[]>(
    () => [
      { key: 'in', label: t('editor.zoomIn') },
      { key: 'out', label: t('editor.zoomOut') },
      { key: '100', label: t('editor.zoomToPercent', { percent: 100 }) },
      { key: '50', label: t('editor.zoomToPercent', { percent: 50 }) },
    ],
    [t]
  );

  const onZoomMenuClick = useCallback(
    ({ key }: { key: string }) => {
      setZoomMenuOpen(false);
      if (key === 'in') onZoomIn();
      else if (key === 'out') onZoomOut();
      else if (key === '100') zoomAtStageCenter(1);
      else if (key === '50') zoomAtStageCenter(0.5);
    },
    [onZoomIn, onZoomOut, zoomAtStageCenter]
  );

  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    setForbidden(false);
    setRecord(null);
    void fetchShareApi(shareId)
      .then((res) => {
        if (cancelled) return;
        const s = res.share;
        if (!s) {
          setMissing(true);
          return;
        }
        if (s.viewerCanEdit) {
          // Owner → live project when known; collaborators stay on the share doc.
          const isOwner = Boolean(viewerId && s.ownerId === viewerId);
          const src = String(s.sourceProjectId || '').trim();
          const dest = isOwner && src ? src : s.id;
          navigate(`/editor/${encodeURIComponent(dest)}`, { replace: true });
          return;
        }
        if (!s.viewerCanView || !s.document) {
          setRecord(s);
          setForbidden(true);
          return;
        }
        setRecord(s);
        dispatch(setDocument(normalizeDocument(s.document)));
        dispatch(setSelectedNodeIds([]));
        dispatch(setWorkspaceMode('dev'));
        dispatch(setActiveTool('select'));
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
          setRecord(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shareId, dispatch, navigate, viewerId]);

  const frames: ArtboardFrame[] = Array.isArray(document?.frames) ? document.frames : [];
  const worldBounds = frames.length
    ? framesBounds(frames)
    : { x: 0, y: 0, width: Number(document?.width) || 794, height: Number(document?.height) || 1123 };
  const worldSurface = {
    x: 0,
    y: 0,
    width: Math.max(3600, worldBounds.x + worldBounds.width + 800),
    height: Math.max(2400, worldBounds.y + worldBounds.height + 800),
  };

  const stageBackground = useMemo(() => {
    const raw = String(document?.backgroundColor || '').trim();
    if (!raw || raw === 'none') return undefined;
    return cssSolidWithOpacity(raw, Number(document?.backgroundOpacity ?? 100));
  }, [document?.backgroundColor, document?.backgroundOpacity]);

  if (missing) {
    return (
      <div className="relative flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 bg-[var(--canvas)] px-6">
        <div className="pointer-events-none absolute right-4 top-3 z-20">
          <div className="pointer-events-auto">
            <WalletAccountChip />
          </div>
        </div>
        <p className="text-[15px] font-medium text-[var(--ink)]">
          {t('editor.shareMissing', { defaultValue: '分享丝存在或已失效' })}
        </p>
        <p className="text-[13px] text-[var(--muted)]">
          {t('editor.shareMissingHint', { defaultValue: '链接坯能已过期，或分享已被删除。' })}
        </p>
      </div>
    );
  }

  if (forbidden || (record && !canView)) {
    return (
      <div className="relative flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 bg-[var(--canvas)] px-6">
        <div className="pointer-events-none absolute right-4 top-3 z-20">
          <div className="pointer-events-auto">
            <WalletAccountChip />
          </div>
        </div>
        <p className="text-[15px] font-medium text-[var(--ink)]">
          {t('editor.shareNoViewAccess')}
        </p>
        <p className="max-w-sm text-center text-[13px] text-[var(--muted)]">
          {viewerId
            ? t('editor.shareNoViewAccessHint')
            : t('editor.shareLoginToView')}
        </p>
        {!viewerId ? (
          <Link
            to={loginUrl}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)]"
          >
            <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
            {t('auth.login')}
          </Link>
        ) : null}
      </div>
    );
  }

  if (!record || !document || canEdit) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-[var(--canvas)] text-[13px] text-[var(--muted)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--canvas)]">
      <div className="pointer-events-none absolute left-4 top-3 z-40">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <span className="max-w-[min(16rem,calc(100vw-14rem))] truncate text-[14px] font-medium text-[var(--ink)]">
            {record.name}
          </span>
          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--muted)] ring-1 ring-[var(--line)]">
            {t('editor.sharePreviewOnly', { defaultValue: t('editor.sharePreview') })}
          </span>
        </div>
      </div>

      <div
        className="pointer-events-none absolute top-3 z-40"
        style={{
          right: inspectOpen ? getInspectDockWidth() + 16 : 16,
        }}
      >
        <div className="pointer-events-auto flex items-center gap-2">
          <EditorTopExportButton />
          <button
            type="button"
            onClick={() => setInspectOpen((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium shadow-sm ring-1 ring-[var(--line)]',
              inspectOpen
                ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                : 'bg-[var(--surface)] text-[var(--ink)]'
            )}
          >
            <HiOutlineCodeBracket className="h-4 w-4" />
            {t('editor.devInspect')}
          </button>
          <WalletAccountChip />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <RcbCanvas
            artboard={worldBounds}
            camera={camera}
            onCameraChange={setCamera}
            panMode={false}
            emptyDragPans={false}
            background={stageBackground}
            stageRef={stageRef}
            defs={<RcbSvgDefs />}
          >
            {frames.map((frame) =>
              frame.hidden ? null : (
              <HtmlArtboardFrame
                key={`body-${frame.id}`}
                frame={frame}
                zIndex={stackZIndex(document, 'frame', frame.id)}
                selected={false}
                layer="body"
                hideTitle
              />
              )
            )}

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
              readOnly
              embedded
              stageEl={stageEl}
            />

            {frames.map((frame) =>
              frame.hidden ? null : (
              <HtmlArtboardFrame
                key={`label-${frame.id}`}
                frame={frame}
                selected={false}
                layer="label"
                hideTitle
              />
              )
            )}
          </RcbCanvas>

          {/* Preview HUD — zoom / minimap (edit tools live on EditorPage) */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2">
            {minimapOpen ? (
              <EditorMinimap
                document={document}
                frames={frames}
                camera={camera}
                stageEl={stageEl}
                activeFrameId={null}
                selectedFrameIds={[]}
                selectedNodeIds={selectedNodeIds}
                onCameraChange={setCamera}
                canvasBg={stageBackground}
              />
            ) : null}
            <FloatingToolbar className="pointer-events-auto w-fit px-2 text-[12px] text-[var(--ink)] shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
              <Tooltip tip={t('editor.minimap')} placement="top">
                <button
                  type="button"
                  aria-label={t('editor.minimap')}
                  onClick={() => setMinimapOpen((v) => !v)}
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded transition-colors',
                    minimapOpen
                      ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                      : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]'
                  )}
                >
                  <HiOutlineMap className={HUD_ICON} strokeWidth={1.75} />
                </button>
              </Tooltip>
              <span className="mx-0.5 h-3.5 w-px bg-black/10" aria-hidden />
              <Dropdown
                trigger="click"
                open={zoomMenuOpen}
                onOpenChange={setZoomMenuOpen}
                placement="top-start"
                strategy="fixed"
                items={zoomMenuItems}
                onClick={onZoomMenuClick}
                popupClassName="min-w-[10rem]"
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
        </div>

        {inspectOpen ? (
          <DevPropertiesPanel onClose={() => setInspectOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}
