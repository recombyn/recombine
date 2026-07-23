import type { ReactNode } from 'react';
import { BiExit } from 'react-icons/bi';
import { HiOutlineBolt } from 'react-icons/hi2';
import Slider from '@/components/base/slider';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';
import './imageToolPanel.css';

/** Compact panel actions — match preset chip height (常用角度 h-7). */
const panelBtn =
  'inline-flex h-7 flex-1 items-center justify-center rounded px-2 text-[12px] font-medium leading-none transition-colors';

/** Shared chrome for image tool panels docked beside the source image. */
export default function ImageToolPanelShell({
  title,
  headerRight,
  onClose,
  footer,
  className,
  children,
  width = 260,
}: {
  title: string;
  headerRight?: ReactNode;
  /** Exit (chat-style) — shown on the far right of the header. */
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded bg-[var(--surface)] text-left shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-[var(--line)]',
        className
      )}
      style={{ width }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation?.();
      }}
      data-image-tool-panel
    >
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3.5">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-[var(--ink)]">
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {headerRight}
          {onClose ? (
            <Tooltip title={'退出'} placement="top">
              <button
                type="button"
                aria-label={'退出'}
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <BiExit className="h-[18px] w-[18px]" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2">{children}</div>
      {footer ? <div className="flex items-center gap-1.5 px-4 pb-2.5 pt-0.5">{footer}</div> : null}
    </div>
  );
}

export function PanelIconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={title} placement="top">
      <button
        type="button"
        aria-label={title}
        onClick={onClick}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Credit cost chip on confirm (bolt + amount), for LLM-backed tools. */
export function PanelConfirmCost({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-white/55">
      <HiOutlineBolt className="h-3 w-3" aria-hidden />
      <span className="tabular-nums">{amount}</span>
    </span>
  );
}

export function PanelFooterActions({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  confirmBusy,
  confirmCost,
  confirmExtra,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmBusy?: boolean;
  /** When set, shows bolt + credit cost on the confirm button (LLM tools). */
  confirmCost?: number;
  confirmExtra?: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        className={cn(panelBtn, 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--accent-soft)]')}
        onClick={onCancel}
      >
        {'取消'}
      </button>
      <button
        type="button"
        disabled={confirmDisabled || confirmBusy}
        className={cn(
          panelBtn,
          'gap-1 bg-[var(--ink)] text-[var(--on-brand)] hover:opacity-90 disabled:bg-[var(--line)] disabled:text-[var(--muted)] disabled:opacity-80'
        )}
        onClick={onConfirm}
      >
        {confirmBusy ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : null}
        <span>{confirmLabel}</span>
        {typeof confirmCost === 'number' ? <PanelConfirmCost amount={confirmCost} /> : null}
        {confirmExtra}
      </button>
    </>
  );
}

export function PanelSliderRow({
  label,
  value,
  display,
  min = -100,
  max = 100,
  step = 1,
  onChange,
  fillFromZero,
}: {
  label: string;
  value: number;
  display?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  fillFromZero?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="w-10 shrink-0 text-left text-[12px] text-[var(--ink)]">{label}</span>
      <div className="relative min-w-0 flex-1 py-0.5">
        <Slider
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
          fillFromZero={fillFromZero}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-[var(--muted)]">
        {display ?? String(value)}
      </span>
    </div>
  );
}

export function PanelClickSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[idx] || options[0];
  return (
    <button
      type="button"
      className="inline-flex h-7 min-w-[4.5rem] items-center justify-center rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)]"
      onClick={() => {
        const next = options[(idx + 1) % options.length];
        if (next) onChange(next.value);
      }}
    >
      {current?.label}
    </button>
  );
}
