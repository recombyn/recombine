import { forwardRef, useRef, type ReactNode, type Ref } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUturnLeft,
  HiOutlineCheckCircle,
  HiOutlineChevronRight,
  HiOutlineComputerDesktop,
  HiOutlineQuestionMarkCircle,
} from 'react-icons/hi2';
import { ChatMarkdown } from '@/components/editor/panels/ChatMarkdown';
import { ContextChipPill } from '@/components/editor/panels/AgentComposerInput';
import { Image } from '@/components/base/image';
import {
  VirtualList,
  type VirtualListHandle,
} from '@/components/base/VirtualList';
import { cn } from '@/utils/classnames';
import { setChatImageDragData } from '@/utils/chatImageDrag';
import { imageSrcToFile } from '@/utils/uploadImage';

export type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** @ chips shown like the composer (label + kind + optional thumb). */
  contexts?: Array<{
    key: string;
    label: string;
    kind: string;
    thumbUrl?: string;
  }>;
  /** `content` with U+FFFC where each context chip sat (inline layout in the bubble). */
  contentMarked?: string;
  /** Design deep-think / reasoner stream — shown inside the foldable gray process. */
  thinking?: string;
  /** Intent analysis — shown inside the foldable gray process, not as final reply. */
  intent?: string;
  streaming?: boolean;
  /** Cursor-like tool execution steps. */
  steps?: Array<{
    id: string;
    name: string;
    status: 'running' | 'done' | 'error' | 'pending';
    kind?: 'thought' | 'explored' | 'tool' | 'added' | 'updated' | 'skipped' | 'deleted';
    /** Timeline tone: confirm / success / info (all plain text rows). */
    variant?: 'confirm' | 'success' | 'info';
    summary?: string;
    /** Nested lines under Explored. */
    items?: Array<{ id: string; name: string; summary?: string }>;
    /** Expandable markdown body (diagrams / long notes). */
    body?: string;
  }>;
  /** Seedream / Image-mode results shown as a gallery (not SVG). */
  images?: string[];
  /** While image-gen is running: expected card count for shimmer placeholders. */
  imagePendingCount?: number;
  /** Image-gen aspect (e.g. 9:16) — sizes shimmer / gallery cards. */
  imageAspectRatio?: string;
  /** Image-gen model id — brand icon in the worked-for row. */
  imageModelId?: string;
  /** Image-gen model display name shown before "Worked for …". */
  imageModelLabel?: string;
  /** Canvas was mutated by the reply to this user turn; restore available while editing (in-memory). */
  canRestore?: boolean;
  /** Epoch ms when this assistant turn started streaming. */
  startedAt?: number;
  /** Wall time for completed turn (ms). */
  durationMs?: number;
  /** Quick-reply chips from ask_user (e.g. create canvas). */
  choices?: string[];
  /** Ask mode: proposed tool_ops waiting for an option with action=apply. */
  proposedOps?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
  /** Ask mode: label of the apply option (compat). */
  applyChoice?: string;
  /** Ask interaction UI — mode + options; text = freeform reply. */
  choiceUi?: {
    mode: 'confirm' | 'single' | 'multi' | 'buttons' | 'text';
    options: Array<{ label: string; action: 'apply' | 'reply' | 'dismiss' }>;
    placeholder?: string;
  };
  /** Live-draw pipeline progress — kept for training UI; not shown in normal chat. */
  pipeline?: {
    category: string;
    labels: string[];
    currentIndex: number;
    stepConfirm: boolean;
    collabMode?: 'collaborative' | 'milestone' | 'auto';
  };
  /** True while canvas nodes are being added one-by-one. */
  drawing?: boolean;
};

export type ChatTurn = {
  user: ChatUiMessage | null;
  assistant?: ChatUiMessage;
};

type Props = {
  turns: ChatTurn[];
  editingUserId: string | null;
  editComposer?: ReactNode;
  sending: boolean;
  formatWorked: (assistant?: ChatUiMessage) => string | null;
  hasCheckpoint: (userId: string) => boolean;
  onBeginEdit: (m: ChatUiMessage) => void;
  onCancelEdit: () => void;
  onRestore: (userId: string) => void;
  onChoice?: (choice: AskChoicePick) => void;
  className?: string;
};

