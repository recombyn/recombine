import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BiMessageSquareAdd, BiTimeFive } from 'react-icons/bi';
import { LuPanelRight } from 'react-icons/lu';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';

type Props = {
  title: string;
  historyOpen: boolean;
  showNewChatTip?: boolean;
  showClose?: boolean;
  onNewChat: () => void;
  onToggleHistory: () => void;
  onClose?: () => void;
};

/**
 * Agent dock top bar — title, new chat, history, optional close.
 */
function AgentDockHeader({
  title,
  historyOpen,
  showNewChatTip = false,
  showClose = false,
  onNewChat,
  onToggleHistory,
  onClose,
}: Props): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-4">
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--ink)]">
        {historyOpen ? t('agent.history') : title}
      </span>
      <div className="relative flex items-center gap-0.5">
        <Tooltip tip={t('agent.newChat')} placement="bottom">
          <button
            type="button"
            aria-label={t('agent.newChat')}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            onClick={onNewChat}
          >
            <BiMessageSquareAdd className="h-4 w-4" />
          </button>
        </Tooltip>
        {showNewChatTip ? (
          <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-30 -translate-x-1/4">
            <div className="relative rounded bg-[var(--ink)] px-2.5 py-1.5 text-[11px] text-[var(--on-brand)] shadow-md">
              <span
                className="absolute left-6 top-0 h-2 w-2 -translate-y-1/2 rotate-45 bg-[var(--ink)]"
                aria-hidden
              />
              {t('agent.alreadyNewChat')}
            </div>
          </div>
        ) : null}
        <Tooltip tip={t('agent.history')} placement="bottom">
          <button
            type="button"
            aria-label={t('agent.history')}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
              historyOpen && 'bg-[var(--accent-soft)] text-[var(--ink)]'
            )}
            onClick={onToggleHistory}
          >
            <BiTimeFive className="h-[18px] w-[18px]" />
          </button>
        </Tooltip>
        {showClose && onClose ? (
          <Tooltip tip={t('agent.closePanel')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.closePanel')}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              onClick={onClose}
            >
              <LuPanelRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

export default AgentDockHeader;
