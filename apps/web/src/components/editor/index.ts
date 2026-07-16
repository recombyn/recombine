/**
 * Editor — component-first layout:
 *
 *   Canvas/     — board / stage / selection shell
 *   nodes/      — ImageNode | TextNode | ShapeNode | FrameNode (+ each node's toolbar)
 *   chrome/     — page HUD
 *   panels/     — Agent / Layers / Resources docks
 *
 * Shared hooks live in `@/hooks` (not under editor).
 */

export { default as EditorToolStrip } from './chrome/EditorToolStrip';
export { default as EditorBootOverlay } from './chrome/EditorBootOverlay';
export { layerIconByKind, LayerKindIcon } from './chrome/layerIcons';

export { default as AgentDock } from './panels/AgentDock';
export { default as LayerPanel } from './panels/LayerPanel';
export { default as ResourcesPanel } from './panels/ResourcesPanel';

export { default as SvgCanvas } from './Canvas/svg/SvgCanvas';
export { default as InfiniteCanvasStage, DEFAULT_CAMERA, zoomAtPoint } from './Canvas/stage/InfiniteCanvasStage';
export type { CanvasCamera } from './Canvas/stage/InfiniteCanvasStage';

export { default as HtmlArtboardFrame } from './nodes/FrameNode/HtmlArtboardFrame';
export { default as FrameDrawFeature } from './nodes/FrameNode/FrameDrawFeature';
export { default as FrameContextToolbar } from './nodes/FrameNode/FrameContextToolbar';
