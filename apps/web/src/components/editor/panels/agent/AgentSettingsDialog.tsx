import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/base';
import { cn } from '@/utils/classnames';
import type { AgentCollabMode } from '@/components/editor/panels/agent/designPipeline';

type Props = {
  open: boolean;
  mode: AgentCollabMode;
  onClose: () => void;
  onChangeMode: (mode: AgentCollabMode) => void;
};

const MODES: AgentCollabMode[] = ['collaborative', 'milestone', 'auto'];

export default function AgentSettingsDialog({
  open,
  mode,
  onClose,
  onChangeMode,
}: Props): ReactNode {
  const { t } = useTranslation();

  return (
    <Dialog
      show={open}
      onClose={onClose}
      title={t('agent.settingsTitle')}
      width={420}
      footer={
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-lg bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--on-brand)] hover:opacity-90"
          onClick={onClose}
        >
          {t('common.confirm')}
        </button>
      }
    >
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--muted)]">
        {t('agent.settingsHint')}
      </p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('agent.collabModeLabel')}>
        {MODES.map((id) => {
          const selected = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChangeMode(id)}
              className={cn(
                'w-full rounded-xl border px-3.5 py-3 text-left transition',
                selected
                  ? 'border-[var(--ink)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--accent-soft)]/60'
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    selected
                      ? 'border-[var(--ink)] bg-[var(--ink)]'
                      : 'border-[var(--muted)] bg-transparent'
                  )}
                  aria-hidden
                >
                  {selected ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--on-brand)]" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[var(--ink)]">
                    {t(`agent.collabMode.${id}.title`)}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[var(--muted)]">
                    {t(`agent.collabMode.${id}.desc`)}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
