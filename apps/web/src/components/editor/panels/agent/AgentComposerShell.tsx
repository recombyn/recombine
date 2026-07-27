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
  HiCheck,
  HiOutlineBolt,
  HiOutlineViewfinderCircle,
  HiOutlineDocument,
  HiOutlineChatBubbleLeftRight,
  HiOutlinePhoto,
  HiOutlinePlay,
  HiOutlinePlus,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { LuInfinity } from 'react-icons/lu';
import { Dropdown, DropdownPanel, DropdownPanelItem } from '@/components/base';
import { Icon } from '@/components/base/icon';
import Tooltip from '@/components/base/tooltip';
import AgentComposerInput, {
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import ImageAspectRatioPicker from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import { formatCanvasSizeChipLabel } from '@/components/editor/chrome/SizePresetPanel';
import { cn } from '@/utils/classnames';

/** Run mode — Auto toggle = agent; image models still use composerMode for gen UI. */
export type ComposerRunMode = 'agent' | 'image';

/** Agent = edit canvas; Ask = propose / clarify first; Image = Seedream-style chat image gen. */
export type ComposerInteractionMode = 'agent' | 'ask' | 'image';

/** Controls shown when `interactionMode === 'image'` (mirrors ImageGeneratorCard footer). */
export type ImageModeComposerControls = {
  resolution: string;
  aspectRatio: string;
  imageCount: number;
  onResolutionChange: (resolution: string) => void;
  onAspectRatioChange: (ratio: string) => void;
  onImageCountChange: (count: number) => void;
  /** Catalog limits for the selected image model (resolutions / pixel floor). */
  imageLimits?: import('@/apis/chat').ImageLimits | null;
  creditCost: number;
  /** Full model name — tooltip / aria only (trigger is icon-only). */
  modelLabel: string;
  modelIcon?: ReactNode;
  modelPanel: ReactNode;
  modelOpen: boolean;
  onModelOpenChange: (open: boolean) => void;
};

/** Ghost toolbar controls — icon only, no border / fill. */
const TOOL_ICON_BTN =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40';
const TOOL_ICON_BTN_ACTIVE = 'bg-[var(--accent-soft)] text-[var(--ink)]';

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
  onAttachFiles?: (files: File[], opts?: { mention?: boolean }) => void;
  /** Tooltip for the attach (+) button. */
  attachTooltip?: string;
  /**
   * Enter canvas pick mode (Add to Chat) — click a node/group on the board to
   * insert a context chip. When set, a pick button is shown next to +.
   */
  onPickFromCanvas?: () => void;
  /** Highlight the pick button while canvas pick mode is active. */
  pickingFromCanvas?: boolean;
  /** Tooltip for the canvas-pick button. */
  pickFromCanvasTooltip?: string;
  /**
   * When true (default), show design canvas size chip.
   * Image quality / ratio / count are LLM-inferred — never shown as a manual panel.
   */
  showDesignSizePicker?: boolean;
  /** When set with onImageAspectRatioChange, show design canvas size button. */
  imageAspectRatio?: string | null;
  onImageAspectRatioChange?: (ratio: string) => void;
  onDesignSceneChange?: (scene: 'website' | 'mobile' | 'image' | 'poster' | null) => void;
  /** Sync size-panel top tab with home / dock scene (poster / mobile / …). */
  designSceneCategory?: 'website' | 'mobile' | 'image' | 'poster' | null;
  /**
   * Where the size / aspect panel opens relative to the trigger.
   * Home hero: `bottom-start` (open downward). Agent dock footer: `top-start`.
   */
  aspectMenuPlacement?: Placement;
  /** When both are set, show the Agent / Ask / Image switch in the toolbar. */
  interactionMode?: ComposerInteractionMode;
  onInteractionModeChange?: (mode: ComposerInteractionMode) => void;
  allowedInteractionModes?: ComposerInteractionMode[];
  /** Image-mode settings / model / credit send (Image Generator–style chrome). */
  imageModeControls?: ImageModeComposerControls | null;
  modelButtonProps: {
    title: string;
    open: boolean;
    /** Preferred: Dropdown-hosted primary panel (flip / shift, stable anchor). */
    panel?: ReactNode;
    onOpenChange?: (open: boolean) => void;
    /** Dropdown placement when using `panel`. @default top-start */
    panelPlacement?: Placement;
    /** @deprecated Prefer `panel` + `onOpenChange` (legacy floating-ui refs). */
    ref?: (node: HTMLElement | null) => void;
    onClick?: () => void;
    getReferenceProps?: (userProps?: Record<string, unknown>) => Record<string, unknown>;
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
      className="relative overflow-hidden rounded-xl bg-[var(--surface)] shadow-[0_8px_24px_rgba(12,12,13,0.16)] ring-1 ring-[var(--line)]"
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

function AttachmentUploadSpinner(): ReactNode {
  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/35"
      aria-hidden
    >
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    </span>
  );
}

/** Square footprint shared by attachment chips and inline attach buttons. */
export const COMPOSER_ATTACHMENT_CHIP_CLASS = 'h-9 w-9 shrink-0 rounded-md';

/**
 * One composer attachment square — thumbnail, upload spinner, remove badge and
 * hover preview. Exported so other composers (e.g. the image generator node)
 * get identical chips.
 */
export function ComposerAttachmentChip({
  attachment: a,
  disabled,
  removable = true,
  onRemove,
}: {
  attachment: ComposerContext;
  disabled?: boolean;
  /** When false, hide the remove badge (e.g. locked subject node). */
  removable?: boolean;
  onRemove: (key: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const thumbSrc = attachmentThumbSrc(a);
  const previewKind = attachmentPreviewKind(thumbSrc);
  const uploading = a.uploadStatus === 'uploading';
  const canPreview = !uploading && (previewKind === 'image' || previewKind === 'audio');
  const title = uploading
    ? t('agent.attachUploading', { name: a.label })
    : canPreview
      ? `预览 ${a.label}`
      : a.label;
  const thumb = (
    <div className={cn('group relative', COMPOSER_ATTACHMENT_CHIP_CLASS)}>
      <button
        type="button"
        disabled={disabled || uploading || !canPreview}
        title={title}
        aria-busy={uploading || undefined}
        className={cn(
          'relative h-full w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]',
          canPreview && 'cursor-zoom-in hover:border-[var(--ink)]/30',
          (uploading || !canPreview) && 'cursor-default'
        )}
      >
        {previewKind === 'image' && thumbSrc ? (
          <img
            src={thumbSrc}
            alt={a.label}
            className={cn('h-full w-full object-cover', uploading && 'opacity-70')}
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[var(--muted)]">
            <HiOutlineDocument className="h-3.5 w-3.5" />
            <span className="w-full truncate text-center text-[8px] leading-tight">
              {a.label}
            </span>
          </span>
        )}
        {uploading ? <AttachmentUploadSpinner /> : null}
      </button>
      {removable ? (
        <button
          type="button"
          aria-label={`移除 ${a.label}`}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(a.key);
          }}
          className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] opacity-0 shadow-sm transition-opacity hover:text-[var(--ink)] group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-0"
        >
          <HiOutlineXMark className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </div>
  );

  if (!canPreview || !thumbSrc) return thumb;

  return (
    <Dropdown
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
      {attachments.map((a) => (
        <ComposerAttachmentChip
          key={a.key}
          attachment={a}
          disabled={disabled}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function interactionModeLabel(
  mode: ComposerInteractionMode,
  t: (key: string) => string
): string {
  if (mode === 'image') return t('agent.interactionImage');
  if (mode === 'ask') return t('agent.interactionAsk');
  return t('agent.interactionAgent');
}

function interactionModeTooltip(
  mode: ComposerInteractionMode,
  t: (key: string) => string
): string {
  if (mode === 'image') return t('agent.interactionImageItem');
  if (mode === 'ask') return t('agent.interactionAskItem');
  return t('agent.interactionAgentItem');
}

function interactionModeIcon(mode: ComposerInteractionMode): ReactNode {
  if (mode === 'image') {
    return <HiOutlinePhoto className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />;
  }
  if (mode === 'ask') {
    return <HiOutlineChatBubbleLeftRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />;
  }
  return <LuInfinity className="h-4 w-4 shrink-0" strokeWidth={2.25} />;
}

function buildInteractionModeOptions(
  allowedModes: ComposerInteractionMode[],
  t: (key: string) => string
): Array<{ key: ComposerInteractionMode; label: string; icon: ReactNode; disabledItem?: boolean }> {
  const all: Array<{ key: ComposerInteractionMode; label: string; icon: ReactNode }> = [
    {
      key: 'agent',
      label: t('agent.interactionAgent'),
      icon: <LuInfinity className="h-4 w-4 shrink-0" strokeWidth={2.25} />,
    },
    {
      key: 'ask',
      label: t('agent.interactionAsk'),
      icon: <HiOutlineChatBubbleLeftRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
    },
    {
      key: 'image',
      label: t('agent.interactionImage'),
      icon: <HiOutlinePhoto className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
    },
  ];
  return all.map((item) => ({ ...item, disabledItem: !allowedModes.includes(item.key) }));
}

function ComposerInteractionModePicker({
  interactionMode,
  disabled,
  modeMenuOpen,
  onModeMenuOpenChange,
  onInteractionModeChange,
  allowedModes,
  t,
}: {
  interactionMode: ComposerInteractionMode;
  disabled?: boolean;
  modeMenuOpen: boolean;
  onModeMenuOpenChange: (open: boolean) => void;
  onInteractionModeChange: (mode: ComposerInteractionMode) => void;
  allowedModes: ComposerInteractionMode[];
  t: (key: string) => string;
}): ReactNode {
  const modes = buildInteractionModeOptions(allowedModes, t);
  return (
    <Dropdown
      trigger="click"
      placement="top-start"
      strategy="fixed"
      offset={8}
      open={modeMenuOpen}
      onOpenChange={onModeMenuOpenChange}
      items={[]}
      floatingClassName="z-[90]"
      referenceClassName="inline-flex"
      popupRender={() => (
        <DropdownPanel className="min-w-[9.5rem] p-1">
          {modes.map((m) => {
            const active = interactionMode === m.key;
            const itemDisabled = Boolean(m.disabledItem);
            return (
              <DropdownPanelItem
                key={m.key}
                selected={active}
                className={cn('gap-2 pr-2', itemDisabled && 'cursor-not-allowed opacity-35')}
                onClick={() => {
                  if (itemDisabled) return;
                  onInteractionModeChange(m.key);
                  onModeMenuOpenChange(false);
                }}
              >
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center',
                    active ? 'text-[var(--ink)]' : 'text-[var(--ink)]/75'
                  )}
                >
                  {m.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{m.label}</span>
                {active ? (
                  <HiCheck
                    className="h-3.5 w-3.5 shrink-0 text-[var(--ink)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
              </DropdownPanelItem>
            );
          })}
        </DropdownPanel>
      )}
    >
      <button
        type="button"
        title={interactionModeTooltip(interactionMode, t)}
        aria-label={interactionModeLabel(interactionMode, t)}
        disabled={disabled}
        className={cn(TOOL_ICON_BTN, modeMenuOpen && TOOL_ICON_BTN_ACTIVE)}
      >
        {interactionModeIcon(interactionMode)}
      </button>
    </Dropdown>
  );
}

function buildAttachPlusButton(opts: {
  isImageMode: boolean;
  disabled?: boolean;
  sending?: boolean;
  onAttachFiles?: (files: File[], opts?: { mention?: boolean }) => void;
  attachTooltip?: string;
  t: (key: string) => string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      disabled={opts.disabled || opts.sending || !opts.onAttachFiles}
      title={opts.attachTooltip || opts.t('agent.uploadImage')}
      aria-label={opts.t('agent.uploadAttach')}
      onClick={opts.onClick}
      className={
        opts.isImageMode
          ? cn(
              COMPOSER_ATTACHMENT_CHIP_CLASS,
              'inline-flex items-center justify-center border border-dashed border-[var(--line)]',
              'bg-[var(--surface)] text-[var(--muted)] transition',
              'hover:border-[var(--ink)]/30 hover:text-[var(--ink)] disabled:opacity-40'
            )
          : TOOL_ICON_BTN
      }
    >
      <HiOutlinePlus className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

function buildPickFromCanvasButton(opts: {
  isImageMode: boolean;
  disabled?: boolean;
  sending?: boolean;
  active?: boolean;
  tooltip: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      disabled={opts.disabled || opts.sending}
      title={opts.tooltip}
      aria-label={opts.tooltip}
      aria-pressed={opts.active || false}
      onClick={opts.onClick}
      className={
        opts.isImageMode
          ? cn(
              COMPOSER_ATTACHMENT_CHIP_CLASS,
              'inline-flex items-center justify-center border border-dashed border-[var(--line)]',
              'bg-[var(--surface)] text-[var(--muted)] transition',
              'hover:border-[var(--ink)]/30 hover:text-[var(--ink)] disabled:opacity-40',
              opts.active && 'border-[var(--ink)]/40 text-[var(--ink)]'
            )
          : cn(TOOL_ICON_BTN, opts.active && TOOL_ICON_BTN_ACTIVE)
      }
    >
      <HiOutlineViewfinderCircle className="h-4 w-4" strokeWidth={2} />
    </button>
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
  onPickFromCanvas,
  pickingFromCanvas = false,
  pickFromCanvasTooltip,
  showDesignSizePicker = true,
  imageAspectRatio,
  onImageAspectRatioChange,
  onDesignSceneChange,
  designSceneCategory,
  aspectMenuPlacement = 'bottom-start',
  interactionMode,
  onInteractionModeChange,
  allowedInteractionModes,
  imageModeControls = null,
  modelButtonProps,
  className,
  submitLabel,
}: Props): ReactNode {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [imageSettingsOpen, setImageSettingsOpen] = useState(false);
  const allowedModes =
    allowedInteractionModes && allowedInteractionModes.length
      ? allowedInteractionModes
      : (['agent', 'ask', 'image'] as ComposerInteractionMode[]);

  const attachments = contexts.filter((c) => c.kind === 'attachment');
  const inlineContexts = contexts.filter((c) => c.kind !== 'attachment');
  const isImageMode = interactionMode === 'image' && Boolean(imageModeControls);
  // Top attach strip (image mode always, or agent/ask after upload) must not steal typing height.
  const hasTopAttachRow = isImageMode || attachments.length > 0;
  const inputMinClass = hasTopAttachRow ? 'min-h-[72px]' : 'min-h-[26px]';
  const showAspectBtn =
    !isImageMode &&
    showDesignSizePicker &&
    typeof imageAspectRatio === 'string' &&
    typeof onImageAspectRatioChange === 'function';

  const imageSettingsSummary = imageModeControls
    ? `${imageModeControls.resolution} · ${
        String(imageModeControls.aspectRatio).trim() === 'smart'
          ? t('agent.ratioSmart')
          : imageModeControls.aspectRatio
      } · ${t('agent.genCountN', { count: imageModeControls.imageCount })}`
    : '';

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

  useEffect(() => {
    if (allowedModes.length <= 1) setModeMenuOpen(false);
  }, [allowedModes]);

  const removeAttachment = (key: string) => {
    onContextsChange(contexts.filter((c) => c.key !== key));
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) onAttachFiles?.(files);
  };

  const onPasteImages = (files: File[]) => {
    if (!files.length || !onAttachFiles) return;
    onAttachFiles(files, { mention: true });
  };

  const aspectLabel = t('agent.designCanvasSize', {
    size: formatCanvasSizeChipLabel(imageAspectRatio, t),
  });

  const attachPlusBtn = buildAttachPlusButton({
    isImageMode,
    disabled,
    sending,
    onAttachFiles,
    attachTooltip,
    t,
    onClick: () => fileInputRef.current?.click(),
  });

  const pickCanvasTooltip =
    pickFromCanvasTooltip || t('agent.pickFromCanvas');
  const pickFromCanvasBtn = onPickFromCanvas
    ? buildPickFromCanvasButton({
        isImageMode,
        disabled,
        sending,
        active: pickingFromCanvas,
        tooltip: pickCanvasTooltip,
        onClick: onPickFromCanvas,
      })
    : null;

  return (
    <div
      className={cn(
        'flex flex-col px-3.5 pb-2 pt-2',
        className,
        // Keep typing room when a top attach row is present (after className so callers can't shrink it).
        hasTopAttachRow && 'min-h-[180px]'
      )}
    >
      {isImageMode ? (
        // Same top attach row as the canvas Image Generator card.
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 pb-0.5">
          {attachments.map((a) => (
            <ComposerAttachmentChip
              key={a.key}
              attachment={a}
              disabled={disabled || sending}
              onRemove={removeAttachment}
            />
          ))}
          {attachPlusBtn}
          {pickFromCanvasBtn ? (
            <Tooltip title={pickCanvasTooltip} placement="top">
              {pickFromCanvasBtn}
            </Tooltip>
          ) : null}
        </div>
      ) : (
        <AttachmentStrip
          attachments={attachments}
          disabled={disabled}
          onRemove={removeAttachment}
        />
      )}
      <div
        className={cn('flex flex-1 cursor-text items-start', inputMinClass, 'max-h-[140px] overflow-hidden')}
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
          placeholder={placeholder}
          onPasteImages={onAttachFiles ? onPasteImages : undefined}
          className={hasTopAttachRow ? 'min-h-[72px]' : undefined}
        />
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {leadingActions}

        {interactionMode && onInteractionModeChange ? (
          <ComposerInteractionModePicker
            interactionMode={interactionMode}
            disabled={disabled}
            modeMenuOpen={modeMenuOpen}
            onModeMenuOpenChange={setModeMenuOpen}
            onInteractionModeChange={onInteractionModeChange}
            allowedModes={allowedModes}
            t={t}
          />
        ) : null}

        {isImageMode && imageModeControls ? (
          <Dropdown
            trigger="click"
            placement="top-start"
            strategy="fixed"
            offset={8}
            open={imageSettingsOpen}
            onOpenChange={setImageSettingsOpen}
            items={[]}
            floatingClassName="z-[90]"
            referenceClassName="inline-flex min-w-0"
            popupRender={() => (
              <DropdownPanel
                className="w-[min(26rem,calc(100vw-2rem))] p-3"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <p className="mb-2.5 text-[13px] font-semibold text-[var(--ink)]">
                  {t('editor.tools.imageSettings')}
                </p>
                <ImageAspectRatioPicker
                  variant="image"
                  resolution={imageModeControls.resolution}
                  aspectRatio={imageModeControls.aspectRatio}
                  imageCount={imageModeControls.imageCount}
                  imageLimits={imageModeControls.imageLimits}
                  onResolutionChange={imageModeControls.onResolutionChange}
                  onAspectRatioChange={imageModeControls.onAspectRatioChange}
                  onImageCountChange={imageModeControls.onImageCountChange}
                  disabled={disabled || sending}
                />
              </DropdownPanel>
            )}
          >
            <button
              type="button"
              disabled={disabled || sending}
              title={imageSettingsSummary}
              aria-label={t('editor.tools.imageSettings')}
              aria-expanded={imageSettingsOpen}
              className={cn(
                'inline-flex h-7 max-w-[min(100%,12rem)] shrink-0 items-center gap-1 truncate rounded-xl px-2 text-[12px] font-medium tabular-nums transition-colors disabled:opacity-40',
                imageSettingsOpen
                  ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                  : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]'
              )}
            >
              <span className="truncate">{imageSettingsSummary}</span>
            </button>
          </Dropdown>
        ) : null}

        {!isImageMode && modelButtonProps.panel != null && modelButtonProps.onOpenChange ? (
          <Tooltip
            title={modelButtonProps.title}
            placement="top"
            disabled={modelButtonProps.open}
          >
            <Dropdown
              trigger="click"
              placement={modelButtonProps.panelPlacement ?? 'top-start'}
              strategy="fixed"
              offset={8}
              open={modelButtonProps.open}
              onOpenChange={modelButtonProps.onOpenChange}
              items={[]}
              nestedDismissGuard="[data-agent-route-submenu], .agent-route-submenu-popup"
              floatingClassName="z-[80]"
              referenceClassName="inline-flex"
              popupRender={() => (
                <div onPointerDown={(e) => e.stopPropagation()}>{modelButtonProps.panel}</div>
              )}
            >
              <button
                type="button"
                aria-label={t('agent.selectModel')}
                aria-expanded={modelButtonProps.open}
                className={cn(TOOL_ICON_BTN, modelButtonProps.open && TOOL_ICON_BTN_ACTIVE)}
              >
                {modelButtonProps.icon ?? (
                  <Icon name="editor-model-cube" width={16} height={16} />
                )}
              </button>
            </Dropdown>
          </Tooltip>
        ) : !isImageMode ? (
          <Tooltip title={modelButtonProps.title} placement="top" disabled={modelButtonProps.open}>
            <button
              type="button"
              ref={modelButtonProps.ref}
              aria-label={t('agent.selectModel')}
              aria-expanded={modelButtonProps.open}
              className={cn(TOOL_ICON_BTN, modelButtonProps.open && TOOL_ICON_BTN_ACTIVE)}
              {...(modelButtonProps.getReferenceProps?.({
                onClick: modelButtonProps.onClick,
              }) ?? { onClick: modelButtonProps.onClick })}
            >
              {modelButtonProps.icon ?? (
                <Icon name="editor-model-cube" width={16} height={16} />
              )}
            </button>
          </Tooltip>
        ) : null}

        {showAspectBtn ? (
          <Tooltip title={aspectLabel} placement="top" disabled={aspectOpen}>
            <button
              type="button"
              ref={aspectFloating.refs.setReference}
              aria-label={t('agent.designCanvasSizeAria', {
                defaultValue: t('agent.imageSettingsAria'),
              })}
              aria-expanded={aspectOpen}
              aria-haspopup="dialog"
              disabled={disabled}
              className={cn(
                'inline-flex h-7 max-w-[9.5rem] shrink-0 items-center rounded-xl px-2 text-[12px] font-medium tabular-nums text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40',
                aspectOpen && TOOL_ICON_BTN_ACTIVE
              )}
              {...aspectIx.getReferenceProps()}
            >
              <span className="truncate">
                {formatCanvasSizeChipLabel(imageAspectRatio, t)}
              </span>
            </button>
          </Tooltip>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          {!isImageMode ? (
            <>
              <Tooltip title={attachTooltip || t('agent.uploadImage')} placement="top">
                {attachPlusBtn}
              </Tooltip>
              {pickFromCanvasBtn ? (
                <Tooltip title={pickCanvasTooltip} placement="top">
                  {pickFromCanvasBtn}
                </Tooltip>
              ) : null}
            </>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
          {isImageMode && imageModeControls ? (
            <>
              <Dropdown
                trigger="click"
                placement="top-end"
                strategy="fixed"
                offset={8}
                open={imageModeControls.modelOpen}
                onOpenChange={imageModeControls.onModelOpenChange}
                items={[]}
                floatingClassName="z-[90]"
                referenceClassName="inline-flex"
                popupRender={() => (
                  <div onPointerDown={(e) => e.stopPropagation()}>
                    {imageModeControls.modelPanel}
                  </div>
                )}
              >
                <button
                  type="button"
                  disabled={disabled || sending}
                  title={imageModeControls.modelLabel}
                  aria-label={imageModeControls.modelLabel}
                  className={cn(TOOL_ICON_BTN, 'disabled:opacity-40')}
                >
                  {imageModeControls.modelIcon}
                </button>
              </Dropdown>
              {sending ? (
                <button
                  type="button"
                  aria-label={t('agent.stop')}
                  title={t('agent.stop')}
                  onClick={() => onStop?.()}
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--ink)] px-2.5 text-[11px] font-semibold text-[var(--on-brand)]"
                >
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-current" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={t('agent.send')}
                  disabled={!canSend}
                  onClick={onSubmit}
                  title={t('wallet.creditCostTip', {
                    count: imageModeControls.creditCost,
                  })}
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--ink)] px-2.5 text-[11px] font-semibold text-[var(--on-brand)] transition disabled:opacity-40"
                >
                  <HiOutlineBolt className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="tabular-nums">{imageModeControls.creditCost}</span>
                </button>
              )}
            </>
          ) : sending ? (
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
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)] transition-opacity disabled:opacity-35"
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
            className="z-[80] w-max max-w-[calc(100vw-24px)]"
            {...aspectIx.getFloatingProps({
              onPointerDown: (e) => e.stopPropagation(),
            })}
          >
            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-0 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
              <ImageAspectRatioPicker
                variant="design"
                aspectRatio={imageAspectRatio!}
                onAspectRatioChange={(ratio, opts) => {
                  onImageAspectRatioChange?.(ratio);
                  if (!opts?.keepOpen) setAspectOpen(false);
                }}
                onDesignSceneChange={onDesignSceneChange}
                designSceneCategory={designSceneCategory}
                disabled={disabled}
              />
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
