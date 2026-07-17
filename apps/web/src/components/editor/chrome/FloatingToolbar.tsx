import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/classnames';

type FloatingToolbarProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Transparent / unstyled chrome (e.g. icon-only host). */
  bare?: boolean;
};

/**
 * Floating editor toolbar chrome — unified 12px radius.
 */
export function FloatingToolbar({
  bare = false,
  className,
  children,
  ...rest
}: FloatingToolbarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5 whitespace-nowrap',
        bare
          ? 'rounded-[12px] bg-transparent p-0 shadow-none ring-0'
          : 'rounded-[12px] bg-[var(--surface)] px-1.5 py-1 shadow-[0_8px_28px_rgba(15,23,42,0.16)] ring-1 ring-[var(--line)]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
