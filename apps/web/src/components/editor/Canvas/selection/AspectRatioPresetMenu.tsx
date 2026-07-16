import { useMemo, type ReactNode } from 'react';
import { HiOutlineChevronDown } from 'react-icons/hi2';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from '@floating-ui/react';
import { DropdownPanel, DropdownPanelItem } from '@/components/base';
import { cn } from '@/utils/classnames';

export const ELEMENT_ASPECT_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'original', label: '原始', w: 0, h: 0 },
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: string;
  onPick: (preset: (typeof ELEMENT_ASPECT_PRESETS)[number]) => void;
  triggerClassName?: string;
  placement?: Placement;
  /** Compact trigger for inline toolbars (fig.2 crop bar style). */
  variant?: 'inline' | 'icon';
};

/**
 * Preset aspect ratio dropdown (fig.2): original + common ratios with shape icons.
 */
export default function AspectRatioPresetMenu({
  open,
  onOpenChange,
  activeId,
  onPick,
  triggerClassName,
  placement = 'bottom-start',
  variant = 'inline',
}: Props): ReactNode {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const label = useMemo(
    () => ELEMENT_ASPECT_PRESETS.find((p) => p.id === activeId)?.label || '原始',
    [activeId]
  );

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        aria-expanded={open}
        aria-label={'比例预设'}
        className={cn(
          variant === 'inline'
            ? 'inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2 text-[12px] font-medium text-[var(--ink)] transition hover:bg-[var(--accent-soft)]'
            : 'inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)]',
          open && 'bg-[var(--accent-soft)]',
          triggerClassName
        )}
        {...getReferenceProps({ onClick: () => onOpenChange(!open) })}
      >
        <span
          className="inline-block h-3 w-3.5 shrink-0 rounded-[2px] border border-dashed border-[var(--muted)]"
          aria-hidden
        />
        {variant === 'inline' ? (
          <>
            <span className="max-w-[5rem] truncate">{label}</span>
            <HiOutlineChevronDown className="h-3 w-3 shrink-0 text-[var(--muted)]" />
          </>
        ) : null}
      </button>
      <FloatingPortal>
        {open ? (
          <DropdownPanel
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[90] min-w-[168px]"
            data-sel-toolbar
            {...getFloatingProps({
              onPointerDown: (e) => e.stopPropagation(),
            })}
          >
            {ELEMENT_ASPECT_PRESETS.map((p) => {
              const selected = activeId === p.id;
              const iconW =
                p.id === 'original'
                  ? 12
                  : Math.max(6, Math.round((p.w / Math.max(p.w, p.h)) * 12));
              const iconH =
                p.id === 'original'
                  ? 12
                  : Math.max(6, Math.round((p.h / Math.max(p.w, p.h)) * 12));
              return (
                <DropdownPanelItem
                  key={p.id}
                  selected={selected}
                  onClick={() => {
                    onPick(p);
                    onOpenChange(false);
                  }}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--muted)]">
                    <span
                      className="inline-block shrink-0 rounded-[2px] border border-current opacity-80"
                      style={{ width: iconW, height: iconH }}
                      aria-hidden
                    />
                  </span>
                  {p.label}
                </DropdownPanelItem>
              );
            })}
          </DropdownPanel>
        ) : null}
      </FloatingPortal>
    </>
  );
}
