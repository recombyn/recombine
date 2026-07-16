import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/utils/classnames';
import type { FloatButtonPosition } from './index';

/**
 * FloatButtonBackTop Props
 */
export interface FloatButtonBackTopProps {
  /**
   * Custom icon; defaults to chevron-up.
   */
  icon?: React.ReactNode;
  /**
   * Fixed corner anchor.
   * @default 'bottomRight'
   */
  position?: FloatButtonPosition;
  /**
   * Offset from viewport edges in px `[x, y]`.
   * @default [24, 24]
   */
  offset?: [number, number];
  /**
   * Scrollable element (or `window`) used to read `scrollTop`.
   */
  target?: () => HTMLElement | Window;
  /**
   * Show the button after scrolling past this many pixels.
   * @default 400
   */
  visibilityHeight?: number;
  /**
   * Fires after scrolling to top.
   */
  onClick?: () => void;
  /**
   * Extra classes on the button.
   */
  className?: string;
  /**
   * Inline styles merged after positioning.
   */
  style?: React.CSSProperties;
  /**
   * Structured style slots.
   */
  styles?: {
    root?: React.CSSProperties;
  };
}

/**
 * Maps corner + offset to absolute positioning styles.
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
 * Reads vertical scroll offset for `window` or an element.
 */
const getScrollTop = (target: HTMLElement | Window): number => {
  if (target === window) {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
  }
  return (target as HTMLElement).scrollTop;
};

/**
 * Animates scroll position to zero over `duration` ms.
 */
const scrollToTop = (target: HTMLElement | Window, duration: number = 200) => {
  const start = getScrollTop(target);
  const startTime = performance.now();

  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // ease-in-out cubic
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const current = start * (1 - easeInOutCubic(progress));

    if (target === window) {
      window.scrollTo(0, current);
    } else {
      (target as HTMLElement).scrollTop = current;
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  requestAnimationFrame(animate);
};

/**
 * Appears after scrolling down; smooth-scrolls the target back to top.
 */
export const FloatButtonBackTop = ({
  icon,
  position = 'bottomRight',
  offset = [24, 24],
  target,
  visibilityHeight = 400,
  onClick,
  className,
  style,
  styles,
}: FloatButtonBackTopProps) => {
  const [visible, setVisible] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | Window | null>(null);

  useEffect(() => {
    const getContainer = () => {
      if (target) {
        return target();
      }
      return window;
    };

    scrollContainerRef.current = getContainer();
    const container = scrollContainerRef.current;

    const handleScroll = () => {
      const scrollTop = getScrollTop(container);
      setVisible(scrollTop > visibilityHeight);
    };

    handleScroll();

    if (container === window) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    } else {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (container === window) {
        window.removeEventListener('scroll', handleScroll);
      } else {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [target, visibilityHeight]);

  const handleClick = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    scrollToTop(container);
    onClick?.();
  }, [onClick]);

  const positionStyle = useMemo(
    () => getPositionStyle(position, offset),
    [position, offset]
  );

  // Default chevron-up icon
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
      >
        <path d='M18 15l-6-6-6 6' />
      </svg>
    );
  }, [icon]);

  if (!visible) return null;

  return (
    <button
      type='button'
      className={cn(
        'fixed z-50 flex items-center justify-center cursor-pointer shadow-lg hover:shadow-xl rounded-full',
        'bg-background-default-secondary border border-[var(--color-border-default-base)] text-text-default-base hover:bg-background-default-tertiary',
        'w-12 h-12',
        visible ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{
        ...positionStyle,
        ...styles?.root,
        ...style,
      }}
      onClick={handleClick}
      aria-label='Back to top'
    >
      {defaultIcon}
    </button>
  );
};

