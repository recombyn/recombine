import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';
import type { AgentCollabMode } from '@/components/editor/panels/agent/designPipeline';

type Props = {
  categoryLabel: string;
  labels: string[];
  currentIndex: number;
  stepConfirm?: boolean;
  collabMode?: AgentCollabMode;
  className?: string;
};

/** Visible fixed-order design phases (human-in-the-loop friendly). */
export default function DesignPipelineBar({
  categoryLabel,
  labels,
  currentIndex,
  stepConfirm,
  collabMode,
  className,
}: Props): ReactNode {
  const { t } = useTranslation();
  if (!labels.length) return null;
  const mode: AgentCollabMode =
    collabMode || (stepConfirm === false ? 'auto' : 'collaborative');
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--line)] bg-[var(--canvas)]/80 px-2.5 py-2',
        className
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--ink)]">
          {t('agent.pipelineTitle', { category: categoryLabel })}
        </span>
        <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
          {t(`agent.collabMode.${mode}.badge`)}
        </span>
      </div>
      <ol className="flex flex-wrap gap-1">
        {labels.map((label, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li
              key={`${label}-${i}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] tabular-nums',
                done && 'bg-emerald-500/15 text-emerald-700',
                active && 'bg-[var(--ink)] text-[var(--on-brand)]',
                !done && !active && 'bg-[var(--surface)] text-[var(--muted)] ring-1 ring-[var(--line)]'
              )}
            >
              <span className="opacity-70">{i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
