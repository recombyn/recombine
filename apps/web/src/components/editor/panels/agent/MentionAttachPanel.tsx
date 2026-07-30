import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

export type MentionAttachItem = {
  /** Composer attachment key. */
  id: string;
  label: string;
  thumbUrl?: string;
};

type Props = {
  items: MentionAttachItem[];
  query: string;
  onPick: (id: string) => void;
  className?: string;
};

/**
 * `@` mention picker — uploaded composer attachments → insert chip in input.
 */
function MentionAttachPanel({
  items,
  query,
  onPick,
  className,
}: Props): ReactNode {
  const { t } = useTranslation();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) || it.id.toLowerCase().includes(q)
      )
    : items;

  return (
    <div
      className={cn(
        'w-[min(220px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]',
        className
      )}
    >
      <div className="max-h-[min(280px,calc(100vh-160px))] overflow-y-auto p-1">
        {!filtered.length ? (
          <div className="px-2 py-4 text-center text-[12px] text-[var(--muted)]">
            {items.length === 0
              ? t('agent.mentionAttachEmpty')
              : t('agent.mentionAttachNoMatch')}
          </div>
        ) : (
          filtered.map((it) => (
            <button
              key={it.id}
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
              ) : (
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
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
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--ink)]">
                {it.label}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default memo(MentionAttachPanel);
