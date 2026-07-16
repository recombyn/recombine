import type { ReactNode } from 'react';
import { BiExit } from 'react-icons/bi';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';

/** Shared size for style-panel icon toggles (stroke sides / align / cap / join). */
export const PANEL_ICON_BTN =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--muted)] transition-colors';

export const PANEL_ICON_BTN_ACTIVE =
  'bg-[var(--surface)] text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]';

export const PANEL_ICON_TRACK =
  'flex h-8 w-full items-center justify-center gap-0.5 rounded-[4px] bg-[var(--accent-soft)] p-0.5';

export const PANEL_ICON_SVG = 'h-3.5 w-3.5';

/**
 * Equal-sized icon toggle group — one active selection (align / cap / join).
 * All slots share the same square hit target so backgrounds never look mismatched.
 */
export function PanelSegmentedIcons<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ id: T; tip: string; Icon: (p: { className?: string }) => ReactNode }>;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cn(PANEL_ICON_TRACK, className)} role="group">
      {options.map(({ id, tip, Icon }) => {
        const active = value === id;
        return (
          <Tooltip key={id} title={tip} placement="top">
            <button
              type="button"
              aria-label={tip}
              aria-pressed={active}
              className={cn(
                PANEL_ICON_BTN,
                'flex-1',
                active && PANEL_ICON_BTN_ACTIVE,
                !active && 'hover:text-[var(--ink)]'
              )}
              onClick={() => onChange(id)}
            >
              <Icon className={PANEL_ICON_SVG} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Multi-select icon toggles (e.g. stroke T/R/B/L) — each can be on independently.
 * Same square sizing as PanelSegmentedIcons.
 */
export function PanelToggleIcons<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: Record<T, boolean>;
  options: Array<{ id: T; tip: string; Icon: (p: { className?: string }) => ReactNode }>;
  onChange: (next: Record<T, boolean>) => void;
  className?: string;
}) {
  return (
    <div className={cn(PANEL_ICON_TRACK, className)} role="group">
      {options.map(({ id, tip, Icon }) => {
        const active = Boolean(value[id]);
        return (
          <Tooltip key={id} title={tip} placement="top">
            <button
              type="button"
              aria-label={tip}
              aria-pressed={active}
              className={cn(
                PANEL_ICON_BTN,
                'flex-1',
                active && PANEL_ICON_BTN_ACTIVE,
                !active && 'hover:text-[var(--ink)]'
              )}
              onClick={() => onChange({ ...value, [id]: !active })}
            >
              <Icon className={PANEL_ICON_SVG} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Shared floating style panel chrome (fill / stroke / radius). */
export function StylePanelShell({
  title,
  onClose,
  children,
  className,
  bodyClassName,
  width,
  dataAttr,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  /** Override default body padding / scroll (e.g. fill panel). */
  bodyClassName?: string;
  width?: number;
  dataAttr?: string;
}) {
  const attrs = dataAttr ? { [dataAttr]: true } : {};
  return (
    <div
      {...attrs}
      className={cn(
        'overflow-hidden rounded-[4px] bg-[var(--surface)] shadow-[0_12px_40px_rgba(15,23,42,0.16)] ring-1 ring-[var(--line)]',
        className
      )}
      style={width ? { width } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex h-11 items-center justify-between px-3">
        <span className="text-[13px] font-medium text-[var(--ink)]">{title}</span>
        {onClose ? (
          <Tooltip title={'退出'} placement="bottom">
            <button
              type="button"
              aria-label={'退出'}
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            >
              <BiExit className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
        ) : null}
      </div>
      <div className={cn('space-y-1.5 p-2.5', bodyClassName)}>{children}</div>
    </div>
  );
}
