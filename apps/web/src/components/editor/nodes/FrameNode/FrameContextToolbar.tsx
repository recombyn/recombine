import { useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  HiOutlineArrowsRightLeft,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
} from 'react-icons/hi2';
import { ColorPanelPopover } from '@/components/base/colorPanel';
import FrameSizePresetMenu, {
  FramePresetIcon,
  FrameRatioPresetMenu,
} from '@/components/editor/nodes/FrameNode/FrameSizePresetMenu';
import {
  applyFramePreset,
  findFramePreset,
  matchFramePreset,
  swapFrameOrientation,
} from '@/components/editor/nodes/FrameNode/frameSizePresets';
import {
  updateArtboardFrame,
  type ArtboardFrame,
} from '@/store/modules/editor';
import Tooltip from '@/components/base/tooltip';
import { SEL_ICON_BTN, SEL_TOOL_BTN } from '@/components/editor/Canvas/selection/ToolbarValueSlider';
import { SelectionToolbarShell } from '@/components/editor/Canvas/selection/SelectionToolbarShell';
import { ExportSelectionPopover } from '@/components/editor/panels/ExportSelectionPanel';
import { cn } from '@/utils/classnames';

type Props = {
  frame: ArtboardFrame;
};

/** Matches shape / selection toolbar field chrome. */
const field =
  'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12px] text-[var(--ink)]';

/** Floating toolbar for the active artboard / frame (shown after draw / select). */
export default function FrameContextToolbar({ frame }: Props) {
  const dispatch = useDispatch();
  const [presetOpen, setPresetOpen] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [aspectLocked, setAspectLocked] = useState(true);
  const presetKey = matchFramePreset(frame.width, frame.height);
  const presetMeta = findFramePreset(presetKey);
  const isRatio = presetMeta?.category === 'ratio';
  const deviceTitle = isRatio ? 'Custom' : presetMeta?.label || 'Custom';
  // Default / free size → 「原始」; matched ratio preset → e.g. 4:3
  const ratioTitle = isRatio ? presetMeta?.label || '原始' : '原始';
  const ratioActiveKey = isRatio ? presetKey : 'original';
  const isLandscape = frame.width > frame.height;

  const patch = (next: Partial<ArtboardFrame>) => {
    dispatch(updateArtboardFrame({ id: frame.id, patch: next }));
  };

  const setSize = (axis: 'w' | 'h', raw: string) => {
    const n = Math.max(40, Math.round(Number(raw) || 0));
    if (!Number.isFinite(n)) return;
    const ratio = frame.width / Math.max(1, frame.height);
    if (axis === 'w') {
      patch({
        width: n,
        height: aspectLocked ? Math.max(40, Math.round(n / ratio)) : frame.height,
      });
    } else {
      patch({
        height: n,
        width: aspectLocked ? Math.max(40, Math.round(n * ratio)) : frame.width,
      });
    }
  };

  const fill = frame.backgroundColor || '#FFFFFF';
  const fillHex = fill === 'transparent' ? '#FFFFFF' : fill;
  const fillOpacity = fill === 'transparent' ? 0 : 100;

  return (
    <SelectionToolbarShell
      box={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      hasTitleLabel
      isFrameToolbar
      zIndexClassName="z-[30]"
    >
      <ColorPanelPopover
        value={fillHex}
        opacity={fillOpacity}
        showAlpha
        onChange={(hex) => patch({ backgroundColor: hex })}
        onOpacityChange={(opacity) => {
          if (opacity <= 0) patch({ backgroundColor: 'transparent' });
        }}
        title={'画板颜色'}
        placement="bottom-start"
        className={SEL_ICON_BTN}
      >
        <span
          className="relative inline-flex h-4 w-4 overflow-hidden rounded-full ring-1 ring-[var(--line)]"
          style={{ background: fill === 'transparent' ? undefined : fill }}
        >
          {fill === 'transparent' ? (
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(45deg,#9ca3af 25%,transparent 25%,transparent 75%,#9ca3af 75%),linear-gradient(45deg,#9ca3af 25%,transparent 25%,transparent 75%,#9ca3af 75%)',
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 3px 3px',
              }}
            />
          ) : null}
        </span>
      </ColorPanelPopover>

      <FrameSizePresetMenu
        open={presetOpen}
        onOpenChange={(v) => {
          setPresetOpen(v);
          if (v) setRatioOpen(false);
        }}
        activeKey={isRatio ? 'custom' : presetKey}
        panelDataAttrs={{ 'data-frame-toolbar': true }}
        triggerClassName={cn(
          SEL_TOOL_BTN,
          'gap-1.5 px-2.5',
          presetOpen && 'bg-[var(--accent-soft)]'
        )}
        onPick={(preset) => {
          const next = applyFramePreset(frame, preset);
          patch(next);
        }}
      >
        <FramePresetIcon kind={isRatio ? 'doc' : presetMeta?.icon || 'doc'} />
        <span className="max-w-[7rem] truncate">{deviceTitle}</span>
      </FrameSizePresetMenu>

      <Tooltip title={isLandscape ? '切换为竖向' : '切换为横向'} placement="top">
        <button
          type="button"
          aria-label={isLandscape ? '切换为竖向' : '切换为横向'}
          aria-pressed={isLandscape}
          className={cn(SEL_ICON_BTN, isLandscape && 'bg-[var(--accent-soft)]')}
          onClick={() => patch(swapFrameOrientation(frame))}
        >
          <HiOutlineArrowsRightLeft className="h-3.5 w-3.5" />
        </button>
      </Tooltip>

      <FrameRatioPresetMenu
        open={ratioOpen}
        onOpenChange={(v) => {
          setRatioOpen(v);
          if (v) setPresetOpen(false);
        }}
        activeKey={ratioActiveKey}
        panelDataAttrs={{ 'data-frame-toolbar': true }}
        triggerClassName={cn(
          SEL_TOOL_BTN,
          'gap-1.5 px-2.5',
          ratioOpen && 'bg-[var(--accent-soft)]'
        )}
        onPick={(preset) => {
          if (preset.key === 'original') return;
          const next = applyFramePreset(frame, preset);
          patch(next);
        }}
      >
        <span>{ratioTitle}</span>
      </FrameRatioPresetMenu>

      <label className={field}>
        <span className="text-[var(--muted)]">W</span>
        <input
          className="w-11 bg-transparent text-[12px] outline-none tabular-nums"
          value={Math.round(frame.width)}
          onChange={(e) => setSize('w', e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </label>
      <label className={field}>
        <span className="text-[var(--muted)]">H</span>
        <input
          className="w-11 bg-transparent text-[12px] outline-none tabular-nums"
          value={Math.round(frame.height)}
          onChange={(e) => setSize('h', e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </label>

      <Tooltip title={aspectLocked ? '解锁比例' : '锁定比例'} placement="top">
        <button
          type="button"
          aria-label={aspectLocked ? '解锁比例' : '锁定比例'}
          className={SEL_ICON_BTN}
          onClick={() => setAspectLocked((v) => !v)}
        >
          {aspectLocked ? (
            <HiOutlineLockClosed className="h-3.5 w-3.5" />
          ) : (
            <HiOutlineLockOpen className="h-3.5 w-3.5" />
          )}
        </button>
      </Tooltip>

      <ExportSelectionPopover
        crop={{
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          backgroundColor: frame.backgroundColor,
        }}
        baseName={frame.name || 'Frame'}
      />
    </SelectionToolbarShell>
  );
}
