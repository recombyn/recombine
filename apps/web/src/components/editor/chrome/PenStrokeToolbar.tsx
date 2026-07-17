import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiOutlineTrash } from 'react-icons/hi2';
import { LuEraser } from 'react-icons/lu';
import { ColorPanelPopover } from '@/components/base/colorPanel';
import { message, DropdownPanel, DropdownPanelItem } from '@/components/base';
import Slider from '@/components/base/slider';
import Tooltip from '@/components/base/tooltip';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import {
  brushPreviewPath,
  findPencilBrush,
  listPencilBrushes,
  type PencilBrushId,
} from '@/components/editor/nodes/ShapeNode/pencilBrushes';
import {
  hydrateCustomPencilBrushes,
  removeCustomPencilBrush,
} from '@/components/editor/nodes/ShapeNode/customPencilBrushes';
import { getTintedStampSrc } from '@/components/editor/nodes/ShapeNode/stampTint';
import {
  setPenStrokeColor,
  setPenStrokeWidth,
  setPencilBrushId,
  setPencilEraseMode,
} from '@/store/modules/editor';
import { cn } from '@/utils/classnames';

/** Compact stroke-weight glyph (three uneven bars). */
function StrokeWeightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
      <rect x="2" y="7" width="12" height="2.5" rx="1" />
      <rect x="2" y="12" width="12" height="1" rx="0.5" />
    </svg>
  );
}

function BrushStrokePreview({
  brushId,
  color,
  className,
}: {
  brushId: string;
  color: string;
  className?: string;
}) {
  const brush = findPencilBrush(brushId);
  if (brush.kind === 'stamp' && brush.stampSrc) {
    const tip = getTintedStampSrc(brush.stampSrc, color);
    const samples = [18, 38, 58, 78, 98].map((x, i) => ({
      x,
      y: 14 + Math.sin((i / 4) * Math.PI * 2) * 6,
    }));
    return (
      <svg className={className} viewBox="0 0 120 28" aria-hidden>
        {samples.map((p, i) => (
          <image
            key={i}
            href={tip}
            x={p.x - 7}
            y={p.y - 7}
            width={14}
            height={14}
            preserveAspectRatio="xMidYMid meet"
          />
        ))}
      </svg>
    );
  }
  const d = brushPreviewPath(brush, 9);
  return (
    <svg className={className} viewBox="0 0 120 28" aria-hidden>
      <path d={d} fill={color} />
    </svg>
  );
}

type PenStrokeToolbarProps = {
  /** Which tool's options to show. */
  mode: 'pen' | 'pencil';
  /**
   * `anchor` — float above the bottom tool strip.
   * `dock` — fixed at page top-center; brush menu opens downward.
   */
  placement?: 'anchor' | 'dock';
  className?: string;
};

/**
 * Pen / pencil stroke bar: color + inline width slider (+ brush / eraser for pencil).
 */
