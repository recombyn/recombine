import type { OffsetOptions, Placement } from '@floating-ui/react';
import {
  FloatingPortal,
  useFloating,
  useInteractions,
  useHover,
  useClick,
  useDismiss,
  offset,
  autoUpdate,
  flip,
  shift,
} from '@floating-ui/react';
import type { FC, ReactNode } from 'react';
import { useBoolean } from 'ahooks';
import * as React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/utils/classnames';
import { tooltipManager } from './TooltipManager';

export type TooltipProps = {
  /** Preferred content prop (alias of title). */
  tip?: ReactNode;
  /** @deprecated Prefer `tip`. */
  title?: ReactNode;
  placement?: Placement;
  trigger?: 'hover' | 'click';
  disabled?: boolean;
  triggerClassName?: string;
  popupClassName?: string;
  offset?: OffsetOptions;
  /** Hover: delay before close when pointer leaves */
  needsDelay?: boolean;
  /** Inline-block wrapper when true */
  asChild?: boolean;
  children: ReactNode;
};

const Tooltip: FC<TooltipProps> = ({
  placement = 'top',
  trigger = 'hover',
  disabled = false,
  tip,
  title,
  children,
  triggerClassName,
  popupClassName,
  offset: offsetValue = 8,
  asChild = true,
  needsDelay = true,
}) => {
  const [open, setOpen] = React.useState(false);
  const content = tip ?? title;

  const [isHoverPopup, { setTrue: setHoverPopup, setFalse: setNotHoverPopup }] = useBoolean(false);
  const isHoverPopupRef = useRef(isHoverPopup);
  useEffect(() => {
    isHoverPopupRef.current = isHoverPopup;
  }, [isHoverPopup]);

  const [isHoverTrigger, { setTrue: setHoverTrigger, setFalse: setNotHoverTrigger }] = useBoolean(false);
  const isHoverTriggerRef = useRef(isHoverTrigger);
  useEffect(() => {
    isHoverTriggerRef.current = isHoverTrigger;
  }, [isHoverTrigger]);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, [clearCloseTimeout]);

  const close = useCallback(() => setOpen(false), []);

  const handleLeave = useCallback(
    (isTrigger: boolean) => {
      if (isTrigger) setNotHoverTrigger();
      else setNotHoverPopup();

      // give time to move to the popup
      if (needsDelay) {
        clearCloseTimeout();
        closeTimeoutRef.current = setTimeout(() => {
          closeTimeoutRef.current = null;
          if (!isHoverPopupRef.current && !isHoverTriggerRef.current) {
            setOpen(false);
            tooltipManager.clear(close);
          }
        }, 300);
      } else {
        clearCloseTimeout();
        setOpen(false);
        tooltipManager.clear(close);
      }
    },
    [needsDelay, clearCloseTimeout, close, setNotHoverTrigger, setNotHoverPopup]
  );

  let computedOffset: OffsetOptions;
  if (typeof offsetValue === 'number') {
    computedOffset = offsetValue + 4;
  } else if (typeof offsetValue === 'object' && offsetValue !== null) {
    computedOffset = {
      mainAxis: ((offsetValue as { mainAxis?: number }).mainAxis ?? 8) + 4,
      crossAxis: (offsetValue as { crossAxis?: number }).crossAxis,
    };
  } else {
    computedOffset = 12;
  }

  const { refs, floatingStyles, context } = useFloating({
    open: disabled ? false : open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(computedOffset), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, {
    enabled: trigger === 'hover' && !disabled,
  });

  const click = useClick(context, {
    enabled: trigger === 'click' && !disabled,
  });

  const dismiss = useDismiss(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, click, dismiss]);

  const handleMouseEnter = useCallback(() => {
    if (trigger === 'hover' && !disabled) {
      clearCloseTimeout();
      setHoverTrigger();
      tooltipManager.register(close);
      setOpen(true);
    }
  }, [trigger, disabled, clearCloseTimeout, setHoverTrigger, close]);

  const handleMouseLeave = useCallback(() => {
    if (trigger === 'hover') {
      handleLeave(true);
    }
  }, [trigger, handleLeave]);

  const handleClick = useCallback(() => {
    if (trigger === 'click' && !disabled) {
      setOpen((v) => !v);
    }
  }, [trigger, disabled]);

  const handlePopupMouseEnter = useCallback(() => {
    if (trigger === 'hover') {
      clearCloseTimeout();
      setHoverPopup();
    }
  }, [trigger, clearCloseTimeout, setHoverPopup]);

  const handlePopupMouseLeave = useCallback(() => {
    if (trigger === 'hover') {
      handleLeave(false);
    }
  }, [trigger, handleLeave]);

  if (!content) {
    return <>{children}</>;
  }

  const triggerElement = (
    <div
      {...getReferenceProps()}
      ref={refs.setReference}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={triggerClassName}
      style={asChild ? { display: 'inline-block' } : undefined}
    >
      {children}
    </div>
  );

  return (
    <>
      {triggerElement}
      {!disabled && open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[1000]"
            onMouseEnter={handlePopupMouseEnter}
            onMouseLeave={handlePopupMouseLeave}
          >
            <div
              className={cn(
                'relative flex h-[26px] w-auto items-center justify-center whitespace-nowrap rounded-xl bg-[#2C2C2C] px-2.5 text-[12px] leading-none text-white shadow-[0_2px_8px_rgba(31,35,41,0.16)]',
                popupClassName
              )}
            >
              {content}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
};

export default React.memo(Tooltip);
