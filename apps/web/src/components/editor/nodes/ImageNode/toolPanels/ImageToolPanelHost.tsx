import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, memo } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { message } from '@/components/base';
import {
  closeImageToolPanel,
  failImageProcess,
  finishImageProcess,
  patchDocumentNode,
  pushEditorHistory,
  startImageProcess,
  type ImageToolPanelKind,
} from '@/store/modules/editor';
import { buildNodeAdjustFilterCss } from '@/components/rcb/scene/document/sceneFill';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import {
  RcbOverlayPortal,
  useRcbCamera,
  rcbSceneToScreen,
} from '@/components/rcb';
import { uploadImageFromSrc } from '@/utils/uploadImage';
import EraserMaskOverlay, { type EraserMaskOverlayHandle } from './EraserMaskOverlay';
import EraserToolPanel from './EraserToolPanel';
import MultiAngleToolPanel from './MultiAngleToolPanel';
import AdjustToolPanel, {
  parseAdjustValues,
  type AdjustValues,
} from './AdjustToolPanel';

/** Local erase → right-side cutout node (source image untouched), same pattern as 抠图. */
async function confirmEraserAsNewNode(opts: {
  applyErase: (src: string, o?: { uploadKey?: string | null }) => Promise<string>;
  src: string;
  uploadKey: string | null;
  sourceId: string;
  label: string;
  dispatch: (action: unknown) => void;
  getPendingProcessId: () => string | null;
  /** Called after the loading clone is spawned (close eraser UI). */
  onSpawned?: () => void;
}): Promise<void> {
  const erased = await opts.applyErase(opts.src, { uploadKey: opts.uploadKey });
  if (!erased || erased === opts.src) {
    throw new Error('请先在图片上涂抹');
  }
  opts.dispatch(
    startImageProcess({
      sourceId: opts.sourceId,
      kind: 'eraser',
      label: opts.label,
    })
  );
  const processId = opts.getPendingProcessId();
  if (!processId) throw new Error('橡皮失败');
  opts.onSpawned?.();
  try {
    const uploaded = await uploadImageFromSrc(erased, 'eraser.png');
    const url = String(uploaded?.url || erased).trim() || erased;
    opts.dispatch(
      finishImageProcess({
        nodeId: processId,
        src: url,
        attrs: {
          cutout: 'true',
          name: '擦除',
          ...(uploaded?.key ? { uploadKey: String(uploaded.key) } : {}),
        },
      })
    );
  } catch (err) {
    opts.dispatch(failImageProcess({ nodeId: processId }));
    throw err;
  }
}

function panelStyleRight(
  camera: { x: number; y: number; zoom: number },
  box: { left: number; top: number; width: number; height: number }
): CSSProperties {
  const gap = 16 / Math.max(0.05, camera.zoom);
  // Top-aligned with the image (not vertically centered on the box).
  const { x, y } = rcbSceneToScreen(camera, box.left + box.width + gap, box.top);
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
function ImageToolPanelHost({ document }: { document: any }): ReactNode {
  const dispatch = useDispatch();
  const store = useStore();
  const { t } = useTranslation();
  const camera = useRcbCamera();
  const panel = useSelector((s: any) => s.editor.imageToolPanel as null | {
    nodeId: string;
    kind: ImageToolPanelKind;
  });
  const selectedNodeId = useSelector((s: any) => s.editor.selectedNodeId as string | null);

  const [brushSize, setBrushSize] = useState(96);
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
    // Crop / expand / flipRotate are owned by session hosts (image + video).
    if (panel.kind === 'crop' || panel.kind === 'expand' || panel.kind === 'flipRotate') {
      return;
    }
    const node = document?.deltaSetLike?.[panel.nodeId];
    if (!node || node.key !== 'image') dispatch(closeImageToolPanel());
  }, [document, panel, dispatch]);

  useEffect(() => {
    if (panel?.kind !== 'eraser' || !panel.nodeId) return;
    const node = document?.deltaSetLike?.[panel.nodeId];
    const boxNow = nodeBox(document, node);
    const shortSide = Math.min(boxNow?.width || 0, boxNow?.height || 0);
    // ~12% of the short side — readable on large plates without maxing the slider.
    const initial = Math.round(Math.min(280, Math.max(64, shortSide * 0.12 || 96)));
    setBrushSize(initial);
    setHasStrokes(false);
    setEraseBusy(false);
    maskRef.current?.clear();
    // Only when opening / switching the eraser target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Flip/rotate + Chat quick-edit use the selection floating toolbar; crop/expand use on-canvas frame.
  if (
    panel.kind === 'flipRotate' ||
    panel.kind === 'quickEdit' ||
    panel.kind === 'crop' ||
    panel.kind === 'expand'
  ) {
    return null;
  }

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
          const shortSide = Math.min(box.width, box.height);
          setBrushSize(Math.round(Math.min(280, Math.max(64, shortSide * 0.12 || 96))));
          maskRef.current?.clear();
          setHasStrokes(false);
        }}
        onCancel={close}
        onConfirm={() => {
          if (!hasStrokes || eraseBusy) return;
          const sourceId = panel.nodeId;
          const node = document?.deltaSetLike?.[sourceId];
          const src = String(node?.attrs?.src || '');
          if (!src) {
            message.error('未找到图片');
            return;
          }
          const applyErase = maskRef.current?.applyErase;
          if (!applyErase) return;
          setEraseBusy(true);
          void (async () => {
            try {
              await confirmEraserAsNewNode({
                applyErase,
                src,
                uploadKey: String(node?.attrs?.uploadKey || node?.attrs?.key || '') || null,
                sourceId,
                label: t('editor.imageToolbar.processingEraser'),
                dispatch,
                getPendingProcessId: () =>
                  (store.getState() as any).editor?.pendingImageProcessId || null,
                onSpawned: close,
              });
              message.success('擦除完成（透明 PNG）');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : '';
              message.error(msg && msg !== '橡皮失败' ? msg : '橡皮失败');
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
        onConfirm={(opts) => {
          dispatch(
            startImageProcess({
              sourceId: panel.nodeId,
              kind: 'multiAngle',
              label: '多角度生成中',
              meta: {
                rotate: opts.rotate,
                tilt: opts.tilt,
                zoom: opts.zoom,
                mode: opts.mode,
              },
            })
          );
          close();
        }}
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
      <RcbOverlayPortal>
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
      </RcbOverlayPortal>
    </>
  );
}

export default memo(ImageToolPanelHost);
