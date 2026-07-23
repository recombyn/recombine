import { useState } from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import { useTranslation } from 'react-i18next';
import Tooltip from '@/components/base/tooltip';
import { DropdownPanel, DropdownPanelItem } from '@/components/base';
import { cn } from '@/utils/classnames';
import {
  SEL_ICON_BTN,
  SEL_ICON_BTN_ACTIVE,
} from '@/components/rcb/selection/ToolbarValueSlider';
import {
  STROKE_STYLES,
  parseStrokeStyle,
  strokeDashPreview,
  type StrokeStyle,
} from '@/components/rcb/scene/sceneStrokeStyle';

export type { StrokeStyle };
export { STROKE_STYLES };

export function strokeStyleLabel(
  style: StrokeStyle,
  t: (key: string) => string
): string {
  const keys: Record<StrokeStyle, string> = {
    solid: 'editor.strokeSolid',
    dashed: 'editor.strokeDashed',
    dotted: 'editor.strokeDotted',
    'long-dash': 'editor.strokeLongDash',
    'short-dash': 'editor.strokeShortDash',
    'dash-dot': 'editor.strokeDashDot',
    'dash-dot-dot': 'editor.strokeDashDotDot',
    'dense-dot': 'editor.strokeDenseDot',
  };
  return t(keys[style]);
}

export function StrokeStyleIcon({
  style,
  active,
}: {
  style: StrokeStyle;
  active?: boolean;
}) {
  return (
    <svg viewBox="0 0 28 8" className="h-3.5 w-7 shrink-0" aria-hidden>
      <line
        x1="1"
        y1="4"
        x2="27"
        y2="4"
        stroke="currentColor"
        strokeWidth={active ? 1.8 : 1.5}
        strokeLinecap="round"
        strokeDasharray={strokeDashPreview(style)}
      />
    </svg>
  );
}

/** Compact stroke style picker: solid / dashed / dotted / … */
export default function StrokeStylePicker({
  value,
  onChange,
}: {
  value: StrokeStyle;
  onChange: (next: StrokeStyle) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = parseStrokeStyle(value);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  return (
    <>
      <Tooltip title={strokeStyleLabel(current, t)} placement="top">
        <button
          type="button"
          ref={refs.setReference}
          aria-label={strokeStyleLabel(current, t)}
          aria-expanded={open}
          className={cn(SEL_ICON_BTN, open && SEL_ICON_BTN_ACTIVE)}
          {...getReferenceProps({
            onClick: () => setOpen((v) => !v),
          })}
        >
          <StrokeStyleIcon style={current} active />
        </button>
      </Tooltip>

      <FloatingPortal>
        {open ? (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[80]"
            {...getFloatingProps()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <DropdownPanel className="min-w-[10.5rem]">
              {STROKE_STYLES.map((style) => (
                <DropdownPanelItem
                  key={style}
                  selected={current === style}
                  onClick={() => {
                    onChange(style);
                    setOpen(false);
                  }}
                >
                  <StrokeStyleIcon style={style} active={current === style} />
                  <span>{strokeStyleLabel(style, t)}</span>
                </DropdownPanelItem>
              ))}
            </DropdownPanel>
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}
