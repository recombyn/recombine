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
} from '@floating-ui/react';
import {
  HiArrowUp,
  HiOutlineCube,
  HiOutlineDocument,
  HiOutlinePlus,
  HiOutlineRectangleGroup,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { Image } from '@/components/base/image';
import Tooltip from '@/components/base/tooltip';
import AgentComposerInput, {
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import ImageAspectRatioPicker from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import { cn } from '@/utils/classnames';

type Props = {
  inputRef?: Ref<AgentComposerHandle>;
  contexts: ComposerContext[];
  onContextsChange: (next: ComposerContext[]) => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
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
  /** When set, show image settings button (image models only). */
  imageAspectRatio?: string | null;
  onImageAspectRatioChange?: (ratio: string) => void;
  imageQuality?: string | null;
  onImageQualityChange?: (quality: string) => void;
  imageResolution?: string | null;
  onImageResolutionChange?: (resolution: string) => void;
  modelButtonProps: {
    ref: (node: HTMLElement | null) => void;
    title: string;
    open: boolean;
    onClick: () => void;
    getReferenceProps: (userProps?: Record<string, unknown>) => Record<string, unknown>;
    /** Optional brand icon for the selected LLM (from assets/model). */
    icon?: ReactNode;
  };
  className?: string;
};

function AttachmentStrip({
  attachments,
  disabled,
  onRemove,
  onPreview,
}: {
  attachments: ComposerContext[];
  disabled?: boolean;
  onRemove: (key: string) => void;
  onPreview: (ctx: ComposerContext) => void;
}): ReactNode {
  if (!attachments.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5 pb-0.5">
      {attachments.map((a) => {
        const canPreview = Boolean(a.dataUrl?.startsWith('data:image/'));
        return (
          <div key={a.key} className="group relative h-9 w-9 shrink-0">
            <button
              type="button"
              disabled={disabled || !canPreview}
              title={canPreview ? `预览 ${a.label}` : a.label}
              onClick={(e) => {
                e.stopPropagation();
                if (canPreview) onPreview(a);
              }}
              className={cn(
                'h-full w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]',
                canPreview && 'cursor-zoom-in hover:border-[var(--ink)]/30',
                !canPreview && 'cursor-default'
              )}
            >
              {canPreview ? (
                <img src={a.dataUrl} alt={a.label} className="h-full w-full object-cover" />
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
  onEscape,
  disabled,
  placeholder,
  leadingActions,
  canSend,
  onAttachFiles,
  attachTooltip,
  imageAspectRatio,
  onImageAspectRatioChange,
  imageQuality,
  onImageQualityChange,
  imageResolution,
  onImageResolutionChange,
  modelButtonProps,
  className,
}: Props): ReactNode {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<ComposerContext | null>(null);
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
    placement: 'top-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ['top-end', 'bottom-start'] }),
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

  return (
    <div className={cn('flex flex-col px-3 pb-2.5 pt-2.5', className)}>
      <AttachmentStrip
        attachments={attachments}
        disabled={disabled}
        onRemove={removeAttachment}
        onPreview={setPreview}
      />
      <div
        className="flex min-h-[40px] flex-1 items-start"
        onClick={() => {
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
      <div className="mt-1.5 flex items-center gap-0.5">
        {leadingActions}
        <Tooltip title={attachTooltip || t('agent.uploadImage')} placement="top">
          <button
            type="button"
            aria-label={t('agent.uploadAttach')}
            disabled={disabled || !onAttachFiles}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            <HiOutlinePlus className="h-4 w-4" />
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
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
              modelButtonProps.open && 'bg-[var(--accent-soft)] text-[var(--ink)]'
            )}
            {...modelButtonProps.getReferenceProps({
              onClick: modelButtonProps.onClick,
            })}
          >
            {modelButtonProps.icon ?? <HiOutlineCube className="h-[18px] w-[18px]" />}
          </button>
        </Tooltip>
        {showAspectBtn ? (
          <Tooltip
            title={t('agent.imageSettings', {
              resolution: imageResolution,
              ratio: imageAspectRatio,
            })}
            placement="top"
            disabled={aspectOpen}
          >
            <button
              type="button"
              ref={aspectFloating.refs.setReference}
              aria-label={t('agent.imageSettingsAria')}
              aria-expanded={aspectOpen}
              aria-haspopup="dialog"
              disabled={disabled}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded px-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40',
                aspectOpen && 'bg-[var(--accent-soft)] text-[var(--ink)]'
              )}
              {...aspectIx.getReferenceProps()}
            >
              <HiOutlineRectangleGroup className="h-[18px] w-[18px]" />
              <span className="text-[11px] font-medium tabular-nums">
                {imageResolution} · {imageAspectRatio}
              </span>
            </button>
          </Tooltip>
        ) : null}

        <button
          type="button"
          aria-label="Send"
          disabled={!canSend}
          onClick={onSubmit}
          className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--on-brand)] transition-opacity disabled:opacity-35"
        >
          <HiArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      {showAspectBtn && aspectOpen ? (
        <FloatingPortal>
          <div
            ref={aspectFloating.refs.setFloating}
            style={aspectFloating.floatingStyles}
            className="z-[80] w-[min(320px,calc(100vw-24px))]"
            {...aspectIx.getFloatingProps({
              onPointerDown: (e) => e.stopPropagation(),
            })}
          >
            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
              <ImageAspectRatioPicker
                quality={imageQuality!}
                resolution={imageResolution!}
                aspectRatio={imageAspectRatio!}
                onQualityChange={(q) => onImageQualityChange?.(q)}
                onResolutionChange={(r) => onImageResolutionChange?.(r)}
                onAspectRatioChange={(ratio) => onImageAspectRatioChange?.(ratio)}
                disabled={disabled}
              />
            </div>
          </div>
        </FloatingPortal>
      ) : null}

      {/* Same lightbox as canvas image nodes (`Image` + PreviewToolbar). */}
      {preview?.dataUrl ? (
        <Image
          src={preview.dataUrl}
          alt={preview.label}
          lazy={false}
          preview={{
            open: true,
            onOpenChange: (open) => {
              if (!open) setPreview(null);
            },
            previewOnClick: false,
          }}
          className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
          imgClassName="!hidden"
        />
      ) : null}
    </div>
  );
}
