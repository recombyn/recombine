import { type ReactNode } from 'react';
import { CameraOverlayPortal } from '@/components/editor/Canvas/stage/CameraContext';
import {
  useSelectionToolbarPlacement,
  type SelectionToolbarBox,
} from '@/components/editor/Canvas/selection/selectionToolbarPlacement';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import { cn } from '@/utils/classnames';

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
export function SelectionToolbarShell({
  box,
  hasTitleLabel = false,
  children,
  className,
  isFrameToolbar = false,
  bare = false,
  zIndexClassName = 'z-30',
}: ShellProps) {
  const { style } = useSelectionToolbarPlacement({ box, hasTitleLabel });
  if (!box) return null;

  return (
    <CameraOverlayPortal>
      <div
        data-sel-toolbar
        {...(isFrameToolbar ? { 'data-frame-toolbar': true } : {})}
        className={cn('pointer-events-auto absolute overflow-visible', zIndexClassName)}
        style={style}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation?.();
        }}
      >
        <FloatingToolbar bare={bare} className={className}>
          {children}
        </FloatingToolbar>
      </div>
    </CameraOverlayPortal>
  );
}

export {
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
  SELECTION_TOOLBAR_ABOVE_LABEL_GAP_PX,
  SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX,
  SELECTION_TOOLBAR_BELOW_BOX_GAP_PX,
  toolbarAboveClearancePx,
  useSelectionToolbarPlacement,
} from '@/components/editor/Canvas/selection/selectionToolbarPlacement';
export type { SelectionToolbarBox } from '@/components/editor/Canvas/selection/selectionToolbarPlacement';
