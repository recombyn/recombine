import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { A4_PORTRAIT } from '@/components/rcb/scene/sceneDocument';
import { cn } from '@/utils/classnames';

/** Frame / artboard size presets (toolbar dropdown + tabs). */
export type FramePresetCategory =
  | 'website'
  | 'mobile'
  | 'image'
  | 'poster'
  | 'custom'
  | 'ratio';

export type SizePresetCategory = Exclude<FramePresetCategory, 'ratio'> | 'auto';

export type FrameSizePreset = {
  key: string;
  label: string;
  category: FramePresetCategory;
  /** Fixed pixel size when set (canonical portrait / listed orientation). */
  width?: number;
  height?: number;
  /** Aspect ratio w/h when set (applied against current width) */
  ratio?: number;
  icon: 'square' | 'portrait' | 'tall' | 'landscape' | 'wide' | 'doc' | 'web' | 'phone' | 'tablet';
};

/** Left tabs — product categories + custom (Auto prepended when `showAuto`).
 * Order: 海报 → UI(移动) → 网站 → 图片 → 自定义
 */
export const FRAME_PRESET_TABS: { id: Exclude<SizePresetCategory, 'auto'> }[] = [
  { id: 'poster' },
  { id: 'mobile' },
  { id: 'website' },
  { id: 'image' },
  { id: 'custom' },
];

