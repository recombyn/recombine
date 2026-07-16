import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import {
  FRAME_PRESET_TABS,
  FRAME_RATIO_PRESETS,
  findFramePreset,
  presetsByCategory,
  type FramePresetCategory,
  type FrameSizePreset,
} from '@/components/editor/nodes/FrameNode/frameSizePresets';
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

type DeviceCategory = Exclude<FramePresetCategory, 'ratio'>;

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

function PresetList({
  list,
  activeKey,
  onPick,
  onClose,
}: {
  list: FrameSizePreset[];
  activeKey: string;
  onPick: (preset: FrameSizePreset) => void;
  onClose: () => void;
}) {
  return (
    <div role="listbox" className="max-h-[min(280px,45vh)] overflow-y-auto px-1 pb-1 pt-0.5">
      {list.map((p) => {
        const selected = activeKey === p.key;
        const sizeHint = p.width && p.height ? `${p.width} × ${p.height}` : '';
        return (
          <DropdownPanelItem
            key={p.key}
            role="option"
            selected={selected}
            onClick={() => {
              onPick(p);
              onClose();
            }}
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[var(--muted)]">
              <FramePresetIcon kind={p.icon} />
            </span>
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            {sizeHint ? (
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                {sizeHint}
              </span>
            ) : null}
          </DropdownPanelItem>
        );
      })}
    </div>
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
 * Device / paper / web size presets — tabs (fig.2 style) without 比例.
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
  const matched = findFramePreset(activeKey);
  const initialTab: DeviceCategory =
    matched?.category && matched.category !== 'ratio' ? matched.category : 'mobile';
  const [tab, setTab] = useState<DeviceCategory>(initialTab);

  useEffect(() => {
    if (!open) return;
    const cat = findFramePreset(activeKey)?.category;
    if (cat && cat !== 'ratio') setTab(cat);
  }, [open, activeKey]);

  const list = useMemo(() => presetsByCategory(tab), [tab]);

  return (
    <FramePresetMenuShell
      open={open}
      onOpenChange={onOpenChange}
      triggerClassName={triggerClassName}
      placement={placement}
      panelDataAttrs={panelDataAttrs}
      ariaLabel={'尺寸预设'}
      panel={
        <DropdownPanel className="w-[min(340px,calc(100vw-24px))] p-0 shadow-[0_12px_40px_rgba(15,23,42,0.18)]">
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto px-3 pt-2.5 pb-1">
            {FRAME_PRESET_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-[4px] px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                      : 'bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--ink)]'
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <PresetList
            list={list}
            activeKey={activeKey}
            onPick={onPick}
            onClose={() => onOpenChange(false)}
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
  return (
    <FramePresetMenuShell
      open={open}
      onOpenChange={onOpenChange}
      triggerClassName={triggerClassName}
      placement={placement}
      panelDataAttrs={panelDataAttrs}
      ariaLabel={'原始'}
      panel={
        <DropdownPanel className="w-[168px] p-1 shadow-[0_12px_40px_rgba(15,23,42,0.18)]">
          <PresetList
            list={FRAME_RATIO_PRESETS}
            activeKey={activeKey}
            onPick={onPick}
            onClose={() => onOpenChange(false)}
          />
        </DropdownPanel>
      }
    >
      {children}
    </FramePresetMenuShell>
  );
}
