import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/utils/classnames';

type DropdownPanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/**
 * Shared floating menu shell — 4px radius, opaque surface fill, ring + shadow.
 * Use for base Dropdown and any custom editor dropdown panels.
 */
export const DropdownPanel = forwardRef<HTMLDivElement, DropdownPanelProps>(
  function DropdownPanel({ className, children, style, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-0.5 overflow-hidden rounded-[4px] bg-[var(--surface)] p-1',
          'shadow-[0_8px_28px_rgba(15,23,42,0.16)] ring-1 ring-[var(--line)]',
          'focus:outline-none focus-visible:outline-none',
          className
        )}
        // Inline surface so canvas chrome under the same z-band cannot show through.
        style={{ backgroundColor: 'var(--surface)', ...(style as CSSProperties | undefined) }}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

type DropdownPanelItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  children: ReactNode;
};

/**
 * Menu row — full-width soft selected fill (fig. aspect “原始”), fixed height.
 */
export const DropdownPanelItem = forwardRef<HTMLButtonElement, DropdownPanelItemProps>(
  function DropdownPanelItem(
    { selected = false, className, children, type = 'button', disabled, ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        aria-selected={selected}
        className={cn(
          'flex h-8 w-full shrink-0 items-center gap-2 rounded-[4px] px-2.5 text-left text-[12px] font-medium text-[var(--ink)] transition-colors',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && (selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'),
          className
        )}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
