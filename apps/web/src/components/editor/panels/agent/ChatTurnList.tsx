import { forwardRef, useRef, type ReactNode, type Ref } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUturnLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi2';
import { ChatMarkdown } from '@/components/editor/panels/ChatMarkdown';
import { ContextChipPill } from '@/components/editor/panels/AgentComposerInput';
import { ModelBrandIcon } from '@/components/editor/panels/agent/ModelPickerPanel';
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
    summary?: string;
    /** Nested lines under Explored (Cursor: Thought briefly / Read file…). */
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
  /** Ask mode: proposed tool_ops waiting for the model-named apply_choice chip. */
  proposedOps?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
  /** Ask mode: which choices[] label applies proposedOps (from model). */
  applyChoice?: string;
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
  onChoice?: (choice: string) => void;
  className?: string;
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

function AssistantProcessBody({
  assistant,
}: {
  assistant: ChatUiMessage;
}): ReactNode {
  // Cursor-style: Thought / Explored (expandable) / Tool call + ops / Added
  const raw = assistant.steps || [];
  // Dedupe by id so React keys stay unique even if state briefly raced.
  const seen = new Set<string>();
  const steps = raw.filter((s) => {
    const id = String(s.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return (
    <div className="mt-1 flex flex-col gap-1.5 border-l border-[var(--line)] pl-2.5 text-[12px] leading-relaxed text-[var(--muted)]">
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
  const expandable =
    step.kind === 'explored' &&
    Boolean((step.items && step.items.length) || step.body?.trim() || step.summary?.trim());
  const [open, setOpen] = useState(
    () => step.status === 'running' || Boolean(step.body?.trim())
  );

  useEffect(() => {
    if (step.status === 'running') setOpen(true);
  }, [step.status, step.id]);

  if (!expandable) {
    return (
      <div className="flex flex-col gap-0.5">
        <span>
          {step.name}
          {step.status === 'running' && !/[.…]$/.test(step.name.trim()) ? '…' : ''}
        </span>
        {step.summary?.trim() ? (
          <span className="whitespace-pre-wrap leading-snug text-[var(--muted)]">
            {step.summary}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="group inline-flex max-w-full items-center gap-0.5 rounded px-0.5 text-left text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          {step.name}
          {step.status === 'running' && !/[.…]$/.test(step.name.trim()) ? '…' : ''}
        </span>
        <HiOutlineChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform',
            open && 'rotate-90'
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="ml-0.5 flex flex-col gap-1 border-l border-[var(--line)] pl-2.5">
          {(step.items || []).map((it) => (
            <div key={it.id} className="flex flex-col gap-0.5">
              <span>{it.name}</span>
              {it.summary?.trim() ? (
                <span className="whitespace-pre-wrap text-[11px] leading-snug opacity-80">
                  {it.summary}
                </span>
              ) : null}
            </div>
          ))}
          {step.summary?.trim() && !(step.items || []).length ? (
            <span className="whitespace-pre-wrap leading-snug">{step.summary}</span>
          ) : null}
          {step.body?.trim() ? (
            <div className="min-w-0 text-[12px] leading-relaxed text-[var(--ink)]">
              <ChatMarkdown content={step.body} />
            </div>
          ) : null}
        </div>
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

function AssistantTurn({
  assistant,
  worked,
  onChoice,
  sending,
}: {
  assistant: ChatUiMessage;
  worked: string | null;
  onChoice?: (choice: string) => void;
  sending: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const foldable = hasFoldableProcess(assistant);
  const streaming = Boolean(assistant.streaming);
  const [processOpen, setProcessOpen] = useState(streaming);

  useEffect(() => {
    setProcessOpen(Boolean(assistant.streaming));
  }, [assistant.streaming, assistant.id]);

  const showProcess = foldable && processOpen;
  const showImageGallery =
    Boolean(assistant.images?.length) ||
    (Number(assistant.imagePendingCount) || 0) > 0;
  const imageModelLabel = String(assistant.imageModelLabel || '').trim();
  const imageModelId = String(assistant.imageModelId || '').trim();
  const showImageModel = Boolean(imageModelLabel || imageModelId);

  const workedMeta = (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12px] font-normal text-[var(--muted)]">
      {showImageModel ? (
        <>
          <ModelBrandIcon
            model={{ id: imageModelId || imageModelLabel, label: imageModelLabel }}
            size={14}
            className="opacity-55"
          />
          <span className="truncate">{imageModelLabel || imageModelId}</span>
        </>
      ) : null}
      {worked ? (
        <span className={cn('shrink-0', showImageModel && 'whitespace-nowrap')}>
          {worked}
        </span>
      ) : null}
    </span>
  );

  return (
    <div
      data-assistant-id={assistant.id}
      className="flex min-w-0 flex-col gap-1.5 px-0.5"
    >
      {worked || showImageModel ? (
        foldable ? (
          <button
            type="button"
            title={processOpen ? t('agent.collapseProcess') : t('agent.expandProcess')}
            className="group inline-flex max-w-full cursor-pointer items-center gap-0.5 rounded px-0.5 text-left text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            onClick={() => setProcessOpen((v) => !v)}
            aria-expanded={processOpen}
          >
            {workedMeta}
            <HiOutlineChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform',
                processOpen && 'rotate-90'
              )}
              aria-hidden
            />
          </button>
        ) : (
          <div className="min-w-0">{workedMeta}</div>
        )
      ) : null}

      {showProcess ? <AssistantProcessBody assistant={assistant} /> : null}

      {showImageGallery ? (
        <ImageGenGallery assistant={assistant} sending={sending} />
      ) : null}

      {assistant.content ? (
        <div className="min-w-0 max-w-full overflow-x-hidden text-[13px] leading-relaxed text-[var(--ink)]">
          <ChatMarkdown content={assistant.content} />
          {streaming && !showProcess && !showImageGallery ? (
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
          ) : null}
        </div>
      ) : streaming && !showProcess && !showImageGallery ? (
        <div className="text-[12px] text-[var(--muted)]">
          {t('agent.working')}
          <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
        </div>
      ) : null}
      {/* Only pending Ask proposals — hide chips after apply or once the turn is stale. */}
      {!streaming &&
      assistant.proposedOps?.length &&
      assistant.choices?.length &&
      onChoice ? (
        <div className="mt-1 flex flex-col items-start gap-1.5">
          {assistant.choices
            .filter((c) => c !== '取消')
            .map((c) => (
              <button
                key={c}
                type="button"
                disabled={sending}
                className="inline-flex h-7 max-w-full items-center rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] px-2.5 text-[11px] text-[var(--ink)] transition-colors hover:bg-[var(--line)] disabled:opacity-40"
                onClick={() => onChoice(c)}
              >
                {c}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

const ChatTurnList = forwardRef(function ChatTurnList(
  {
    turns,
    editingUserId,
    editComposer,
    sending,
    formatWorked,
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
        const worked = formatWorked(assistant);
        const canRestore = Boolean(m && hasCheckpoint(m.id));
        return (
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            {m ? (
              isEditing ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--canvas)] shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                    {editComposer}
                  </div>
                  <div className="flex items-center gap-1 px-0.5">
                    {canRestore ? (
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                        onClick={() => onRestore(m.id)}
                      >
                        <HiOutlineArrowUturnLeft className="h-3.5 w-3.5" />
                        {t('agent.restore')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-7 items-center rounded-lg px-2 text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                      onClick={onCancelEdit}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group relative min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]">
                  <div
                    onClick={!sending ? () => onBeginEdit(m) : undefined}
                    className={cn(
                      'min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-[var(--ink)]',
                      !sending ? 'cursor-pointer' : '',
                      canRestore && !sending ? 'pr-9' : ''
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
                      style={{ top: 4, right: 10 }}
                      className={cn(
                        'absolute z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-opacity hover:bg-[var(--canvas)] hover:text-[var(--ink)]',
                        sending
                          ? 'pointer-events-none opacity-0'
                          : 'opacity-0 group-hover:opacity-100'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Defer unmount past the click event — avoids removeChild NotFoundError.
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
                worked={worked}
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
