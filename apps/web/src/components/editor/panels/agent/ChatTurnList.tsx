import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi2';
import { ChatMarkdown } from '@/components/editor/panels/ChatMarkdown';
import { cn } from '@/utils/classnames';

export type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
    summary?: string;
  }>;
  /** Seedream / Image-mode results shown as a gallery (not SVG). */
  images?: string[];
  /** While image-gen is running: expected card count for shimmer placeholders. */
  imagePendingCount?: number;
  /** Image-gen aspect (e.g. 9:16) — sizes shimmer / gallery cards. */
  imageAspectRatio?: string;
  /** Canvas was mutated by the reply to this user turn; restore available while editing (in-memory). */
  canRestore?: boolean;
  /** Epoch ms when this assistant turn started streaming. */
  startedAt?: number;
  /** Wall time for completed turn (ms). */
  durationMs?: number;
  /** Quick-reply chips from ask_user (e.g. create canvas). */
  choices?: string[];
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
  /** Hover「添加到画布」— place generated image on the editor canvas. */
  onAddImageToCanvas?: (src: string) => void;
};

function hasFoldableProcess(assistant: ChatUiMessage): boolean {
  return Boolean(assistant.steps?.length);
}

/** Gallery / shimmer cards: min width 128px, height from aspect ratio. */
function cardBoxFromAspect(raw?: string): { width: number; height: number } {
  const MIN_W = 128;
  let rw = 1;
  let rh = 1;
  const s = String(raw || '1:1').trim();
  const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i.exec(s);
  if (m) {
    rw = Math.max(0.01, Number(m[1]));
    rh = Math.max(0.01, Number(m[2]));
  }
  const width = MIN_W;
  const height = Math.max(48, Math.round((width * rh) / rw));
  return { width, height };
}

function AssistantProcessBody({
  assistant,
}: {
  assistant: ChatUiMessage;
}): ReactNode {
  // Cursor-style activity log (图1): Thought / Explored / Tool call + ops / Added —
  // never dump intent-analysis essays into this fold.
  const steps = assistant.steps || [];
  return (
    <div className="mt-1 flex flex-col gap-2 border-l border-[var(--line)] pl-2.5 text-[12px] leading-relaxed text-[var(--muted)]">
      {steps.length ? (
        <ul className="flex flex-col gap-1">
          {steps.map((step) => (
            <li key={step.id} className="flex flex-col gap-0.5">
              <span>
                {step.name}
                {step.status === 'running' && !/[.…]$/.test(step.name.trim()) ? '…' : ''}
              </span>
              {step.summary?.trim() ? (
                <span className="whitespace-pre-wrap leading-snug text-[var(--muted)]">
                  {step.summary}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ImageGenGallery({
  assistant,
  onAddImageToCanvas,
}: {
  assistant: ChatUiMessage;
  onAddImageToCanvas?: (src: string) => void;
  sending?: boolean;
}): ReactNode {
  const { t } = useTranslation();
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
            <div
              key={`${assistant.id}-img-${i}`}
              className="group relative shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--canvas)]"
              style={{ width: box.width, height: box.height }}
            >
              <img
                src={src}
                alt=""
                className="block h-full w-full object-cover"
                loading="lazy"
              />
              {onAddImageToCanvas ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/55 to-transparent px-2 pb-2 pt-8 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-md bg-[var(--ink)] px-2.5 text-[11px] font-medium text-[var(--on-brand)] shadow-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onAddImageToCanvas(src);
                    }}
                  >
                    {t('agent.addImageToCanvas', { defaultValue: 'Add to canvas' })}
                  </button>
                </div>
              ) : null}
            </div>
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
  onAddImageToCanvas,
  sending,
}: {
  assistant: ChatUiMessage;
  worked: string | null;
  onChoice?: (choice: string) => void;
  onAddImageToCanvas?: (src: string) => void;
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

  return (
    <div
      data-assistant-id={assistant.id}
      className="flex min-w-0 flex-col gap-1.5 px-0.5"
    >
      {worked ? (
        foldable ? (
          <button
            type="button"
            title={processOpen ? t('agent.collapseProcess', { defaultValue: '收起过程' }) : t('agent.expandProcess', { defaultValue: '展开过程' })}
            className="group inline-flex max-w-full cursor-pointer items-center gap-0.5 rounded px-0.5 text-left text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            onClick={() => setProcessOpen((v) => !v)}
            aria-expanded={processOpen}
          >
            <span>{worked}</span>
            <HiOutlineChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 opacity-0 transition-[opacity,transform] group-hover:opacity-100',
                processOpen && 'rotate-90 opacity-70 group-hover:opacity-100'
              )}
            />
          </button>
        ) : (
          <div className="text-[12px] text-[var(--muted)]">{worked}</div>
        )
      ) : null}

      {showProcess ? <AssistantProcessBody assistant={assistant} /> : null}

      {showImageGallery ? (
        <ImageGenGallery
          assistant={assistant}
          onAddImageToCanvas={onAddImageToCanvas}
          sending={sending}
        />
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
      {!streaming && assistant.choices?.length && onChoice ? (
        <div className="mt-1 flex flex-col items-start gap-1.5">
          {assistant.choices
            .filter((c) => c !== '取消')
            .map((c) => (
              <button
                key={c}
                type="button"
                disabled={sending}
                className="inline-flex h-7 max-w-full items-center rounded-full border border-[var(--line)] bg-[var(--accent-soft)] px-2.5 text-[11px] text-[var(--ink)] transition-colors hover:bg-[var(--line)] disabled:opacity-40"
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

export default function ChatTurnList({
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
  onAddImageToCanvas,
}: Props): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-5 py-2">
      {turns.map(({ user: m, assistant }) => {
        const isEditing = Boolean(m && editingUserId === m.id);
        const worked = formatWorked(assistant);
        const canRestore = Boolean(m && hasCheckpoint(m.id));
        return (
          <div key={m?.id || assistant?.id} className="flex w-full min-w-0 flex-col gap-1.5">
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
                    {m.content || '...'}
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
                onAddImageToCanvas={onAddImageToCanvas}
                sending={sending}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
