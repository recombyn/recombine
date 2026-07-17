import { useState } from 'react';
import { HiOutlineCheck, HiOutlineChevronDown } from 'react-icons/hi2';
import { Dropdown } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown';
import { INPUT_NO_SPIN } from '@/components/base/colorPanel';
import {
  BLEND_MODE_OPTIONS,
  blendModeLabel,
  layerOpacityToPct,
  parseBlendMode,
  parseLayerOpacity,
  type BlendModeId,
} from '@/store/scene/sceneBlend';
import { cn } from '@/utils/classnames';

type Props = {
  blendMode?: unknown;
  opacity?: unknown;
  onBlendModeChange: (mode: BlendModeId) => void;
  onOpacityChange: (opacity01: number) => void;
  className?: string;
};

function buildMenuItems(active: BlendModeId): MenuItemType[] {
  const items: MenuItemType[] = [];
  for (const opt of BLEND_MODE_OPTIONS) {
    if (opt.groupStart && items.length > 0) {
      items.push({ key: `div-${opt.id}`, type: 'divider', label: '' });
    }
    items.push({
      key: opt.id,
      label: (
        <span className="flex w-full items-center justify-between gap-3">
          <span>{opt.label}</span>
          {active === opt.id ? (
            <HiOutlineCheck className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0" />
          )}
        </span>
      ),
    });
  }
  return items;
}

export default function BlendModeControl({
  blendMode,
  opacity,
  onBlendModeChange,
  onOpacityChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const mode = parseBlendMode(blendMode);
  const pct = layerOpacityToPct(parseLayerOpacity(opacity, 1));

  const setPct = (raw: string) => {
    const n = Number(String(raw).replace(/%/g, '').trim());
    if (!Number.isFinite(n)) return;
    onOpacityChange(Math.min(1, Math.max(0, Math.round(n) / 100)));
  };

  return (
    <div className={cn('inline-flex h-8 items-center gap-0.5', className)}>
      <Dropdown
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottom-start"
        offset={6}
        strategy="fixed"
        items={buildMenuItems(mode)}
        selectedKeys={[mode]}
        onClick={(key) => {
          if (key.startsWith('div-')) return;
          onBlendModeChange(parseBlendMode(key));
          setOpen(false);
        }}
        popupClassName="min-w-[9.5rem] max-h-[min(70vh,22rem)] overflow-y-auto"
        floatingClassName="z-[80]"
        referenceClassName="inline-flex"
      >
        <button
          type="button"
          aria-label="混合模式"
          aria-expanded={open}
          className={cn(
            'inline-flex h-8 max-w-[7.5rem] items-center gap-0.5 rounded-[4px] px-1.5 text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)]',
            open && 'bg-[var(--accent-soft)]'
          )}
        >
          <span className="min-w-0 truncate">{blendModeLabel(mode)}</span>
          <HiOutlineChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
        </button>
      </Dropdown>
      <label className="inline-flex h-8 items-center gap-0.5 rounded-[4px] px-1.5 text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]">
        <input
          type="number"
          min={0}
          max={100}
          aria-label="不透明度"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className={cn(
            'w-8 bg-transparent text-right text-[12px] tabular-nums outline-none',
            INPUT_NO_SPIN
          )}
        />
        <span className="text-[var(--muted)]">%</span>
      </label>
    </div>
  );
}

