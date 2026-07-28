import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { message, DropdownPanel, DropdownPanelItem } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import {
  fillPanelPreview,
  type FillPanelValue,
} from '@/components/editor/panels/FillPanel';
import { ExportSelectionPopover } from '@/components/editor/panels/ExportSelectionPanel';
import {
  fillImageFieldsFromAttrs,
  parseFillType,
} from '@/components/rcb/scene/sceneFill';
import { boolEffectAttr } from '@/components/rcb/scene/sceneEffects';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import {
  addNodeToDocument,
  createShapeNode,
  groupNodesInDocument,
  removeNodesFromDocument,
  resolveSelectionNodeIds,
  selectionSharedGroupId,
  supportsAspectPresets,
  supportsCornerRadius,
  supportsFill,
  supportsStroke,
  supportsBooleanOp,
  ungroupNodesInDocument,
} from '@/components/rcb/scene/sceneDocument';
import {
  openShapeStylePanel,
  patchDocumentNode,
  setDocument,
  setMixedSelection,
  setSelectedNodeId,
  setSelectedNodeIds,
} from '@/store/modules/editor';
import { cn } from '@/utils/classnames';
import {
  SEL_ICON_BTN,
  SEL_ICON_BTN_ACTIVE,
  SEL_TOOL_BTN,
} from './ToolbarValueSlider';
import {
  FillColorSwatch,
  IconCornerRadius,
  StrokeColorSwatch,
} from './StyleToolbarIcons';
import BlendModeControl from './BlendModeControl';
import { SelectionToolbarShell } from './SelectionToolbarShell';
import AspectRatioPresetMenu, {
  ELEMENT_ASPECT_PRESETS,
} from './AspectRatioPresetMenu';
import {
  matchAspectPresetKey,
  sizeFromAspectPreset,
} from './resizeGeometry';
import { radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import { computeShapeBoolean, applyBooleanResultPaint, type BoolMode } from './shapeBoolean';

const ASPECT_ORIG_W = 'aspect-original-width';
const ASPECT_ORIG_H = 'aspect-original-height';

type SceneBox = { left: number; top: number; width: number; height: number };

type Props = {
  document: any;
  nodeIds: string[];
  /** Co-selected artboards — group/ungroup expand to content inside them. */
  frameIds?: string[];
  box: SceneBox;
};

const btn = SEL_TOOL_BTN;

const iconBtn = SEL_ICON_BTN;

function Sep() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />;
}

/** Soft gap between sibling clusters (e.g. H-align vs V-align). */
function ClusterGap() {
  return <div className="w-1 shrink-0" aria-hidden />;
}

type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom';

type NodeBox = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  shapeType: string;
  fill: string;
  stroke: string;
  borderWidth: number;
  path?: string;
  angle?: number;
  sides?: number;
};

function readBoxes(document: any, nodeIds: string[]): NodeBox[] {
  return nodeIds
    .map((id) => {
      const node = document?.deltaSetLike?.[id];
      if (!node) return null;
      const { left, top } = nodeLeftTop(document, node);
      const pathRaw = node.attrs?.path != null ? String(node.attrs.path) : '';
      const angle = Number(node.attrs?.angle ?? 0) || 0;
      const sidesRaw = Number(node.attrs?.sides);
      return {
        id,
        left,
        top,
        width: Math.max(1, Number(node.width) || 1),
        height: Math.max(1, Number(node.height) || 1),
        shapeType: String(node.attrs?.shapeType || (node.key === 'shape' ? 'rect' : node.key || '')),
        fill: String(node.attrs?.['fill-color'] || '#FFFFFF'),
        stroke: String(node.attrs?.['border-color'] || '#333333'),
        borderWidth: Number(node.attrs?.['border-width'] ?? 1) || 1,
        path: pathRaw || undefined,
        angle,
        sides: Number.isFinite(sidesRaw) ? sidesRaw : undefined,
      };
    })
    .filter(Boolean) as NodeBox[];
}

