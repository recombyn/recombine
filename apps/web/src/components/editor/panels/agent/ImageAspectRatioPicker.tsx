import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

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
  { id: '1K', label: '1K' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
] as const;

export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number]['id'];

export const DEFAULT_IMAGE_RESOLUTION: ImageResolution = '2K';

function RatioIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number);
  const max = 14;
  const scale = max / Math.max(w, h);
  const rw = Math.max(4, Math.round(w * scale));
  const rh = Math.max(4, Math.round(h * scale));
  return (
    <span
      className="inline-block rounded-[2px] border border-current opacity-80"
      style={{ width: rw, height: rh }}
      aria-hidden
    />
  );
}

function SegmentButton({
  active,
  disabled,
  label,
  onClick,
  className,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
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
        'flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40',
        active
          ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--ink)]'
          : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--accent-soft)]/60 hover:text-[var(--ink)]',
        className
      )}
    >
      {label}
    </button>
  );
}

type Props = {
  quality: string;
  resolution: string;
  aspectRatio: string;
  onQualityChange: (quality: string) => void;
  onResolutionChange: (resolution: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Image gen settings: quality, resolution, aspect ratio (Seedream). */
export default function ImageAspectRatioPicker({
  quality,
  resolution,
  aspectRatio,
  onQualityChange,
  onResolutionChange,
  onAspectRatioChange,
  disabled,
  className,
}: Props): ReactNode {
  const { t } = useTranslation();
  const qualityLabel = (id: ImageQuality) =>
    id === 'low'
      ? t('agent.qualityLow')
      : id === 'high'
        ? t('agent.qualityHigh')
        : t('agent.qualityStandard');

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--muted)]">
          {t('agent.quality')}
        </p>
        <div className="flex gap-1.5">
          {IMAGE_QUALITY_IDS.map((id) => (
            <SegmentButton
              key={id}
              active={quality === id}
              disabled={disabled}
              label={qualityLabel(id)}
              onClick={() => onQualityChange(id)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--muted)]">
          {t('agent.clarity')}
        </p>
        <div className="flex gap-1.5">
          {IMAGE_RESOLUTIONS.map((r) => (
            <SegmentButton
              key={r.id}
              active={resolution === r.id}
              disabled={disabled}
              label={r.label}
              onClick={() => onResolutionChange(r.id)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--muted)]">
          {t('agent.aspectRatio')}
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {IMAGE_ASPECT_RATIOS.map((ratio) => {
            const active = aspectRatio === ratio;
            return (
              <button
                key={ratio}
                type="button"
                disabled={disabled}
                title={ratio}
                onClick={(e) => {
                  e.stopPropagation();
                  onAspectRatioChange(ratio);
                }}
                className={cn(
                  'flex h-[52px] flex-col items-center justify-center gap-1 rounded-lg border text-[11px] transition-colors disabled:opacity-40',
                  active
                    ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--ink)]'
                    : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--accent-soft)]/60 hover:text-[var(--ink)]'
                )}
              >
                <RatioIcon ratio={ratio} />
                <span>{ratio}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
