import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

export type MentionAttachItem = {
  /** Composer attachment key or skill key. */
  id: string;
  label: string;
  thumbUrl?: string;
  /** Optional secondary line (skill whenToUse). */
  hint?: string;
  /** Group label for skill picker sections. */
  group?: string;
};

type Props = {
  items: MentionAttachItem[];
  query: string;
  onPick: (id: string) => void;
  className?: string;
  /** `attach` = @ attachments; `skill` = / skills. */
  variant?: 'attach' | 'skill';
};

function filterMentionItems(items: MentionAttachItem[], query: string): MentionAttachItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      it.id.toLowerCase().includes(q) ||
      (it.hint || '').toLowerCase().includes(q)
  );
}

/**
 * Composer mention picker — `@` attachments or `/` skills.
 */
function MentionAttachPanel({
  items,
  query,
  onPick,
  className,
  variant = 'attach',
}: Props): ReactNode {
  const { t } = useTranslation();
  const filtered = filterMentionItems(items, query);
  const emptyKey =
    variant === 'skill'
      ? items.length === 0
        ? 'agent.mentionSkillEmpty'
        : 'agent.mentionSkillNoMatch'
      : items.length === 0
        ? 'agent.mentionAttachEmpty'
        : 'agent.mentionAttachNoMatch';

  let lastGroup = '';

  return (
    <div
      className={cn(
        'w-[min(260px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]',
        className
      )}
    >
      <div className="max-h-[min(320px,calc(100vh-160px))] overflow-y-auto p-1">
        {!filtered.length ? (
          <div className="px-2 py-4 text-center text-[12px] text-[var(--muted)]">
            {t(emptyKey)}
          </div>
        ) : (
          filtered.map((it) => {
            const showGroup = Boolean(it.group && it.group !== lastGroup);
            if (it.group) lastGroup = it.group;
            return (
              <div key={it.id}>
                {showGroup ? (
                  <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    {it.group}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--canvas)]"
                  onClick={() => onPick(it.id)}
                >
                  {it.thumbUrl ? (
                    <img
                      src={it.thumbUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded border border-[var(--line)] object-cover"
                    />
                  ) : variant === 'skill' ? null : (
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface)] text-[11px] font-semibold text-[var(--muted)]"
                      aria-hidden
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                        <path d="M9 9h6v6H9z" />
                      </svg>
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-[var(--ink)]">
                      {it.label}
                    </span>
                    {it.hint ? (
                      <span className="block truncate text-[10px] text-[var(--muted)]">
                        {it.hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default memo(MentionAttachPanel);