export const FRAME_SIZE_PRESETS: FrameSizePreset[] = [
  // Website
  { key: 'web-1280', label: '1280 × 720', category: 'website', width: 1280, height: 720, icon: 'web' },
  { key: 'web-1366', label: '1366 × 768', category: 'website', width: 1366, height: 768, icon: 'web' },
  { key: 'web-1440', label: '1440 × 900', category: 'website', width: 1440, height: 900, icon: 'web' },
  { key: 'web-1600', label: '1600 × 900', category: 'website', width: 1600, height: 900, icon: 'web' },
  { key: 'web-1920', label: '1920 × 1080', category: 'website', width: 1920, height: 1080, icon: 'web' },
  { key: 'web-2560', label: '2560 × 1440', category: 'website', width: 2560, height: 1440, icon: 'web' },

  // Mobile app (phones + tablets)
  { key: 'iphone-14-pro-max', label: 'iPhone 14 Pro Max', category: 'mobile', width: 430, height: 932, icon: 'phone' },
  { key: 'iphone-14-pro', label: 'iPhone 14 Pro', category: 'mobile', width: 393, height: 852, icon: 'phone' },
  { key: 'iphone-14-plus', label: 'iPhone 14 Plus / 13 Pro Max', category: 'mobile', width: 428, height: 926, icon: 'phone' },
  { key: 'iphone-14', label: 'iPhone 14 / 13 / 12', category: 'mobile', width: 390, height: 844, icon: 'phone' },
  { key: 'iphone-13-mini', label: 'iPhone 13 mini', category: 'mobile', width: 375, height: 812, icon: 'phone' },
  { key: 'iphone-x', label: 'iPhone X / XS / 11 Pro', category: 'mobile', width: 375, height: 812, icon: 'phone' },
  { key: 'iphone-xr', label: 'iPhone XR / XS Max / 11', category: 'mobile', width: 414, height: 896, icon: 'phone' },
  { key: 'pixel-7-pro', label: 'Google Pixel 7 Pro / 6 Pro', category: 'mobile', width: 412, height: 892, icon: 'phone' },
  { key: 'pixel-7', label: 'Google Pixel 7 / 6 / 6a', category: 'mobile', width: 412, height: 915, icon: 'phone' },
  { key: 'galaxy-s10', label: 'Samsung Galaxy S10', category: 'mobile', width: 360, height: 760, icon: 'phone' },
  { key: 'ipad-pro-12', label: 'iPad Pro 12.9"', category: 'mobile', width: 1024, height: 1366, icon: 'tablet' },
  { key: 'ipad-pro-11', label: 'iPad Pro 11"', category: 'mobile', width: 834, height: 1194, icon: 'tablet' },
  { key: 'ipad-air', label: 'iPad Air', category: 'mobile', width: 820, height: 1180, icon: 'tablet' },
  { key: 'ipad-mini', label: 'iPad mini', category: 'mobile', width: 744, height: 1133, icon: 'tablet' },
  { key: 'surface-pro-8', label: 'Surface Pro 8', category: 'mobile', width: 1440, height: 960, icon: 'tablet' },

  // Image
  { key: 'img-1-1', label: '1:1', category: 'image', width: 1080, height: 1080, icon: 'square' },
  { key: 'img-4-3', label: '4:3', category: 'image', width: 1600, height: 1200, icon: 'landscape' },
  { key: 'img-3-4', label: '3:4', category: 'image', width: 1200, height: 1600, icon: 'portrait' },
  { key: 'img-16-9', label: '16:9', category: 'image', width: 1920, height: 1080, icon: 'wide' },
  { key: 'img-9-16', label: '9:16', category: 'image', width: 1080, height: 1920, icon: 'tall' },
  { key: 'img-3-2', label: '3:2', category: 'image', width: 1620, height: 1080, icon: 'landscape' },
  { key: 'img-2-3', label: '2:3', category: 'image', width: 1080, height: 1620, icon: 'portrait' },

  // Poster (print + common promo sizes)
  { key: 'poster-1080x1920', label: '竖版海报', category: 'poster', width: 1080, height: 1920, icon: 'tall' },
  { key: 'poster-1242x2208', label: '竖版海报 · 大', category: 'poster', width: 1242, height: 2208, icon: 'tall' },
  { key: 'poster-1920x1080', label: '横版海报', category: 'poster', width: 1920, height: 1080, icon: 'wide' },
  { key: 'a0', label: 'A0', category: 'poster', width: 3179, height: 4494, icon: 'doc' },
  { key: 'a1', label: 'A1', category: 'poster', width: 2245, height: 3179, icon: 'doc' },
  { key: 'a2', label: 'A2', category: 'poster', width: 1587, height: 2245, icon: 'doc' },
  { key: 'a3', label: 'A3', category: 'poster', width: 1123, height: 1588, icon: 'doc' },
  { key: 'a4', label: 'A4', category: 'poster', width: A4_PORTRAIT.width, height: A4_PORTRAIT.height, icon: 'doc' },
  { key: 'a5', label: 'A5', category: 'poster', width: 559, height: 794, icon: 'doc' },
  { key: 'a6', label: 'A6', category: 'poster', width: 397, height: 559, icon: 'doc' },
  { key: 'b4', label: 'B4', category: 'poster', width: 945, height: 1334, icon: 'doc' },
  { key: 'b5', label: 'B5', category: 'poster', width: 665, height: 945, icon: 'doc' },
  { key: 'letter', label: 'Letter', category: 'poster', width: 816, height: 1056, icon: 'doc' },
  { key: 'legal', label: 'Legal', category: 'poster', width: 816, height: 1344, icon: 'doc' },
  { key: 'tabloid', label: 'Tabloid', category: 'poster', width: 1056, height: 1632, icon: 'doc' },

  // Ratio (separate toolbar)
  { key: 'original', label: '原始', category: 'ratio', icon: 'square' },
  { key: '1:1', label: '1:1', category: 'ratio', ratio: 1, icon: 'square' },
  { key: '4:3', label: '4:3', category: 'ratio', ratio: 4 / 3, icon: 'landscape' },
  { key: '3:4', label: '3:4', category: 'ratio', ratio: 3 / 4, icon: 'portrait' },
  { key: '16:9', label: '16:9', category: 'ratio', ratio: 16 / 9, icon: 'wide' },
  { key: '9:16', label: '9:16', category: 'ratio', ratio: 9 / 16, icon: 'tall' },
];

/** Ratio presets live in a separate toolbar control (not in device tabs). */
export const FRAME_RATIO_PRESETS = FRAME_SIZE_PRESETS.filter((p) => p.category === 'ratio');

export function presetsByCategory(category: FramePresetCategory): FrameSizePreset[] {
  if (category === 'custom') return [];
  return FRAME_SIZE_PRESETS.filter((p) => p.category === category);
}

/** Swap width/height (portrait ↔ landscape). */
export function swapFrameOrientation(current: {
  width: number;
  height: number;
}): { width: number; height: number } {
  return {
    width: Math.max(40, Math.round(current.height)),
    height: Math.max(40, Math.round(current.width)),
  };
}

/**
 * Apply a size preset. Keeps the current landscape/portrait orientation when
 * the preset has a fixed size (so A4 + landscape toggle stays consistent).
 */
