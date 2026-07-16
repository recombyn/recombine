import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import {
  CameraOverlayPortal,
  useCamera,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';
import {
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
} from '@/components/editor/Canvas/selection/selectionToolbarPlacement';
import { patchDocumentNode, setActiveFrameId, setSelectedNodeIds } from '@/store/modules/editor';
import { nodeLeftTop } from '@/store/scene/sceneToSvg';

const DEFAULT_NAME = 'Image';

function imageName(node: any) {
  const raw = String(node?.attrs?.name || node?.attrs?.title || '').trim();
  return raw || DEFAULT_NAME;
}

function ImageLabel({
  nodeId,
  node,
  document,
}: {
  nodeId: string;
  node: any;
  document: any;
}) {
  const dispatch = useDispatch();
  const camera = useCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(imageName(node));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const committedRef = useRef(false);

  const selectImage = () => {
    dispatch(setActiveFrameId(null));
    dispatch(setSelectedNodeIds([nodeId]));
  };

  const { left, top } = nodeLeftTop(document, node);
  const width = Math.max(1, Number(node.width) || 1);
  const height = Math.max(1, Number(node.height) || 1);

  const stageBox = useMemo(() => {
    const origin = worldToStage(camera, left, top);
    return {
      left: origin.x,
      top: origin.y,
      width: width * z,
      height: height * z,
    };
  }, [camera, left, top, width, height, z]);

  const labelStyle = useMemo(
    () => ({
      left: stageBox.left,
      top: stageBox.top - NODE_TITLE_LABEL_GAP_PX - NODE_TITLE_LABEL_LINE_PX,
      width: stageBox.width,
      height: NODE_TITLE_LABEL_LINE_PX,
    }),
    [stageBox]
  );

  useEffect(() => {
    if (!editing) setDraft(imageName(node));
  }, [node, editing]);

  useEffect(() => {
    if (!editing) return;
    committedRef.current = false;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = (value?: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = (value ?? draft).trim() || DEFAULT_NAME;
    setEditing(false);
    if (next !== imageName(node)) {
      dispatch(patchDocumentNode({ nodeId, patch: { attrs: { name: next } } }));
    }
  };

  useEffect(() => {
    if (!editing) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      const target = e.target as Node | null;
      if (root && target && root.contains(target)) return;
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        commit(el?.value);
      });
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
    // commit closes over latest draft/node; rebind while editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, dispatch, node, nodeId, draft]);

  return (
    <div
      ref={rootRef}
      data-image-label
      data-scene-node-id={nodeId}
      className="pointer-events-auto absolute z-[6] flex w-full items-center justify-between gap-2 text-[11px] font-medium leading-none text-[var(--muted)]"
      style={labelStyle}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (editing) return;
        selectImage();
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <span aria-hidden className="select-none">
          #
        </span>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            aria-label="Image name"
            size={Math.max(1, draft.length || 1)}
            className="h-4 appearance-none border-0 bg-transparent p-0 text-[11px] font-medium leading-none text-[var(--ink)] shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
            style={
              {
                width: `${Math.max(1, draft.length || 1)}ch`,
                fieldSizing: 'content',
              } as CSSProperties
            }
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(imageName(node));
                setEditing(false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            className="truncate text-left leading-none text-[var(--muted)] hover:text-[var(--ink)]"
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectImage();
              setDraft(imageName(node));
              setEditing(true);
            }}
          >
            {imageName(node)}
          </button>
        )}
      </div>
      <span className="shrink-0 tabular-nums leading-none text-[var(--muted)] opacity-80">
        {Math.round(width)}
        {' × '}
        {Math.round(height)}
      </span>
    </div>
  );
}

/** Screen-fixed titles above image nodes (same pattern as artboard Frame labels). */
export default function ImageNodeLabels({
  document,
  hidden,
}: {
  document: any;
  /** Hide while move / resize / rotate is in progress. */
  hidden?: boolean;
}): ReactNode {
  const ids = useMemo(() => {
    const children: string[] = document?.deltaSetLike?.ROOT?.children || [];
    return children.filter((id) => {
      const node = document?.deltaSetLike?.[id];
      if (node?.key !== 'image') return false;
      // Skip transient import/process placeholders.
      if (node?.attrs?.processKind) return false;
      return true;
    });
  }, [document]);

  if (hidden || !ids.length) return null;

  return (
    <CameraOverlayPortal>
      {ids.map((id) => {
        const node = document.deltaSetLike[id];
        if (!node) return null;
        return <ImageLabel key={id} nodeId={id} node={node} document={document} />;
      })}
    </CameraOverlayPortal>
  );
}
