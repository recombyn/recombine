import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  FloatingPortal,
} from '@floating-ui/react';
import { cva } from 'class-variance-authority';
import { cn } from '@/utils/classnames';
import { FloatButtonGroup } from './FloatButtonGroup';
import { FloatButtonBackTop } from './FloatButtonBackTop';

/**
 * Corner placement for fixed positioning.
 */
export type FloatButtonPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

/**
 * Hit target size token.
 */
export type FloatButtonSize = 'default' | 'large' | 'small';

/**
 * Visual emphasis variant.
 */
export type FloatButtonType = 'default' | 'primary';

/**
 * FloatButton Props
 */
export interface FloatButtonProps {
  /**
   * Icon or custom content.
   */
  icon?: React.ReactNode;
  /**
   * Default tooltip copy when `tooltip` is omitted.
   */
  description?: string;
  /**
   * Color variant.
   * @default 'default'
   */
  type?: FloatButtonType;
  /**
   * Shape token.
   * @default 'circle'
   */
  shape?: 'circle' | 'square';
  /**
   * Hit area size.
   * @default 'default'
   */
  size?: FloatButtonSize;
  /**
   * Viewport corner anchor.
   * @default 'bottomRight'
   */
  position?: FloatButtonPosition;
  /**
   * Offset from edges in px `[x, y]`.
   * @default [24, 24]
   */
  offset?: [number, number];
  /**
   * Click handler.
   */
  onClick?: () => void;
  /**
   * Disable pointer events.
   * @default false
   */
  disabled?: boolean;
  /**
   * Extra classes on the button.
   */
  className?: string;
  /**
   * Inline styles merged after position.
   */
  style?: React.CSSProperties;
  /**
   * Numeric badge or custom badge node.
   */
  badge?: { count: number } | React.ReactNode;
  /**
   * Tooltip text (overrides `description` when both exist).
   */
  tooltip?: string;
  /**
   * Fallback content when `icon` is empty.
   */
  children?: React.ReactNode;
}

/**
 * Float button surface styles.
 */
const floatButtonVariants = cva(
  'fixed z-50 flex items-center justify-center cursor-pointer shadow-lg hover:shadow-xl',
  {
    variants: {
      type: {
        default:
          'bg-background-default-secondary border border-[var(--color-border-default-base)] text-text-default-base hover:bg-background-default-tertiary',
        primary:
          'bg-brand-base text-white border border-brand-base hover:bg-brand-hover',
      },
      shape: {
        circle: 'rounded-full',
        square: 'rounded-lg',
      },
      size: {
        small: 'w-8 h-8',
        default: 'w-12 h-12',
        large: 'w-14 h-14',
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed pointer-events-none',
        false: '',
      },
    },
    defaultVariants: {
      type: 'default',
      shape: 'circle',
      size: 'default',
      disabled: false,
    },
  }
);

/**
 * Computes `top`/`right`/`bottom`/`left` for a corner position.
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
 * Fixed corner action button with optional tooltip and badge.
 */
const FloatButton = ({
  icon,
  description,
  type = 'default',
  shape = 'circle',
  size = 'default',
  position = 'bottomRight',
  offset = [24, 24],
  onClick,
  disabled = false,
  className,
  style,
  badge,
  tooltip,
  children,
}: FloatButtonProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const positionStyle = useMemo(
    () => getPositionStyle(position, offset),
    [position, offset]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    onClick?.();
  }, [disabled, onClick]);

  const handleMouseEnter = useCallback(() => {
    if (tooltip || description) {
      setShowTooltip(true);
    }
  }, [tooltip, description]);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const renderBadge = () => {
    if (!badge) return null;

    if (typeof badge === 'object' && 'count' in badge) {
      return (
        <span className='absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-xs font-medium text-white bg-red-500 rounded-full'>
          {badge.count > 99 ? '99+' : badge.count}
        </span>
      );
    }

    return <span className='absolute -top-1 -right-1'>{badge}</span>;
  };

  const renderTooltip = () => {
    if (!showTooltip || (!tooltip && !description)) return null;

    return (
      <FloatingPortal>
        <div
          className={cn(
            'absolute z-[60] px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-nowrap pointer-events-none',
            showTooltip ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            ...positionStyle,
            [position.includes('Right') ? 'right' : 'left']: position.includes('Right')
              ? `${offset[0] + 60}px`
              : `${offset[0] + 60}px`,
            [position.includes('top') ? 'top' : 'bottom']: position.includes('top')
              ? `${offset[1]}px`
              : `${offset[1]}px`,
          }}
        >
          {tooltip || description}
        </div>
      </FloatingPortal>
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type='button'
        className={cn(floatButtonVariants({ type, shape, size, disabled }), className)}
        style={{ ...positionStyle, ...style }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={disabled}
        aria-label={description || tooltip}
      >
        {icon || children}
        {renderBadge()}
      </button>
      {renderTooltip()}
    </>
  );
};

FloatButton.Group = FloatButtonGroup;
FloatButton.BackTop = FloatButtonBackTop;

export { FloatButton };
export default FloatButton;