export function applyFramePreset(
  current: { width: number; height: number },
  preset: FrameSizePreset
): { width: number; height: number } {
  if (preset.width && preset.height) {
    const wantLandscape = current.width > current.height;
    const presetLandscape = preset.width > preset.height;
    if (wantLandscape !== presetLandscape) {
      return { width: preset.height, height: preset.width };
    }
    return { width: preset.width, height: preset.height };
  }
  if (preset.ratio && preset.ratio > 0) {
    const width = Math.max(40, Math.round(current.width));
    const height = Math.max(40, Math.round(width / preset.ratio));
    return { width, height };
  }
  return current;
}

export function matchFramePreset(width: number, height: number): string {
  for (const p of FRAME_SIZE_PRESETS) {
    if (p.key === 'original') continue;
    if (p.width && p.height) {
      if (Math.abs(p.width - width) <= 1 && Math.abs(p.height - height) <= 1) return p.key;
      if (Math.abs(p.width - height) <= 1 && Math.abs(p.height - width) <= 1) return p.key;
    } else if (p.ratio) {
      const r = width / Math.max(1, height);
      if (Math.abs(r - p.ratio) < 0.02) return p.key;
    }
  }
  return 'custom';
}

export function findFramePreset(key: string): FrameSizePreset | undefined {
  return FRAME_SIZE_PRESETS.find((p) => p.key === key);
}

/** Normalize canvas size chip: `1440x900` | `auto` | `400xauto` | `autox600`. */
export function normalizeCanvasSizeChip(raw: unknown): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/\s+/g, '');
  if (!s || s === 'auto') return 'auto';
  const m = s.match(/^(\d+|auto)x(\d+|auto)$/);
  if (!m) return s;
  const [, a, b] = m;
  if (a === 'auto' && b === 'auto') return 'auto';
  return `${a}x${b}`;
}

/** True when both sides are fixed pixels (client must not let LLM rewrite). */
export function isCanvasSizeFullyLocked(raw: unknown): boolean {
  const s = normalizeCanvasSizeChip(raw);
  return /^\d+x\d+$/.test(s);
}

/** True when chip is auto or one side is auto (LLM may confirm / fill). */
export function isCanvasSizeAutoHint(raw: unknown): boolean {
  const s = normalizeCanvasSizeChip(raw);
  if (s === 'auto') return true;
  return /^(?:\d+xauto|autox\d+)$/.test(s);
}

/** Chip label: `1440 × 900` | `Auto` | `400 × Auto`. */
export function formatCanvasSizeChipLabel(
  raw: unknown,
  t: (key: string) => string
): string {
  const s = normalizeCanvasSizeChip(raw);
  const auto = t('editor.frameToolbar.auto');
  if (s === 'auto') return auto;
  const m = s.match(/^(\d+|auto)x(\d+|auto)$/);
  if (!m) return String(raw || '');
  const left = m[1] === 'auto' ? auto : m[1];
  const right = m[2] === 'auto' ? auto : m[2];
  return `${left} × ${right}`;
}

/** Localized display label for a size/ratio preset. */
export function framePresetDisplayLabel(
  preset: Pick<FrameSizePreset, 'key' | 'label'>,
  t: (key: string) => string
): string {
  if (preset.key === 'original') return t('editor.frameToolbar.original');
  if (preset.key === 'custom') return t('editor.frameToolbar.custom');
  if (preset.key === 'auto') return t('editor.frameToolbar.auto');
  if (preset.key === 'poster-1080x1920') return t('editor.frameToolbar.posterPortrait');
  if (preset.key === 'poster-1242x2208') return t('editor.frameToolbar.posterPortraitLarge');
  if (preset.key === 'poster-1920x1080') return t('editor.frameToolbar.posterLandscape');
  return preset.label;
}

const TAB_I18N: Record<SizePresetCategory, string> = {
  auto: 'editor.frameToolbar.auto',
  website: 'editor.frameToolbar.tabWebsite',
  mobile: 'editor.frameToolbar.tabMobile',
  image: 'editor.frameToolbar.tabImage',
  poster: 'editor.frameToolbar.tabPoster',
  custom: 'editor.frameToolbar.tabCustom',
};

/**
 * Proportional frame outline. Optionally shrink/grow by area vs `relativeToMaxArea`
 * (e.g. A0 vs A6 within the paper tab).
 */
