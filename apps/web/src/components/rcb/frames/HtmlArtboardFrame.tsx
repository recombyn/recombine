import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  RcbOverlayPortal,
  useRcbCamera,
} from '../camera/context';
import {
  rcbSceneToScreen,
} from '../core/math';
import {
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
} from '../selection/SelectionToolbarShell';
import type { ArtboardFrame } from '@/components/rcb/frames/types';

type HtmlArtboardFrameProps = {
  frame: ArtboardFrame;
  selected?: boolean;
  onSelect?: () => void;
  onRename?: (name: string) => void;
  /** Drag the label to move the artboard. */
  onMove?: (x: number, y: number) => void;
  onMoveStart?: () => void;
  /** Label drag ended (clear guides, etc.). */
  onMoveEnd?: () => void;
  /** Hide title while the frame is being moved. */
  hideTitle?: boolean;
  /** body under world canvas; label above so it stays clickable */
  layer?: 'body' | 'label';
};

/**
 * Frame chrome only. Draw/select content lives on the world SvgCanvas.
 * Render `body` under the canvas and `label` above it (label uses screen overlay).
 * Double-click the name to rename.
 */
export default function HtmlArtboardFrame({
  frame,
  selected,
  onSelect,
  onRename,
  onMove,
  onMoveStart,
  onMoveEnd,
  hideTitle = false,
  layer = 'body',
}: HtmlArtboardFrameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(frame.name || 'Frame');
  const [labelDragging, setLabelDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const labelDragRef = useRef<{
    originX: number;
    originY: number;
    clientX0: number;
    clientY0: number;
    started: boolean;
  } | null>(null);
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);

  useEffect(() => {
    if (!editing) setDraft(frame.name || 'Frame');
  }, [frame.name, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      const target = e.target as Node | null;
      if (root && target && root.contains(target)) return;
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        const value = (el?.value ?? '').trim() || 'Frame';
        setEditing(false);
        if (value !== (frame.name || 'Frame')) onRename?.(value);
      });
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [editing, frame.name, onRename]);

  const commit = () => {
    const next = draft.trim() || 'Frame';
    setEditing(false);
    if (next !== (frame.name || 'Frame')) onRename?.(next);
  };

  const stageBox = useMemo(() => {
    const origin = rcbSceneToScreen(camera, frame.x, frame.y);
    return {
      left: origin.x,
      top: origin.y,
      width: frame.width * z,
      height: frame.height * z,
    };
  }, [camera, frame.x, frame.y, frame.width, frame.height, z]);

  const labelStyle = useMemo(
    () => ({
      left: stageBox.left,
      // Fixed screen-pixel offset above the frame — does not grow with zoom.
      top: stageBox.top - NODE_TITLE_LABEL_GAP_PX - NODE_TITLE_LABEL_LINE_PX,
      width: stageBox.width,
      height: NODE_TITLE_LABEL_LINE_PX,
    }),
    [stageBox]
  );

  const generating = String(frame.processStatus || '') === 'running';
  const processLabel = String(frame.processLabel || '生成中…');

  const processOverlayStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      left: stageBox.left,
      top: stageBox.top,
      width: stageBox.width,
      height: stageBox.height,
    }),
    [stageBox.left, stageBox.top, stageBox.width, stageBox.height]
  );

  const processPillStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      left: stageBox.left + stageBox.width / 2,
      top: stageBox.top + stageBox.height - 14,
      transform: 'translate(-50%, -100%)',
    }),
    [stageBox.left, stageBox.top, stageBox.width, stageBox.height]
  );

  if (layer === 'label') {
    return (
      <RcbOverlayPortal>
        {/* Screen-fixed frame edge. Selection blue comes from FrameSelectionChrome
            (same 1.5px as shape chrome) — do not double-draw a thick inset here. */}
        <div
          className="pointer-events-none absolute z-[5]"
          style={{
            left: stageBox.left,
            top: stageBox.top,
            width: stageBox.width,
            height: stageBox.height,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
          }}
          aria-hidden
        />

        {hideTitle || labelDragging ? null : (
          <div
            ref={rootRef}
            data-frame-id={frame.id}
            data-frame-label
            className="pointer-events-auto absolute z-[6] flex w-full items-center justify-between gap-2 text-[11px] font-medium leading-none text-[var(--muted)]"
            style={labelStyle}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (editing) return;
              onSelect?.();
              if (!onMove || e.button !== 0) return;
              labelDragRef.current = {
                originX: frame.x,
                originY: frame.y,
                clientX0: e.clientX,
                clientY0: e.clientY,
                started: false,
              };
              const onMoveWin = (ev: PointerEvent) => {
                const drag = labelDragRef.current;
                if (!drag) return;
                const dx = (ev.clientX - drag.clientX0) / z;
                const dy = (ev.clientY - drag.clientY0) / z;
                if (!drag.started) {
                  if (Math.hypot(dx, dy) < 3) return;
                  drag.started = true;
                  setLabelDragging(true);
                  onMoveStart?.();
                }
                onMove(Math.round(drag.originX + dx), Math.round(drag.originY + dy));
              };
              const onUpWin = () => {
                const wasDragging = labelDragRef.current?.started;
                labelDragRef.current = null;
                setLabelDragging(false);
                window.removeEventListener('pointermove', onMoveWin);
                window.removeEventListener('pointerup', onUpWin);
                if (wasDragging) onMoveEnd?.();
              };
              window.addEventListener('pointermove', onMoveWin);
              window.addEventListener('pointerup', onUpWin);
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
                  aria-label="Frame name"
                  size={Math.max(1, draft.length || 1)}
                  className="h-4 appearance-none border-0 bg-transparent p-0 text-[11px] font-medium leading-none text-[var(--ink)] shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
                  style={{
                    width: `${Math.max(1, draft.length || 1)}ch`,
                    fieldSizing: 'content',
                  } as CSSProperties}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commit();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setDraft(frame.name || 'Frame');
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
                    onSelect?.();
                    setDraft(frame.name || 'Frame');
                    setEditing(true);
                  }}
                >
                  {frame.name || 'Frame'}
                </button>
              )}
            </div>
            <span className="shrink-0 tabular-nums leading-none text-[var(--muted)] opacity-80">
              {Math.round(frame.width)}
              {' × '}
              {Math.round(frame.height)}
            </span>
          </div>
        )}
      </RcbOverlayPortal>
    );
  }

  const bg =
    frame.backgroundColor && frame.backgroundColor !== 'transparent'
      ? frame.backgroundColor
      : '#FFFFFF';

  return (
    <>
      <div
        className="pointer-events-none absolute z-[0] overflow-hidden"
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
          // While generating, screen-space shimmer covers the plate; keep a neutral fill underneath.
          backgroundColor: generating ? '#e4ecf4' : bg,
        }}
        data-frame-id={frame.id}
      />
      {generating ? (
        <RcbOverlayPortal>
          <div
            data-artboard-process-shimmer
            data-frame-id={frame.id}
            className="artboard-process-shimmer pointer-events-none absolute z-[29] overflow-hidden"
            style={processOverlayStyle}
            aria-hidden
          />
          <div
            data-artboard-process-label
            data-frame-id={frame.id}
            className="pointer-events-none absolute z-[30] whitespace-nowrap rounded-full bg-[rgba(55,55,55,0.72)] px-2.5 py-1 text-[11px] font-medium leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]"
            style={processPillStyle}
          >
            {processLabel}
          </div>
        </RcbOverlayPortal>
      ) : null}
    </>
  );
}
