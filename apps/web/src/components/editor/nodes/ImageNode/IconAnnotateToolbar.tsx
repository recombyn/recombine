import type { ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { LuPencil } from 'react-icons/lu';
import { ColorPanelPopover } from '@/components/base/colorPanel';
import Slider from '@/components/base/slider';
import Tooltip from '@/components/base/tooltip';
import {
  setActiveTool,
  setPenStrokeColor,
  setPenStrokeWidth,
} from '@/store/modules/editor';
import { cn } from '@/utils/classnames';
type Props = {
  /** Optional download / export control after the annotate tools. */
  downloadSlot?: ReactNode;
};

const BTN =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/10';
const BTN_ACTIVE = 'bg-white/15 text-white';

function StrokeGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 11c2-3 3.5-4 5-4s3 1 5 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SelectGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray="2.2 1.8"
      />
    </svg>
  );
}

function TextGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3.5 13h2.1l.55-1.55h3.7L10.4 13h2.1L9.1 3H6.9L3.5 13zm3.15-3.2L8 6.1l1.35 3.7H6.65z" />
    </svg>
  );
}

/**
 * Icon annotate strip (fig.1): pen · select · text · color · stroke width.
 * No photo tools (remove-bg / upscale / eraser …).
 */
export default function IconAnnotateToolbar({ downloadSlot }: Props): ReactNode {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: any) => String(s.editor.activeTool || 'select'));
  const color = useSelector((s: any) => String(s.editor.penStrokeColor || '#ef4444'));
  const width = useSelector((s: any) => {
    const n = Number(s.editor.penStrokeWidth);
    return Number.isFinite(n) && n > 0 ? n : 2;
  });

  const penActive = activeTool === 'pencil' || activeTool === 'pen';
  const selectActive = activeTool === 'select' || activeTool === 'pan';
  const textActive = activeTool === 'text';

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[12px] bg-[#2c2c2c] px-1.5 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Tooltip title={'画笔'} placement="top">
        <button
          type="button"
          aria-label={'画笔'}
          className={cn(BTN, penActive && BTN_ACTIVE)}
          onClick={() => dispatch(setActiveTool('pencil'))}
        >
          <LuPencil className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </Tooltip>

      <Tooltip title={'选择'} placement="top">
        <button
          type="button"
          aria-label={'选择'}
          className={cn(BTN, selectActive && !penActive && !textActive && BTN_ACTIVE)}
          onClick={() => dispatch(setActiveTool('select'))}
        >
          <SelectGlyph className="h-4 w-4" />
        </button>
      </Tooltip>

      <Tooltip title={'文字'} placement="top">
        <button
          type="button"
          aria-label={'文字'}
          className={cn(BTN, textActive && BTN_ACTIVE)}
          onClick={() => dispatch(setActiveTool('text'))}
        >
          <TextGlyph className="h-4 w-4" />
        </button>
      </Tooltip>

      <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />

      <ColorPanelPopover
        value={color}
        onChange={(hex) => dispatch(setPenStrokeColor(hex))}
        title={'标注颜色'}
        placement="top"
        offset={10}
        shiftMainAxis={false}
        className="inline-flex"
      >
        {({ open, hex }) => (
          <Tooltip title={'颜色'} placement="top">
            <span className={cn(BTN, open && BTN_ACTIVE)}>
              <span
                className="h-4 w-4 rounded-full ring-1 ring-white/30"
                style={{ background: hex }}
              />
            </span>
          </Tooltip>
        )}
      </ColorPanelPopover>

      <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />

      <div className="flex items-center gap-2 px-1">
        <StrokeGlyph className="h-4 w-4 shrink-0 text-white/80" />
        <div className="w-[88px]">
          <Slider
            min={1}
            max={24}
            step={1}
            value={width}
            onChange={(v) => dispatch(setPenStrokeWidth(v))}
            thumbColor="#ffffff"
            activeColor="#ffffff"
            inactiveColor="rgba(255,255,255,0.28)"
          />
        </div>
      </div>

      {downloadSlot ? (
        <>
          <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />
          <span className="[&_button]:text-white/85 [&_button:hover]:bg-white/10">
            {downloadSlot}
          </span>
        </>
      ) : null}
    </div>
  );
}
