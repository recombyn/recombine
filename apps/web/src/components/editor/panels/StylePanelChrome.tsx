import type { ReactNode } from 'react';
import { BiExit } from 'react-icons/bi';
import Tooltip from '@/components/base/tooltip';
import {
  SEGMENTED_CHIP,
  SEGMENTED_CHIP_IDLE,
  SEGMENTED_TRACK,
} from '@/components/base/segmented';
import { FillVisibilityIcon } from '@/components/editor/nodes/ShapeNode/FillVisibilityIcon';
import { cn } from '@/utils/classnames';

/**
 * Full-width track — literally the same chrome as `SegmentedControl`.
 * Tooltip wrappers must be flex-1 so N slots split width evenly.
 */
export const PANEL_ICON_TRACK = cn(SEGMENTED_TRACK, 'flex w-full gap-0.5');

/** Equal-width slot wrapper (Tooltip trigger). */
export const PANEL_ICON_SLOT = 'min-w-0 flex-1 basis-0';

export const PANEL_ICON_SVG = 'h-3.5 w-3.5';

/** Shared size for style-panel icon toggles (stroke sides / align / cap / join). */
export const PANEL_ICON_BTN = cn(
  SEGMENTED_CHIP,
  'w-full min-w-0 text-[var(--muted)]'
);

export const PANEL_ICON_BTN_ACTIVE =
  'bg-[var(--surface)] text-[var(--ink)] shadow-sm';

/**
 * Equal-sized icon toggle group — one active selection (align / cap / join).
 * Slots share width evenly (3 → 1/3, 5 → 1/5).
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
          <Tooltip
            key={id}
            title={tip}
            placement="top"
            asChild={false}
            triggerClassName={PANEL_ICON_SLOT}
          >
            <button
              type="button"
              aria-label={tip}
              aria-pressed={active}
              className={cn(
                PANEL_ICON_BTN,
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
 * Same equal-width slots as PanelSegmentedIcons (5 with「全部」→ 1/5 each).
 */
export function PanelToggleIcons<T extends string>({
  value,
  options,
  onChange,
  className,
  /** Optional leading control (e.g. “All sides”) rendered before side toggles. */
  leading,
}: {
  value: Record<T, boolean>;
  options: Array<{ id: T; tip: string; Icon: (p: { className?: string }) => ReactNode }>;
  onChange: (next: Record<T, boolean>) => void;
  className?: string;
  leading?: {
    tip: string;
    Icon: (p: { className?: string }) => ReactNode;
    active: boolean;
    onClick: () => void;
  };
}) {
  const LeadIcon = leading?.Icon;
  return (
    <div className={cn(PANEL_ICON_TRACK, className)} role="group">
      {leading && LeadIcon ? (
        <Tooltip
          title={leading.tip}
          placement="top"
          asChild={false}
          triggerClassName={PANEL_ICON_SLOT}
        >
          <button
            type="button"
            aria-label={leading.tip}
            aria-pressed={leading.active}
            className={cn(
              PANEL_ICON_BTN,
              leading.active && PANEL_ICON_BTN_ACTIVE,
              !leading.active && 'hover:text-[var(--ink)]'
            )}
            onClick={leading.onClick}
          >
            <LeadIcon className={PANEL_ICON_SVG} />
          </button>
        </Tooltip>
      ) : null}
      {options.map(({ id, tip, Icon }) => {
        const active = Boolean(value[id]);
        return (
          <Tooltip
            key={id}
            title={tip}
            placement="top"
            asChild={false}
            triggerClassName={PANEL_ICON_SLOT}
          >
            <button
              type="button"
              aria-label={tip}
              aria-pressed={active}
              className={cn(
                PANEL_ICON_BTN,
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
  /** Layer visibility (eye) — fill / stroke hide toggles live in the panel header. */
  layerVisible,
  onLayerVisibleChange,
  layerVisibleTipShow = '显示',
  layerVisibleTipHide = '隐藏',
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  /** Override default body padding / scroll (e.g. fill panel). */
  bodyClassName?: string;
  width?: number;
  dataAttr?: string;
  layerVisible?: boolean;
  onLayerVisibleChange?: (visible: boolean) => void;
  layerVisibleTipShow?: string;
  layerVisibleTipHide?: string;
}) {
  const attrs = dataAttr ? { [dataAttr]: true } : {};
  const showLayerToggle = typeof layerVisible === 'boolean' && Boolean(onLayerVisibleChange);
  return (
    <div
      {...attrs}
      className={cn(
        'overflow-hidden rounded-xl bg-[var(--surface)] shadow-[0_12px_40px_rgba(15,23,42,0.16)] ring-1 ring-[var(--line)]',
        className
      )}
      style={width ? { width } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex h-11 items-center justify-between px-3">
        <span className="text-[13px] font-medium text-[var(--ink)]">{title}</span>
        <div className="flex items-center gap-0.5">
          {showLayerToggle ? (
            <Tooltip
              title={layerVisible ? layerVisibleTipHide : layerVisibleTipShow}
              placement="bottom"
            >
              <button
                type="button"
                aria-label={layerVisible ? layerVisibleTipHide : layerVisibleTipShow}
                aria-pressed={layerVisible}
                onClick={() => onLayerVisibleChange?.(!layerVisible)}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <FillVisibilityIcon visible={Boolean(layerVisible)} className="h-[18px] w-[18px]" />
              </button>
            </Tooltip>
          ) : null}
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
      </div>
      <div className={cn('space-y-1.5 p-2.5', bodyClassName)}>{children}</div>
    </div>
  );
}
