import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineClipboardDocument,
  HiOutlineCodeBracket,
  HiOutlineHome,
  HiOutlineLink,
} from 'react-icons/hi2';
import { message } from '@/components/base';
import DevPropertiesPanel from '@/components/editor/panels/DevPropertiesPanel';
import InfiniteCanvasStage, {
  DEFAULT_CAMERA,
  type CanvasCamera,
} from '@/components/editor/Canvas/stage/InfiniteCanvasStage';
import SvgCanvas from '@/components/editor/Canvas/svg/SvgCanvas';
import EditorToolStrip from '@/components/editor/chrome/EditorToolStrip';
import HtmlArtboardFrame from '@/components/editor/nodes/FrameNode/HtmlArtboardFrame';
import FrameSelectionChrome from '@/components/editor/nodes/FrameNode/FrameSelectionChrome';
import ShapeStylePanelHost from '@/components/editor/nodes/ShapeNode/ShapeStylePanelHost';
import { cn } from '@/utils/classnames';
import {
  setActiveTool,
  setDocument,
  setSelectedNodeIds,
  setWorkspaceMode,
  type ArtboardFrame,
} from '@/store/modules/editor';
import { normalizeDocument } from '@/store/scene/sceneDocument';
import {
  copyText,
  getShare,
  shareCopyText,
  shareUrl,
  updateShareDocument,
  type ShareRecord,
} from '@/store/shareStorage';
import { cssSolidWithOpacity } from '@/components/base/colorPanel';

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
 * Public share viewer — preview ≈ Dev inspect view; edit allows canvas changes.
 */
export default function SharePage() {
  const { shareId = '' } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const document = useSelector((s: any) => s.editor.document);
  const selectedNodeId = useSelector((s: any) => s.editor.selectedNodeId);
  const selectedNodeIds = useSelector((s: any) => s.editor.selectedNodeIds || []);
  const documentPatchToken = useSelector((s: any) => s.editor.documentPatchToken);
  const lastPatchedNodeIds = useSelector(
    (s: any) => (s.editor.lastPatchedNodeIds as string[]) || []
  );
  const sceneReloadToken = useSelector((s: any) => s.editor.sceneReloadToken);
  const activeFrameId = useSelector((s: any) => s.editor.activeFrameId as string | null);
  const [record, setRecord] = useState<ShareRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [camera, setCamera] = useState<CanvasCamera>(DEFAULT_CAMERA);
  const [inspectOpen, setInspectOpen] = useState(true);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const shareIdRef = useRef(shareId);
  shareIdRef.current = shareId;

  const canEdit = record?.permission === 'edit';
  const readOnly = !canEdit;

  useEffect(() => {
    const s = getShare(shareId);
    if (!s) {
      setMissing(true);
      setRecord(null);
      return;
    }
    setMissing(false);
    setRecord(s);
    dispatch(setDocument(normalizeDocument(s.document)));
    dispatch(setWorkspaceMode(s.permission === 'preview' ? 'dev' : 'design'));
    dispatch(setActiveTool('select'));
    dispatch(setSelectedNodeIds([]));
    setInspectOpen(s.permission === 'preview');
  }, [shareId, dispatch]);

  // Persist edit-share canvas back to local share store.
  useEffect(() => {
    if (!canEdit || !record?.id || !document) return undefined;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const id = record.id;
    saveTimer.current = window.setTimeout(() => {
      if (shareIdRef.current !== id) return;
      const next = updateShareDocument(id, document);
      if (next) setRecord(next);
    }, 600);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [canEdit, record?.id, document]);

  const frames: ArtboardFrame[] = Array.isArray(document?.frames) ? document.frames : [];
  const activeFrame = frames.find((f) => f.id === activeFrameId) || frames[0] || null;
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

  const url = record ? shareUrl(record.id) : '';

  const onCopyLink = async () => {
    if (!url) return;
    try {
      await copyText(url);
      message.success('链接已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const onCopyText = async () => {
    if (!record || !url) return;
    try {
      await copyText(shareCopyText(record, url));
      message.success('分享文案已复制');
    } catch {
      message.error('复制失败');
    }
  };

  if (missing) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 bg-[var(--canvas)] px-6">
        <p className="text-[15px] font-medium text-[var(--ink)]">分享不存在或已失效</p>
        <p className="text-[13px] text-[var(--muted)]">
          链接可能已过期，或尚未在本机生成过该分享（当前为本地存储预览）。
        </p>
        <Link
          to="/home"
          className="mt-2 inline-flex h-9 items-center rounded-full bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)]"
        >
          回首页
        </Link>
      </div>
    );
  }

  if (!record || !document) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-[var(--canvas)] text-[13px] text-[var(--muted)]">
        加载分享中…
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--canvas)]">
      <div className="pointer-events-none absolute left-4 top-3 z-20">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="首页"
            onClick={() => navigate('/home')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]"
          >
            <HiOutlineHome className="h-4 w-4" />
          </button>
          <span className="max-w-[12rem] truncate text-[14px] font-medium text-[var(--ink)]">
            {record.name}
          </span>
          <span
            className={cn(
              'inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium',
              canEdit
                ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                : 'bg-[var(--surface)] text-[var(--muted)] ring-1 ring-[var(--line)]'
            )}
          >
            {canEdit ? '可编辑' : '仅预览'}
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-3 z-20">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onCopyLink()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]"
          >
            <HiOutlineLink className="h-3.5 w-3.5" />
            复制链接
          </button>
          <button
            type="button"
            onClick={() => void onCopyText()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]"
          >
            <HiOutlineClipboardDocument className="h-3.5 w-3.5" />
            复制文案
          </button>
          {readOnly ? (
            <button
              type="button"
              onClick={() => setInspectOpen((v) => !v)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium shadow-sm ring-1 ring-[var(--line)]',
                inspectOpen
                  ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                  : 'bg-[var(--surface)] text-[var(--ink)]'
              )}
            >
              <HiOutlineCodeBracket className="h-3.5 w-3.5" />
              Dev
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <InfiniteCanvasStage
          artboard={worldBounds}
          camera={camera}
          onCameraChange={setCamera}
          panMode
          emptyDragPans
          background={stageBackground}
          stageRef={stageRef}
        >
          {frames.map((frame) => (
            <HtmlArtboardFrame
              key={`body-${frame.id}`}
              frame={frame}
              selected={false}
              layer="body"
              hideTitle={readOnly}
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
              readOnly={readOnly}
              embedded
            />
          </div>

          {frames.map((frame) => (
            <HtmlArtboardFrame
              key={`label-${frame.id}`}
              frame={frame}
              selected={false}
              layer="label"
              hideTitle={readOnly}
            />
          ))}

          {!readOnly && activeFrame && selectedNodeIds.length === 0 ? (
            <FrameSelectionChrome frame={activeFrame} />
          ) : null}
          {!readOnly ? <ShapeStylePanelHost document={document} /> : null}
        </InfiniteCanvasStage>

        {!readOnly ? (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
            <div className="pointer-events-auto">
              <EditorToolStrip />
            </div>
          </div>
        ) : null}

        {readOnly && inspectOpen ? (
          <div className="absolute bottom-0 right-0 top-0 z-30 flex">
            <DevPropertiesPanel onClose={() => setInspectOpen(false)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
