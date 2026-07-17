import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  fillPanelPreview,
  type FillPanelValue,
} from '@/components/editor/panels/FillPanel';
import { ExportSelectionPopover } from '@/components/editor/panels/ExportSelectionPanel';
import {
  fillImageFieldsFromAttrs,
  parseFillType,
} from '@/store/scene/sceneFill';
import { boolEffectAttr } from '@/store/scene/sceneEffects';
import { openShapeStylePanel, patchDocumentNode } from '@/store/modules/editor';
import ToolbarValueSlider, {
  SEL_ICON_BTN,
  SEL_TOOL_BTN,
} from '@/components/editor/Canvas/selection/ToolbarValueSlider';
import {
  FillColorSwatch,
  IconCornerRadius,
  StrokeColorSwatch,
} from '@/components/editor/Canvas/selection/StyleToolbarIcons';
import AspectRatioPresetMenu, {
  ELEMENT_ASPECT_PRESETS,
} from '@/components/editor/Canvas/selection/AspectRatioPresetMenu';
import {
  matchAspectPresetKey,
  sizeFromAspectPreset,
} from '@/components/editor/Canvas/selection/resizeGeometry';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';
import {
  supportsAspectPresets,
  supportsCornerRadius,
  supportsFill,
  supportsShapeSides,
  supportsStroke,
} from '@/store/scene/sceneDocument';
import { radiiFromAttrs } from '@/store/scene/sceneRadii';
import {
  clampShapeSides,
  DEFAULT_SHAPE_SIDES,
  MAX_SHAPE_SIDES,
  MIN_SHAPE_SIDES,
  sidesFromAttrs,
} from '@/store/scene/sceneShapes';

type SceneBox = { left: number; top: number; width: number; height: number };

/** Stored before first ratio preset so 「原始」 can restore. */
const ASPECT_ORIG_W = 'aspect-original-width';
const ASPECT_ORIG_H = 'aspect-original-height';

