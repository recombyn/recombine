import React, { useState, useCallback, useRef, useMemo, Children, cloneElement, isValidElement } from 'react';
import {
  autoUpdate,
  useDismiss,
  useFloating,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';
import { cn } from '@/utils/classnames';
import type { FloatButtonProps, FloatButtonPosition } from './index';

/**
 * FloatButtonGroup Props
 */
export interface FloatButtonGroupProps {
  /**
   * Secondary actions rendered in the floating stack.
   */
  children: React.ReactNode;
  /**
   * Controlled open state.
   */
  open?: boolean;
  /**
   * Open state change (controlled or uncontrolled).
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * Whether the stack toggles on click or hover.
   * @default 'click'
   */
  trigger?: 'click' | 'hover';
  /**
   * Corner anchor for the primary control.
   * @default 'bottomRight'
   */
  position?: FloatButtonPosition;
  /**
   * Offset from viewport edges in px `[x, y]`.
   * @default [24, 24]
   */
  offset?: [number, number];
  /**
   * Primary toggle icon; defaults to a plus that rotates when open.
   */
  icon?: React.ReactNode;
  /**
   * Primary button color variant.
   * @default 'primary'
   */
  type?: FloatButtonProps['type'];
  /**
   * Extra classes on the primary button.
   */
  className?: string;
  /**
   * Inline styles on the primary button.
   */
  style?: React.CSSProperties;
}

/**
 * Corner + offset → fixed positioning styles.
 */
const getPositionStyle = (
  position: FloatButtonPosition,
  offset: [number, number]
): React.CSSProperties => {
  const [x, y] = offset;
  const styles: React.CSSProperties = {};

  switch (position) {
    case 'topLeft':
      styles.top = `${y}px`;
      styles.left = `${x}px`;
      break;
    case 'topRight':
      styles.top = `${y}px`;
      styles.right = `${x}px`;
      break;
    case 'bottomLeft':
      styles.bottom = `${y}px`;
      styles.left = `${x}px`;
      break;
    case 'bottomRight':
    default:
      styles.bottom = `${y}px`;
      styles.right = `${x}px`;
      break;
  }

  return styles;
};

/**
 * Stack grows upward from bottom corners, downward from top corners.
 */
const getExpandDirection = (position: FloatButtonPosition): 'up' | 'down' =>
  position.includes('bottom') ? 'up' : 'down';

/**
 * Primary FAB that reveals a vertical stack of child buttons.
 */
export const FloatButtonGroup = ({
  children,
  open: controlledOpen,
  onOpenChange,
  trigger = 'click',
  position = 'bottomRight',
  offset = [24, 24],
  icon,
  type = 'primary',
  className,
  style,
}: FloatButtonGroupProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (newOpen) => {
      if (!isControlled) {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    placement: position.includes('Right') ? 'top-end' : 'top-start',
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const handleToggle = useCallback(() => {
    const newOpen = !open;
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [open, isControlled, onOpenChange]);

  const handleMouseEnter = useCallback(() => {
    if (trigger === 'hover' && !open) {
      if (!isControlled) {
        setInternalOpen(true);
      }
      onOpenChange?.(true);
    }
  }, [trigger, open, isControlled, onOpenChange]);

  const handleMouseLeave = useCallback(() => {
    if (trigger === 'hover' && open) {
      if (!isControlled) {
        setInternalOpen(false);
      }
      onOpenChange?.(false);
    }
  }, [trigger, open, isControlled, onOpenChange]);

  const positionStyle = useMemo(
    () => getPositionStyle(position, offset),
    [position, offset]
  );

  const expandDirection = useMemo(
    () => getExpandDirection(position),
    [position]
  );

  const childButtons = useMemo(() => {
    return Children.toArray(children).filter((child) => isValidElement(child));
  }, [children]);

  // Default primary icon: plus → rotates 45° when open
  const defaultIcon = useMemo(() => {
    if (icon) return icon;
    return (
      <svg
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        className={cn(open && 'rotate-45')}
      >
        <line x1='12' y1='5' x2='12' y2='19' />
        <line x1='5' y1='12' x2='19' y2='12' />
      </svg>
    );
  }, [icon, open]);

  return (
    <>
      <button
        ref={refs.setReference}
        type='button'
        className={cn(
          'fixed z-50 flex items-center justify-center cursor-pointer shadow-lg hover:shadow-xl rounded-full',
          type === 'primary'
            ? 'bg-brand-base text-white border border-brand-base hover:bg-brand-hover'
            : 'bg-background-default-secondary border border-[var(--color-border-default-base)] text-text-default-base hover:bg-background-default-tertiary',
          'w-12 h-12',
          className
        )}
        style={{ ...positionStyle, ...style }}
        onClick={trigger === 'click' ? handleToggle : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...getReferenceProps()}
        aria-label='Float button group'
      >
        {defaultIcon}
      </button>

      <FloatingPortal>
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            visibility: open ? 'visible' : 'hidden',
            pointerEvents: open ? 'auto' : 'none',
          }}
          className='z-50'
          {...getFloatingProps()}
        >
          <div
            className={cn(
              'flex flex-col gap-2',
              expandDirection === 'up' ? 'flex-col-reverse' : 'flex-col'
            )}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {childButtons.map((child, index) => {
              if (!isValidElement<FloatButtonProps>(child)) return null;

              const childStyle: React.CSSProperties = {
                position: 'relative',
                opacity: open ? 1 : 0,
                pointerEvents: open ? 'auto' : 'none',
              };

              const handleChildClick = () => {
                child.props.onClick?.();
                // Collapse after a child action
                if (!isControlled) {
                  setInternalOpen(false);
                }
                onOpenChange?.(false);
              };

              return (
                <div
                  key={index}
                  style={childStyle}
                  onClick={handleChildClick}
                >
                  {cloneElement(child, {
                    style: {
                      ...child.props.style,
                      position: 'relative',
                    },
                    onClick: handleChildClick,
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </FloatingPortal>

      <style>{`
        @keyframes floatButtonSlideIn {
          from {
            opacity: 0;
            transform: translateY(${expandDirection === 'up' ? '10px' : '-10px'}) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
};

