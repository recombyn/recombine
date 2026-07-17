import type { ReactNode } from 'react';
import { cn } from '@/utils/classnames';

type SegmentTabsProps<T extends string> = {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Accessible name for the tablist. */
  'aria-label'?: string;
};

/**
 * Plain text tabs (no underline / no pill) — plaza & profile.
 * Active = semibold ink; inactive = muted.
 */
export default function SegmentTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: SegmentTabsProps<T>): ReactNode {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full flex-wrap items-center gap-5', className)}
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              'text-[13px] transition-colors',
              active
                ? 'font-semibold text-[var(--ink)]'
                : 'font-normal text-[var(--muted)] hover:text-[var(--ink)]'
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
