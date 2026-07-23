/**
 * @rcb — recombyn canvas component library
 *
 * Prefer `@/components/rcb` for UI / camera / tools / selection.
 * Scene domain (document model, fill, effects, SVG I/O) lives under
 * `@/components/rcb/scene/<module>` — not Redux (`store/modules`).
 *
 * Layout helpers (overlay / place APIs):
 * - `rcbAlignInBox(box, size, align, pad?)` — park a control in a box (center, corners, …)
 * - `rcbCenterInBox(box, size, pad?)` — shorthand for center
 * - `rcbCenterOnPoint(point, size)` — place a node centered on a pointer / drop point
 *
 * @example
 * ```tsx
 * import {
 *   RcbCanvas, RcbSvgDefs, RCB_DEFAULT_CAMERA,
 *   RcbShapeDraw, RcbSelection, RcbArtboardFrame,
 *   useRcbScreenToScene, rcbAlignInBox, rcbCenterOnPoint,
 * } from '@/components/rcb'
 * import { normalizeDocument } from '@/components/rcb/scene/sceneDocument'
 * ```
 */

export type { RcbBox, RcbCamera, RcbVec } from './core/types';
export { RCB_DEFAULT_CAMERA } from './core/types';
export {
  rcbClampZoom,
  rcbSceneToScreen,
  rcbScreenToScene,
  rcbScreenPxToScene,
  rcbZoomAtPoint,
  rcbFitCamera,
  rcbViewportSceneBounds,
} from './core/math';
export {
  rcbAlignInBox,
  rcbCenterInBox,
  rcbCenterOnPoint,
  type RcbAlign,
  type RcbBoxLike,
} from './core/layout';

export {
  RcbCameraContext,
  RcbOverlayRootContext,
  RcbViewportElContext,
  RcbDevicePixelRatioContext,
  useRcbCamera,
  useRcbOverlayRoot,
  useRcbViewportEl,
  useRcbDevicePixelRatio,
  useRcbDprMultiple,
  useRcbScreenToScene,
  useRcbScreenToolbarStyle,
  RcbOverlayPortal,
} from './camera/context';

export {
  nearestDprMultiple,
  toDomPrecision,
  snapCssToDevicePixel,
  isFractionalDpr,
  alignLengthToDpr,
  readDevicePixelRatio,
  subscribeDevicePixelRatio,
} from './core/dpr';

export { default as RcbCanvas, zoomAtPoint } from './canvas/RcbCanvas';
export type { RcbCanvasProps } from './canvas/RcbCanvas';
export { default as RcbSvgDefs } from './canvas/RcbSvgDefs';
export { default as RcbSceneOverlaySvg } from './canvas/RcbSceneOverlaySvg';
export { getSvgBoard, setSvgBoard, type SvgBoardHandle } from './canvas/svgBoardRegistry';
export { useSvgBoard } from './canvas/useSvgBoard';

// Per-shape paint hosts (runtime — not document store)
export { default as RcbShapesLayer } from './shapes/RcbShapesLayer';
export { default as RcbShapeHost } from './shapes/RcbShapeHost';
export {
  getShapeHost,
  listShapeHosts,
  registerShapeHost,
  unregisterShapeHost,
  setSharedNodeEls,
  getSharedNodeEls,
  replaceShapePaint,
  type ShapeHostHandle,
} from './shapes/shapeHostRegistry';

// Tools
export { default as RcbShapeDraw } from './tools/ShapeDrawFeature';
export { default as ShapeDrawFeature } from './tools/ShapeDrawFeature';
export type { ShapeDrawCommit } from './tools/ShapeDrawFeature';
export { default as RcbPenDraw } from './tools/PenDrawFeature';
export { default as PenDrawFeature } from './tools/PenDrawFeature';
export { default as PenPathEditFeature } from './tools/PenPathEditFeature';
export { default as RcbPencilDraw } from './tools/PencilDrawFeature';
export { default as PencilDrawFeature } from './tools/PencilDrawFeature';
export type { PencilEraseTarget, PencilEraseStroke } from './tools/PencilDrawFeature';
export { default as RcbBucketFill } from './tools/BucketFillFeature';
export { default as BucketFillFeature } from './tools/BucketFillFeature';
export { default as RcbTextPlace } from './tools/TextPlaceFeature';
export { default as TextPlaceFeature } from './tools/TextPlaceFeature';
export { default as RcbImagePlace } from './tools/ImagePlaceFeature';
export { default as ImagePlaceFeature } from './tools/ImagePlaceFeature';
export * from './tools/penPath';
export * from './tools/pencilBrushes';
export * from './tools/pencilErase';
export { STAMP_TINT_READY_EVENT, getTintedStampSrc } from './tools/stampTint';

// Selection
export { default as RcbSelection } from './selection/SelectionFeature';
export { default as SelectionFeature } from './selection/SelectionFeature';
export { default as SelectionChrome } from './selection/SelectionChrome';
export { default as SelectionContextToolbar } from './selection/SelectionContextToolbar';
export { default as MultiSelectionToolbar } from './selection/MultiSelectionToolbar';
export { default as CanvasContextMenu } from './selection/CanvasContextMenu';
export {
  resizeFromHandle,
  rotateBoxesAround,
  scaleBoxesToUnion,
  unionOfBoxes,
  type ResizeHandle,
} from './selection/resizeGeometry';
export * from './selection/alignGuides';
export * from './selection/shapeBoolean';
export * from './selection/rotateCornerCursor';
export * from './selection/SelectionToolbarShell';

// Frames
export { default as RcbArtboardFrame } from './frames/HtmlArtboardFrame';
export { default as HtmlArtboardFrame } from './frames/HtmlArtboardFrame';
export { default as RcbFrameDraw } from './frames/FrameDrawFeature';
export { default as FrameDrawFeature } from './frames/FrameDrawFeature';
export { default as RcbFrameMove } from './frames/FrameMoveFeature';
export { default as FrameMoveFeature } from './frames/FrameMoveFeature';
export type { ArtboardFrame } from './frames/types';
