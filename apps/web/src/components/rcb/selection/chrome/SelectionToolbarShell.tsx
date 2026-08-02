import {
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  memo,
} from 'react';
import {
  RcbOverlayPortal,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '../../camera/context';
import { rcbScreenPxToScene } from '../../core/math';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import { cn } from '@/utils/classnames';

/** Interactive chrome controls inside canvas overlays (toolbars / generators / menus). */
const CHROME_ACTION_SEL =
  'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), [role="menuitem"]:not([aria-disabled="true"])';

function chromeActionFromEvent(
  target: EventTarget | null,
  root: EventTarget & HTMLElement
): HTMLElement | null {
  const el = (target as HTMLElement | null)?.closest?.(CHROME_ACTION_SEL) as HTMLElement | null;
  if (!el || !root.contains(el)) return null;
  return el;
}

/**
 * Same activation path as canvas node hits: pointer down/up.
 * `element.click()` runs existing onClick handlers; only the following real
 * click (after a synthetic activate) is suppressed — not every button click.
 */
export function useChromePointerActivate() {
  const armedRef = useRef<HTMLElement | null>(null);
  const suppressBrowserClickRef = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation?.();
    suppressBrowserClickRef.current = false;
    if (e.button !== 0) {
      armedRef.current = null;
      return;
    }
    armedRef.current = chromeActionFromEvent(e.target, e.currentTarget);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const armed = armedRef.current;
    armedRef.current = null;
    if (!armed || e.button !== 0) return;
    if (chromeActionFromEvent(e.target, e.currentTarget) !== armed) return;
    e.preventDefault();
    e.stopPropagation();
    suppressBrowserClickRef.current = true;
    armed.click();
  };

  const onPointerCancel = () => {
    armedRef.current = null;
    suppressBrowserClickRef.current = false;
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (!suppressBrowserClickRef.current) return;
    // Programmatic `.click()` is detail 0 — let it reach the button onClick.
    if (e.detail === 0) return;
    suppressBrowserClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return { onPointerDown, onPointerUp, onPointerCancel, onClickCapture };
}

/**
 * Title row above frame (must stay in sync with HtmlArtboardFrame).
 * Screen pixels — independent of zoom.
 */
export const NODE_TITLE_LABEL_GAP_PX = 6;
export const NODE_TITLE_LABEL_LINE_PX = 16;

/** Air between title top and toolbar bottom when docking above a titled node. */
export const SELECTION_TOOLBAR_ABOVE_LABEL_GAP_PX = 10;

/** Air between box edge and toolbar when there is no title row. */
export const SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX = 12;

/** Air between box bottom and toolbar top when docking below. */
export const SELECTION_TOOLBAR_BELOW_BOX_GAP_PX = 8;

export type SelectionToolbarBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Screen px from selection top → toolbar anchor (toolbar bottom when above). */
export function toolbarAboveClearancePx(hasTitleLabel: boolean) {
  if (!hasTitleLabel) return SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX;
  return (
    NODE_TITLE_LABEL_GAP_PX +
    NODE_TITLE_LABEL_LINE_PX +
    SELECTION_TOOLBAR_ABOVE_LABEL_GAP_PX
  );
}

/**
 * Shared world-space placement for selection / frame floating toolbars.
 * With `anchor: 'bottom'`, `top` is the bottom edge of the toolbar (clears titles).
 */
export function useSelectionToolbarPlacement(opts: {
  box: SelectionToolbarBox | null | undefined;
  /** Image / frame name+size row above the box. */
  hasTitleLabel?: boolean;
}): {
  style: CSSProperties;
  preferAbove: boolean;
  left: number;
  top: number;
} {
  const { zoom } = useRcbCamera();
  const hasTitle = Boolean(opts.hasTitleLabel);
  const aboveGap = rcbScreenPxToScene(toolbarAboveClearancePx(hasTitle), zoom);
  const belowGap = rcbScreenPxToScene(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX, zoom);
  const box = opts.box;
  const preferAbove = Boolean(box) && box.top >= aboveGap;
  const left = box ? box.left + box.width / 2 : 0;
  let top = 0;
  if (box) {
    top = preferAbove ? box.top - aboveGap : box.top + box.height + belowGap;
  }

  const style = useRcbScreenToolbarStyle({
    left,
    top,
    anchor: preferAbove ? 'bottom' : 'top',
  });

  return { style, preferAbove, left, top };
}

type ShellProps = {
  box: SelectionToolbarBox | null | undefined;
  hasTitleLabel?: boolean;
  children: ReactNode;
  className?: string;
  /** Mark as frame toolbar for hit-testing / dismiss selectors. */
  isFrameToolbar?: boolean;
  /** Transparent / unstyled inner (icon image tools). */
  bare?: boolean;
  zIndexClassName?: string;
};

/**
 * Portal + screen-fixed placement + chrome for selection toolbars.
 * Keeps Frame / Image / Shape bars aligned so titles are never covered.
 */
function SelectionToolbarShell({
  box,
  hasTitleLabel = false,
  children,
  className,
  isFrameToolbar = false,
  bare = false,
  zIndexClassName = 'z-30',
}: ShellProps) {
  const { style } = useSelectionToolbarPlacement({ box, hasTitleLabel });
  const chromePointer = useChromePointerActivate();
  if (!box) return null;

  return (
    <RcbOverlayPortal>
      <div
        data-sel-toolbar
        {...(isFrameToolbar ? { 'data-frame-toolbar': true } : {})}
        className={cn('pointer-events-auto absolute overflow-visible', zIndexClassName)}
        style={style}
        {...chromePointer}
      >
        <FloatingToolbar bare={bare} className={className}>
          {children}
        </FloatingToolbar>
      </div>
    </RcbOverlayPortal>
  );
}

const MemoizedSelectionToolbarShell = memo(SelectionToolbarShell);
export { MemoizedSelectionToolbarShell as SelectionToolbarShell };
