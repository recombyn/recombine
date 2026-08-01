import { useMemo, useState, type CSSProperties, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheck, HiOutlineChevronDown } from 'react-icons/hi2';
import { Dropdown } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown';
import { INPUT_NO_SPIN } from '@/components/base/colorPanel';
import { cn } from '@/utils/classnames';

/** Layer blend modes (Figma / CSS mix-blend-mode). */
export type BlendModeId =
  | 'pass-through'
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type BlendModeOption = {
  id: BlendModeId;
  groupStart?: boolean;
};

export const BLEND_MODE_OPTIONS: BlendModeOption[] = [
  { id: 'pass-through' },
  { id: 'normal' },
  { id: 'darken', groupStart: true },
  { id: 'multiply' },
  { id: 'color-burn' },
  { id: 'lighten', groupStart: true },
  { id: 'screen' },
  { id: 'color-dodge' },
  { id: 'overlay', groupStart: true },
  { id: 'soft-light' },
  { id: 'hard-light' },
  { id: 'difference', groupStart: true },
  { id: 'exclusion' },
  { id: 'hue', groupStart: true },
  { id: 'saturation' },
  { id: 'color' },
  { id: 'luminosity' },
];

const BLEND_MODE_SET = new Set(BLEND_MODE_OPTIONS.map((o) => o.id));

export function parseBlendMode(raw: unknown, opts?: { allowPassThrough?: boolean }): BlendModeId {
  const s = String(raw || '').trim().toLowerCase();
  const normalized =
    s === 'passthrough' || s === 'pass_through' ? 'pass-through' : s;
  if (BLEND_MODE_SET.has(normalized as BlendModeId)) {
    const id = normalized as BlendModeId;
    if (id === 'pass-through' && !opts?.allowPassThrough) return 'normal';
    return id;
  }
  return 'normal';
}

export function blendModeLabel(id: BlendModeId): string {
  return id;
}

export function blendModeToCss(id: BlendModeId): string {
  if (id === 'pass-through') return '';
  return id;
}

export function parseLayerOpacity(raw: unknown, fallback = 1): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

export function layerOpacityToPct(opacity01: number): number {
  return Math.round(Math.min(1, Math.max(0, opacity01)) * 100);
}

/** Mini two-circle preview — monochrome so it matches the rest of the toolbar. */
function BlendModeIcon({ mode, className }: { mode: BlendModeId; className?: string }) {
  const cssMode: CSSProperties['mixBlendMode'] =
    mode === 'pass-through' ? 'normal' : (mode as CSSProperties['mixBlendMode']);
  return (
    <span
      className={cn(
        'relative inline-block h-3.5 w-3.5 shrink-0 overflow-hidden rounded-[2px] bg-[var(--canvas)] ring-1 ring-[var(--line)]',
        className
      )}
      style={{ isolation: 'isolate' }}
      aria-hidden
    >
      <span
        className="absolute left-0 top-0 h-[10px] w-[10px] rounded-full"
        style={{ background: '#737373' }}
      />
      <span
        className="absolute bottom-0 right-0 h-[10px] w-[10px] rounded-full"
        style={{ background: '#b0b0b0', mixBlendMode: cssMode }}
      />
    </span>
  );
}

type Props = {
  blendMode?: unknown;
  opacity?: unknown;
  /** Pass-through is only meaningful for groups/frames (Figma). */
  allowPassThrough?: boolean;
  onBlendModeChange: (mode: BlendModeId) => void;
  onOpacityChange: (opacity01: number) => void;
  /** Inserted between blend-mode dropdown and opacity (e.g. corner radius). */
  afterBlendSlot?: ReactNode;
  className?: string;
};

function BlendModeControl({
  blendMode,
  opacity,
  allowPassThrough = false,
  onBlendModeChange,
  onOpacityChange,
  afterBlendSlot,
  className,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const mode = parseBlendMode(blendMode, { allowPassThrough });
  const pct = layerOpacityToPct(parseLayerOpacity(opacity, 1));

  const labelOf = (id: BlendModeId) => t(`editor.blendMode.${id}`);

  const items: MenuItemType[] = useMemo(() => {
    const out: MenuItemType[] = [];
    for (const opt of BLEND_MODE_OPTIONS) {
      if (opt.id === 'pass-through' && !allowPassThrough) continue;
      if (opt.groupStart && out.length > 0) {
        out.push({ key: `div-${opt.id}`, type: 'divider', label: '' });
      }
      out.push({
        key: opt.id,
        label: (
          <span className="flex w-full items-center gap-2">
            <BlendModeIcon mode={opt.id} />
            <span className="min-w-0 flex-1 truncate">{labelOf(opt.id)}</span>
            {mode === opt.id ? (
              <HiOutlineCheck className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" />
            )}
          </span>
        ),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t + mode drive labels
  }, [mode, t, allowPassThrough]);

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
        items={items}
        selectedKeys={[mode]}
        onClick={(key) => {
          if (key.startsWith('div-')) return;
          onBlendModeChange(parseBlendMode(key, { allowPassThrough }));
          setOpen(false);
        }}
        popupClassName="min-w-[11rem] max-h-[min(70vh,22rem)] overflow-y-auto"
        floatingClassName="z-[80]"
        referenceClassName="inline-flex"
      >
        <button
          type="button"
          aria-label={t('editor.imageToolbar.blendMode')}
          aria-expanded={open}
          className={cn(
            'inline-flex h-8 max-w-[8.5rem] items-center gap-1.5 rounded-[4px] px-1.5 text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)]',
            open && 'bg-[var(--accent-soft)]'
          )}
        >
          <BlendModeIcon mode={mode} />
          <span className="min-w-0 truncate">{labelOf(mode)}</span>
          <HiOutlineChevronDown className="h-3.5 w-3.5 shrink-0 text-current" />
        </button>
      </Dropdown>
      {afterBlendSlot}
      <label className="inline-flex h-8 items-center gap-0.5 rounded-[4px] px-1.5 text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]">
        <input
          type="number"
          min={0}
          max={100}
          aria-label={t('editor.imageToolbar.opacity')}
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

export default memo(BlendModeControl);
