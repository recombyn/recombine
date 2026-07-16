import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { message } from '@/components/base';
import {
  closeImageToolPanel,
  patchDocumentNode,
  pushEditorHistory,
  startImageProcess,
  type ImageToolPanelKind,
} from '@/store/modules/editor';
import { buildNodeAdjustFilterCss } from '@/store/scene/sceneFill';
import { nodeLeftTop } from '@/store/scene/sceneToSvg';
import {
  CameraOverlayPortal,
  useCamera,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';
import EraserMaskOverlay, { type EraserMaskOverlayHandle } from './EraserMaskOverlay';
import EraserToolPanel from './EraserToolPanel';
import MultiAngleToolPanel from './MultiAngleToolPanel';
import AdjustToolPanel, {
  parseAdjustValues,
  type AdjustValues,
} from './AdjustToolPanel';

function panelStyleRight(
  camera: { x: number; y: number; zoom: number },
  box: { left: number; top: number; width: number; height: number }
): CSSProperties {
  const gap = 16 / Math.max(0.05, camera.zoom);
  // Top-aligned with the image (not vertically centered on the box).
  const { x, y } = worldToStage(camera, box.left + box.width + gap, box.top);
  return {
    position: 'absolute',
    left: x,
    top: y,
    zIndex: 40,
  };
}

function nodeBox(
  document: any,
  node: any
): { left: number; top: number; width: number; height: number } | null {
  if (!node) return null;
  const { left, top } = nodeLeftTop(document, node);
  return {
    left,
    top,
    width: Math.max(1, Number(node.width) || 1),
    height: Math.max(1, Number(node.height) || 1),
  };
}

/** Host for image tool panels positioned relative to the source image. */
export default function ImageToolPanelHost({ document }: { document: any }): ReactNode {
  const dispatch = useDispatch();
  const camera = useCamera();
  const panel = useSelector((s: any) => s.editor.imageToolPanel as null | {
    nodeId: string;
    kind: ImageToolPanelKind;
  });
  const selectedNodeId = useSelector((s: any) => s.editor.selectedNodeId as string | null);

  const [brushSize, setBrushSize] = useState(40);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);
  const maskRef = useRef<EraserMaskOverlayHandle>(null);
  const adjustHistoryPushedRef = useRef(false);
  const adjustBaselineRef = useRef<{ cssFilter: string; adjustValues: unknown } | null>(null);

  useEffect(() => {
    if (!panel) return;
    if (!selectedNodeId || selectedNodeId !== panel.nodeId) {
      dispatch(closeImageToolPanel());
    }
  }, [selectedNodeId, panel, dispatch]);

  useEffect(() => {
    if (!panel) return;
    const node = document?.deltaSetLike?.[panel.nodeId];
    if (!node || node.key !== 'image') dispatch(closeImageToolPanel());
  }, [document, panel, dispatch]);

  useEffect(() => {
    if (panel?.kind === 'eraser') {
      setBrushSize(40);
      setHasStrokes(false);
      setEraseBusy(false);
      maskRef.current?.clear();
    }
  }, [panel?.kind, panel?.nodeId]);

  // Snapshot adjust attrs once when the panel opens (for cancel restore).
  useEffect(() => {
    if (panel?.kind !== 'adjust' || !panel.nodeId) {
      adjustHistoryPushedRef.current = false;
      adjustBaselineRef.current = null;
      return;
    }
    const node = document?.deltaSetLike?.[panel.nodeId];
    adjustHistoryPushedRef.current = false;
    adjustBaselineRef.current = {
      cssFilter: String(node?.attrs?.cssFilter || '').trim(),
      adjustValues: node?.attrs?.adjustValues ?? null,
    };
    // Only re-snapshot when opening / switching image — not on every doc patch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel?.kind, panel?.nodeId]);

  const box = useMemo(() => {
    if (!panel) return null;
    return nodeBox(document, document?.deltaSetLike?.[panel.nodeId]);
  }, [document, panel]);

  if (!panel || !box) return null;
  // Flip/rotate uses the selection floating toolbar; crop/expand use on-canvas frame.
  if (panel.kind === 'flipRotate' || panel.kind === 'crop' || panel.kind === 'expand') return null;

  const close = () => dispatch(closeImageToolPanel());

  const runProcess = (kind: ImageToolPanelKind, label: string, size?: {
    targetWidth?: number;
    targetHeight?: number;
  }) => {
    dispatch(
      startImageProcess({
        sourceId: panel.nodeId,
        kind,
        label,
        targetWidth: size?.targetWidth,
        targetHeight: size?.targetHeight,
      })
    );
    close();
  };

  const style = panelStyleRight(camera, box);

  const writeAdjustAttrs = (opts: AdjustValues, mode: 'preview' | 'commit') => {
    const node = document?.deltaSetLike?.[panel.nodeId];
    const filter = buildNodeAdjustFilterCss(opts);
    const cssFilter = filter === 'none' ? '' : filter;
    const adjustValues = JSON.stringify(opts);
    if (mode === 'preview') {
      if (!adjustHistoryPushedRef.current) {
        adjustHistoryPushedRef.current = true;
        dispatch(pushEditorHistory());
      }
      dispatch(
        patchDocumentNode({
          nodeId: panel.nodeId,
          skipHistory: true,
          patch: {
            attrs: {
              ...(node?.attrs || {}),
              cssFilter,
              adjustValues,
            },
          },
        })
      );
      return;
    }
    dispatch(
      patchDocumentNode({
        nodeId: panel.nodeId,
        // History already snapped on first preview; avoid a duplicate empty undo step.
        skipHistory: adjustHistoryPushedRef.current,
        patch: {
          attrs: {
            ...(node?.attrs || {}),
            cssFilter,
            adjustValues,
          },
        },
      })
    );
  };

  let body: ReactNode = null;
  if (panel.kind === 'eraser') {
    body = (
      <EraserToolPanel
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        hasStrokes={hasStrokes}
        confirmBusy={eraseBusy}
        onReset={() => {
          setBrushSize(40);
          maskRef.current?.clear();
          setHasStrokes(false);
        }}
        onCancel={close}
        onConfirm={() => {
          if (!hasStrokes || eraseBusy) return;
          const node = document?.deltaSetLike?.[panel.nodeId];
          const src = String(node?.attrs?.src || '');
          if (!src) {
            message.error('未找到图片');
            return;
          }
          setEraseBusy(true);
          void (async () => {
            try {
              const next = await maskRef.current?.applyErase(src);
              if (!next || next === src) {
                message.error('请先在图片上涂抹');
                return;
              }
              dispatch(
                patchDocumentNode({
                  nodeId: panel.nodeId,
                  patch: { attrs: { ...(node?.attrs || {}), src: next } },
                })
              );
              close();
            } catch {
              message.error('橡皮失败');
            } finally {
              setEraseBusy(false);
            }
          })();
        }}
      />
    );
  } else if (panel.kind === 'multiAngle') {
    const node = document?.deltaSetLike?.[panel.nodeId];
    body = (
      <MultiAngleToolPanel
        imageSrc={String(node?.attrs?.src || '') || undefined}
        onCancel={close}
        onConfirm={() => runProcess('multiAngle', '多角度生成中')}
      />
    );
  } else if (panel.kind === 'adjust') {
    const node = document?.deltaSetLike?.[panel.nodeId];
    const saved = parseAdjustValues(
      adjustBaselineRef.current?.adjustValues ?? node?.attrs?.adjustValues
    );
    body = (
      <AdjustToolPanel
        key={`${panel.nodeId}-adjust`}
        initialValues={saved}
        onChange={(opts) => writeAdjustAttrs(opts, 'preview')}
        onCancel={() => {
          const baseline = adjustBaselineRef.current;
          const n = document?.deltaSetLike?.[panel.nodeId];
          dispatch(
            patchDocumentNode({
              nodeId: panel.nodeId,
              skipHistory: true,
              patch: {
                attrs: {
                  ...(n?.attrs || {}),
                  cssFilter: baseline?.cssFilter ?? '',
                  adjustValues: baseline?.adjustValues ?? null,
                },
              },
            })
          );
          close();
        }}
        onConfirm={(opts) => {
          writeAdjustAttrs(opts, 'commit');
          close();
        }}
      />
    );
  }

  return (
    <>
      {panel.kind === 'eraser' ? (
        <EraserMaskOverlay
          ref={maskRef}
          imageBox={box}
          brushSize={brushSize}
          onDirtyChange={setHasStrokes}
        />
      ) : null}
      <CameraOverlayPortal>
        <div
          className="pointer-events-auto"
          style={style}
          data-image-tool-panel
          onPointerDown={(e) => {
            // Stop bubble so canvas selection/pan does not run; do not use capture —
            // capture stopPropagation blocks panel internals (e.g. angle-editor drag).
            e.stopPropagation();
          }}
        >
          {body}
        </div>
      </CameraOverlayPortal>
    </>
  );
}
