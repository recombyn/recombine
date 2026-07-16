import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cva } from 'class-variance-authority';
import { cn } from '@/utils/classnames';
import { Icon } from '@/components/base/icon';

export type DrawerPlacement = 'left' | 'right' | 'top' | 'bottom';

const drawerPanelVariants = cva(
  'flex flex-col border-[0.5px] border-[var(--color-border-default-base)] bg-[var(--color-background-default-base)] shadow-lg pointer-events-auto',
  {
    variants: {
      placement: {
        left: 'rounded-r-lg',
        right: 'rounded-l-lg',
        top: 'w-full rounded-b-lg',
        bottom: 'w-full rounded-t-lg',
      },
      fixedHeight: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      {
        placement: ['left', 'right'],
        fixedHeight: false,
        class: 'h-full',
      },
    ],
  }
);

export interface DrawerProps {
  /** Open state */
  open: boolean;
  /** Close handler */
  onClose?: () => void;
  /** Title text */
  title?: React.ReactNode;
  /** Custom header (overrides title) */
  titleRender?: React.ReactNode;
  /** Body */
  children: React.ReactNode;
  /** Footer slot */
  footer?: React.ReactNode;
  /** Slide edge; default right */
  placement?: DrawerPlacement;
  /** Width (left/right) or height (top/bottom); default 400px */
  width?: number | string;
  /** Backdrop; default true */
  mask?: boolean;
  /** Click mask to close; default true */
  maskClosable?: boolean;
  /** Header close button; default true */
  closable?: boolean;
  /** Panel class */
  className?: string;
  /** Header class */
  titleClassName?: string;
  /** Body class */
  bodyClassName?: string;
  /** Footer class */
  footerClassName?: string;
  /** Panel style */
  style?: React.CSSProperties;
  /** z-index; default 499 */
  zIndex?: number;
  /** Edge inset(s) */
  offset?: number | { top?: number; right?: number; bottom?: number; left?: number };
  /** Top offset */
  top?: number | string;
  /** Bottom offset */
  bottom?: number | string;
  /** Left offset */
  left?: number | string;
  /** Right offset */
  right?: number | string;
  /** Left/right: height from top+bottom instead of full viewport */
  fixedHeight?: boolean;
  /** Outer-edge arrow control (left/right only) */
  onLeftEdgeButtonClick?: () => void;
}

