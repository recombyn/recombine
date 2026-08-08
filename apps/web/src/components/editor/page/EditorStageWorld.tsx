import {
  memo,
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useDispatch } from 'react-redux';
import {
  RcbCanvas,
  RcbSvgDefs,
  FrameDrawFeature,
  FrameMoveFeature,
  HtmlArtboardFrame,
  type RcbCamera as CanvasCamera,
} from '@/components/rcb';
import SvgCanvas from '@/components/editor/canvas/SvgCanvas';
import ImageProcessWatcher from '@/components/editor/nodes/ImageNode/ImageProcessWatcher';
import CropExpandSessionHost from '@/components/editor/nodes/ImageNode/cropExpand/CropExpandSessionHost';
import ImageToolPanelHost from '@/components/editor/nodes/ImageNode/toolPanels/ImageToolPanelHost';
import ShapeStylePanelHost from '@/components/editor/nodes/ShapeNode/ShapeStylePanelHost';
import VideoTrimSessionHost from '@/components/editor/nodes/VideoNode/VideoTrimSessionHost';
import AudioTrimSessionHost from '@/components/editor/nodes/AudioNode/AudioTrimSessionHost';
import AudioSpeedSessionHost from '@/components/editor/nodes/AudioNode/AudioSpeedSessionHost';
import MeshHandlesOverlay from '@/components/editor/nodes/ShapeNode/MeshHandlesOverlay';
import FrameContextToolbar from '@/components/editor/nodes/FrameNode/FrameContextToolbar';
import type { ArtboardFrame } from '@/components/rcb/frames/types';
import type { FillPanelValue } from '@/components/editor/panels/FillPanel';
import { stackZIndex } from '@/components/rcb/scene/document/sceneDocument';
import {
  parseFillGradient,
  serializeFillGradient,
  type FillGradient,
} from '@/components/rcb/scene/document/sceneFill';
import {
  addArtboardFrame,
  renameArtboardFrame,
  setActiveFrameId,
  setActiveTool,
  setCanvasMeta,
  setMixedSelection,
  setSelectedNodeIds,
  updateArtboardFrame,
  pushEditorHistory,
} from '@/store/modules/editor';
import { snapBoxToGrid } from '@/components/rcb/selection/alignGuides';
import { canvasFillToDocumentMeta } from './EditorBottomHud';

const EDITOR_PAN_BLOCK_SELECTOR = [
  '[data-scene-node-id]',
  '[data-sel-box]',
  '[data-sel-handle]',
  '[data-frame-label]',
  '[data-image-label]',
  '[data-frame-toolbar]',
  '[data-sel-toolbar]',
  '[data-ctx-menu]',
  '[data-crop-expand-overlay]',
  '[data-crop-expand-toolbar]',
  '[data-image-tool-panel]',
  '[data-gradient-handles]',
  '[data-mesh-handles]',
  '[data-shape-style-panel]',
  '[data-video-playback-bar]',
  '[data-video-trim-toolbar]',
  '[data-audio-playback-bar]',
  '[data-audio-trim-toolbar]',
  '[data-audio-speed-toolbar]',
].join(',');

function isEditableFocusTarget(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || Boolean(el.isContentEditable)
  );
}

/** Blur stage inputs when pointer lands on the canvas chrome (not the field itself). */
function blurStageEditableOnPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
  const active = window.document.activeElement as HTMLElement | null;
  if (
    !active ||
    active === e.currentTarget ||
    !e.currentTarget.contains(active) ||
    !isEditableFocusTarget(active)
  ) {
    return;
  }
  active.blur();
}

function canvasDiffuseMeshGradient(
  fill: FillPanelValue
): FillGradient & { type: 'diffuse' } {
  return {
    ...parseFillGradient(fill.fillGradient, 'diffuse', fill.fillColor),
    type: 'diffuse',
  };
}

/** Per-frame label handlers — undefined in inspect/dev so chrome stays inert. */
function frameLabelInteractionProps(
  frameId: string,
  isDevMode: boolean,
  handlers: {
    onSelectFrame: (id: string) => void;
    onRenameFrame: (id: string, name: string) => void;
    onMoveFrame: (
      id: string,
      x: number,
      y: number,
      opts?: { skipGrid?: boolean }
    ) => void;
    onFrameMoveStart: (id: string) => void;
    onFrameMoveEnd: () => void;
  }
) {
  if (isDevMode) {
    return {
      onSelect: undefined as undefined,
      onRename: undefined as undefined,
      onMove: undefined as undefined,
      onMoveStart: undefined as undefined,
      onMoveEnd: undefined as undefined,
    };
  }
  return {
    onSelect: () => handlers.onSelectFrame(frameId),
    onRename: (name: string) => handlers.onRenameFrame(frameId, name),
    onMove: (x: number, y: number, opts?: { skipGrid?: boolean }) =>
      handlers.onMoveFrame(frameId, x, y, opts),
    onMoveStart: () => handlers.onFrameMoveStart(frameId),
    onMoveEnd: handlers.onFrameMoveEnd,
  };
}

