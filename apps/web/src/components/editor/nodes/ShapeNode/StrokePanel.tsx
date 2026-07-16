import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from '@floating-ui/react';
import { HiOutlineChevronDown } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { COLOR_PANEL_WIDTH, ColorPanel, INPUT_NO_SPIN } from '@/components/base/colorPanel';
import Tooltip from '@/components/base/tooltip';
import {
  type StrokeStyle,
  StrokeStyleIcon,
  STROKE_STYLES,
} from '@/components/editor/nodes/ShapeNode/StrokeStylePicker';
import type {
  StrokeAlign,
  StrokeLinecap,
  StrokeLinejoin,
} from '@/store/scene/sceneEffects';
import {
  PanelSegmentedIcons,
  PanelToggleIcons,
  StylePanelShell,
} from '@/components/editor/panels/StylePanelChrome';
import {
  SEL_ICON_BTN,
  SEL_ICON_BTN_ACTIVE,
} from '@/components/editor/Canvas/selection/ToolbarValueSlider';
import { cn } from '@/utils/classnames';

export type StrokeSides = { T: boolean; R: boolean; B: boolean; L: boolean };
/** @deprecated Prefer CornerRadiiValue from CornerRadiusPanel — kept for stroke attrs bridge. */
export type StrokeCorners = { tl: number; tr: number; br: number; bl: number };

export type StrokePanelValue = {
  color: string;
  opacity: number;
  width: number;
  style: StrokeStyle;
  align?: StrokeAlign;
  linecap?: StrokeLinecap;
  linejoin?: StrokeLinejoin;
  /** Per-side visibility (rect-like only). */
  sides?: StrokeSides;
};

const DEFAULT_SIDES: StrokeSides = { T: true, R: true, B: true, L: true };

function StrokeWeightGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
      <rect x="2" y="7" width="12" height="2.5" rx="1" />
      <rect x="2" y="12" width="12" height="1" rx="0.5" />
    </svg>
  );
}

