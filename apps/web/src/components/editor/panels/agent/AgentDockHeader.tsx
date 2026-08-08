import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BiMessageSquareAdd, BiTimeFive } from 'react-icons/bi';
import { LuPanelRight } from 'react-icons/lu';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';

export type AgentEngineMode = 'agent' | 'cli';

export type CodingCliOption = {
  id: string;
  name: string;
  available: boolean;
};

type Props = {
  title: string;
  historyOpen: boolean;
  showNewChatTip?: boolean;
  showClose?: boolean;
  onNewChat: () => void;
  onToggleHistory: () => void;
  onClose?: () => void;
  /** Desktop shell: Agent vs local coding CLI (mutually exclusive). */
  engineMode?: AgentEngineMode;
  onEngineModeChange?: (mode: AgentEngineMode) => void;
  codingClis?: CodingCliOption[];
  codingCliId?: string;
  onCodingCliChange?: (id: string) => void;
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
  engineMode,
  onEngineModeChange,
  codingClis,
  codingCliId,
  onCodingCliChange,
}: Props): ReactNode {
  const { t } = useTranslation();
  const showEngine = Boolean(engineMode && onEngineModeChange);
  const availableClis = (codingClis || []).filter((c) => c.available);

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate text-[15px] font-semibold text-[var(--ink)]">
          {historyOpen ? t('agent.history') : title}
        </span>
        {showEngine && !historyOpen ? (
          <div className="flex shrink-0 items-center gap-1">
            <div
              className="inline-flex h-7 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] p-0.5"
              role="group"
              aria-label="Agent engine"
            >
              <Tooltip tip={t('agent.engineAgentTip')} placement="bottom">
                <button
                  type="button"
                  className={cn(
                    'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                    engineMode === 'agent'
                      ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  )}
                  onClick={() => onEngineModeChange?.('agent')}
                >
                  {t('agent.engineAgent')}
                </button>
              </Tooltip>
              <Tooltip tip={t('agent.engineCliTip')} placement="bottom">
                <button
                  type="button"
                  className={cn(
                    'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                    engineMode === 'cli'
                      ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  )}
                  onClick={() => onEngineModeChange?.('cli')}
                >
                  {t('agent.engineCli')}
                </button>
              </Tooltip>
            </div>
            {engineMode === 'cli' && onCodingCliChange ? (
              <select
                aria-label={t('agent.engineCliPick')}
                className="h-7 max-w-[9rem] truncate rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[11px] text-[var(--ink)] outline-none"
                value={codingCliId || ''}
                onChange={(e) => onCodingCliChange(e.target.value)}
              >
                {availableClis.length === 0 ? (
                  <option value="">{t('agent.engineCliMissing')}</option>
                ) : (
                  availableClis.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="relative flex shrink-0 items-center gap-0.5">
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
