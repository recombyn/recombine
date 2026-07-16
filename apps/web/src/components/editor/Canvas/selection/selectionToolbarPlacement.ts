import { type CSSProperties } from 'react';
import {
  screenPxToWorld,
  useCamera,
  useScreenFixedToolbarStyle,
} from '@/components/editor/Canvas/stage/CameraContext';

/**
 * Title row above image / frame (must stay in sync with ImageNodeLabels + HtmlArtboardFrame).
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
  const { zoom } = useCamera();
  const hasTitle = Boolean(opts.hasTitleLabel);
  const aboveGap = screenPxToWorld(toolbarAboveClearancePx(hasTitle), zoom);
  const belowGap = screenPxToWorld(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX, zoom);
  const box = opts.box;

  const preferAbove = Boolean(box) && box!.top >= aboveGap;
  const left = box ? box.left + box.width / 2 : 0;
  const top = box
    ? preferAbove
      ? box.top - aboveGap
      : box.top + box.height + belowGap
    : 0;

  const style = useScreenFixedToolbarStyle({
    left,
    top,
    anchor: preferAbove ? 'bottom' : 'top',
  });

  return { style, preferAbove, left, top };
}