/** Align icons */
function IconAlignLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="1.5" height="12" rx="0.5" />
      <rect x="5" y="3.5" width="8" height="2" rx="0.5" />
      <rect x="5" y="7" width="5.5" height="2" rx="0.5" />
      <rect x="5" y="10.5" width="7" height="2" rx="0.5" />
    </svg>
  );
}
function IconAlignCenterX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="7.25" y="2" width="1.5" height="12" rx="0.5" />
      <rect x="3.5" y="3.5" width="9" height="2" rx="0.5" />
      <rect x="5" y="7" width="6" height="2" rx="0.5" />
      <rect x="4" y="10.5" width="8" height="2" rx="0.5" />
    </svg>
  );
}
function IconAlignRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="12.5" y="2" width="1.5" height="12" rx="0.5" />
      <rect x="3" y="3.5" width="8" height="2" rx="0.5" />
      <rect x="5.5" y="7" width="5.5" height="2" rx="0.5" />
      <rect x="4" y="10.5" width="7" height="2" rx="0.5" />
    </svg>
  );
}
function IconAlignTop({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="12" height="1.5" rx="0.5" />
      <rect x="3.5" y="5" width="2" height="8" rx="0.5" />
      <rect x="7" y="5" width="2" height="5.5" rx="0.5" />
      <rect x="10.5" y="5" width="2" height="7" rx="0.5" />
    </svg>
  );
}
function IconAlignMiddle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="7.25" width="12" height="1.5" rx="0.5" />
      <rect x="3.5" y="3.5" width="2" height="9" rx="0.5" />
      <rect x="7" y="5" width="2" height="6" rx="0.5" />
      <rect x="10.5" y="4" width="2" height="8" rx="0.5" />
    </svg>
  );
}
function IconAlignBottom({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="12.5" width="12" height="1.5" rx="0.5" />
      <rect x="3.5" y="3" width="2" height="8" rx="0.5" />
      <rect x="7" y="5.5" width="2" height="5.5" rx="0.5" />
      <rect x="10.5" y="4" width="2" height="7" rx="0.5" />
    </svg>
  );
}

