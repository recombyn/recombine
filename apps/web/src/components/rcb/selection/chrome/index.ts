/**
 * Selection overlays (roles → React modules):
 *
 * | Role | Module |
 * |---|---|
 * | Selection foreground (AABB + resize) | `../SelectionChrome` |
 * | Path indicator / path handles | `../HostPathChrome` |
 * | Brush (marquee) | `BrushOverlay` |
 * | Shape handles (radius / sides / star) | `*HandlesOverlay` |
 * | Toolbars / menus / title | `*Toolbar*` / `NodeTitleLabel` |
 *
 * Paint: world SVG via `WorldSvgFrame` / host twin — not CSS-scale alignment, not Canvas兜底.
 * Pointer engine + resize math stay in `selection/` (parent).
 */
export { default as MultiSelectionToolbar } from './MultiSelectionToolbar';
export { default as SelectionContextToolbar } from './SelectionContextToolbar';
export { default as CanvasContextMenu } from './CanvasContextMenu';
export { default as BlendModeControl } from './BlendModeControl';
export { default as AspectRatioPresetMenu } from './AspectRatioPresetMenu';
export { AspectPresetGlyph, ELEMENT_ASPECT_PRESETS } from './AspectRatioPresetMenu';
export {
  SelectionToolbarShell,
  useChromePointerActivate,
  SELECTION_TOOLBAR_BELOW_BOX_GAP_PX,
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
} from './SelectionToolbarShell';
export { default as NodeTitleLabel } from './NodeTitleLabel';
export { default as ToolbarMenuSelect } from './ToolbarMenuSelect';
export {
  SEL_ICON_BTN,
  SEL_ICON_BTN_ACTIVE,
  SEL_SIZE_INPUT,
  SEL_TOOL_BTN,
} from './ToolbarValueSlider';
export { FillColorSwatch, StrokeColorSwatch, IconCornerRadius } from './StyleToolbarIcons';
export { default as BrushOverlay } from './BrushOverlay';
export { default as CornerRadiusHandlesOverlay } from './CornerRadiusHandlesOverlay';
export { default as PolygonShapeHandlesOverlay } from './PolygonShapeHandlesOverlay';
export { default as StarShapeHandlesOverlay } from './StarShapeHandlesOverlay';
export { default as CircleShapeHandlesOverlay } from './CircleShapeHandlesOverlay';