type Props = {
  document: any;
  worldBounds: { x: number; y: number; width: number; height: number };
  worldSurface: { x: number; y: number; width: number; height: number };
  camera: CanvasCamera;
  onCameraChange: (camera: CanvasCamera) => void;
  panMode: boolean;
  frameMode: boolean;
  stageBackground?: string;
  stageRef: RefObject<HTMLDivElement | null>;
  onViewportEl: (el: HTMLElement | null) => void;
  stageEl: HTMLElement | null;
  canvasCursor?: string;
  gridSize: number;
  isDevMode: boolean;
  isMobileViewport: boolean;
  activeTool: string;
  canvasDocument: any;
  sceneReloadToken: number;
  documentPatchToken: number;
  lastPatchedNodeIds: string[];
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedFrameIds: string[];
  frames: ArtboardFrame[];
  selectedFrames: ArtboardFrame[];
  activeFrame: ArtboardFrame | null;
  canvasFillValue: FillPanelValue;
  canvasBgOpen: boolean;
  canvasMeshSelectedIndex: number;
  setCanvasMeshSelectedIndex: (v: number) => void;
  canvasMeshShowGuides: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCanvasReady: () => void;
  onOpenAgent: (opts?: { prompt?: string }) => void;
  onAddToChat: (target: string | string[]) => void;
};

