import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/base/icon';
import SizePresetPanel, {
  SizeAspectGlyph,
  isCanvasSizeAutoHint,
  normalizeCanvasSizeChip,
} from '@/components/editor/chrome/SizePresetPanel';
import { cn } from '@/utils/classnames';

export { SizeAspectGlyph };

/** Presets shown in the image-gen ratio grid (fig.2). */
export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '1:2',
  '2:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
  '9:21',
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const DEFAULT_IMAGE_ASPECT_RATIO: ImageAspectRatio = '1:1';

export const IMAGE_QUALITY_IDS = ['low', 'standard', 'high'] as const;

export type ImageQuality = (typeof IMAGE_QUALITY_IDS)[number];

export const DEFAULT_IMAGE_QUALITY: ImageQuality = 'standard';

export const IMAGE_RESOLUTIONS = [
  { id: '1K', labelKey: 'agent.resolution1kShort' as const },
  { id: '2K', labelKey: 'agent.resolution2kShort' as const },
  { id: '4K', labelKey: 'agent.resolution4kShort' as const },
] as const;

export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number]['id'];

export const DEFAULT_IMAGE_RESOLUTION: ImageResolution = '2K';

export const IMAGE_COUNT_OPTIONS = [1, 2, 4] as const;

export type ImageCount = (typeof IMAGE_COUNT_OPTIONS)[number];

export const DEFAULT_IMAGE_COUNT: ImageCount = 1;

/** Mirrors apps/api/services/llm/image.py size tables. */
const SIZE_1K: Record<string, string> = {
  '1:1': '1024x1024',
  '1:2': '768x1536',
  '2:1': '1536x768',
  '9:16': '720x1280',
  '16:9': '1280x720',
  '3:4': '864x1152',
  '4:3': '1152x864',
  '3:2': '1248x832',
  '2:3': '832x1248',
  '5:4': '1280x1024',
  '4:5': '1024x1280',
  '21:9': '1680x720',
  '9:21': '720x1680',
};

const SIZE_2K: Record<string, string> = {
  '1:1': '2048x2048',
  '4:3': '2304x1728',
  '3:4': '1728x2304',
  '16:9': '2560x1440',
  '9:16': '1440x2560',
  '3:2': '2496x1664',
  '2:3': '1664x2496',
  '21:9': '3024x1296',
  '9:21': '1296x3024',
  '5:4': '2304x1792',
  '4:5': '1792x2304',
  '1:2': '1440x2880',
  '2:1': '2880x1440',
};

const SIZE_4K: Record<string, string> = {
  '1:1': '4096x4096',
  '4:3': '4704x3520',
  '3:4': '3520x4704',
  '16:9': '5504x3040',
  '9:16': '3040x5504',
  '3:2': '4992x3328',
  '2:3': '3328x4992',
  '21:9': '6240x2656',
  '9:21': '2656x6240',
  '5:4': '4608x3584',
  '4:5': '3584x4608',
  '1:2': '2880x5760',
  '2:1': '5760x2880',
};

const SIZE_TABLES: Record<string, Record<string, string>> = {
  '1K': SIZE_1K,
  '2K': SIZE_2K,
  '4K': SIZE_4K,
};

const BASE_AREA: Record<string, number> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
  '4K': 4096 * 4096,
};

function roundDim(n: number) {
  return Math.max(16, Math.round(n / 16) * 16);
}

function parseAspectParts(aspectRatio: string): { w: number; h: number } {
  const raw = String(aspectRatio || '1:1').trim();
  if (/^\d+x\d+$/i.test(raw)) {
    const [a, b] = raw.toLowerCase().split('x').map(Number);
    if (a > 0 && b > 0) return { w: a, h: b };
  }
  if (raw.includes(':')) {
    const [a, b] = raw.split(':').map(Number);
    if (a > 0 && b > 0) return { w: a, h: b };
  }
  return { w: 1, h: 1 };
}

function sizeFromArea(area: number, aspectRatio: string) {
  const { w: wr, h: hr } = parseAspectParts(aspectRatio);
  const ratio = wr / hr;
  const h = Math.sqrt(area / ratio);
  const w = h * ratio;
  return { w: roundDim(w), h: roundDim(h) };
}

