import React from 'react';
import { cn } from '@/utils/classnames';

export interface DividerProps {
  /** Layout axis */
  type?: 'horizontal' | 'vertical';
  /** Dashed line */
  dashed?: boolean;
  /** Label alignment when children set */
  orientation?: 'left' | 'right' | 'center';
  /** Center label */
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Horizontal or vertical rule */
export const Divider: React.FC<DividerProps> = ({
  type = 'horizontal',
  dashed = false,
  orientation = 'center',
  children,
  className,
  style,
}) => {
  if (type === 'vertical') {
    return (
      <span
        className={cn(
          'inline-block h-full w-px bg-[var(--color-border-default-base)]',
          dashed && 'border-dashed',
          className
        )}
        style={style}
      />
    );
  }

  if (children) {
    return (
      <div
        className={cn('flex items-center w-full my-4', className)}
        style={style}
      >
        <span
          className={cn(
            'flex-1 h-px bg-[var(--color-border-default-base)]',
            dashed && 'border-dashed',
            orientation === 'left' && 'flex-none w-1/6',
            orientation === 'right' && 'flex-none w-1/6 ml-auto'
          )}
        />
        <span className='px-4 text-[var(--color-text-default-secondary)] text-sm'>
          {children}
        </span>
        <span
          className={cn(
            'flex-1 h-px bg-[var(--color-border-default-base)]',
            dashed && 'border-dashed',
            orientation === 'left' && 'flex-1',
            orientation === 'right' && 'flex-none w-1/6'
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full h-px bg-[var(--color-border-default-base)]',
        dashed && 'border-dashed',
        className
      )}
      style={style}
    />
  );
};

export default Divider;