function IconStrokeAlignInside({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="3" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="5" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconStrokeAlignCenter({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function IconStrokeAlignOutside({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5" y="5" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="3" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconStrokeCapButt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="butt" />
      <path d="M3 5v6M13 5v6" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
    </svg>
  );
}

function IconStrokeCapRound({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 8h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconStrokeCapSquare({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}

function IconStrokeJoinMiter({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 13V5h8" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="butt" />
    </svg>
  );
}

function IconStrokeJoinRound({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 13V5h8" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="butt" />
    </svg>
  );
}

function IconStrokeJoinBevel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 13V7l2-2h6" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="bevel" strokeLinecap="butt" />
    </svg>
  );
}

function IconSideTop({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <path d="M3.5 4h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSideRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <path d="M12 3.5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSideBottom({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <path d="M3.5 12h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSideLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <path d="M4 3.5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Compact stroke-style dropdown field (not tabs). */
function StrokeStyleField({
  value,
  onChange,
}: {
  value: StrokeStyle;
  onChange: (next: StrokeStyle) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = STROKE_STYLES.includes(value) ? value : 'solid';
  const labels: Record<StrokeStyle, string> = {
    solid: t('editor.strokeSolid'),
    dashed: t('editor.strokeDashed'),
    dotted: t('editor.strokeDotted'),
  };

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        aria-label={labels[current]}
        aria-expanded={open}
        className="inline-flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded bg-[var(--accent-soft)] px-2 text-[12px] text-[var(--ink)] outline-none hover:bg-[var(--line)]"
        {...getReferenceProps({ onClick: () => setOpen((v) => !v) })}
      >
        <StrokeStyleIcon style={current} active />
        <span className="min-w-0 flex-1 truncate text-left">{labels[current]}</span>
        <HiOutlineChevronDown className="h-3 w-3 shrink-0 text-[var(--muted)]" />
      </button>

      <FloatingPortal>
        {open ? (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[90]"
            {...getFloatingProps()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              data-stroke-style-menu
              className="min-w-[132px] overflow-hidden rounded bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
            >
              {STROKE_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]',
                    current === style && 'bg-[var(--accent-soft)] font-medium'
                  )}
                  onClick={() => {
                    onChange(style);
                    setOpen(false);
                  }}
                >
                  <StrokeStyleIcon style={style} active={current === style} />
                  <span>{labels[style]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}

/**
 * Stroke editor panel: width · style · sides · align/cap/join · color.
 * Corner radius lives in CornerRadiusPanel (opened from the R toolbar control).
 */
export function StrokePanel({
  value,
  onChange,
  title = '描边',
  onClose,
  className,
  showLinecap = true,
  showSides = false,
}: {
  value: StrokePanelValue;
  onChange: (next: StrokePanelValue) => void;
  title?: string;
  onClose?: () => void;
  className?: string;
  /** Open paths only — caps have no effect on closed shapes. */
  showLinecap?: boolean;
  /** Rect-like only — independent T/R/B/L side strokes. */
  showSides?: boolean;
}) {
  const { t } = useTranslation();
  const patch = (partial: Partial<StrokePanelValue>) => onChange({ ...value, ...partial });
  const width = Math.max(0, Math.round(Number(value.width) || 0));
  const align: StrokeAlign = value.align === 'inside' || value.align === 'outside' ? value.align : 'center';
  const linecap: StrokeLinecap =
    value.linecap === 'round' || value.linecap === 'square' ? value.linecap : 'butt';
  const linejoin: StrokeLinejoin =
    value.linejoin === 'round' || value.linejoin === 'bevel' ? value.linejoin : 'miter';
  const sides = value.sides ?? DEFAULT_SIDES;

  return (
    <StylePanelShell
      title={title}
      onClose={onClose}
      width={COLOR_PANEL_WIDTH}
      dataAttr="data-stroke-panel"
      className={className}
    >
      <div className="flex w-full items-center justify-between gap-1.5">
        <label className="inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[4px] bg-[var(--accent-soft)] px-2 text-[12px] text-[var(--ink)]">
          <StrokeWeightGlyph className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <input
            type="number"
            min={0}
            max={40}
            value={width}
            onChange={(e) =>
              patch({ width: Math.max(0, Math.min(40, Math.round(Number(e.target.value) || 0))) })
            }
            className={cn(
              'min-w-0 flex-1 bg-transparent text-[12px] tabular-nums outline-none',
              INPUT_NO_SPIN
            )}
          />
          <span className="shrink-0 text-[11px] text-[var(--muted)]">px</span>
        </label>
        <StrokeStyleField value={value.style} onChange={(style) => patch({ style })} />
      </div>

      {showSides ? (
        <PanelToggleIcons
          value={sides}
          onChange={(next) => patch({ sides: next as StrokeSides })}
          options={[
            { id: 'T', tip: t('editor.strokeSideTop'), Icon: IconSideTop },
            { id: 'R', tip: t('editor.strokeSideRight'), Icon: IconSideRight },
            { id: 'B', tip: t('editor.strokeSideBottom'), Icon: IconSideBottom },
            { id: 'L', tip: t('editor.strokeSideLeft'), Icon: IconSideLeft },
          ]}
        />
      ) : null}

      {/* 图3：对齐 + 连接同一行；开放路径的线帽单独一行 */}
      {showLinecap ? (
        <PanelSegmentedIcons
          value={linecap}
          onChange={(next) => patch({ linecap: next })}
          options={[
            { id: 'butt', tip: t('editor.strokeCapButt'), Icon: IconStrokeCapButt },
            { id: 'round', tip: t('editor.strokeCapRound'), Icon: IconStrokeCapRound },
            { id: 'square', tip: t('editor.strokeCapSquare'), Icon: IconStrokeCapSquare },
          ]}
        />
      ) : null}
      <div className="flex w-full items-center gap-1">
        <PanelSegmentedIcons
          className="min-w-0 flex-1"
          value={align}
          onChange={(next) => patch({ align: next })}
          options={[
            { id: 'inside', tip: t('editor.strokeAlignInside'), Icon: IconStrokeAlignInside },
            { id: 'center', tip: t('editor.strokeAlignCenter'), Icon: IconStrokeAlignCenter },
            { id: 'outside', tip: t('editor.strokeAlignOutside'), Icon: IconStrokeAlignOutside },
          ]}
        />
        <PanelSegmentedIcons
          className="min-w-0 flex-1"
          value={linejoin}
          onChange={(next) => patch({ linejoin: next })}
          options={[
            { id: 'miter', tip: t('editor.strokeJoinMiter'), Icon: IconStrokeJoinMiter },
            { id: 'round', tip: t('editor.strokeJoinRound'), Icon: IconStrokeJoinRound },
            { id: 'bevel', tip: t('editor.strokeJoinBevel'), Icon: IconStrokeJoinBevel },
          ]}
        />
      </div>

      <ColorPanel
        value={value.color}
        opacity={value.opacity}
        showAlpha
        onChange={(color) => patch({ color })}
        onOpacityChange={(opacity) => patch({ opacity })}
        showHeader={false}
        padded={false}
        className="!w-full !shadow-none !ring-0"
      />
    </StylePanelShell>
  );
}

export type StrokePanelPopoverProps = {
  value: StrokePanelValue;
  onChange: (next: StrokePanelValue) => void;
  title?: string;
  placement?: Placement;
  disabled?: boolean;
  className?: string;
  children?: ReactNode | ((ctx: { open: boolean; value: StrokePanelValue }) => ReactNode);
};

/** Toolbar trigger → stroke panel (width / style / align / cap / join / color). */
export function StrokePanelPopover({
  value,
  onChange,
  title = '描边',
  placement = 'bottom-start',
  disabled = false,
  className,
  children,
}: StrokePanelPopoverProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({
        padding: 12,
        fallbackPlacements: ['top-start', 'top-end', 'right-start', 'left-start'],
      }),
      shift({ padding: 12 }),
    ],
  });
  const dismiss = useDismiss(context, {
    outsidePress: (event) => {
      const target = event.target as HTMLElement | null;
      // Nested style dropdown portals to body.
      if (target?.closest?.('[data-stroke-panel]')) return false;
      if (target?.closest?.('[data-stroke-style-menu]')) return false;
      if (target?.closest?.('[data-color-panel]')) return false;
      return true;
    },
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const setOpenSafe = useCallback(
    (next: boolean) => {
      if (!disabled) setOpen(next);
    },
    [disabled]
  );

  const trigger =
    typeof children === 'function'
      ? children({ open, value })
      : children ?? (
          <span className="relative inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--ink)] bg-transparent">
            <span
              aria-hidden
              className="absolute inset-[3px] rounded-full"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)',
                backgroundSize: '5px 5px',
                backgroundPosition: '0 0, 0 2.5px, 2.5px -2.5px, -2.5px 0',
              }}
            />
            <span
              className="absolute inset-[3px] rounded-full"
              style={{ background: value.color, opacity: value.opacity / 100 }}
            />
          </span>
        );

  return (
    <>
      <Tooltip title={title} placement="top" disabled={open || !title}>
        <button
          type="button"
          ref={refs.setReference}
          disabled={disabled}
          aria-label={title}
          aria-expanded={open}
          className={cn(SEL_ICON_BTN, open && SEL_ICON_BTN_ACTIVE, className)}
          {...getReferenceProps({
            onClick: () => setOpenSafe(!open),
          })}
        >
          {trigger}
        </button>
      </Tooltip>

      <FloatingPortal>
        {open ? (
          <div
            ref={refs.setFloating}
            style={floatingStyles as CSSProperties}
            className="z-[80]"
            {...getFloatingProps()}
          >
            <StrokePanel
              value={value}
              onChange={onChange}
              title={title}
              onClose={() => setOpen(false)}
            />
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}

export default StrokePanel;
