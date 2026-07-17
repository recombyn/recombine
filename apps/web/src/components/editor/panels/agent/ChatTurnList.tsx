import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineCheck,
  HiOutlineWrenchScrewdriver,
} from 'react-icons/hi2';
import type { ChatUiMessage } from '@/hooks/useChatSessions';
import { ChatMarkdown, ChatThinkingBlock } from '@/components/editor/panels/ChatMarkdown';
import DesignPipelineBar from '@/components/editor/panels/agent/DesignPipelineBar';
import { cn } from '@/utils/classnames';

export type ChatTurn = {
  user: ChatUiMessage | null;
  assistant?: ChatUiMessage;
};

type Props = {
  turns: ChatTurn[];
  editingUserId: string | null;
  editComposer?: ReactNode;
  sending: boolean;
  canApplyText: boolean;
  formatWorked: (assistant?: ChatUiMessage) => string | null;
  hasCheckpoint: (userId: string) => boolean;
  onBeginEdit: (m: ChatUiMessage) => void;
  onCancelEdit: () => void;
  onRestore: (userId: string) => void;
  onApplyText: (content: string) => void;
  onChoice?: (choice: string) => void;
};

export default function ChatTurnList({
  turns,
  editingUserId,
  editComposer,
  sending,
  canApplyText,
  formatWorked,
  hasCheckpoint,
  onBeginEdit,
  onCancelEdit,
  onRestore,
  onApplyText,
  onChoice,
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
                  {editComposer}
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
              <div className="group flex min-w-0 items-start gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]">
                <div
                  role={!sending ? 'button' : undefined}
                  tabIndex={!sending ? 0 : undefined}
                  onClick={!sending ? () => onBeginEdit(m) : undefined}
                  className={cn(
                    'min-w-0 flex-1 cursor-pointer whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-[var(--ink)]'
                  )}
                  title={t('agent.clickToEdit')}
                >
                  {m.content || '...'}
                </div>
                {canRestore && !sending ? (
                  <button
                    type="button"
                    aria-label={t('agent.restoreCheckpoint')}
                    title={t('agent.restoreCheckpoint')}
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-[var(--muted)] opacity-0 transition-opacity hover:bg-[var(--canvas)] hover:text-[var(--ink)] group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(m.id);
                    }}
                  >
                    <HiOutlineArrowUturnLeft className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              )
            ) : null}

            {assistant && !isEditing ? (
              <div
                data-assistant-id={assistant.id}
                className="flex min-w-0 flex-col gap-1.5 px-0.5"
              >
                {worked ? <div className="text-[12px] text-[var(--muted)]">{worked}</div> : null}
                {assistant.pipeline?.labels?.length ? (
                  <DesignPipelineBar
                    categoryLabel={assistant.pipeline.category}
                    labels={assistant.pipeline.labels}
                    currentIndex={assistant.pipeline.currentIndex}
                    stepConfirm={assistant.pipeline.stepConfirm}
                    collabMode={assistant.pipeline.collabMode}
                  />
                ) : null}
                {assistant.thinking ||
                (assistant.streaming && !assistant.content && !assistant.steps?.length) ? (
                  <ChatThinkingBlock
                    content={assistant.thinking || ''}
                    streaming={assistant.streaming}
                  />
                ) : null}
                {assistant.steps?.length ? (
                  <div className="min-w-0 space-y-1">
                    {assistant.steps.map((s) => (
                      <div
                        key={s.id}
                        className="flex min-w-0 items-start gap-2 text-[11px] text-[var(--muted)]"
                      >
                        <HiOutlineWrenchScrewdriver
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            s.status === 'running' && 'animate-pulse text-[var(--accent)]',
                            s.status === 'done' && 'text-emerald-600',
                            s.status === 'error' && 'text-red-500'
                          )}
                        />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                          <span className="font-medium text-[var(--ink)]">{s.name}</span>
                          {' · '}
                          {s.status === 'running'
                            ? t('agent.running')
                            : s.summary || (s.status === 'error' ? t('agent.failed') : t('agent.done'))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {assistant.content ? (
                  <div className="min-w-0 max-w-full overflow-x-hidden text-[13px] leading-relaxed text-[var(--ink)]">
                    <ChatMarkdown content={assistant.content} />
                    {assistant.streaming ? (
                      <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
                    ) : null}
                  </div>
                ) : assistant.streaming && !(assistant.thinking || assistant.steps?.length) ? (
                  <div className="text-[13px] text-[var(--muted)]">设计中…</div>
                ) : null}
                {!assistant.streaming && assistant.content && canApplyText ? (
                  <button
                    type="button"
                    className="mr-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    onClick={() => onApplyText(assistant.content)}
                  >
                    <HiOutlineCheck className="h-3.5 w-3.5" />
                    {t('agent.apply')}
                  </button>
                ) : null}
                {!assistant.streaming && assistant.choices?.length && onChoice ? (
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
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