/** Resolve pixel size for a ratio + resolution (same rules as the image API). */
export function resolveImagePixelSize(
  aspectRatio: string,
  resolution: string
): { w: number; h: number } {
  const raw = String(aspectRatio || '1:1').trim();
  if (raw === 'smart') {
    return resolveImagePixelSize('1:1', resolution);
  }
  if (/^\d+x\d+$/i.test(raw)) {
    const [a, b] = raw.toLowerCase().split('x').map(Number);
    if (a > 0 && b > 0) return { w: a, h: b };
  }
  const resKey = resolution === '1K' || resolution === '4K' ? resolution : '2K';
  const table = SIZE_TABLES[resKey];
  const hit = table[raw];
  if (hit) {
    const [a, b] = hit.split('x').map(Number);
    return { w: a, h: b };
  }
  return sizeFromArea(BASE_AREA[resKey] || BASE_AREA['2K'], raw);
}

/** Chip label uses colon: `2560:1440`. */
export function formatImageSizeLabel(aspectRatio: string, resolution: string) {
  const { w, h } = resolveImagePixelSize(aspectRatio, resolution);
  return `${w}:${h}`;
}

/**
 * Visual glyph for a ratio key (`smart` / `3:2` / `1248x832`).
 * Drawn in a fixed box so 16:9 / 1:1 / 9:16 read clearly different.
 */
export function AspectRatioGlyph({
  ratio,
  className,
  size = 18,
}: {
  ratio: string;
  className?: string;
  size?: number;
}) {
  const raw = String(ratio || '1:1').trim();
  if (raw === 'smart' || raw.toLowerCase() === 'auto' || /auto/i.test(raw)) {
    return (
      <Icon
        name="editor-aspect-smart"
        width={size}
        height={size}
        className={cn('shrink-0', className)}
      />
    );
  }
  const parts = parseAspectParts(raw);
  return (
    <SizeAspectGlyph
      width={parts.w}
      height={parts.h}
      box={size}
      className={className}
    />
  );
}

/** Whether the current value matches a preset ratio at the given resolution. */
function isRatioActive(current: string, preset: string, resolution: string) {
  if (current === preset) return true;
  if (preset === 'smart' || !/^\d+x\d+$/i.test(current)) return false;
  const px = resolveImagePixelSize(preset, resolution);
  const cur = parseAspectParts(current);
  return px.w === cur.w && px.h === cur.h;
}

/** Cyan sparkle for HD / UHD (fig.2 / fig.3). */
export function ResolutionSparkle({ className }: { className?: string }) {
  return (
    <svg className={cn('h-2.5 w-2.5', className)} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M6 0.5L7.2 4.8L11.5 6L7.2 7.2L6 11.5L4.8 7.2L0.5 6L4.8 4.8L6 0.5Z" />
    </svg>
  );
}

type Props = {
  /** design = device presets (fig.3/4); image = quality/ratio grid (fig.2). */
  variant?: 'design' | 'image';
  quality?: string;
  resolution: string;
  aspectRatio: string;
  imageCount?: number;
  onQualityChange?: (quality: string) => void;
  onResolutionChange: (resolution: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  /** Design size tab category — keep in sync with Agent scene (mobile/website/…). */
  onDesignSceneChange?: (scene: 'website' | 'mobile' | 'image' | 'poster' | null) => void;
  onImageCountChange?: (count: number) => void;
  disabled?: boolean;
  className?: string;
};

function SegmentedRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1.5', className)}>{children}</div>
  );
}

function SegmentBtn({
  active,
  disabled,
  onClick,
  children,
  className,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex flex-1 items-center justify-center rounded-[4px] px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40',
        active
          ? 'bg-[var(--ink)] text-[var(--on-brand)]'
          : 'bg-[var(--canvas)] text-[var(--muted)] hover:text-[var(--ink)]',
        className
      )}
    >
      {children}
    </button>
  );
}

