import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
import SizePresetPanel, {
  FRAME_RATIO_PRESETS,
  framePresetDisplayLabel,
  type FrameSizePreset,
} from '@/components/editor/chrome/SizePresetPanel';
import { DropdownPanel, DropdownPanelItem } from '@/components/base';
import { cn } from '@/utils/classnames';

export function FramePresetIcon({ kind, className }: { kind: string; className?: string }) {
  const base = cn('rounded-[2px] border border-current opacity-80', className);
  if (kind === 'square') return <span className={cn(base, 'h-3.5 w-3.5')} />;
  if (kind === 'portrait' || kind === 'phone') return <span className={cn(base, 'h-3.5 w-2.5')} />;
  if (kind === 'tall') return <span className={cn(base, 'h-3.5 w-2')} />;
  if (kind === 'landscape' || kind === 'web') return <span className={cn(base, 'h-2.5 w-3.5')} />;
  if (kind === 'wide') return <span className={cn(base, 'h-2 w-3.5')} />;
  if (kind === 'tablet') return <span className={cn(base, 'h-3 w-3.5')} />;
  return <span className={cn(base, 'h-3.5 w-3')} />;
}

type MenuShellProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  triggerClassName?: string;
  children: ReactNode;
  placement?: Placement;
  panelDataAttrs?: Record<string, string | boolean | undefined>;
  ariaLabel: string;
  panel: ReactNode;
};

function FramePresetMenuShell({
  open,
  onOpenChange,
  triggerClassName,
  children,
  placement = 'bottom-start',
  panelDataAttrs,
  ariaLabel,
  panel,
}: MenuShellProps) {
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

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        className={triggerClassName}
        aria-expanded={open}
        aria-label={ariaLabel}
        {...getReferenceProps({
          onClick: () => onOpenChange(!open),
        })}
      >
        {children}
      </button>
      <FloatingPortal>
        {open ? (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[90]"
            {...panelDataAttrs}
            {...getFloatingProps()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {panel}
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}

type DeviceMenuProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeKey: string;
  onPick: (preset: FrameSizePreset) => void;
  triggerClassName?: string;
  children?: ReactNode;
  placement?: Placement;
  panelDataAttrs?: Record<string, string | boolean | undefined>;
};

/**
 * Device / paper / web size presets — shared SizePresetPanel (same as chat).
 */
export default function FrameSizePresetMenu({
  open,
  onOpenChange,
  activeKey,
  onPick,
  triggerClassName,
  children,
  placement = 'bottom-start',
  panelDataAttrs,
}: DeviceMenuProps) {
  const { t } = useTranslation();
  return (
    <FramePresetMenuShell
      open={open}
      onOpenChange={onOpenChange}
      triggerClassName={triggerClassName}
      placement={placement}
      panelDataAttrs={panelDataAttrs}
      ariaLabel={t('editor.frameToolbar.sizePresets')}
      panel={
        <DropdownPanel className="w-max max-w-[calc(100vw-24px)] overflow-hidden p-0 shadow-[0_12px_40px_rgba(15,23,42,0.18)]">
          <SizePresetPanel
            activeKey={activeKey}
            onPick={(preset) => {
              onPick(preset);
              onOpenChange(false);
            }}
          />
        </DropdownPanel>
      }
    >
      {children}
    </FramePresetMenuShell>
  );
}

type RatioMenuProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeKey: string;
  onPick: (preset: FrameSizePreset) => void;
  triggerClassName?: string;
  children?: ReactNode;
  placement?: Placement;
  panelDataAttrs?: Record<string, string | boolean | undefined>;
};

/** Standalone ratio picker (not nested in device tabs). */
export function FrameRatioPresetMenu({
  open,
  onOpenChange,
  activeKey,
  onPick,
  triggerClassName,
  children,
  placement = 'bottom-start',
  panelDataAttrs,
}: RatioMenuProps) {
  const { t } = useTranslation();
  return (
    <FramePresetMenuShell
      open={open}
      onOpenChange={onOpenChange}
      triggerClassName={triggerClassName}
      placement={placement}
      panelDataAttrs={panelDataAttrs}
      ariaLabel={t('editor.frameToolbar.ratioPresets')}
      panel={
        <DropdownPanel className="w-[168px] p-1 shadow-[0_12px_40px_rgba(15,23,42,0.18)]">
          <div role="listbox" className="max-h-[min(280px,45vh)] overflow-y-auto">
            {FRAME_RATIO_PRESETS.map((p) => {
              const selected = activeKey === p.key;
              return (
                <DropdownPanelItem
                  key={p.key}
                  role="option"
                  selected={selected}
                  onClick={() => {
                    onPick(p);
                    onOpenChange(false);
                  }}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--muted)]">
                    <FramePresetIcon kind={p.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {framePresetDisplayLabel(p, t)}
                  </span>
                </DropdownPanelItem>
              );
            })}
          </div>
        </DropdownPanel>
      }
    >
      {children}
    </FramePresetMenuShell>
  );
}