export function SizeAspectGlyph({
  width,
  height,
  box = 20,
  relativeToMaxArea,
  className,
}: {
  width: number;
  height: number;
  box?: number;
  relativeToMaxArea?: number;
  className?: string;
}) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const ar = w / h;
  const pad = 1.5;
  const inner = box - pad * 2;
  let gw: number;
  let gh: number;
  if (ar >= 1) {
    gw = inner;
    gh = Math.max(3, inner / ar);
  } else {
    gh = inner;
    gw = Math.max(3, inner * ar);
  }
  if (relativeToMaxArea && relativeToMaxArea > 0) {
    const t = Math.sqrt((w * h) / relativeToMaxArea);
    const scale = 0.42 + 0.58 * Math.min(1, Math.max(0.15, t));
    gw *= scale;
    gh *= scale;
  }
  const x = (box - gw) / 2;
  const y = (box - gh) / 2;
  return (
    <svg
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      className={cn('shrink-0 text-current', className)}
      aria-hidden
    >
      <rect
        x={x}
        y={y}
        width={gw}
        height={gh}
        rx={Math.min(2, Math.min(gw, gh) * 0.12)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
      />
    </svg>
  );
}

type SizePresetPanelProps = {
  /** Highlight matching preset key (e.g. `iphone-14`). */
  activeKey?: string;
  /** Fallback when `activeKey` is empty — match by pixel size. */
  activeWidth?: number;
  activeHeight?: number;
  initialCategory?: SizePresetCategory;
  disabled?: boolean;
  className?: string;
  /** Show Auto (LLM picks size) — used by design agent canvas picker. */
  showAuto?: boolean;
  /** When Auto is selected in the composer chip. */
  autoActive?: boolean;
  /** Called when user picks a fixed-size preset (or Auto / partial custom). */
  onPick: (preset: FrameSizePreset) => void;
};

function resolveTabForKey(key: string, autoActive?: boolean): SizePresetCategory {
  if (autoActive || key === 'auto') return 'auto';
  if (!key || key === 'custom') return 'custom';
  const cat = findFramePreset(key)?.category;
  if (cat && cat !== 'ratio') return cat;
  return 'website';
}

/**
 * Shared size preset UI — left category tabs + right device list.
 * Used by frame toolbar and chat design canvas size picker.
 */
