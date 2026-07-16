import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  closeShapeStylePanel,
  patchDocumentNode,
} from '@/store/modules/editor';
import { nodeLeftTop } from '@/store/scene/sceneToSvg';
import {
  CameraOverlayPortal,
  useCamera,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';
import { FillPanel, type FillPanelValue } from '@/components/editor/panels/FillPanel';
import {
  StrokePanel,
  type StrokePanelValue,
  type StrokeSides,
} from '@/components/editor/nodes/ShapeNode/StrokePanel';
import {
  CornerRadiusPanel,
  type CornerRadiiValue,
} from '@/components/editor/nodes/ShapeNode/CornerRadiusPanel';
import GradientHandlesOverlay from '@/components/editor/nodes/ShapeNode/GradientHandlesOverlay';
import MeshHandlesOverlay from '@/components/editor/nodes/ShapeNode/MeshHandlesOverlay';
import type { StrokeStyle } from '@/components/editor/nodes/ShapeNode/StrokeStylePicker';
import {
  DEFAULT_FILL_IMAGE_ADJUST,
  fillImageFieldsFromAttrs,
  parseFillGradient,
  parseFillType,
  serializeFillGradient,
  serializeFillImageAdjust,
  type FillGradient,
} from '@/store/scene/sceneFill';
import {
  resolveStrokeAlign,
  resolveStrokeLinecap,
  resolveStrokeLinejoin,
  boolEffectAttr,
} from '@/store/scene/sceneEffects';
import { supportsFill, supportsCornerRadius, supportsSideStroke } from '@/store/scene/sceneDocument';
import { radiiFromAttrs, radiiEqual, type CornerRadii } from '@/store/scene/sceneRadii';

type SceneBox = { left: number; top: number; width: number; height: number };

/** Panel docked to the top-right of the selection (same pattern as eraser). */
function panelStyleTopRight(
  camera: { x: number; y: number; zoom: number },
  box: SceneBox
): CSSProperties {
  const gap = 16 / Math.max(0.05, camera.zoom);
  const { x, y } = worldToStage(camera, box.left + box.width + gap, box.top);
  return {
    position: 'absolute',
    left: x,
    top: y,
    zIndex: 40,
  };
}

function unionBoxes(boxes: SceneBox[]): SceneBox | null {
  if (!boxes.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of boxes) {
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
  }
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function nodeBox(document: any, node: any): SceneBox | null {
  if (!node) return null;
  const { left, top } = nodeLeftTop(document, node);
  return {
    left,
    top,
    width: Math.max(1, Number(node.width) || 1),
    height: Math.max(1, Number(node.height) || 1),
  };
}

function fillAttrsFromValue(next: FillPanelValue, shapeType?: unknown) {
  return {
    ...(shapeType != null ? { shapeType } : {}),
    'fill-color': next.fillColor,
    'fill-type': next.fillType,
    'fill-opacity': next.fillOpacity ?? 100,
    'fill-enabled': 'true',
    'fill-visible': 'true',
    ...(next.fillType !== 'solid' && next.fillType !== 'image' && next.fillGradient
      ? { 'fill-gradient': next.fillGradient }
      : {}),
    ...(next.fillType === 'image'
      ? {
          'fill-image-src': next.fillImageSrc || '',
          'fill-image-fit': next.fillImageFit ?? 'fill',
          'fill-image-rotate': next.fillImageRotate ?? 0,
          'fill-image-adjust': serializeFillImageAdjust(
            next.fillImageAdjust ?? DEFAULT_FILL_IMAGE_ADJUST
          ),
        }
      : {}),
  };
}

function strokeAttrsFromValue(next: StrokePanelValue, opts?: { writeSides?: boolean }) {
  const linecap = next.linecap ?? 'butt';
  const linejoin = next.linejoin ?? 'miter';
  const attrs: Record<string, unknown> = {
    'border-color': next.color,
    stroke: next.color,
    'stroke-opacity': Math.max(0, Math.min(100, Math.round(next.opacity))),
    'border-width': Math.max(0, Math.round(next.width) || 0),
    strokeStyle: next.style,
    strokeAlign: next.align ?? 'center',
    strokeLinecap: linecap,
    'stroke-linecap': linecap,
    strokeLinejoin: linejoin,
    'stroke-linejoin': linejoin,
    'stroke-enabled': 'true',
    'stroke-visible': 'true',
  };
  if (opts?.writeSides && next.sides) {
    attrs.T = next.sides.T ? 'true' : 'false';
    attrs.R = next.sides.R ? 'true' : 'false';
    attrs.B = next.sides.B ? 'true' : 'false';
    attrs.L = next.sides.L ? 'true' : 'false';
  }
  return attrs;
}

function readFillValue(attrs: Record<string, unknown> | undefined): FillPanelValue {
  const a = attrs || {};
  return {
    fillType: parseFillType(a['fill-type']),
    fillColor: String(a['fill-color'] || '#FFFFFF'),
    fillOpacity: Number(a['fill-opacity'] ?? 100),
    fillGradient: a['fill-gradient'] != null ? String(a['fill-gradient']) : undefined,
    ...fillImageFieldsFromAttrs(a),
  };
}

function readStrokeSides(attrs: Record<string, unknown> | undefined): StrokeSides {
  const a = attrs || {};
  return {
    T: boolEffectAttr(a.T, true),
    R: boolEffectAttr(a.R, true),
    B: boolEffectAttr(a.B, true),
    L: boolEffectAttr(a.L, true),
  };
}

function readStrokeCorners(attrs: Record<string, unknown> | undefined): CornerRadiiValue {
  const r = radiiFromAttrs(attrs);
  const linked = attrs?.radiusLinked !== false && attrs?.radiusLinked !== 'false';
  return { tl: r.tl, tr: r.tr, br: r.br, bl: r.bl, linked: Boolean(linked) };
}

function readStrokeValue(attrs: Record<string, unknown> | undefined): StrokePanelValue {
  const a = attrs || {};
  const rawStyle = String(a.strokeStyle || 'solid');
  const style: StrokeStyle =
    rawStyle === 'dashed' || rawStyle === 'dotted' ? rawStyle : 'solid';
  const widthNum = Number(a['border-width'] ?? a.strokeWidth ?? 1);
  const shapeType = String(a.shapeType || '');
  const freehandCaps =
    shapeType === 'pen' || shapeType === 'pencil' || shapeType === 'arrow';
  const hasCapAttr = a.strokeLinecap != null || a['stroke-linecap'] != null;
  const hasJoinAttr = a.strokeLinejoin != null || a['stroke-linejoin'] != null;
  return {
    color: String(a['border-color'] || a.stroke || '#333333'),
    opacity: Math.max(0, Math.min(100, Number(a['stroke-opacity'] ?? 100))),
    width: Number.isFinite(widthNum) ? widthNum : 1,
    style,
    align: resolveStrokeAlign(a),
    linecap: hasCapAttr
      ? resolveStrokeLinecap(a)
      : freehandCaps
        ? 'round'
        : 'butt',
    linejoin: hasJoinAttr
      ? resolveStrokeLinejoin(a)
      : freehandCaps
        ? 'round'
        : 'miter',
    sides: readStrokeSides(a),
  };
}

/**
 * Fill / stroke editor docked to the right of the selection.
 * Top selection toolbar is suppressed while this is open (see SvgCanvas suppressChrome).
 */
export default function ShapeStylePanelHost({ document }: { document: any }): ReactNode {
  const dispatch = useDispatch();
  const camera = useCamera();
  const panel = useSelector(
    (s: any) =>
      s.editor.shapeStylePanel as null | {
        kind: 'fill' | 'stroke' | 'radius';
        nodeIds: string[];
      }
  );
  const selectedNodeIds = useSelector((s: any) => s.editor.selectedNodeIds as string[]);
  const [meshSelectedIndex, setMeshSelectedIndex] = useState(0);
  const [meshShowGuides, setMeshShowGuides] = useState(true);

  const panelFillType = useMemo(() => {
    if (!panel || panel.kind !== 'fill') return null;
    const attrs = document?.deltaSetLike?.[panel.nodeIds[0]]?.attrs as
      | Record<string, unknown>
      | undefined;
    return parseFillType(String(attrs?.['fill-type'] || 'solid'));
  }, [panel, document]);

  useEffect(() => {
    setMeshSelectedIndex(0);
  }, [panel?.nodeIds?.join(','), panel?.kind, panelFillType]);

  useEffect(() => {
    if (!panel) return;
    const same =
      panel.nodeIds.length === selectedNodeIds.length &&
      panel.nodeIds.every((id) => selectedNodeIds.includes(id));
    if (!same) dispatch(closeShapeStylePanel());
  }, [panel, selectedNodeIds, dispatch]);

  useEffect(() => {
    if (!panel || panel.kind !== 'fill') return;
    const anyFill = panel.nodeIds.some((id) => supportsFill(document?.deltaSetLike?.[id]));
    if (!anyFill) dispatch(closeShapeStylePanel());
  }, [panel, document, dispatch]);

  useEffect(() => {
    if (!panel || panel.kind !== 'radius') return;
    const anyRadius = panel.nodeIds.some((id) =>
      supportsCornerRadius(document?.deltaSetLike?.[id])
    );
    if (!anyRadius) dispatch(closeShapeStylePanel());
  }, [panel, document, dispatch]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch(closeShapeStylePanel());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, dispatch]);

  const box = useMemo(() => {
    if (!panel) return null;
    const boxes = panel.nodeIds
      .map((id) => nodeBox(document, document?.deltaSetLike?.[id]))
      .filter(Boolean) as SceneBox[];
    return unionBoxes(boxes);
  }, [document, panel]);

  if (!panel || !box) return null;

  const firstId = panel.nodeIds[0];
  const firstNode = document?.deltaSetLike?.[firstId];
  const firstAttrs = firstNode?.attrs as Record<string, unknown> | undefined;
  const close = () => dispatch(closeShapeStylePanel());
  const fillValue = readFillValue(firstAttrs);
  const fillType = parseFillType(fillValue.fillType);
  const showGradientHandles =
    panel.kind === 'fill' &&
    (fillType === 'linear' || fillType === 'radial' || fillType === 'angular');
  const showMeshHandles = panel.kind === 'fill' && fillType === 'diffuse';
  const handleBox = nodeBox(document, firstNode) || box;
  const nodeAngle = Number(firstAttrs?.angle);
  const gradient: FillGradient | null = showGradientHandles
    ? (() => {
        const g = parseFillGradient(
          fillValue.fillGradient,
          fillType as 'linear' | 'radial' | 'angular',
          fillValue.fillColor
        );
        g.type = fillType as 'linear' | 'radial' | 'angular';
        return g;
      })()
    : null;
  const meshGradient: FillGradient | null = showMeshHandles
    ? (() => {
        const g = parseFillGradient(fillValue.fillGradient, 'diffuse', fillValue.fillColor);
        g.type = 'diffuse';
        return g;
      })()
    : null;

  const applyFill = (next: FillPanelValue) => {
    for (const id of panel.nodeIds) {
      const node = document?.deltaSetLike?.[id];
      if (!supportsFill(node)) continue;
      const shapeType = node?.attrs?.shapeType;
      dispatch(
        patchDocumentNode({
          nodeId: id,
          patch: { attrs: fillAttrsFromValue(next, shapeType) },
        })
      );
    }
  };

  const applyGradient = (next: FillGradient) => {
    applyFill({
      ...fillValue,
      fillType: next.type,
      fillGradient: serializeFillGradient(next),
    });
  };

  const applyStroke = (next: StrokePanelValue) => {
    for (const id of panel.nodeIds) {
      const node = document?.deltaSetLike?.[id];
      if (!node) continue;
      dispatch(
        patchDocumentNode({
          nodeId: id,
          patch: {
            attrs: strokeAttrsFromValue(next, {
              writeSides: supportsSideStroke(node),
            }),
          },
        })
      );
    }
  };

  const applyRadius = (next: CornerRadiiValue) => {
    for (const id of panel.nodeIds) {
      const node = document?.deltaSetLike?.[id];
      if (!node || !supportsCornerRadius(node)) continue;
      const linked = next.linked || radiiEqual(next as CornerRadii);
      dispatch(
        patchDocumentNode({
          nodeId: id,
          patch: {
            attrs: {
              radiusTL: Math.max(0, Math.round(next.tl) || 0),
              radiusTR: Math.max(0, Math.round(next.tr) || 0),
              radiusBR: Math.max(0, Math.round(next.br) || 0),
              radiusBL: Math.max(0, Math.round(next.bl) || 0),
              radiusLinked: linked ? 'true' : 'false',
            },
          },
        })
      );
    }
  };

  const shapeType = String(firstAttrs?.shapeType || firstNode?.key || 'rect');
  const pathClosed =
    firstAttrs?.closed === true ||
    firstAttrs?.closed === 'true' ||
    (typeof firstAttrs?.path === 'string' && /z\s*$/i.test(String(firstAttrs.path).trim()));
  /** Line caps only affect open strokes (line / arrow / pen / open path). */
  const showLinecap =
    shapeType === 'line' ||
    shapeType === 'arrow' ||
    shapeType === 'pen' ||
    shapeType === 'pencil' ||
    (shapeType === 'path' && !pathClosed);
  const showSides = panel.nodeIds.some((id) =>
    supportsSideStroke(document?.deltaSetLike?.[id])
  );
  const cornerMax = Math.max(
    64,
    ...panel.nodeIds.map((id) => {
      const n = document?.deltaSetLike?.[id];
      if (!n) return 0;
      return Math.floor(Math.min(Number(n.width) || 0, Number(n.height) || 0) / 2);
    })
  );

  return (
    <>
      {showGradientHandles && gradient ? (
        <GradientHandlesOverlay
          box={handleBox}
          angle={Number.isFinite(nodeAngle) ? nodeAngle : 0}
          gradient={gradient}
          onChange={applyGradient}
        />
      ) : null}
      {showMeshHandles && meshGradient ? (
        <MeshHandlesOverlay
          box={handleBox}
          angle={Number.isFinite(nodeAngle) ? nodeAngle : 0}
          gradient={meshGradient}
          selectedIndex={meshSelectedIndex}
          showGuides={meshShowGuides}
          onChange={applyGradient}
          onActivePointChange={setMeshSelectedIndex}
        />
      ) : null}
      <CameraOverlayPortal>
        <div
          className="pointer-events-auto"
          style={panelStyleTopRight(camera, box)}
          data-shape-style-panel
          onPointerDown={(e) => e.stopPropagation()}
        >
          {panel.kind === 'fill' ? (
            <FillPanel
              value={fillValue}
              onChange={applyFill}
              title={'颜色'}
              onClose={close}
              meshSelectedIndex={meshSelectedIndex}
              onMeshSelectedIndexChange={setMeshSelectedIndex}
              meshShowGuides={meshShowGuides}
              onMeshShowGuidesChange={setMeshShowGuides}
            />
          ) : panel.kind === 'radius' ? (
            <CornerRadiusPanel
              value={readStrokeCorners(firstAttrs)}
              onChange={applyRadius}
              title={'圆角'}
              onClose={close}
              max={cornerMax}
            />
          ) : (
            <StrokePanel
              value={readStrokeValue(firstAttrs)}
              onChange={applyStroke}
              title={'描边'}
              onClose={close}
              showLinecap={showLinecap}
              showSides={showSides}
            />
          )}
        </div>
      </CameraOverlayPortal>
    </>
  );
}