/** Edge slide-over panel */
const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  titleRender,
  children,
  footer,
  placement = 'right',
  width = 400,
  mask = true,
  maskClosable = true,
  closable = true,
  className,
  titleClassName,
  bodyClassName,
  footerClassName,
  style,
  zIndex = 499,
  offset,
  top,
  bottom,
  left,
  right,
  fixedHeight = false,
  onLeftEdgeButtonClick,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  const transformValue = React.useMemo(() => {
    if (open) {
      return 'translateX(0) translateY(0)';
    }
    // Closed: translate off-screen
    switch (placement) {
      case 'left':
        return 'translateX(calc(-100% - 20px))';
      case 'right':
        return 'translateX(calc(100% + 20px))';
      case 'top':
        return 'translateY(calc(-100% - 20px))';
      case 'bottom':
        return 'translateY(calc(100% + 20px))';
      default:
        return 'translateX(calc(100% + 20px))';
    }
  }, [open, placement]);

  const positionStyle = React.useMemo((): React.CSSProperties => {
    const styles: React.CSSProperties = {};

    const sizeValue = typeof width === 'number' ? `${width}px` : width;
    if (placement === 'left' || placement === 'right') {
      styles.width = sizeValue;
      if (fixedHeight && top !== undefined && bottom !== undefined) {
        const topNum = typeof top === 'number' ? top : parseFloat(String(top));
        const bottomNum = typeof bottom === 'number' ? bottom : parseFloat(String(bottom));
        if (!Number.isNaN(topNum) && !Number.isNaN(bottomNum)) {
          styles.height = `calc(100vh - ${topNum}px - ${bottomNum}px)`;
        }
      }
    } else {
      styles.height = sizeValue;
    }

    if (typeof offset === 'object' && offset !== null) {
      if (offset.top !== undefined) styles.top = typeof offset.top === 'number' ? `${offset.top}px` : offset.top;
      if (offset.right !== undefined) styles.right = typeof offset.right === 'number' ? `${offset.right}px` : offset.right;
      if (offset.bottom !== undefined) styles.bottom = typeof offset.bottom === 'number' ? `${offset.bottom}px` : offset.bottom;
      if (offset.left !== undefined) styles.left = typeof offset.left === 'number' ? `${offset.left}px` : offset.left;
    } else if (typeof offset === 'number') {
      const placementMap: Record<DrawerPlacement, 'top' | 'right' | 'bottom' | 'left'> = {
        left: 'left',
        right: 'right',
        top: 'top',
        bottom: 'bottom',
      };
      styles[placementMap[placement]] = `${offset}px`;
    }

    if (top !== undefined) styles.top = typeof top === 'number' ? `${top}px` : top;
    if (bottom !== undefined) styles.bottom = typeof bottom === 'number' ? `${bottom}px` : bottom;
    if (left !== undefined) styles.left = typeof left === 'number' ? `${left}px` : left;
    if (right !== undefined) styles.right = typeof right === 'number' ? `${right}px` : right;

    if (placement === 'left' && !styles.left && !styles.right) styles.left = 0;
    if (placement === 'right' && !styles.left && !styles.right) styles.right = 0;
    if (placement === 'top' && !styles.top && !styles.bottom) styles.top = 0;
    if (placement === 'bottom' && !styles.top && !styles.bottom) styles.bottom = 0;

    return styles;
  }, [placement, width, fixedHeight, top, bottom, offset, left, right]);

  const roundedClass = React.useMemo(() => {
    switch (placement) {
      case 'left':
        return 'rounded-r-lg';
      case 'right':
        return 'rounded-l-lg';
      case 'top':
        return 'rounded-b-lg';
      case 'bottom':
        return 'rounded-t-lg';
      default:
        return 'rounded-l-lg';
    }
  }, [placement]);

  const heightClass = React.useMemo(() => {
    if (placement === 'left' || placement === 'right') {
      return fixedHeight ? '' : 'h-full';
    }
    return '';
  }, [placement, fixedHeight]);

  const handleMaskClick = () => {
    if (mask && maskClosable) {
      onClose?.();
    }
  };

  const drawerContent = (
    <>
      {mask && open && (
        <div
          className='fixed inset-0 bg-[var(--color-shadow-overlay)] backdrop-blur-[6px]'
          style={{ zIndex: zIndex - 1, opacity: open ? 1 : 0 }}
          onClick={handleMaskClick}
        />
      )}

      <div
        className={cn(
          'fixed flex flex-col',
          open ? 'pointer-events-auto' : 'pointer-events-none',
          drawerPanelVariants({
            placement,
            fixedHeight: fixedHeight && (placement === 'left' || placement === 'right'),
          }),
          roundedClass,
          heightClass,
          className
        )}
        style={{
          zIndex,
          transform: transformValue,
          ...positionStyle,
          ...style,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {onLeftEdgeButtonClick != null && (placement === 'left' || placement === 'right') && (
          <div
            role='button'
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onLeftEdgeButtonClick();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onLeftEdgeButtonClick();
              }
            }}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 flex flex-col items-center justify-center py-[12px] cursor-pointer hover:opacity-70 text-[var(--color-icon-base)] pointer-events-auto',
              'bg-[var(--color-background-default-base)]',
              placement === 'right' ? 'rounded-l-[8px] rounded-r-none pl-[2px] pr-[4px]' : 'rounded-r-[8px] rounded-l-none pl-[4px] pr-[2px]'
            )}
            style={{
              zIndex: 1,
              left: placement === 'right' ? -24 : undefined,
              right: placement === 'left' ? -24 : undefined,
              boxShadow: placement === 'right' ? '-4px 0 12px -2px rgba(0,0,0,0.1)' : '4px 0 12px -2px rgba(0,0,0,0.1)',
            }}
            aria-label={open ? 'Collapse panel' : 'Expand panel'}
          >
            <Icon
              name={open === (placement === 'right') ? 'base-arrow_right_icon' : 'base-arrow_left_icon'}
              width={24}
              height={24}
              className={placement === 'left' ? 'rotate-180' : ''}
            />
          </div>
        )}

        {(title || titleRender) && (
          <div className={cn('flex items-center justify-between border-b border-[var(--color-border-default-base)] px-6 py-4', titleClassName)}>
            {titleRender ? (
              titleRender
            ) : (
              <>
                <h3 className='text-lg font-semibold text-[var(--color-text-default-base)]'>{title}</h3>
                {closable && (
                  <button
                    type='button'
                    onClick={onClose}
                    className='ml-4 flex items-center justify-center rounded p-1 text-[var(--color-text-default-tertiary)] hover:bg-[var(--color-background-default-secondary)] hover:text-[var(--color-text-default-base)]'
                    aria-label='Close'
                  >
                    <Icon name='base-close-icon' width={16} height={16} />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* min-h-0: scrollable body in flex layout */}
        <div className={cn('flex-1 min-h-0 overflow-y-auto px-6 py-4', bodyClassName)}>{children}</div>

        {footer && (
          <div className={cn('border-t border-[var(--color-border-default-base)] px-6 py-4', footerClassName)}>
            {footer}
          </div>
        )}


      </div>
    </>
  );
  return createPortal(drawerContent, document.body);
};

Drawer.displayName = 'Drawer';

export default Drawer;

