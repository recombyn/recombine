import type { ReactNode } from 'react';
import { HiOutlineClock } from 'react-icons/hi2';
import { cn } from '@/utils/classnames';

type EmptyStateProps = {
  hint: string;
  /** Defaults to a clock glyph (same as Me / Assets). */
  icon?: ReactNode;
  className?: string;
};

/** Borderless empty hint: icon + text only (no dashed box / fill). */
export default function EmptyState({ hint, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col items-center justify-center px-6 py-24 text-[var(--muted)]',
        className
      )}
    >
      {icon ?? <HiOutlineClock className="mb-3 h-8 w-8 opacity-50" strokeWidth={1.25} />}
      <p className="text-center text-[13px]">{hint}</p>
    </div>
  );
}