export default function PenStrokeToolbar({
  mode,
  placement = 'anchor',
  className,
}: PenStrokeToolbarProps) {
  const dispatch = useDispatch();
  const isPencil = mode === 'pencil';
  const docked = placement === 'dock';
  const color = useSelector((s: any) => String(s.editor.penStrokeColor || '#333333'));
  const width = useSelector((s: any) => {
    const n = Number(s.editor.penStrokeWidth);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const brushId = useSelector((s: any) =>
    String(s.editor.pencilBrushId || 'solid')
  ) as PencilBrushId;
  const eraseMode = useSelector((s: any) => Boolean(s.editor.pencilEraseMode));
  const [brushRev, setBrushRev] = useState(0);
  const brushes = listPencilBrushes();
  const brush = findPencilBrush(brushId);
  const [brushOpen, setBrushOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const brushCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    hydrateCustomPencilBrushes();
    setBrushRev((n) => n + 1);
  }, []);

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current != null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const openBrushMenu = () => {
    if (eraseMode) return;
    clearTimer(brushCloseTimer);
    setBrushOpen(true);
  };
  const scheduleCloseBrush = () => {
    clearTimer(brushCloseTimer);
    brushCloseTimer.current = window.setTimeout(() => setBrushOpen(false), 160);
  };

  useEffect(() => {
    return () => clearTimer(brushCloseTimer);
  }, []);

  useEffect(() => {
    if (!isPencil) setBrushOpen(false);
  }, [isPencil]);

  useEffect(() => {
    if (eraseMode) setBrushOpen(false);
  }, [eraseMode]);

  const onDeleteCustom = (id: string) => {
    removeCustomPencilBrush(id);
    setBrushRev((n) => n + 1);
    if (brushId === id) dispatch(setPencilBrushId('solid'));
    message.success('已删除自定义画笔');
  };

  const menuPos = docked
    ? 'absolute left-1/2 top-[calc(100%+8px)] z-40 -translate-x-1/2'
    : 'absolute bottom-[calc(100%+8px)] left-1/2 z-40 -translate-x-1/2';

  return (
    <div
      ref={rootRef}
      className={cn(
        docked
          ? 'pointer-events-auto'
          : 'pointer-events-auto absolute bottom-[calc(100%+10px)] left-1/2 z-30 -translate-x-1/2',
        className
      )}
    >
      <FloatingToolbar className="relative gap-1 px-2">
        <ColorPanelPopover
          value={color}
          onChange={(hex) => dispatch(setPenStrokeColor(hex))}
          title={isPencil ? '铅笔颜色' : '钢笔颜色'}
          placement={docked ? 'bottom' : 'top'}
          offset={10}
          shiftMainAxis={false}
          className="inline-flex"
        >
          {({ open, hex }) => (
            <Tooltip title={'颜色'} placement={docked ? 'bottom' : 'top'}>
              <span
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-[4px] transition-colors',
                  open ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]',
                  eraseMode && 'opacity-40'
                )}
              >
                <span
                  className="h-4 w-4 rounded-full border border-black/15"
                  style={{ background: hex }}
                />
              </span>
            </Tooltip>
          )}
        </ColorPanelPopover>

        <span className="mx-0.5 h-4 w-px bg-[var(--line)]" aria-hidden />

        {isPencil ? (
          <div
            className="relative"
            onMouseEnter={openBrushMenu}
            onMouseLeave={scheduleCloseBrush}
          >
            <Tooltip
              title={'画笔'}
              placement={docked ? 'bottom' : 'top'}
              disabled={brushOpen || eraseMode}
            >
              <button
                type="button"
                aria-label={'画笔'}
                aria-expanded={brushOpen}
                disabled={eraseMode}
                onClick={() => {
                  if (eraseMode) return;
                  setBrushOpen((v) => !v);
                }}
                className={cn(
                  'inline-flex h-8 max-w-[9.5rem] items-center gap-1.5 rounded-[4px] px-2 text-[12px] font-medium text-[var(--ink)] transition-colors',
                  brushOpen ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]',
                  eraseMode && 'cursor-not-allowed opacity-40'
                )}
              >
                <BrushStrokePreview
                  brushId={brush.id}
                  color={color}
                  className="h-4 w-10 shrink-0"
                />
                <span className="truncate">{brush.label}</span>
              </button>
            </Tooltip>

            {brushOpen && !eraseMode ? (
              <DropdownPanel
                className={cn(menuPos, 'w-[260px]')}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={openBrushMenu}
                onMouseLeave={scheduleCloseBrush}
              >
                <ul
                  key={brushRev}
                  className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto"
                >
                  {brushes.map((b) => {
                    const active = b.id === brush.id;
                    return (
                      <li key={b.id} className="group relative">
                        <DropdownPanelItem
                          title={b.label}
                          selected={active}
                          className={cn(b.custom && 'pr-8')}
                          onClick={() => {
                            dispatch(setPencilBrushId(b.id));
                            setBrushOpen(false);
                          }}
                        >
                          <BrushStrokePreview
                            brushId={b.id}
                            color={color}
                            className="h-7 w-[7.5rem] shrink-0"
                          />
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-[12px] text-[var(--muted)]',
                              active && 'font-medium text-[var(--ink)]'
                            )}
                          >
                            {b.label}
                          </span>
                        </DropdownPanelItem>
                        {b.custom ? (
                          <button
                            type="button"
                            aria-label={`删除 ${b.label}`}
                            title="删除"
                            className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--muted)] opacity-0 transition-opacity hover:bg-black/5 hover:text-[var(--ink)] group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCustom(b.id);
                            }}
                          >
                            <HiOutlineTrash className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </DropdownPanel>
            ) : null}
          </div>
        ) : null}

        {isPencil ? <span className="mx-0.5 h-4 w-px bg-[var(--line)]" aria-hidden /> : null}

        {/* Width: inline slider (no popover) */}
        <div
          className="flex h-8 items-center gap-2 px-1"
          onPointerDown={(e) => e.stopPropagation()}
          title={eraseMode ? '橡皮尺寸' : '粗细'}
        >
          <StrokeWeightIcon className="h-4 w-4 shrink-0 text-[var(--ink)]" />
          <div className="w-[96px] shrink-0">
            <Slider
              min={1}
              max={40}
              step={1}
              value={width}
              onChange={(v) => dispatch(setPenStrokeWidth(v))}
            />
          </div>
          <span className="min-w-[2.75rem] shrink-0 text-right text-[12px] font-medium tabular-nums text-[var(--ink)]">
            {width}
            <span className="ml-0.5 text-[11px] font-normal text-[var(--muted)]">Px</span>
          </span>
        </div>

        {isPencil ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-[var(--line)]" aria-hidden />
            <Tooltip title={'橡皮擦'} placement={docked ? 'bottom' : 'top'}>
              <button
                type="button"
                aria-label={'橡皮擦'}
                aria-pressed={eraseMode}
                onClick={() => dispatch(setPencilEraseMode(!eraseMode))}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-[4px] transition-colors',
                  eraseMode
                    ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                    : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]'
                )}
              >
                <LuEraser className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </Tooltip>
          </>
        ) : null}
      </FloatingToolbar>
    </div>
  );
}