/** Infinite canvas world: artboards, SvgCanvas, frame draw/move, style hosts. */
function EditorStageWorld({
  document,
  worldBounds,
  worldSurface,
  camera,
  onCameraChange,
  panMode,
  frameMode,
  stageBackground,
  stageRef,
  onViewportEl,
  stageEl,
  canvasCursor,
  gridSize,
  isDevMode,
  isMobileViewport,
  activeTool,
  canvasDocument,
  sceneReloadToken,
  documentPatchToken,
  lastPatchedNodeIds,
  selectedNodeId,
  selectedNodeIds,
  selectedFrameIds,
  frames,
  selectedFrames,
  activeFrame,
  canvasFillValue,
  canvasBgOpen,
  canvasMeshSelectedIndex,
  setCanvasMeshSelectedIndex,
  canvasMeshShowGuides,
  onZoomIn,
  onZoomOut,
  onCanvasReady,
  onOpenAgent,
  onAddToChat,
}: Props) {
  const dispatch = useDispatch();
  const [movingFrameId, setMovingFrameId] = useState<string | null>(null);

  const onCommitFrame = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      dispatch(addArtboardFrame(rect));
      dispatch(setActiveTool('select'));
      dispatch(setSelectedNodeIds([]));
    },
    [dispatch]
  );

  const onMoveFrame = useCallback(
    (id: string, x: number, y: number, opts?: { skipGrid?: boolean }) => {
      const frame = frames.find((f) => f.id === id);
      if (!frame) return;
      let moving = {
        left: x,
        top: y,
        width: Math.max(1, Number(frame.width) || 1),
        height: Math.max(1, Number(frame.height) || 1),
      };
      if (!opts?.skipGrid) moving = snapBoxToGrid(moving, gridSize);
      dispatch(
        updateArtboardFrame({
          id,
          patch: {
            x: Math.round(moving.left),
            y: Math.round(moving.top),
          },
          skipHistory: true,
        })
      );
    },
    [dispatch, frames, gridSize]
  );

  const onFrameMoveStart = useCallback(
    (frameId: string) => {
      setMovingFrameId(frameId);
      dispatch(pushEditorHistory());
    },
    [dispatch]
  );

  const onFrameMoveEnd = useCallback(() => {
    setMovingFrameId(null);
  }, []);

  const onSelectFrame = useCallback(
    (id: string) => {
      dispatch(setActiveFrameId(id));
    },
    [dispatch]
  );

  const onClearCanvasSelection = useCallback(() => {
    dispatch(setMixedSelection({ nodeIds: [], frameIds: [] }));
  }, [dispatch]);

  const onRenameFrame = useCallback(
    (id: string, name: string) => {
      dispatch(renameArtboardFrame({ id, name }));
    },
    [dispatch]
  );

  const onCanvasDiffuseMeshChange = useCallback(
    (next: FillGradient) => {
      dispatch(
        setCanvasMeta(
          canvasFillToDocumentMeta(
            {
              ...canvasFillValue,
              fillType: 'diffuse',
              fillGradient: serializeFillGradient(next),
              fillColor: next.meshPoints?.[0]?.color || canvasFillValue.fillColor,
            },
            false
          )
        )
      );
    },
    [canvasFillValue, dispatch]
  );

  if (isMobileViewport || !document) return null;

  const showCanvasDiffuseMesh =
    canvasBgOpen && canvasFillValue.fillType === 'diffuse';
  const showFrameToolbar =
    !isDevMode &&
    selectedFrames.length >= 1 &&
    selectedNodeIds.length === 0 &&
    Boolean(activeFrame) &&
    movingFrameId !== activeFrame?.id;

  return (
    <div
      className="relative min-h-0 flex-1"
      onPointerDown={blurStageEditableOnPointerDown}
    >
      <RcbCanvas
        artboard={worldBounds}
        camera={camera}
        onCameraChange={onCameraChange}
        panMode={panMode}
        emptyDragPans={false}
        panBlockSelector={EDITOR_PAN_BLOCK_SELECTOR}
        background={stageBackground}
        stageRef={stageRef}
        onViewportEl={onViewportEl}
        cursor={canvasCursor}
        defs={<RcbSvgDefs />}
        gridSize={gridSize}
      >
        {frames.map((frame) =>
          frame.hidden ? null : (
            <HtmlArtboardFrame
              key={`body-${frame.id}`}
              frame={frame}
              zIndex={stackZIndex(document, 'frame', frame.id)}
              selected={!isDevMode && selectedFrameIds.includes(frame.id)}
              layer="body"
            />
          )
        )}

        <SvgCanvas
          document={canvasDocument}
          reloadToken={sceneReloadToken}
          documentPatchToken={documentPatchToken}
          lastPatchedNodeIds={lastPatchedNodeIds}
          selectedNodeId={selectedNodeId}
          selectedNodeIds={selectedNodeIds}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onReady={onCanvasReady}
          embedded
          stageEl={stageEl}
          onOpenAgent={onOpenAgent}
          onAddToChat={onAddToChat}
        />

        <ImageProcessWatcher />
        <ImageToolPanelHost document={document} />
        <ShapeStylePanelHost document={document} />
        <CropExpandSessionHost document={document} />
        <VideoTrimSessionHost document={document} />
        <AudioTrimSessionHost document={document} />
        <AudioSpeedSessionHost document={document} />

        {showCanvasDiffuseMesh ? (
          <MeshHandlesOverlay
            box={{
              left: 0,
              top: 0,
              width: worldSurface.width,
              height: worldSurface.height,
            }}
            gradient={canvasDiffuseMeshGradient(canvasFillValue)}
            selectedIndex={canvasMeshSelectedIndex}
            showGuides={canvasMeshShowGuides}
            onActivePointChange={setCanvasMeshSelectedIndex}
            onChange={onCanvasDiffuseMeshChange}
          />
        ) : null}

        {frames.map((frame) =>
          frame.hidden ? null : (
            <HtmlArtboardFrame
              key={`label-${frame.id}`}
              frame={frame}
              selected={!isDevMode && selectedFrameIds.includes(frame.id)}
              hideTitle={isDevMode || movingFrameId === frame.id}
              {...frameLabelInteractionProps(frame.id, isDevMode, {
                onSelectFrame,
                onRenameFrame,
                onMoveFrame,
                onFrameMoveStart,
                onFrameMoveEnd,
              })}
              layer="label"
            />
          )
        )}

        {showFrameToolbar && activeFrame ? (
          <FrameContextToolbar frame={activeFrame} />
        ) : null}

        <FrameMoveFeature
          enabled={!isDevMode && activeTool === 'select' && !panMode}
          frames={frames}
          camera={camera}
          stageEl={stageEl}
          onClearSelection={onClearCanvasSelection}
        />

        <FrameDrawFeature
          enabled={!isDevMode && frameMode}
          stageEl={stageEl}
          onCommit={onCommitFrame}
          gridSnap
          gridSize={gridSize}
        />
      </RcbCanvas>
    </div>
  );
}

export default memo(EditorStageWorld);