export type AskChoicePick = {
  label: string;
  action: 'apply' | 'reply' | 'dismiss';
  /** multi mode: all selected labels when submitting. */
  selectedLabels?: string[];
};

function hasFoldableProcess(assistant: ChatUiMessage): boolean {
  return Boolean(assistant.steps?.length);
}

/** Gallery / shimmer cards — wide enough for hover CTA; scroll when many. */
function cardBoxFromAspect(raw?: string): { width: number; height: number } {
  const TARGET_W = 168;
  let rw = 1;
  let rh = 1;
  const s = String(raw || '1:1').trim();
  if (s === 'smart' || s.toLowerCase() === 'auto') {
    /* keep 1:1 */
  } else {
    const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i.exec(s);
    if (m) {
      rw = Math.max(0.01, Number(m[1]));
      rh = Math.max(0.01, Number(m[2]));
    }
  }
  const width = TARGET_W;
  const height = Math.max(96, Math.min(280, Math.round((width * rh) / rw)));
  return { width, height };
}

/** User bubble: attachment thumbs above text (composer strip / 图2); @ chips inline. */
function UserMessageBody({
  content,
  contentMarked,
  contexts,
}: {
  content: string;
  contentMarked?: string;
  contexts?: ChatUiMessage['contexts'];
}): ReactNode {
  const chips = contexts || [];
  const attachments = chips.filter((c) => c.kind === 'attachment');
  const inline = chips.filter((c) => c.kind !== 'attachment');

  const attachmentStrip =
    attachments.length > 0 ? (
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {attachments.map((a) => {
          const src = String(a.thumbUrl || '').trim();
          return (
            <div
              key={a.key}
              title={a.label}
              className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--canvas)]"
            >
              {src ? (
                <img src={src} alt={a.label} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-0.5 text-center text-[8px] leading-tight text-[var(--muted)]">
                  {a.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  if (!inline.length) {
    return (
      <>
        {attachmentStrip}
        {content || (attachments.length ? '' : '...')}
      </>
    );
  }

  const marked =
    contentMarked && contentMarked.includes('\uFFFC')
      ? contentMarked
      : `${'\uFFFC'.repeat(inline.length)}${content || ''}`;

  const parts = marked.split('\uFFFC');
  const nodes: ReactNode[] = [];
  let chipIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part) nodes.push(<span key={`t-${i}`}>{part}</span>);
    if (i < parts.length - 1) {
      const c = inline[chipIdx++];
      if (c) {
        nodes.push(
          <ContextChipPill
            key={`${c.key}-${chipIdx}`}
            label={c.label}
            thumbUrl={c.thumbUrl}
            className="mx-0.5"
          />
        );
      }
    }
  }
  while (chipIdx < inline.length) {
    const c = inline[chipIdx++];
    if (!c) break;
    nodes.push(
      <ContextChipPill
        key={`${c.key}-${chipIdx}`}
        label={c.label}
        thumbUrl={c.thumbUrl}
        className="mx-0.5"
      />
    );
  }
  return (
    <>
      {attachmentStrip}
      {nodes.length ? nodes : content || '...'}
    </>
  );
}

function stepVariant(
  step: NonNullable<ChatUiMessage['steps']>[number]
): 'confirm' | 'success' | 'info' {
  if (step.variant === 'success' || step.variant === 'confirm' || step.variant === 'info') {
    return step.variant;
  }
  const kind = step.kind || '';
  if (kind === 'added' || kind === 'updated' || kind === 'deleted') return 'success';
  if (kind === 'thought' || kind === 'explored' || kind === 'tool' || kind === 'skipped') {
    return 'confirm';
  }
  return 'info';
}

function AssistantProcessBody({
  assistant,
}: {
  assistant: ChatUiMessage;
}): ReactNode {
  const raw = assistant.steps || [];
  const seen = new Set<string>();
  const steps = raw.filter((s) => {
    const id = String(s.id || '');
    if (!id || seen.has(id)) return false;
    // Drop the streaming seed row once real thought/process steps exist.
    if (
      s.id === 'thought-0' &&
      raw.some((x) => x.id !== 'thought-0' && (x.kind === 'thought' || x.kind === 'explored' || x.kind === 'tool' || x.kind === 'added' || x.kind === 'updated'))
    ) {
      return false;
    }
    seen.add(id);
    return true;
  });
  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      {steps.map((step, i) => (
        <ProcessStepRow key={`${step.id}-${i}`} step={step} />
      ))}
    </div>
  );
}

function ProcessStepRow({
  step,
}: {
  step: NonNullable<ChatUiMessage['steps']>[number];
}): ReactNode {
  const { t } = useTranslation();
  const variant = stepVariant(step);
  const expandable = Boolean(
    (step.items && step.items.length) ||
      step.body?.trim() ||
      (step.summary?.trim() && step.summary.trim() !== step.name.trim())
  );
  const [open, setOpen] = useState(
    () => step.status === 'running' || Boolean(step.body?.trim())
  );

  useEffect(() => {
    if (step.status === 'running') setOpen(true);
  }, [step.status, step.id]);

  const label = (
    <>
      {step.name}
      {step.status === 'running' && !/[.…]$/.test(step.name.trim()) ? '…' : ''}
    </>
  );

  const chevron = expandable ? (
    <HiOutlineChevronRight
      className={cn(
        'h-3.5 w-3.5 shrink-0 opacity-45 transition-transform',
        open && 'rotate-90'
      )}
      aria-hidden
    />
  ) : null;

  const detail =
    open && expandable ? (
      <div className="flex w-full flex-col gap-1 text-[12px] leading-relaxed text-[var(--muted)]">
        {(step.items || []).map((it) => (
          <div key={it.id} className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1.5">
              <HiOutlineCheckCircle
                className="h-3 w-3 shrink-0 text-[var(--success,#22a06b)] opacity-80"
                aria-hidden
              />
              {it.name}
            </span>
            {it.summary?.trim() ? (
              <span className="whitespace-pre-wrap text-[11px] leading-snug opacity-80">
                {it.summary}
              </span>
            ) : null}
          </div>
        ))}
        {step.summary?.trim() && step.summary.trim() !== step.name.trim() ? (
          <span className="w-full whitespace-pre-wrap leading-snug">{step.summary}</span>
        ) : null}
        {step.body?.trim() ? (
          <div className="w-full text-[12px] leading-relaxed text-[var(--ink)]/80">
            <ChatMarkdown content={step.body} />
          </div>
        ) : null}
      </div>
    ) : null;

  const rowClass = cn(
    'flex w-full items-center gap-1.5 text-left text-[12px] leading-none text-[var(--muted)] transition-colors',
    step.status === 'error' && 'text-[var(--ink)]',
    (step.status === 'done' || variant === 'success') && 'text-[var(--ink)]/70'
  );

  const leadingIcon =
    step.status === 'error' ? (
      <HiOutlineQuestionMarkCircle
        className="h-3.5 w-3.5 shrink-0 text-[var(--danger,#c45)]"
        aria-hidden
      />
    ) : step.status === 'done' || variant === 'success' ? (
      <HiOutlineCheckCircle
        className="h-3.5 w-3.5 shrink-0 text-[var(--success,#22a06b)]"
        aria-hidden
      />
    ) : (
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--ink)]/35"
        aria-hidden
      />
    );

  if (!expandable) {
    return (
      <span className={rowClass}>
        {leadingIcon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </span>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-1.5">
      <button
        type="button"
        className={cn(rowClass, 'hover:text-[var(--ink)]')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? t('agent.collapseProcess') : t('agent.expandProcess')}
      >
        {leadingIcon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {chevron}
      </button>
      {detail}
    </div>
  );
}

function AssistantTurn({
  assistant,
  onChoice,
  sending,
}: {
  assistant: ChatUiMessage;
  worked?: string | null;
  onChoice?: (choice: AskChoicePick) => void;
  sending: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const foldable = hasFoldableProcess(assistant);
  const streaming = Boolean(assistant.streaming);

  const showImageGallery =
    Boolean(assistant.images?.length) ||
    (Number(assistant.imagePendingCount) || 0) > 0;
  const doneMilestone =
    !streaming && (foldable || showImageGallery) && Boolean(assistant.content || showImageGallery);

  const showAskChoices =
    !streaming &&
    onChoice &&
    Boolean(
      (assistant.choiceUi?.mode !== 'text' && assistant.choiceUi?.options?.length) ||
        (assistant.choiceUi?.mode === 'text' &&
          assistant.choiceUi.options?.some(
            (o) => o.action === 'apply' || o.action === 'dismiss'
          )) ||
        assistant.choices?.length ||
        assistant.applyChoice ||
        assistant.proposedOps?.length
    );

  return (
    <div
      data-assistant-id={assistant.id}
      className="flex w-full min-w-0 flex-col items-stretch gap-2.5 px-0.5"
    >
      <div className="flex w-full items-center gap-1.5 text-[12px] leading-none text-[var(--ink)]/70">
        <HiOutlineQuestionMarkCircle className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {streaming && !assistant.content?.trim()
            ? t('agent.working')
            : t('agent.replied', { defaultValue: '已回复' })}
        </span>
      </div>

      {/* Process first, then reply — matching product timeline order. */}
      {foldable ? <AssistantProcessBody assistant={assistant} /> : null}

      {showImageGallery ? (
        <ImageGenGallery assistant={assistant} sending={sending} />
      ) : null}

      {assistant.content ? (
        <div className="w-full min-w-0 overflow-x-hidden text-[13px] leading-[1.7] text-[var(--ink)] [&_.chat-md_p:first-child]:font-semibold">
          <ChatMarkdown content={assistant.content} />
          {streaming ? (
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
          ) : null}
        </div>
      ) : streaming && !foldable && !showImageGallery ? (
        <div className="w-full text-[12px] text-[var(--muted)]">
          {t('agent.working')}
          <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
        </div>
      ) : null}

      {doneMilestone ? (
        <div className="flex w-full items-center gap-1.5 text-[12px] text-[var(--muted)]">
          <HiOutlineComputerDesktop className="h-3.5 w-3.5 opacity-70" aria-hidden />
          <span>
            {t('agent.taskCompleteNamed', {
              name: t('app.name', { defaultValue: 'Recombyn' }),
              defaultValue: '{{name}} 已完成任务',
            })}
          </span>
        </div>
      ) : null}

      {showAskChoices && onChoice ? (
        <AskChoicePanel assistant={assistant} onChoice={onChoice} sending={sending} />
      ) : null}
    </div>
  );
}

function ChatResultImageCard({
  src,
  box,
}: {
  src: string;
  box: { width: number; height: number };
}): ReactNode {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const draggedRef = useRef(false);

  const download = async () => {
    try {
      const file = await imageSrcToFile(src, 'image.png');
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name || 'image.png';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="group relative shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--canvas)]"
      style={{ width: box.width, height: box.height }}
    >
      <img
        src={src}
        alt=""
        draggable
        loading="lazy"
        className="block h-full w-full cursor-grab object-cover active:cursor-grabbing"
        onDragStart={(e) => {
          draggedRef.current = true;
          setChatImageDragData(e.dataTransfer, src);
        }}
        onDragEnd={() => {
          // Click often follows a completed drag — ignore the next click once.
          window.setTimeout(() => {
            draggedRef.current = false;
          }, 0);
        }}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          setPreviewOpen(true);
        }}
      />
      <button
        type="button"
        aria-label={t('agent.downloadImage', { defaultValue: '下载图片' })}
        title={t('agent.downloadImage', { defaultValue: '下载图片' })}
        className="absolute bottom-1.5 right-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white shadow-sm backdrop-blur-[2px] transition-colors hover:bg-black/70"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void download();
        }}
      >
        <HiOutlineArrowDownTray className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      <Image
        src={src}
        alt=""
        lazy={false}
        preview={{ open: previewOpen, onOpenChange: setPreviewOpen, previewOnClick: false }}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        imgClassName="!hidden"
      />
    </div>
  );
}

function ImageGenGallery({
  assistant,
}: {
  assistant: ChatUiMessage;
  sending?: boolean;
}): ReactNode {
  const images = assistant.images || [];
  const pending = Math.max(0, Number(assistant.imagePendingCount) || 0);
  const slots = Math.max(images.length, pending);
  if (slots <= 0) return null;
  const box = cardBoxFromAspect(assistant.imageAspectRatio);

  return (
    <div className="mt-1 flex max-w-full gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]">
      {Array.from({ length: slots }, (_, i) => {
        const src = images[i];
        if (src) {
          return (
            <ChatResultImageCard
              key={`${assistant.id}-img-${i}`}
              src={src}
              box={box}
            />
          );
        }
        return (
          <div
            key={`${assistant.id}-shimmer-${i}`}
            className="chat-image-gen-shimmer shrink-0 rounded-lg border border-[var(--line)]"
            style={{ width: box.width, height: box.height }}
            aria-hidden
          />
        );
      })}
    </div>
  );
}

function resolveAskChoiceUi(assistant: ChatUiMessage): ChatUiMessage['choiceUi'] | null {
  if (assistant.choiceUi?.mode === 'text') {
    // Free-text answers use the bottom composer — only keep chip actions if any.
    const opts = (assistant.choiceUi.options || []).filter(
      (o) => o.action === 'apply' || o.action === 'dismiss'
    );
    if (!opts.length) return null;
    return { mode: 'buttons', options: opts };
  }
  if (assistant.choiceUi?.options?.length) return assistant.choiceUi;
  const labels = (assistant.choices || []).map((c) => String(c).trim()).filter(Boolean);
  const apply = String(assistant.applyChoice || '').trim();
  if (!labels.length && !apply && !assistant.proposedOps?.length) return null;
  const options: NonNullable<ChatUiMessage['choiceUi']>['options'] = [];
  if (apply) options.push({ label: apply, action: 'apply' });
  for (const label of labels) {
    if (label === apply) continue;
    options.push({ label, action: 'reply' });
  }
  if (assistant.proposedOps?.length && !options.some((o) => o.action === 'apply')) {
    options.unshift({ label: '', action: 'apply' });
  }
  if (!options.length) return null;
  const mode =
    options.every((o) => o.action === 'apply' || o.action === 'dismiss')
      ? 'confirm'
      : 'buttons';
  return { mode, options };
}

function AskChoicePanel({
  assistant,
  onChoice,
  sending,
}: {
  assistant: ChatUiMessage;
  onChoice: (choice: AskChoicePick) => void;
  sending: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const ui = resolveAskChoiceUi(assistant);
  const [picked, setPicked] = useState<string[]>([]);
  if (!ui?.options.length) return null;

  const optionLabel = (opt: { label: string; action: string }) => {
    if (opt.label) return opt.label;
    if (opt.action === 'apply') return t('common.confirm');
    if (opt.action === 'dismiss') return t('common.cancel');
    return opt.label;
  };

  const chipClass =
    'inline-flex h-8 max-w-full items-center rounded-full border border-[var(--line)] bg-[var(--canvas)] px-3 text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-40';

  if (ui.mode === 'multi') {
    const replyOpts = ui.options.filter((o) => o.action === 'reply');
    const applyOpt = ui.options.find((o) => o.action === 'apply');
    const dismissOpt = ui.options.find((o) => o.action === 'dismiss');
    return (
      <div className="mt-1 flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {replyOpts.map((opt) => {
            const label = optionLabel(opt);
            const on = picked.includes(label);
            return (
              <button
                key={`m-${label}`}
                type="button"
                disabled={sending}
                className={cn(chipClass, on && 'border-[var(--ink)] bg-[var(--line)]')}
                onClick={() =>
                  setPicked((prev) =>
                    on ? prev.filter((x) => x !== label) : [...prev, label]
                  )
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {applyOpt ? (
            <button
              type="button"
              disabled={sending}
              className={chipClass}
              onClick={() =>
                onChoice({
                  label: optionLabel(applyOpt),
                  action: 'apply',
                  selectedLabels: picked,
                })
              }
            >
              {optionLabel(applyOpt)}
            </button>
          ) : (
            <button
              type="button"
              disabled={sending || picked.length === 0}
              className={chipClass}
              onClick={() =>
                onChoice({
                  label: picked.join('、'),
                  action: 'reply',
                  selectedLabels: picked,
                })
              }
            >
              {t('common.confirm')}
            </button>
          )}
          {dismissOpt ? (
            <button
              type="button"
              disabled={sending}
              className={chipClass}
              onClick={() =>
                onChoice({ label: optionLabel(dismissOpt), action: 'dismiss' })
              }
            >
              {optionLabel(dismissOpt)}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1.5">
      {ui.options.map((opt, i) => {
        const label = optionLabel(opt);
        return (
          <button
            key={`${opt.action}-${label}-${i}`}
            type="button"
            disabled={sending}
            className={chipClass}
            onClick={() => onChoice({ label, action: opt.action })}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const ChatTurnList = forwardRef(function ChatTurnList(
  {
    turns,
    editingUserId,
    editComposer,
    sending,
    formatWorked: _formatWorked,
    hasCheckpoint,
    onBeginEdit,
    onCancelEdit,
    onRestore,
    onChoice,
    className,
  }: Props,
  ref: Ref<VirtualListHandle>
): ReactNode {
  const { t } = useTranslation();

  return (
    <VirtualList
      ref={ref}
      items={turns}
      estimateSize={180}
      overscan={4}
      gap={20}
      getItemKey={(turn) => turn.user?.id || turn.assistant?.id || 'turn'}
      className={cn('px-4 py-2', className)}
      contentClassName="py-2"
      empty={
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="text-center text-[14px] text-[var(--muted)]">
            {t('agent.emptyHint', {
              defaultValue: '描述你想要的设计，或上传参考图开始',
            })}
          </p>
        </div>
      }
    >
      {({ user: m, assistant }) => {
        const isEditing = Boolean(m && editingUserId === m.id);
        const canRestore = Boolean(m && hasCheckpoint(m.id));
        return (
          <div className="flex w-full min-w-0 flex-col gap-3">
            {m ? (
              isEditing ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--canvas)] shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
                    {editComposer}
                  </div>
                  <div className="flex items-center gap-1 px-0.5">
                    {canRestore ? (
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                        onClick={() => onRestore(m.id)}
                      >
                        <HiOutlineArrowUturnLeft className="h-3.5 w-3.5" />
                        {t('agent.restore')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-7 items-center rounded-full px-2.5 text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                      onClick={onCancelEdit}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group relative w-full min-w-0">
                  <div
                    onClick={!sending ? () => onBeginEdit(m) : undefined}
                    className={cn(
                      'w-full rounded-[22px] bg-[var(--canvas)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--ink)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
                      !sending ? 'cursor-pointer' : '',
                      canRestore && !sending ? 'pr-10' : ''
                    )}
                    title={t('agent.clickToEdit')}
                  >
                    <UserMessageBody
                      content={m.content}
                      contentMarked={m.contentMarked}
                      contexts={m.contexts}
                    />
                  </div>
                  {canRestore ? (
                    <button
                      type="button"
                      aria-label={t('agent.restoreCheckpoint')}
                      title={t('agent.restoreCheckpoint')}
                      disabled={sending}
                      className={cn(
                        'absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-opacity hover:bg-[var(--canvas)] hover:text-[var(--ink)]',
                        sending
                          ? 'pointer-events-none opacity-0'
                          : 'opacity-0 group-hover:opacity-100'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const id = m.id;
                        window.setTimeout(() => onRestore(id), 0);
                      }}
                    >
                      <HiOutlineArrowUturnLeft className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              )
            ) : null}

            {assistant && !isEditing ? (
              <AssistantTurn
                assistant={assistant}
                onChoice={onChoice}
                sending={sending}
              />
            ) : null}
          </div>
        );
      }}
    </VirtualList>
  );
});

export default ChatTurnList;
