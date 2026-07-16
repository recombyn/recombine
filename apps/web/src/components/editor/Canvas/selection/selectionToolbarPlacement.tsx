/**
 * Compat re-export: Vite HMR may still request this `.tsx` path after the
 * module was split into `.ts` + `SelectionToolbarShell.tsx`.
 */
export {
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
  SELECTION_TOOLBAR_ABOVE_LABEL_GAP_PX,
  SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX,
  SELECTION_TOOLBAR_BELOW_BOX_GAP_PX,
  toolbarAboveClearancePx,
  useSelectionToolbarPlacement,
} from './selectionToolbarPlacement';
export type { SelectionToolbarBox } from './selectionToolbarPlacement';
export { SelectionToolbarShell } from './SelectionToolbarShell';
