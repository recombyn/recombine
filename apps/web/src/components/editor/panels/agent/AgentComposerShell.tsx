import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from '@floating-ui/react';
import {
  HiArrowUp,
  HiOutlineDocument,
  HiOutlinePlay,
  HiOutlinePlus,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { Dropdown } from '@/components/base';
import { Icon } from '@/components/base/icon';
import Tooltip from '@/components/base/tooltip';
import AgentComposerInput, {
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import ImageAspectRatioPicker, {
  AspectRatioGlyph,
  formatImageSizeLabel,
  ResolutionSparkle,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import { formatCanvasSizeChipLabel } from '@/components/editor/chrome/SizePresetPanel';
import { cn } from '@/utils/classnames';

/** Run mode — Auto toggle = agent; image tab = image gen. */
export type ComposerRunMode = 'agent' | 'image';

/** Ghost toolbar controls — icon only, no border / fill. */
const TOOL_ICON_BTN =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-40';
const TOOL_ICON_BTN_ACTIVE = 'text-[var(--ink)]';
const TOOL_TEXT_BTN =
  'inline-flex h-7 max-w-[min(100%,10rem)] items-center gap-1.5 rounded-md px-0.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-40';
const TOOL_TEXT_BTN_ACTIVE = 'text-[var(--ink)]';

type Props = {
  inputRef?: Ref<AgentComposerHandle>;
  contexts: ComposerContext[];
  onContextsChange: (next: ComposerContext[]) => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** While a turn is running — show stop instead of send. */
  sending?: boolean;
  onStop?: () => void;
  onEscape?: () => void;
  disabled?: boolean;
  placeholder: string;
  /** Left toolbar extras (e.g. 取消 / 还原 when editing). */
  leadingActions?: ReactNode;
  canSend: boolean;
  /** Open OS file picker and receive selected files (images). */
  onAttachFiles?: (files: File[]) => void;
  /** Tooltip for the attach (+) button. */
  attachTooltip?: string;
  /** design = device presets; image = quality/ratio grid. */
  aspectPickerVariant?: 'design' | 'image';
  /** When set, show image settings button. */
  imageAspectRatio?: string | null;
  onImageAspectRatioChange?: (ratio: string) => void;
  onDesignSceneChange?: (scene: 'website' | 'mobile' | 'image' | 'poster' | null) => void;
  imageQuality?: string | null;
  onImageQualityChange?: (quality: string) => void;
  imageResolution?: string | null;
  onImageResolutionChange?: (resolution: string) => void;
  imageCount?: number | null;
  onImageCountChange?: (count: number) => void;
  /**
   * Where the size / aspect panel opens relative to the trigger.
   * Home hero: `bottom-start` (open downward). Agent dock footer: `top-start`.
   */
  aspectMenuPlacement?: Placement;
  modelButtonProps: {
    ref: (node: HTMLElement | null) => void;
    title: string;
    open: boolean;
    onClick: () => void;
    getReferenceProps: (userProps?: Record<string, unknown>) => Record<string, unknown>;
    /** Optional brand icon for the selected LLM (from assets/model). */
    icon?: ReactNode;
    /** Short label shown in the pill (e.g. Auto / DeepSeek). */
    label?: string;
  };
  className?: string;
  /** Home hero: text CTA instead of icon-only send. */
  submitLabel?: string;
};


const ATTACH_PREVIEW_WIDTH = 160;
/** Cap tall previews by shrinking width so aspect stays true. */
const ATTACH_PREVIEW_MAX_HEIGHT = 360;

function formatAudioTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function attachmentPreviewKind(src?: string): 'image' | 'audio' | null {
  const s = String(src || '').trim();
  if (!s) return null;
  if (s.startsWith('data:image/')) return 'image';
  if (s.startsWith('data:audio/')) return 'audio';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return 'image';
  return null;
}

function attachmentThumbSrc(a: ComposerContext): string {
  const thumb = String(a.thumbUrl || '').trim();
  if (thumb.startsWith('data:image/')) return thumb;
  const ref = String(a.dataUrl || '').trim();
  if (ref.startsWith('data:image/') || ref.startsWith('http://') || ref.startsWith('https://')) {
    return ref;
  }
  return thumb || ref;
}

function AttachmentImagePreview({ src, label }: { src: string; label: string }): ReactNode {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0) {
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Fixed width; height from image aspect. If too tall, shrink width to keep ratio.
  let panelW = ATTACH_PREVIEW_WIDTH;
  let panelH = Math.round(ATTACH_PREVIEW_WIDTH * 1.25);
  if (imgSize && imgSize.w > 0) {
    panelH = Math.round((ATTACH_PREVIEW_WIDTH * imgSize.h) / imgSize.w);
    if (panelH > ATTACH_PREVIEW_MAX_HEIGHT) {
      panelH = ATTACH_PREVIEW_MAX_HEIGHT;
      panelW = Math.max(72, Math.round((ATTACH_PREVIEW_MAX_HEIGHT * imgSize.w) / imgSize.h));
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-white shadow-[0_8px_24px_rgba(12,12,13,0.16)] ring-1 ring-black/5"
      style={{ width: panelW, height: panelH }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <img src={src} alt={label} className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

function AttachmentAudioPreview({ src }: { src: string }): ReactNode {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState({ current: 0, duration: 0 });

  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div
      className="flex h-11 items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 shadow-[0_8px_24px_rgba(12,12,13,0.14)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={
          playing
            ? t('agent.previewPause', { defaultValue: 'Pause' })
            : t('agent.previewPlay', { defaultValue: 'Play' })
        }
        onClick={toggleAudio}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)]"
      >
        {playing ? (
          <span className="h-2.5 w-2.5 rounded-[2px] bg-current" aria-hidden />
        ) : (
          <HiOutlinePlay className="h-4 w-4" />
        )}
      </button>
      <span className="text-[12px] tabular-nums text-[var(--muted)]">
        {formatAudioTime(audioTime.current)} / {formatAudioTime(audioTime.duration || 0)}
      </span>
      <audio
        ref={audioRef}
        src={src}
        className="hidden"
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (!el) return;
          setAudioTime({ current: el.currentTime, duration: el.duration || 0 });
        }}
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (!el) return;
          setAudioTime({ current: 0, duration: el.duration || 0 });
        }}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

function AttachmentStrip({
  attachments,
  disabled,
  onRemove,
}: {
  attachments: ComposerContext[];
  disabled?: boolean;
  onRemove: (key: string) => void;
}): ReactNode {
  if (!attachments.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5 pb-0.5">
      {attachments.map((a) => {
        const thumbSrc = attachmentThumbSrc(a);
        const previewKind = attachmentPreviewKind(thumbSrc);
        const canPreview = previewKind === 'image' || previewKind === 'audio';
        const thumb = (
          <div className="group relative h-9 w-9 shrink-0">
            <button
              type="button"
              disabled={disabled || !canPreview}
              title={canPreview ? `预览 ${a.label}` : a.label}
              className={cn(
                'h-full w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]',
                canPreview && 'cursor-zoom-in hover:border-[var(--ink)]/30',
                !canPreview && 'cursor-default'
              )}
            >
              {canPreview && previewKind === 'image' && thumbSrc ? (
                <img src={thumbSrc} alt={a.label} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[var(--muted)]">
                  <HiOutlineDocument className="h-3.5 w-3.5" />
                  <span className="w-full truncate text-center text-[8px] leading-tight">{a.label}</span>
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={`移除 ${a.label}`}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(a.key);
              }}
              className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] opacity-0 shadow-sm transition-opacity hover:text-[var(--ink)] group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
            >
              <HiOutlineXMark className="h-2.5 w-2.5" />
            </button>
          </div>
        );

        if (!canPreview || !thumbSrc) return <div key={a.key}>{thumb}</div>;

        return (
          <Dropdown
            key={a.key}
            trigger="hover"
            placement="top"
            strategy="fixed"
            offset={8}
            items={[]}
            floatingClassName="z-[90]"
            referenceClassName="inline-flex"
            popupRender={() =>
              previewKind === 'audio' ? (
                <AttachmentAudioPreview src={thumbSrc} />
              ) : (
                <AttachmentImagePreview src={thumbSrc} label={a.label} />
              )
            }
          >
            {thumb}
          </Dropdown>
        );
      })}
    </div>
  );
}