export default function SizePresetPanel({
  activeKey,
  activeWidth,
  activeHeight,
  initialCategory,
  disabled,
  className,
  showAuto = false,
  autoActive = false,
  onPick,
}: SizePresetPanelProps): ReactNode {
  const { t } = useTranslation();
  const matchedKey =
    activeKey ||
    (activeWidth && activeHeight ? matchFramePreset(activeWidth, activeHeight) : '');

  const resolvedInitial: SizePresetCategory = (() => {
    if (autoActive && showAuto) return 'auto';
    if (initialCategory) return initialCategory;
    return resolveTabForKey(matchedKey, autoActive && showAuto);
  })();

  const [tab, setTab] = useState<SizePresetCategory>(resolvedInitial);
  const [customW, setCustomW] = useState(() =>
    activeWidth && activeWidth > 0 ? String(Math.round(activeWidth)) : ''
  );
  const [customH, setCustomH] = useState(() =>
    activeHeight && activeHeight > 0 ? String(Math.round(activeHeight)) : ''
  );

  useEffect(() => {
    setTab(resolvedInitial);
  }, [resolvedInitial]);

  useEffect(() => {
    if (activeWidth && activeWidth > 0) setCustomW(String(Math.round(activeWidth)));
    if (activeHeight && activeHeight > 0) setCustomH(String(Math.round(activeHeight)));
  }, [activeWidth, activeHeight]);

  const tabs = useMemo(
    () =>
      showAuto
        ? ([{ id: 'auto' as const }, ...FRAME_PRESET_TABS] as { id: SizePresetCategory }[])
        : FRAME_PRESET_TABS,
    [showAuto]
  );

  const list = useMemo(
    () => (tab === 'auto' || tab === 'custom' ? [] : presetsByCategory(tab)),
    [tab]
  );
  const maxArea = useMemo(() => {
    let max = 0;
    for (const p of list) {
      if (p.width && p.height) max = Math.max(max, p.width * p.height);
    }
    return max || 1;
  }, [list]);

  const pickAuto = () => {
    onPick({
      key: 'auto',
      label: t('editor.frameToolbar.auto'),
      category: 'custom',
      icon: 'square',
    });
  };

  const applyCustom = () => {
    const wRaw = String(customW).trim();
    const hRaw = String(customH).trim();
    const wNum = wRaw ? Math.round(Number(wRaw)) : NaN;
    const hNum = hRaw ? Math.round(Number(hRaw)) : NaN;
    const hasW = Number.isFinite(wNum) && wNum >= 40;
    const hasH = Number.isFinite(hNum) && hNum >= 40;
    if (!hasW && !hasH) {
      if (showAuto) {
        setTab('auto');
        pickAuto();
      }
      return;
    }
    onPick({
      key: 'custom',
      label: t('editor.frameToolbar.custom'),
      category: 'custom',
      ...(hasW ? { width: wNum } : {}),
      ...(hasH ? { height: hNum } : {}),
      icon: 'square',
    });
  };

  return (
    <div className={cn('flex min-h-[280px] min-w-[360px] items-stretch', className)}>
      <div
        role="tablist"
        aria-orientation="vertical"
        className="flex w-[7.5rem] shrink-0 flex-col border-r border-[var(--line)]"
      >
        <div className="flex flex-col gap-0.5 p-1.5">
          {tabs.map((item) => {
            const active =
              item.id === 'auto'
                ? Boolean(autoActive) || tab === 'auto'
                : !autoActive && tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  // Tabs only switch the list — do not onPick (parent closes the popover on pick).
                  setTab(item.id);
                }}
                className={cn(
                  'rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition-colors disabled:opacity-40',
                  active
                    ? 'bg-[var(--canvas)] text-[var(--ink)]'
                    : 'text-[var(--muted)] hover:bg-[var(--canvas)]/70 hover:text-[var(--ink)]'
                )}
              >
                {t(TAB_I18N[item.id])}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="listbox"
        className="min-w-0 flex-1 overflow-y-auto pl-1 pr-1.5"
        style={{ maxHeight: 'min(340px, 50vh)' }}
      >
        {tab === 'auto' ? (
          <div className="flex flex-col gap-2 p-3">
            <p className="text-[13px] font-medium text-[var(--ink)]">
              {t('editor.frameToolbar.auto')}
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--muted)]">
              {t('editor.frameToolbar.autoHint')}
            </p>
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              {t('editor.frameToolbar.customAutoHint')}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                pickAuto();
              }}
              className="mt-1 h-9 rounded-lg bg-[var(--ink)] text-[13px] font-medium text-[var(--surface)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t('editor.frameToolbar.apply')}
            </button>
          </div>
        ) : tab === 'custom' ? (
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] text-[var(--muted)]">
                  {t('editor.frameToolbar.width')}
                </span>
                <input
                  type="number"
                  min={40}
                  inputMode="numeric"
                  disabled={disabled}
                  placeholder={showAuto ? t('editor.frameToolbar.auto') : undefined}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCustom();
                    }
                  }}
                  className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] tabular-nums text-[var(--ink)] outline-none [appearance:textfield] focus:border-[var(--ink)]/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </label>
              <span className="mt-5 text-[13px] text-[var(--muted)]">×</span>
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] text-[var(--muted)]">
                  {t('editor.frameToolbar.height')}
                </span>
                <input
                  type="number"
                  min={40}
                  inputMode="numeric"
                  disabled={disabled}
                  placeholder={showAuto ? t('editor.frameToolbar.auto') : undefined}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCustom();
                    }
                  }}
                  className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] tabular-nums text-[var(--ink)] outline-none [appearance:textfield] focus:border-[var(--ink)]/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </label>
            </div>
            {showAuto ? (
              <p className="text-[11px] leading-snug text-[var(--muted)]">
                {t('editor.frameToolbar.customAutoHint')}
              </p>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                applyCustom();
              }}
              className="h-9 rounded-lg bg-[var(--ink)] text-[13px] font-medium text-[var(--surface)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t('editor.frameToolbar.apply')}
            </button>
          </div>
        ) : (
          list.map((p) => {
            const selected = !autoActive && matchedKey === p.key;
            const sizeHint = p.width && p.height ? `${p.width} x ${p.height}` : '';
            return (
              <button
                key={p.key}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled || !p.width || !p.height}
                onClick={(e) => {
                  e.stopPropagation();
                  if (p.width && p.height) onPick(p);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] transition-colors disabled:opacity-40',
                  selected
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--ink)]'
                    : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]/60'
                )}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--muted)]">
                  {p.width && p.height ? (
                    <SizeAspectGlyph
                      width={p.width}
                      height={p.height}
                      box={20}
                      relativeToMaxArea={maxArea}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {framePresetDisplayLabel(p, t)}
                </span>
                {sizeHint ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                    {sizeHint}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
