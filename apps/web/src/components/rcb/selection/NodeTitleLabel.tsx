import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LuFrame, LuImage, LuImagePlus, LuVideo } from 'react-icons/lu';
import { RiVideoAiLine } from 'react-icons/ri';
import { RcbOverlayPortal, useRcbCamera, rcbSceneToScreen } from '@/components/rcb';
import {
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
} from '@/components/rcb/selection/SelectionToolbarShell';

type NodeTitleLabelBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type NodeTitleIcon = 'frame' | 'image' | 'image-generator' | 'video' | 'video-generator';

type Props = {
  /** Scene-space AABB of the node / frame. */
  box: NodeTitleLabelBox;
  name: string;
  /** Displayed size (usually node width × height). */
  sizeWidth: number;
  sizeHeight: number;
  /** Hit-test / dismiss marker — frame uses `data-frame-label`, image `data-image-label`. */
  dataAttr: 'frame-label' | 'image-label';
  /** Leading glyph — defaults from `dataAttr` when omitted. */
  icon?: NodeTitleIcon;
  /** Extra data attrs (e.g. frame id / node id). */
  dataProps?: Record<string, string>;
  /** Node rotation (deg) — title rides above the top edge of the rotated box. */
  angle?: number;
  /** Hide while moving / transforming. */
  hidden?: boolean;
  onSelect?: () => void;
  onRename?: (name: string) => void;
  /** Drag the label to move the target (frames). */
  onMove?: (x: number, y: number, opts?: { skipGrid?: boolean }) => void;
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
  /** Scene origin used as drag baseline (`frame.x` / `node.x`). */
  originX?: number;
  originY?: number;
  renameAriaLabel?: string;
};

function TitleIcon({ kind }: { kind: NodeTitleIcon }) {
  const cls = 'h-3 w-3 shrink-0 text-[var(--muted)]';
  if (kind === 'frame') return <LuFrame className={cls} strokeWidth={2} aria-hidden />;
  if (kind === 'image-generator') return <LuImagePlus className={cls} strokeWidth={2} aria-hidden />;
  if (kind === 'video-generator') {
    return <RiVideoAiLine className={cls} aria-hidden />;
  }
  if (kind === 'video') return <LuVideo className={cls} strokeWidth={2} aria-hidden />;
  return <LuImage className={cls} strokeWidth={2} aria-hidden />;
}

/**
 * Shared title row above frames and selected images: `icon Name` · `W × H`.
 * Screen-fixed typography (does not grow with zoom) — same metrics as SelectionToolbarShell.
 */
export default function NodeTitleLabel({
  box,
  name,
  sizeWidth,
  sizeHeight,
  dataAttr,
  icon,
  dataProps,
  angle = 0,
  hidden = false,
  onSelect,
  onRename,
  onMove,
  onMoveStart,
  onMoveEnd,
  originX = 0,
  originY = 0,
  renameAriaLabel,
}: Props): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
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
    if (!editing) setDraft(name);
  }, [name, editing]);

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
        const value = (el?.value ?? '').trim() || name;
        setEditing(false);
        setDraft(value);
        if (value !== name) onRename?.(value);
      });
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [editing, name, onRename]);

  const stageBox = useMemo(() => {
    const origin = rcbSceneToScreen(camera, box.left, box.top);
    return {
      left: origin.x,
      top: origin.y,
      width: Math.max(1, box.width * z),
      height: Math.max(1, box.height * z),
    };
  }, [camera, box.left, box.top, box.width, box.height, z]);

  const frameStyle = useMemo(
    (): CSSProperties => ({
      left: stageBox.left,
      top: stageBox.top,
      width: stageBox.width,
      height: stageBox.height,
      transform: Math.abs(angle) > 0.001 ? `rotate(${angle}deg)` : undefined,
      transformOrigin: 'center center',
    }),
    [stageBox, angle]
  );

  const labelStyle = useMemo(
    (): CSSProperties => ({
      left: 0,
      top: -NODE_TITLE_LABEL_GAP_PX - NODE_TITLE_LABEL_LINE_PX,
      width: '100%',
      height: NODE_TITLE_LABEL_LINE_PX,
    }),
    []
  );

  const commit = () => {
    const next = draft.trim() || name;
    setEditing(false);
    setDraft(next);
    if (next !== name) onRename?.(next);
  };

  if (hidden || labelDragging) return null;

  const attrProps =
    dataAttr === 'frame-label'
      ? { 'data-frame-label': true as const }
      : { 'data-image-label': true as const };
  const iconKind: NodeTitleIcon =
    icon || (dataAttr === 'frame-label' ? 'frame' : 'image');

  return (
    <RcbOverlayPortal>
      <div className="pointer-events-none absolute z-[6]" style={frameStyle}>
        <div
          ref={rootRef}
          {...attrProps}
          {...dataProps}
          className="pointer-events-auto absolute flex w-full items-center justify-between gap-2 text-[11px] font-medium leading-none text-[var(--muted)]"
          style={labelStyle}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (editing) return;
            onSelect?.();
            if (!onMove || e.button !== 0) return;
            labelDragRef.current = {
              originX,
              originY,
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
              onMove(Math.round(drag.originX + dx), Math.round(drag.originY + dy), {
                skipGrid: ev.ctrlKey || ev.metaKey,
              });
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
            <TitleIcon kind={iconKind} />
            {editing && onRename ? (
              <input
                ref={inputRef}
                value={draft}
                aria-label={renameAriaLabel || name}
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
                    setDraft(name);
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
                  if (!onRename) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect?.();
                  setDraft(name);
                  setEditing(true);
                }}
              >
                {name}
              </button>
            )}
          </div>
          <span className="shrink-0 tabular-nums leading-none text-[var(--muted)] opacity-80">
            {Math.round(sizeWidth)}
            {' × '}
            {Math.round(sizeHeight)}
          </span>
        </div>
      </div>
    </RcbOverlayPortal>
  );
}