/**
 * Shared agent composer card — input + toolbar (attach / model / send).
 * Used for both the dock footer and in-place message edit (Cursor-style).
 */
export default function AgentComposerShell({
  inputRef,
  contexts,
  onContextsChange,
  value,
  onChange,
  onSubmit,
  sending = false,
  onStop,
  onEscape,
  disabled,
  placeholder,
  leadingActions,
  canSend,
  onAttachFiles,
  attachTooltip,
  aspectPickerVariant = 'design',
  imageAspectRatio,
  onImageAspectRatioChange,
  onDesignSceneChange,
  imageQuality,
  onImageQualityChange,
  imageResolution,
  onImageResolutionChange,
  imageCount,
  onImageCountChange,
  aspectMenuPlacement = 'bottom-start',
  modelButtonProps,
  className,
  submitLabel,
}: Props): ReactNode {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [aspectOpen, setAspectOpen] = useState(false);

  const attachments = contexts.filter((c) => c.kind === 'attachment');
  const inlineContexts = contexts.filter((c) => c.kind !== 'attachment');
  const showAspectBtn =
    typeof imageAspectRatio === 'string' &&
    typeof onImageAspectRatioChange === 'function' &&
    typeof imageQuality === 'string' &&
    typeof onImageQualityChange === 'function' &&
    typeof imageResolution === 'string' &&
    typeof onImageResolutionChange === 'function';

  const aspectFloating = useFloating({
    open: aspectOpen,
    onOpenChange: setAspectOpen,
    placement: aspectMenuPlacement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        padding: 12,
        fallbackPlacements:
          aspectMenuPlacement.startsWith('bottom')
            ? ['bottom-end', 'top-start', 'top-end']
            : ['top-end', 'bottom-start', 'bottom-end'],
      }),
      shift({ padding: 12 }),
    ],
  });
  const aspectIx = useInteractions([
    useClick(aspectFloating.context),
    useDismiss(aspectFloating.context),
  ]);

  useEffect(() => {
    if (!showAspectBtn) setAspectOpen(false);
  }, [showAspectBtn]);

  const removeAttachment = (key: string) => {
    onContextsChange(contexts.filter((c) => c.key !== key));
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) onAttachFiles?.(files);
  };

  const aspectLabel =
    aspectPickerVariant === 'image'
      ? t('agent.imageSettings', {
          resolution: imageResolution,
          ratio: formatImageSizeLabel(imageAspectRatio!, imageResolution!),
        })
      : t('agent.designCanvasSize', {
          size: formatCanvasSizeChipLabel(imageAspectRatio, t),
        });

  return (
    <div className={cn('flex flex-col px-3 pb-2 pt-2', className)}>
      <AttachmentStrip
        attachments={attachments}
        disabled={disabled}
        onRemove={removeAttachment}
      />
      <div
        className="flex min-h-[26px] flex-1 items-start"
        onClick={(e) => {
          // Clicks inside the contenteditable already place the caret — don't steal it to end.
          if ((e.target as HTMLElement | null)?.closest?.('[data-agent-composer]')) return;
          const r = inputRef as { current?: AgentComposerHandle | null } | null;
          r?.current?.focus();
        }}
      >
        <AgentComposerInput
          ref={inputRef}
          contexts={inlineContexts}
          onContextsChange={(next) => {
            onContextsChange([...attachments, ...next]);
          }}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          onEscape={onEscape}
          disabled={disabled}
          placeholder={attachments.length || inlineContexts.length ? '' : placeholder}
        />
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {leadingActions}

        <Tooltip title={attachTooltip || t('agent.uploadImage')} placement="top">
          <button
            type="button"
            aria-label={t('agent.uploadAttach')}
            disabled={disabled || !onAttachFiles}
            onClick={() => fileInputRef.current?.click()}
            className={TOOL_ICON_BTN}
          >
            <HiOutlinePlus className="h-4 w-4" strokeWidth={2} />
          </button>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
          multiple
          className="hidden"
          onChange={onFileChange}
        />

        <Tooltip title={modelButtonProps.title} placement="top" disabled={modelButtonProps.open}>
          <button
            type="button"
            ref={modelButtonProps.ref}
            aria-label={t('agent.selectModel')}
            aria-expanded={modelButtonProps.open}
            className={cn(TOOL_ICON_BTN, modelButtonProps.open && TOOL_ICON_BTN_ACTIVE)}
            {...modelButtonProps.getReferenceProps({
              onClick: modelButtonProps.onClick,
            })}
          >
            {modelButtonProps.icon ?? (
              <Icon name="editor-model-cube" width={16} height={16} />
            )}
          </button>
        </Tooltip>

        {showAspectBtn ? (
          <Tooltip title={aspectLabel} placement="top" disabled={aspectOpen}>
            <button
              type="button"
              ref={aspectFloating.refs.setReference}
              aria-label={t('agent.imageSettingsAria')}
              aria-expanded={aspectOpen}
              aria-haspopup="dialog"
              disabled={disabled}
              className={cn(TOOL_TEXT_BTN, aspectOpen && TOOL_TEXT_BTN_ACTIVE)}
              {...aspectIx.getReferenceProps()}
            >
              <AspectRatioGlyph
                ratio={imageAspectRatio!}
                size={12}
                className="opacity-80"
              />
              <span className="truncate text-[11px] font-medium tabular-nums">
                {aspectPickerVariant === 'design'
                  ? formatCanvasSizeChipLabel(imageAspectRatio, t)
                  : formatImageSizeLabel(imageAspectRatio!, imageResolution!)}
              </span>
              {aspectPickerVariant === 'image' &&
              (imageResolution === '2K' || imageResolution === '4K') ? (
                <ResolutionSparkle className="text-[#22d3ee]" />
              ) : null}
            </button>
          </Tooltip>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          {sending ? (
            <button
              type="button"
              aria-label={t('agent.stop')}
              title={t('agent.stop')}
              onClick={() => onStop?.()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--on-brand)] transition-opacity hover:opacity-90"
            >
              <span className="h-2.5 w-2.5 rounded-[2px] bg-current" aria-hidden />
            </button>
          ) : submitLabel ? (
            <button
              type="button"
              aria-label={submitLabel}
              title={submitLabel}
              disabled={!canSend}
              onClick={onSubmit}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)] transition-opacity disabled:opacity-35"
            >
              {submitLabel}
            </button>
          ) : (
            <button
              type="button"
              aria-label={t('agent.send')}
              title={t('agent.send')}
              disabled={!canSend}
              onClick={onSubmit}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--on-brand)] transition-opacity disabled:opacity-35"
            >
              <HiArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {showAspectBtn && aspectOpen ? (
        <FloatingPortal>
          <div
            ref={aspectFloating.refs.setFloating}
            style={aspectFloating.floatingStyles}
            className="z-[80] w-[min(400px,calc(100vw-24px))]"
            {...aspectIx.getFloatingProps({
              onPointerDown: (e) => e.stopPropagation(),
            })}
          >
            <div
              className={cn(
                'overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]',
                // Design size presets match frame toolbar (flush edges). Image settings keep padding.
                aspectPickerVariant === 'design' ? 'p-0' : 'p-3'
              )}
            >
              <ImageAspectRatioPicker
                variant={aspectPickerVariant}
                quality={imageQuality!}
                resolution={imageResolution!}
                aspectRatio={imageAspectRatio!}
                imageCount={typeof imageCount === 'number' ? imageCount : undefined}
                onQualityChange={(q) => onImageQualityChange?.(q)}
                onResolutionChange={(r) => onImageResolutionChange?.(r)}
                onAspectRatioChange={(ratio) => {
                  onImageAspectRatioChange?.(ratio);
                  // Collapse after picking a size / ratio (home + dock).
                  setAspectOpen(false);
                }}
                onDesignSceneChange={onDesignSceneChange}
                onImageCountChange={
                  aspectPickerVariant === 'image' ? onImageCountChange : undefined
                }
                disabled={disabled}
              />
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