/** Single-shape floating bar: fill / stroke · corner radius · W·H · ratio · download. */
export default function ShapeSelectionToolbar({
  nodeId,
  node,
  box,
}: {
  nodeId: string;
  node: any;
  box: SceneBox;
}) {
  const dispatch = useDispatch();
  const [ratioOpen, setRatioOpen] = useState(false);
  const cornerRadius = supportsCornerRadius(node);
  const canFill = supportsFill(node);
  const canStroke = supportsStroke(node);
  const showAspectPresets = supportsAspectPresets(node);
  const showSides = supportsShapeSides(node);
  const shapeType = String(node?.attrs?.shapeType || '');
  const sidesLabel = shapeType === 'star' ? '角数' : '边数';
  const sidesPrefix = shapeType === 'star' ? '角' : '边';
  const sides = sidesFromAttrs(node?.attrs);

  const activeRatioId = useMemo(
    () => matchAspectPresetKey(box.width, box.height, ELEMENT_ASPECT_PRESETS),
    [box.width, box.height]
  );

  const fillValue: FillPanelValue = {
    fillType: parseFillType(node?.attrs?.['fill-type']),
    fillColor: String(node?.attrs?.['fill-color'] || '#FFFFFF'),
    fillOpacity: Number(node?.attrs?.['fill-opacity'] ?? 100),
    fillGradient:
      node?.attrs?.['fill-gradient'] != null ? String(node.attrs['fill-gradient']) : undefined,
    ...fillImageFieldsFromAttrs(node?.attrs),
  };
  const fillVisible =
    boolEffectAttr(node?.attrs?.['fill-enabled'], true) &&
    boolEffectAttr(node?.attrs?.['fill-visible'], true);
  const fillPreview = fillVisible ? fillPanelPreview(fillValue) : 'transparent';
  const strokeVisible =
    boolEffectAttr(node?.attrs?.['stroke-enabled'], true) &&
    boolEffectAttr(node?.attrs?.['stroke-visible'], true);
  const strokeColor = String(node?.attrs?.['border-color'] || node?.attrs?.stroke || '#333333');
  const radius = radiiFromAttrs(node?.attrs).tl;

  const patchAttrs = (attrs: Record<string, unknown>) => {
    const shapeType = node?.attrs?.shapeType;
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          attrs: {
            ...(shapeType != null ? { shapeType } : {}),
            ...attrs,
          },
        },
      })
    );
  };

  const patchSize = (width: number, height: number) => {
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
        },
      })
    );
  };

  const setSize = (axis: 'w' | 'h', raw: string) => {
    const n = Math.max(1, Math.round(Number(raw) || 0));
    if (!Number.isFinite(n)) return;
    if (axis === 'w') patchSize(n, Math.round(box.height));
    else patchSize(Math.round(box.width), n);
  };

  const applySides = (n: number) => {
    patchAttrs({ sides: clampShapeSides(n, DEFAULT_SHAPE_SIDES) });
  };

  const openStyle = (kind: 'fill' | 'stroke' | 'radius') => {
    dispatch(openShapeStylePanel({ kind, nodeIds: [nodeId] }));
  };

  return (
    <>
      {canFill ? (
        <Tooltip title={'颜色'} placement="top">
          <button
            type="button"
            aria-label={'颜色'}
            className={cn(SEL_ICON_BTN, !fillVisible && 'opacity-55')}
            onClick={() => openStyle('fill')}
          >
            <FillColorSwatch color={fillPreview} />
          </button>
        </Tooltip>
      ) : null}

      {canStroke ? (
        <Tooltip title={'描边'} placement="top">
          <button
            type="button"
            aria-label={'描边'}
            className={cn(SEL_ICON_BTN, !strokeVisible && 'opacity-55')}
            onClick={() => openStyle('stroke')}
          >
            <StrokeColorSwatch color={strokeVisible ? strokeColor : 'var(--line)'} />
          </button>
        </Tooltip>
      ) : null}
      {cornerRadius ? (
        <Tooltip title={'圆角'} placement="top">
          <button
            type="button"
            aria-label={'圆角'}
            className={SEL_TOOL_BTN}
            onClick={() => openStyle('radius')}
          >
            <IconCornerRadius className="h-4 w-4 text-[var(--muted)]" />
            <span className="tabular-nums">{radius}</span>
          </button>
        </Tooltip>
      ) : null}

      {showSides ? (
        <ToolbarValueSlider
          prefix={sidesPrefix}
          value={sides}
          min={MIN_SHAPE_SIDES}
          max={MAX_SHAPE_SIDES}
          onChange={applySides}
          title={sidesLabel}
          panelLabel={sidesLabel}
        />
      ) : null}

      {showAspectPresets ? (
        <AspectRatioPresetMenu
          open={ratioOpen}
          onOpenChange={setRatioOpen}
          activeId={activeRatioId}
          onPick={(preset) => {
            if (preset.id === 'original') {
              const ow = Number(node?.attrs?.[ASPECT_ORIG_W]);
              const oh = Number(node?.attrs?.[ASPECT_ORIG_H]);
              if (Number.isFinite(ow) && ow > 0 && Number.isFinite(oh) && oh > 0) {
                patchSize(ow, oh);
              }
              return;
            }
            const shapeType = node?.attrs?.shapeType;
            const hasOrig =
              Number(node?.attrs?.[ASPECT_ORIG_W]) > 0 && Number(node?.attrs?.[ASPECT_ORIG_H]) > 0;
            const next = sizeFromAspectPreset(box, preset.w, preset.h);
            dispatch(
              patchDocumentNode({
                nodeId,
                patch: {
                  width: Math.max(1, Math.round(next.width)),
                  height: Math.max(1, Math.round(next.height)),
                  attrs: {
                    ...(shapeType != null ? { shapeType } : {}),
                    ...(!hasOrig
                      ? {
                          [ASPECT_ORIG_W]: Math.round(box.width),
                          [ASPECT_ORIG_H]: Math.round(box.height),
                        }
                      : {}),
                  },
                },
              })
            );
          }}
        />
      ) : null}

      <label className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-[12px] text-[var(--ink)]">
        <span className="text-[var(--muted)]">W</span>
        <input
          className="w-10 bg-transparent text-[12px] outline-none tabular-nums"
          defaultValue={Math.round(box.width)}
          key={`w-${Math.round(box.width)}`}
          onBlur={(e) => setSize('w', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSize('w', (e.target as HTMLInputElement).value);
          }}
        />
      </label>
      <label className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-[12px] text-[var(--ink)]">
        <span className="text-[var(--muted)]">H</span>
        <input
          className="w-10 bg-transparent text-[12px] outline-none tabular-nums"
          defaultValue={Math.round(box.height)}
          key={`h-${Math.round(box.height)}`}
          onBlur={(e) => setSize('h', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSize('h', (e.target as HTMLInputElement).value);
          }}
        />
      </label>

      <ExportSelectionPopover nodeIds={[nodeId]} />
    </>
  );
}