/** Image gen (fig.2) / design canvas size (fig.3 + left tabs fig.4). */
export default function ImageAspectRatioPicker({
  variant = 'image',
  quality = DEFAULT_IMAGE_QUALITY,
  resolution,
  aspectRatio,
  imageCount = DEFAULT_IMAGE_COUNT,
  onQualityChange,
  onResolutionChange,
  onAspectRatioChange,
  onDesignSceneChange,
  onImageCountChange,
  disabled,
  className,
}: Props): ReactNode {
  const { t } = useTranslation();

  const pixels = useMemo(
    () => resolveImagePixelSize(aspectRatio, resolution),
    [aspectRatio, resolution]
  );

  if (variant === 'design') {
    const chip = normalizeCanvasSizeChip(aspectRatio);
    const autoActive = isCanvasSizeAutoHint(chip) || chip === 'auto';
    const fixed = /^\d+x\d+$/.test(chip);
    const [cw, ch] = fixed ? chip.split('x').map(Number) : [0, 0];
    const partialW = /^(\d+)xauto$/.test(chip) ? Number(chip.split('x')[0]) : 0;
    const partialH = /^autox(\d+)$/.test(chip) ? Number(chip.split('x')[1]) : 0;
    return (
      <SizePresetPanel
        className={className}
        disabled={disabled}
        showAuto
        autoActive={autoActive && !partialW && !partialH}
        activeWidth={fixed ? cw : partialW || undefined}
        activeHeight={fixed ? ch : partialH || undefined}
        onPick={(preset) => {
          if (preset.key === 'auto') {
            onAspectRatioChange('auto');
            // Clear scene lock so Auto isn't pinned to a prior Mobile/Website tab.
            onDesignSceneChange?.(null);
            return;
          }
          const hasW = typeof preset.width === 'number' && preset.width >= 40;
          const hasH = typeof preset.height === 'number' && preset.height >= 40;
          if (hasW && hasH) {
            onAspectRatioChange(`${preset.width}x${preset.height}`);
          } else if (hasW) {
            onAspectRatioChange(`${preset.width}xauto`);
          } else if (hasH) {
            onAspectRatioChange(`autox${preset.height}`);
          } else {
            onAspectRatioChange('auto');
          }
          if (
            preset.category === 'website' ||
            preset.category === 'mobile' ||
            preset.category === 'image' ||
            preset.category === 'poster'
          ) {
            onDesignSceneChange?.(preset.category);
          }
        }}
      />
    );
  }

  // Image generation settings
  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('agent.quality')}</p>
        <SegmentedRow>
          {(
            [
              { id: 'low', label: t('agent.qualityLow') },
              { id: 'standard', label: t('agent.qualityStandard') },
              { id: 'high', label: t('agent.qualityHigh') },
            ] as const
          ).map((q) => (
            <SegmentBtn
              key={q.id}
              active={quality === q.id}
              disabled={disabled || !onQualityChange}
              onClick={() => onQualityChange?.(q.id)}
            >
              {q.label}
            </SegmentBtn>
          ))}
        </SegmentedRow>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('agent.clarity')}</p>
        <SegmentedRow>
          {IMAGE_RESOLUTIONS.map((r) => {
            const active = resolution === r.id;
            return (
              <SegmentBtn
                key={r.id}
                active={active}
                disabled={disabled}
                onClick={() => {
                  onResolutionChange(r.id);
                  if (/^\d+x\d+$/i.test(aspectRatio)) {
                    const p = parseAspectParts(aspectRatio);
                    const next = sizeFromArea(
                      BASE_AREA[r.id] || BASE_AREA['2K'],
                      `${p.w}:${p.h}`
                    );
                    onAspectRatioChange(`${next.w}x${next.h}`);
                  }
                }}
              >
                <span className="inline-flex items-center gap-0.5">
                  {t(r.labelKey)}
                  {r.id === '2K' || r.id === '4K' ? (
                    <ResolutionSparkle className="text-[#22d3ee]" />
                  ) : null}
                </span>
              </SegmentBtn>
            );
          })}
        </SegmentedRow>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('agent.aspectRatio')}</p>
        <div className="grid grid-cols-5 gap-1 sm:grid-cols-6">
          {IMAGE_ASPECT_RATIOS.map((ratio) => {
            const active = isRatioActive(aspectRatio, ratio, resolution);
            return (
              <button
                key={ratio}
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onAspectRatioChange(ratio);
                }}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-[4px] px-1 py-1.5 transition-colors disabled:opacity-40',
                  active
                    ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                    : 'bg-[var(--canvas)] text-[var(--muted)] hover:text-[var(--ink)]'
                )}
              >
                <AspectRatioGlyph ratio={ratio} size={18} />
                <span className="text-[10px] font-medium tabular-nums">{ratio}</span>
              </button>
            );
          })}
        </div>
      </div>

      {onImageCountChange ? (
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">{t('agent.genCount')}</p>
          <SegmentedRow>
            {IMAGE_COUNT_OPTIONS.map((n) => (
              <SegmentBtn
                key={n}
                active={imageCount === n}
                disabled={disabled}
                onClick={() => onImageCountChange(n)}
              >
                {t('agent.genCountN', { count: n })}
              </SegmentBtn>
            ))}
          </SegmentedRow>
        </div>
      ) : null}
    </div>
  );
}
