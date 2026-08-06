import { memo, useCallback, useState, type RefObject } from 'react';
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
import MeshHandlesOverlay from '@/components/editor/nodes/ShapeNode/MeshHandlesOverlay';
import FrameContextToolbar from '@/components/editor/nodes/FrameNode/FrameContextToolbar';
import type { ArtboardFrame } from '@/components/rcb/frames/types';
import type { FillPanelValue } from '@/components/editor/panels/FillPanel';
import { stackZIndex } from '@/components/rcb/scene/document/sceneDocument';
import {
  parseFillGradient,
  serializeFillGradient,
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
].join(',');

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

  if (isMobileViewport || !document) return null;

  return (
    <div
      className="relative min-h-0 flex-1"
      onPointerDown={(e) => {
        const active = window.document.activeElement as HTMLElement | null;
        if (
          active &&
          active !== e.currentTarget &&
          e.currentTarget.contains(active) &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.isContentEditable)
        ) {
          active.blur();
        }
      }}
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

        {canvasBgOpen && canvasFillValue.fillType === 'diffuse' ? (
          <MeshHandlesOverlay
            box={{
              left: 0,
              top: 0,
              width: worldSurface.width,
              height: worldSurface.height,
            }}
            gradient={{
              ...parseFillGradient(
                canvasFillValue.fillGradient,
                'diffuse',
                canvasFillValue.fillColor
              ),
              type: 'diffuse',
            }}
            selectedIndex={canvasMeshSelectedIndex}
            showGuides={canvasMeshShowGuides}
            onActivePointChange={setCanvasMeshSelectedIndex}
            onChange={(next) => {
              dispatch(
                setCanvasMeta(
                  canvasFillToDocumentMeta(
                    {
                      ...canvasFillValue,
                      fillType: 'diffuse',
                      fillGradient: serializeFillGradient(next),
                      fillColor:
                        next.meshPoints?.[0]?.color || canvasFillValue.fillColor,
                    },
                    false
                  )
                )
              );
            }}
          />
        ) : null}

        {frames.map((frame) =>
          frame.hidden ? null : (
            <HtmlArtboardFrame
              key={`label-${frame.id}`}
              frame={frame}
              selected={!isDevMode && selectedFrameIds.includes(frame.id)}
              hideTitle={isDevMode || movingFrameId === frame.id}
              onSelect={isDevMode ? undefined : () => onSelectFrame(frame.id)}
              onRename={
                isDevMode
                  ? undefined
                  : (name) => dispatch(renameArtboardFrame({ id: frame.id, name }))
              }
              onMove={
                isDevMode ? undefined : (x, y, opts) => onMoveFrame(frame.id, x, y, opts)
              }
              onMoveStart={isDevMode ? undefined : () => onFrameMoveStart(frame.id)}
              onMoveEnd={isDevMode ? undefined : onFrameMoveEnd}
              layer="label"
            />
          )
        )}

        {!isDevMode &&
        selectedFrames.length >= 1 &&
        selectedNodeIds.length === 0 &&
        activeFrame &&
        movingFrameId !== activeFrame.id ? (
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