/** Boolean icons */
function IconBoolUnion({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M3 6h8v8H3V6Zm5-3h8v8h-8V3Zm0 3h3v5H8V6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function IconBoolSubtract({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M3 6h8v8H3V6Z" />
      <path fill="var(--surface, #fff)" d="M8 3h8v8H8V3Z" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        d="M8.6 3.6h6.8v6.8H8.6V3.6Z"
      />
    </svg>
  );
}
function IconBoolIntersect({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path opacity="0.22" d="M3 6h8v8H3V6Zm5-3h8v8H8V3Z" />
      <path d="M8 6h3v5H8V6Z" />
    </svg>
  );
}
function IconBoolExclude({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M3 6h8v8H3V6Zm5-3h8v8H8V3ZM8 6h3v5H8V6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconDistributeMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="2.5" width="2.2" height="11" rx="0.4" />
      <rect x="7" y="4.5" width="2.2" height="7" rx="0.4" />
      <rect x="12" y="3.5" width="2.2" height="9" rx="0.4" />
    </svg>
  );
}

function IconGroup({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" strokeDasharray="2.2 1.6" />
    </svg>
  );
}

/** Dashed box with diagonal slash — ungroup (fig.1). */
function IconUngroup({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" strokeDasharray="2.2 1.6" />
      <path d="M3.5 12.5 L12.5 3.5" strokeLinecap="round" />
    </svg>
  );
}

/** Multi-select floating bar with inline align, distribute, and boolean ops. */
export default function MultiSelectionToolbar({
  document,
  nodeIds,
  frameIds = [],
  box,
}: Props): ReactNode {
  const dispatch = useDispatch();
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [booleanOpen, setBooleanOpen] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);

  /** Explicit nodes ∪ content inside co-selected artboards. */
  const opNodeIds = useMemo(
    () => resolveSelectionNodeIds(document, nodeIds, frameIds),
    [document, nodeIds, frameIds]
  );

  const boxes = useMemo(() => readBoxes(document, opNodeIds), [document, opNodeIds]);

  const shapeBoxes = useMemo(
    () =>
      boxes.filter((b) => {
        const node = document?.deltaSetLike?.[b.id];
        return supportsBooleanOp(node);
      }),
    [boxes, document]
  );

  const allSupport = (pred: (node: any) => boolean) =>
    opNodeIds.length > 0 &&
    opNodeIds.every((id) => pred(document?.deltaSetLike?.[id]));

  const showBoolean = shapeBoxes.length >= 2 && allSupport(supportsBooleanOp);
  const showStroke = allSupport(supportsStroke);
  const showFill = allSupport(supportsFill);
  const showCornerRadius = allSupport(supportsCornerRadius);
  const showAspectPresets = allSupport(supportsAspectPresets);
  const canAlign = boxes.length >= 2;
  const canDistribute = boxes.length >= 3;

  const activeRatioId = useMemo(
    () => matchAspectPresetKey(box.width, box.height, ELEMENT_ASPECT_PRESETS),
    [box.width, box.height]
  );

  const patchGeom = (id: string, patch: { x?: number; y?: number; width?: number; height?: number }) => {
    dispatch(patchDocumentNode({ nodeId: id, patch }));
  };

  const align = (mode: AlignMode) => {
    if (boxes.length < 2) return;
    const minL = Math.min(...boxes.map((b) => b.left));
    const maxR = Math.max(...boxes.map((b) => b.left + b.width));
    const minT = Math.min(...boxes.map((b) => b.top));
    const maxB = Math.max(...boxes.map((b) => b.top + b.height));
    const midX = (minL + maxR) / 2;
    const midY = (minT + maxB) / 2;

    for (const b of boxes) {
      if (mode === 'left') patchGeom(b.id, { x: minL });
      if (mode === 'centerX') patchGeom(b.id, { x: midX - b.width / 2 });
      if (mode === 'right') patchGeom(b.id, { x: maxR - b.width });
      if (mode === 'top') patchGeom(b.id, { y: minT });
      if (mode === 'middle') patchGeom(b.id, { y: midY - b.height / 2 });
      if (mode === 'bottom') patchGeom(b.id, { y: maxB - b.height });
    }
    setDistributeOpen(false);
  };

  const distribute = (axis: 'h' | 'v') => {
    if (boxes.length < 3) {
      message.warning('至少选中 3 个元素才能分布');
      return;
    }
    const sorted = [...boxes].sort((a, b) => (axis === 'h' ? a.left - b.left : a.top - b.top));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (axis === 'h') {
      const span =
        last.left + last.width - first.left - sorted.reduce((s, b) => s + b.width, 0);
      const gap = span / (sorted.length - 1);
      let x = first.left;
      sorted.forEach((b, i) => {
        if (i === 0) {
          x = b.left + b.width + gap;
          return;
        }
        if (i === sorted.length - 1) return;
        patchGeom(b.id, { x });
        x += b.width + gap;
      });
    } else {
      const span =
        last.top + last.height - first.top - sorted.reduce((s, b) => s + b.height, 0);
      const gap = span / (sorted.length - 1);
      let y = first.top;
      sorted.forEach((b, i) => {
        if (i === 0) {
          y = b.top + b.height + gap;
          return;
        }
        if (i === sorted.length - 1) return;
        patchGeom(b.id, { y });
        y += b.height + gap;
      });
    }
    setDistributeOpen(false);
  };

  const runBoolean = (mode: BoolMode) => {
    if (shapeBoxes.length < 2) {
      message.warning('布尔运算需至少 2 个形状');
      return;
    }

    const ids = shapeBoxes.map((b) => b.id);
    const { result, usedFallback, hasNonRect } = computeShapeBoolean(shapeBoxes, mode);

    if (!result) {
      if (mode === 'intersect') {
        message.warning('没有重叠区域');
      } else {
        message.warning('布尔运算失败');
      }
      return;
    }

    if (usedFallback && hasNonRect) {
      message.warning('已使用包围盒近似；部分形状轮廓未能精确计算');
    }

    const sample = shapeBoxes[0];
    const sampleNode = document?.deltaSetLike?.[sample.id];
    const { id, node } = createShapeNode({
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height,
      shapeType: 'path',
      fill: sample.fill,
      stroke: sample.stroke,
      borderWidth: sample.borderWidth,
      path: result.path,
      closed: true,
    });
    const attrs = node.attrs as Record<string, unknown>;
    attrs['fill-rule'] = result.fillRule;
    attrs.closed = 'true';
    applyBooleanResultPaint(
      attrs,
      sampleNode?.attrs as Record<string, unknown> | undefined,
      { stroke: sample.stroke, borderWidth: sample.borderWidth }
    );

    let next = addNodeToDocument(document, id, node);
    next = removeNodesFromDocument(next, ids);
    dispatch(setDocument(next));
    dispatch(setSelectedNodeIds([id]));
    dispatch(setSelectedNodeId(id));
    setDistributeOpen(false);
    setBooleanOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey) return;
      if (e.key.toLowerCase() !== 'u') return;
      e.preventDefault();
      runBoolean('union');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, shapeBoxes]);

  useEffect(() => {
    if (!distributeOpen && !booleanOpen) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-multi-toolbar-menu]')) return;
      setDistributeOpen(false);
      setBooleanOpen(false);
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, [distributeOpen, booleanOpen]);

  const openStyle = (kind: 'fill' | 'stroke' | 'radius') => {
    const ids =
      kind === 'fill'
        ? opNodeIds.filter((id) => supportsFill(document?.deltaSetLike?.[id]))
        : kind === 'stroke'
          ? opNodeIds.filter((id) => supportsStroke(document?.deltaSetLike?.[id]))
          : opNodeIds.filter((id) => supportsCornerRadius(document?.deltaSetLike?.[id]));
    if (!ids.length) return;
    dispatch(openShapeStylePanel({ kind, nodeIds: ids }));
  };

  const setSize = (axis: 'w' | 'h', raw: string) => {
    const n = Math.max(1, Math.round(Number(raw) || 0));
    if (!Number.isFinite(n) || !box) return;
    // Toolbar shows Math.round(chrome); blur with the same digits must be a no-op
    // (otherwise sx = round(w)/w quietly shrinks/grows the path).
    if (axis === 'w' && n === Math.round(box.width)) return;
    if (axis === 'h' && n === Math.round(box.height)) return;
    const oldW = Math.max(1, box.width);
    const oldH = Math.max(1, box.height);
    let newW = oldW;
    let newH = oldH;
    if (axis === 'w') newW = n;
    else newH = n;
    const sx = newW / oldW;
    const sy = newH / oldH;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    for (const b of boxes) {
      const ncx = b.left + b.width / 2;
      const ncy = b.top + b.height / 2;
      const nw = Math.max(1, Math.round(b.width * sx));
      const nh = Math.max(1, Math.round(b.height * sy));
      const nx = Math.round(cx + (ncx - cx) * sx - nw / 2);
      const ny = Math.round(cy + (ncy - cy) * sy - nh / 2);
      patchGeom(b.id, { x: nx, y: ny, width: nw, height: nh });
    }
  };

  if (!boxes.length || !box) return null;

  const fillSourceId =
    opNodeIds.find((id) => supportsFill(document?.deltaSetLike?.[id])) || opNodeIds[0];
  const firstAttrs = document?.deltaSetLike?.[fillSourceId]?.attrs || {};
  const fillSample: FillPanelValue = {
    fillType: parseFillType(firstAttrs['fill-type']),
    fillColor: String(firstAttrs['fill-color'] || '#FFFFFF'),
    fillOpacity: Number(firstAttrs['fill-opacity'] ?? 100),
    fillGradient:
      firstAttrs['fill-gradient'] != null ? String(firstAttrs['fill-gradient']) : undefined,
    ...fillImageFieldsFromAttrs(firstAttrs),
  };
  const fillVisible = opNodeIds
    .filter((id) => supportsFill(document?.deltaSetLike?.[id]))
    .every((id) => {
      const a = document?.deltaSetLike?.[id]?.attrs || {};
      return boolEffectAttr(a['fill-enabled'], true) && boolEffectAttr(a['fill-visible'], true);
    });
  const fillPreview = fillVisible ? fillPanelPreview(fillSample) : 'transparent';
  const strokeVisible = opNodeIds.every((id) => {
    const a = document?.deltaSetLike?.[id]?.attrs || {};
    return (
      boolEffectAttr(a['stroke-enabled'], true) && boolEffectAttr(a['stroke-visible'], true)
    );
  });
  const strokeColor = String(firstAttrs['border-color'] || firstAttrs.stroke || '#333333');
  const radiusSample = radiiFromAttrs(firstAttrs).tl;

  const alignH: Array<{ mode: AlignMode; tip: string; Icon: typeof IconAlignLeft }> = [
    { mode: 'left', tip: '左对齐', Icon: IconAlignLeft },
    { mode: 'centerX', tip: '水平居中', Icon: IconAlignCenterX },
    { mode: 'right', tip: '右对齐', Icon: IconAlignRight },
  ];
  const alignV: Array<{ mode: AlignMode; tip: string; Icon: typeof IconAlignLeft }> = [
    { mode: 'top', tip: '顶部对齐', Icon: IconAlignTop },
    { mode: 'middle', tip: '垂直居中', Icon: IconAlignMiddle },
    { mode: 'bottom', tip: '底部对齐', Icon: IconAlignBottom },
  ];

  const boolItems: Array<{ mode: BoolMode; tip: string; Icon: typeof IconBoolUnion }> = [
    { mode: 'union', tip: '并集 (Ctrl + Alt + U)', Icon: IconBoolUnion },
    { mode: 'subtract', tip: '减去', Icon: IconBoolSubtract },
    { mode: 'intersect', tip: '相交', Icon: IconBoolIntersect },
    { mode: 'exclude', tip: '排除', Icon: IconBoolExclude },
  ];

  const groupId = selectionSharedGroupId(document, opNodeIds);

  const createGroup = () => {
    if (opNodeIds.length < 2) return;
    const next = groupNodesInDocument(document, opNodeIds);
    dispatch(setDocument(next));
    dispatch(setMixedSelection({ nodeIds: opNodeIds, frameIds }));
  };

  const ungroup = () => {
    const next = ungroupNodesInDocument(document, opNodeIds);
    dispatch(setDocument(next));
    dispatch(setMixedSelection({ nodeIds: opNodeIds, frameIds }));
  };

  // Fig.1 — selected group: 解除编组 | export
  if (groupId) {
    return (
      <SelectionToolbarShell box={box}>
            <Tooltip title={'解除编组'} placement="top">
              <button
                type="button"
                className={btn}
                aria-label={'解除编组'}
                onClick={ungroup}
              >
                <IconUngroup className="h-3.5 w-3.5" />
                <span>{'解除编组'}</span>
              </button>
            </Tooltip>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />
            <ExportSelectionPopover nodeIds={opNodeIds} />
      </SelectionToolbarShell>
    );
  }

  const layoutCluster =
    canAlign || canDistribute ? (
      <>
        {canAlign ? (
          <>
            <div className="inline-flex items-center gap-0.5" role="group" aria-label="水平对齐">
              {alignH.map(({ mode, tip, Icon }) => (
                <Tooltip key={mode} title={tip} placement="top">
                  <button
                    type="button"
                    aria-label={tip}
                    className={iconBtn}
                    onClick={() => align(mode)}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </Tooltip>
              ))}
            </div>
            <ClusterGap />
            <div className="inline-flex items-center gap-0.5" role="group" aria-label="垂直对齐">
              {alignV.map(({ mode, tip, Icon }) => (
                <Tooltip key={mode} title={tip} placement="top">
                  <button
                    type="button"
                    aria-label={tip}
                    className={iconBtn}
                    onClick={() => align(mode)}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </>
        ) : null}

        {canDistribute ? (
          <>
            {canAlign ? <ClusterGap /> : null}
            <div className="relative" data-multi-toolbar-menu>
              <Tooltip title="分布" placement="top">
                <button
                  type="button"
                  aria-label="分布"
                  className={cn(iconBtn, distributeOpen && SEL_ICON_BTN_ACTIVE)}
                  onClick={() => {
                    setBooleanOpen(false);
                    setDistributeOpen((v) => !v);
                  }}
                >
                  <IconDistributeMenu className="h-4 w-4" />
                </button>
              </Tooltip>
              {distributeOpen ? (
                <DropdownPanel className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[9rem]">
                  <DropdownPanelItem onClick={() => distribute('h')}>水平分布</DropdownPanelItem>
                  <DropdownPanelItem onClick={() => distribute('v')}>垂直分布</DropdownPanelItem>
                </DropdownPanel>
              ) : null}
            </div>
          </>
        ) : null}
      </>
    ) : null;

  const booleanCluster = showBoolean ? (
    <div className="relative" data-multi-toolbar-menu>
      <Tooltip title="布尔运算" placement="top">
        <button
          type="button"
          aria-label="布尔运算"
          aria-expanded={booleanOpen}
          className={cn(iconBtn, booleanOpen && SEL_ICON_BTN_ACTIVE)}
          onClick={() => {
            setDistributeOpen(false);
            setBooleanOpen((v) => !v);
          }}
        >
          <IconBoolUnion className="h-4 w-4" />
        </button>
      </Tooltip>
      {booleanOpen ? (
        <DropdownPanel className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[10.5rem]">
          {boolItems.map(({ mode, tip, Icon }) => (
            <DropdownPanelItem
              key={mode}
              onClick={() => runBoolean(mode)}
              className="gap-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--ink)]" />
              <span>{tip.replace(/\s*\(.*\)$/, '')}</span>
            </DropdownPanelItem>
          ))}
        </DropdownPanel>
      ) : null}
    </div>
  ) : null;

  const styleCluster =
    showFill || showStroke || showCornerRadius ? (
      <>
        {showFill ? (
          <Tooltip title="填充" placement="top">
            <button
              type="button"
              aria-label="填充"
              className={cn(SEL_ICON_BTN, !fillVisible && 'opacity-55')}
              onClick={() => openStyle('fill')}
            >
              <FillColorSwatch color={fillPreview} />
            </button>
          </Tooltip>
        ) : null}
        {showStroke ? (
          <Tooltip title="描边" placement="top">
            <button
              type="button"
              aria-label="描边"
              className={cn(SEL_ICON_BTN, !strokeVisible && 'opacity-55')}
              onClick={() => openStyle('stroke')}
            >
              <StrokeColorSwatch color={strokeVisible ? strokeColor : 'var(--line)'} />
            </button>
          </Tooltip>
        ) : null}
        {showCornerRadius ? (
          <Tooltip title="圆角" placement="top">
            <button
              type="button"
              aria-label="圆角"
              className={SEL_TOOL_BTN}
              onClick={() => openStyle('radius')}
            >
              <IconCornerRadius className="h-4 w-4 text-[var(--muted)]" />
              <span className="tabular-nums">{radiusSample}</span>
            </button>
          </Tooltip>
        ) : null}
      </>
    ) : null;

  const transformCluster = (
    <>
      {showAspectPresets ? (
        <AspectRatioPresetMenu
          open={ratioOpen}
          onOpenChange={setRatioOpen}
          activeId={activeRatioId}
          onPick={(preset) => {
            if (preset.id === 'original') {
              for (const b of boxes) {
                const node = document?.deltaSetLike?.[b.id];
                const ow = Number(node?.attrs?.[ASPECT_ORIG_W]);
                const oh = Number(node?.attrs?.[ASPECT_ORIG_H]);
                if (Number.isFinite(ow) && ow > 0 && Number.isFinite(oh) && oh > 0) {
                  patchGeom(b.id, { width: ow, height: oh });
                }
              }
              return;
            }
            const unionNext = sizeFromAspectPreset(box, preset.w, preset.h);
            const sx = unionNext.width / Math.max(1, box.width);
            const sy = unionNext.height / Math.max(1, box.height);
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            for (const b of boxes) {
              const node = document?.deltaSetLike?.[b.id];
              const hasOrig =
                Number(node?.attrs?.[ASPECT_ORIG_W]) > 0 &&
                Number(node?.attrs?.[ASPECT_ORIG_H]) > 0;
              const ncx = b.left + b.width / 2;
              const ncy = b.top + b.height / 2;
              const nw = Math.max(1, Math.round(b.width * sx));
              const nh = Math.max(1, Math.round(b.height * sy));
              const nx = Math.round(cx + (ncx - cx) * sx - nw / 2);
              const ny = Math.round(cy + (ncy - cy) * sy - nh / 2);
              const shapeType = node?.attrs?.shapeType;
              dispatch(
                patchDocumentNode({
                  nodeId: b.id,
                  patch: {
                    x: nx,
                    y: ny,
                    width: nw,
                    height: nh,
                    attrs: {
                      ...(shapeType != null ? { shapeType } : {}),
                      ...(!hasOrig
                        ? {
                            [ASPECT_ORIG_W]: Math.round(b.width),
                            [ASPECT_ORIG_H]: Math.round(b.height),
                          }
                        : {}),
                    },
                  },
                })
              );
            }
          }}
        />
      ) : null}
      <label className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-[12px] text-[var(--ink)]">
        <span className="text-[var(--muted)]">W</span>
        <input
          className="w-10 bg-transparent text-[12px] outline-none"
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
          className="w-10 bg-transparent text-[12px] outline-none"
          defaultValue={Math.round(box.height)}
          key={`h-${Math.round(box.height)}`}
          onBlur={(e) => setSize('h', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSize('h', (e.target as HTMLInputElement).value);
          }}
        />
      </label>
    </>
  );

  const actionCluster = (
    <>
      {opNodeIds.length >= 2 ? (
        <Tooltip title="创建编组" placement="top">
          <button type="button" className={btn} aria-label="创建编组" onClick={createGroup}>
            <IconGroup className="h-3.5 w-3.5" />
            <span>创建编组</span>
          </button>
        </Tooltip>
      ) : null}
      <ExportSelectionPopover nodeIds={opNodeIds} />
    </>
  );

  const appearanceCluster = (
    <BlendModeControl
      blendMode={firstAttrs.blendMode}
      opacity={firstAttrs.opacity}
      allowPassThrough={opNodeIds.every((id) => document?.deltaSetLike?.[id]?.key === 'frame')}
      onBlendModeChange={(mode) => {
        for (const id of opNodeIds) {
          dispatch(patchDocumentNode({ nodeId: id, patch: { attrs: { blendMode: mode } } }));
        }
      }}
      onOpacityChange={(opacity) => {
        for (const id of opNodeIds) {
          dispatch(patchDocumentNode({ nodeId: id, patch: { attrs: { opacity } } }));
        }
      }}
    />
  );

  // Unified order: Style → Layout → Boolean → Geometry → Blend/Opacity → Actions
  const sections = [
    styleCluster,
    layoutCluster,
    booleanCluster,
    transformCluster,
    appearanceCluster,
    actionCluster,
  ].filter(Boolean);

  return (
    <SelectionToolbarShell box={box}>
      {sections.map((section, i) => (
        <div key={i} className="contents">
          {i > 0 ? <Sep /> : null}
          {section}
        </div>
      ))}
    </SelectionToolbarShell>
  );
}
