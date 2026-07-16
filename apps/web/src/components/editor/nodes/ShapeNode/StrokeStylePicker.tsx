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
import { SEL_ICON_BTN, SEL_ICON_BTN_ACTIVE } from '@/components/editor/Canvas/selection/ToolbarValueSlider';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export const STROKE_STYLES: StrokeStyle[] = ['solid', 'dashed', 'dotted'];

function dashFor(style: StrokeStyle) {
  if (style === 'dashed') return '5 3';
  if (style === 'dotted') return '1.5 2.5';
  return undefined;
}

export function StrokeStyleIcon({ style, active }: { style: StrokeStyle; active?: boolean }) {
  return (
    <svg viewBox="0 0 20 8" className="h-3.5 w-5 shrink-0" aria-hidden>
      <line
        x1="1"
        y1="4"
        x2="19"
        y2="4"
        stroke="currentColor"
        strokeWidth={active ? 1.8 : 1.5}
        strokeLinecap="round"
        strokeDasharray={dashFor(style)}
      />
    </svg>
  );
}

/** Compact stroke style picker: solid / dashed / dotted (toolbar icon). */
export default function StrokeStylePicker({
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
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  return (
    <>
      <Tooltip title={labels[current]} placement="top">
        <button
          type="button"
          ref={refs.setReference}
          aria-label={labels[current]}
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
            <DropdownPanel
              className="min-w-[132px]"
            >
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
                  <span>{labels[style]}</span>
                </DropdownPanelItem>
              ))}
            </DropdownPanel>
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}
