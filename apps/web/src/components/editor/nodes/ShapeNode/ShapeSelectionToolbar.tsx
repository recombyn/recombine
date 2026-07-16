import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  HiOutlineEyeDropper,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
} from 'react-icons/hi2';
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
import { openShapeStylePanel, patchDocumentNode, setAspectLocked } from '@/store/modules/editor';
import { FillVisibilityIcon } from '@/components/editor/nodes/ShapeNode/FillVisibilityIcon';
import { StrokeVisibilityIcon } from '@/components/editor/nodes/ShapeNode/StrokeVisibilityIcon';
import { pickScreenColor } from '@/components/editor/color/pickScreenColor';
import ToolbarValueSlider, {
  SEL_ICON_BTN,
  SEL_TOOL_BTN,
} from '@/components/editor/Canvas/selection/ToolbarValueSlider';
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
  const aspectLocked = useSelector((s: any) => s.editor.aspectLocked) as boolean;
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
    const ratio = box.width / Math.max(1, box.height);
    if (axis === 'w') {
      const width = n;
      const height = aspectLocked ? Math.max(1, Math.round(width / ratio)) : Math.round(box.height);
      patchSize(width, height);
    } else {
      const height = n;
      const width = aspectLocked ? Math.max(1, Math.round(height * ratio)) : Math.round(box.width);
      patchSize(width, height);
    }
  };

  const applySides = (n: number) => {
    patchAttrs({ sides: clampShapeSides(n, DEFAULT_SHAPE_SIDES) });
  };

  const openStyle = (kind: 'fill' | 'stroke' | 'radius') => {
    dispatch(openShapeStylePanel({ kind, nodeIds: [nodeId] }));
  };

  const toggleStrokeVisible = () => {
    const next = !strokeVisible;
    patchAttrs({
      'stroke-enabled': next ? 'true' : 'false',
      'stroke-visible': next ? 'true' : 'false',
    });
  };

  const toggleFillVisible = () => {
    const next = !fillVisible;
    patchAttrs({
      'fill-enabled': next ? 'true' : 'false',
      'fill-visible': next ? 'true' : 'false',
    });
  };

  const runEyedropper = async () => {
    const hex = await pickScreenColor();
    if (!hex) return;
    patchAttrs({
      'fill-enabled': 'true',
      'fill-visible': 'true',
      'fill-type': 'solid',
      'fill-color': hex,
    });
  };

  return (
    <>
      {canFill ? (
        <div
          className={cn(
            'inline-flex h-8 items-center gap-0.5 rounded-[4px] px-0.5',
            !fillVisible && 'opacity-55'
          )}
        >
          <Tooltip title={fillVisible ? '隐藏填充' : '显示填充'} placement="top">
            <button
              type="button"
              aria-label={fillVisible ? '隐藏填充' : '显示填充'}
              aria-pressed={fillVisible}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              onClick={toggleFillVisible}
            >
              <FillVisibilityIcon visible={fillVisible} className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip title={'颜色'} placement="top">
            <button
              type="button"
              aria-label={'颜色'}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] hover:bg-[var(--accent-soft)]"
              onClick={() => openStyle('fill')}
            >
              <span className="relative inline-flex h-4 w-4 overflow-hidden rounded-[4px] ring-1 ring-[var(--line)]">
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)',
                    backgroundSize: '6px 6px',
                    backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
                  }}
                />
                <span className="absolute inset-0" style={{ background: fillPreview }} />
              </span>
            </button>
          </Tooltip>
          <Tooltip title={'取色'} placement="top">
            <button
              type="button"
              aria-label={'取色'}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              onClick={() => void runEyedropper()}
            >
              <HiOutlineEyeDropper className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      ) : null}

      {canStroke ? (
        <div
          className={cn(
            'inline-flex h-8 items-center gap-0.5 rounded-[4px] px-0.5',
            !strokeVisible && 'opacity-55'
          )}
        >
          <Tooltip
            title={strokeVisible ? '隐藏描边' : '显示描边'}
            placement="top"
          >
            <button
              type="button"
              aria-label={strokeVisible ? '隐藏描边' : '显示描边'}
              aria-pressed={strokeVisible}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              onClick={toggleStrokeVisible}
            >
              <StrokeVisibilityIcon visible={strokeVisible} className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-[4px] px-1.5 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            onClick={() => openStyle('stroke')}
          >
            {'描边'}
          </button>
        </div>
      ) : null}
      {cornerRadius ? (
        <Tooltip title={'圆角'} placement="top">
          <button
            type="button"
            aria-label={'圆角'}
            className={SEL_TOOL_BTN}
            onClick={() => openStyle('radius')}
          >
            <span className="text-[var(--muted)]">R</span>
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
              dispatch(setAspectLocked(false));
              return;
            }
            dispatch(setAspectLocked(true));
            const next = sizeFromAspectPreset(box, preset.w, preset.h);
            patchSize(next.width, next.height);
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
      <Tooltip title={aspectLocked ? '解锁比例' : '锁定比例'} placement="top">
        <button
          type="button"
          aria-label={aspectLocked ? '解锁比例' : '锁定比例'}
          className={SEL_ICON_BTN}
          onClick={() => dispatch(setAspectLocked(!aspectLocked))}
        >
          {aspectLocked ? (
            <HiOutlineLockClosed className="h-3.5 w-3.5" />
          ) : (
            <HiOutlineLockOpen className="h-3.5 w-3.5" />
          )}
        </button>
      </Tooltip>

      <ExportSelectionPopover nodeIds={[nodeId]} />
    </>
  );
}
