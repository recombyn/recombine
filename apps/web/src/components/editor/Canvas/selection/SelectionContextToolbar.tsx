import { useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineBars3,
  HiOutlineBars3BottomLeft,
  HiOutlineBars3BottomRight,
  HiOutlineBold,
  HiOutlineCodeBracket,
  HiOutlineItalic,
  HiOutlineStrikethrough,
} from 'react-icons/hi2';
import { ColorPanelPopover } from '@/components/base/colorPanel';
import Tooltip from '@/components/base/tooltip';
import {
  openShapeStylePanel,
  patchDocumentNode,
  startImageProcess,
  openImageToolPanel,
} from '@/store/modules/editor';
import FlipRotateToolbar from '@/components/editor/nodes/ImageNode/FlipRotateToolbar';
import { ExportSelectionPopover } from '@/components/editor/panels/ExportSelectionPanel';
import { imageToolBtn } from '@/components/editor/nodes/ImageNode/imageToolbarShared';
import {
  buildMarkdownTextAttrs,
  buildTextAttrsPreservingMarkdown,
  isTextBold,
  isTextItalic,
  isTextStrike,
  measurePlainTextSize,
  parseNodeMarkdown,
  parseNodeTextStyle,
} from '@/store/scene/sceneText';
import { markdownToPlain } from '@/store/scene/sceneMarkdown';
import { isIconImageNode, type ImageProcessKind } from '@/store/scene/sceneDocument';
import ToolbarMenuSelect from './ToolbarMenuSelect';
import BlendModeControl from './BlendModeControl';
import {
  SEL_ICON_BTN,
  SEL_ICON_BTN_ACTIVE,
  SEL_TOOL_BTN,
} from './ToolbarValueSlider';
import { IconCornerRadius } from './StyleToolbarIcons';
import FontFamilyPicker from '@/components/editor/nodes/TextNode/FontFamilyPicker';
import TextEditDialog from '@/components/editor/nodes/TextNode/TextEditDialog';
import IconAnnotateToolbar from '@/components/editor/nodes/ImageNode/IconAnnotateToolbar';
import ImageToolbarEditTools from '@/components/editor/nodes/ImageNode/ImageToolbarEditTools';
import ImageToolbarMoreDownload from '@/components/editor/nodes/ImageNode/ImageToolbarMoreDownload';
import ImageFullscreenPreviewButton from '@/components/editor/nodes/ImageNode/ImageFullscreenPreviewButton';
import ShapeSelectionToolbar from '@/components/editor/nodes/ShapeNode/ShapeSelectionToolbar';
import { SelectionToolbarShell } from '@/components/editor/Canvas/selection/SelectionToolbarShell';
import { radiiFromAttrs } from '@/store/scene/sceneRadii';
import { supportsCornerRadius } from '@/store/scene/sceneDocument';
import { cn } from '@/utils/classnames';

const WEIGHT_OPTIONS = [
  { value: 'normal', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: 'bold', label: 'Bold' },
  { value: '900', label: 'Black' },
];

const SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72, 80, 96, 108].map((n) => ({
  value: String(n),
  label: String(n),
}));

type SceneBox = { left: number; top: number; width: number; height: number };

type Props = {
  document: any;
  nodeId: string;
  box: SceneBox;
  onOpenAgent?: (opts?: { prompt?: string }) => void;
};

const btn = SEL_TOOL_BTN;

function Sep() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />;
}

function AlignIcon({ align }: { align: string }) {
  if (align === 'center') return <HiOutlineBars3 className="h-4 w-4" />;
  if (align === 'right') return <HiOutlineBars3BottomRight className="h-4 w-4" />;
  return <HiOutlineBars3BottomLeft className="h-4 w-4" />;
}

export default function SelectionContextToolbar(props: Props): ReactNode {
  const { document, nodeId, box } = props;
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const imageToolPanel = useSelector(
    (s: any) => s.editor.imageToolPanel as null | { nodeId: string; kind: string }
  );
  const node = document?.deltaSetLike?.[nodeId];
  const kind = node?.key || 'shape';
  const flipRotateOpen =
    kind === 'image' &&
    imageToolPanel?.kind === 'flipRotate' &&
    imageToolPanel?.nodeId === nodeId;
  const [mdOpen, setMdOpen] = useState(false);
  const style = useMemo(
    () => (kind === 'text' ? parseNodeTextStyle(node?.attrs || {}) : null),
    [kind, node?.attrs]
  );

  if (!node || !box) return null;

  const patchTextStyle = (partial: Record<string, unknown>) => {
    const next = buildTextAttrsPreservingMarkdown(node.attrs || {}, {
      ...parseNodeTextStyle(node.attrs || {}),
      ...partial,
    } as any);
    dispatch(patchDocumentNode({ nodeId, patch: { attrs: next } }));
  };

  const textAlign = String(style?.textAlign || 'left');

  const runImageProcess = (
    kind: ImageProcessKind,
    label: string,
    size?: { targetWidth?: number; targetHeight?: number },
    meta?: Record<string, unknown>
  ) => {
    dispatch(
      startImageProcess({
        sourceId: nodeId,
        kind,
        label,
        targetWidth: size?.targetWidth,
        targetHeight: size?.targetHeight,
        meta,
      })
    );
  };

  return (
    <>
      <SelectionToolbarShell
        box={box}
        hasTitleLabel={kind === 'image'}
        bare={kind === 'image' && isIconImageNode(node)}
      >
          {!(kind === 'image' && isIconImageNode(node)) ? (
            <BlendModeControl
              blendMode={node?.attrs?.blendMode}
              opacity={node?.attrs?.opacity}
              onBlendModeChange={(mode) =>
                dispatch(patchDocumentNode({ nodeId, patch: { attrs: { blendMode: mode } } }))
              }
              onOpacityChange={(opacity) =>
                dispatch(patchDocumentNode({ nodeId, patch: { attrs: { opacity } } }))
              }
            />
          ) : null}
          {kind === 'text' && style ? (
            <>
              <ColorPanelPopover
                value={String(style.fill || '#333333')}
                onChange={(hex) => patchTextStyle({ fill: hex })}
                title={'文字颜色'}
                placement="bottom-start"
                className={btn}
              />
              <FontFamilyPicker
                value={String(style.fontFamily || 'Alibaba PuHuiTi')}
                onChange={({ fontFamily, fontWeight }) =>
                  patchTextStyle({ fontFamily, fontWeight })
                }
              />
              <ToolbarMenuSelect
                value={String(style.fontWeight)}
                options={WEIGHT_OPTIONS}
                onChange={(v) => patchTextStyle({ fontWeight: v })}
                displayLabel={
                  WEIGHT_OPTIONS.find((o) => o.value === String(style.fontWeight))?.label || 'Regular'
                }
              />
              <ToolbarMenuSelect
                value={String(style.fontSize)}
                options={SIZE_OPTIONS}
                onChange={(v) => patchTextStyle({ fontSize: Number(v) })}
                displayLabel={String(style.fontSize)}
                editable
                inputMin={1}
                inputMax={400}
              />
              <Tooltip title={'加粗'} placement="top">
                <button
                  type="button"
                  aria-label={'加粗'}
                  className={cn(SEL_ICON_BTN, isTextBold(style) && SEL_ICON_BTN_ACTIVE)}
                  aria-pressed={isTextBold(style)}
                  onClick={() =>
                    patchTextStyle({ fontWeight: isTextBold(style) ? 'normal' : 'bold' })
                  }
                >
                  <HiOutlineBold className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip title={'倾斜'} placement="top">
                <button
                  type="button"
                  aria-label={'倾斜'}
                  className={cn(SEL_ICON_BTN, isTextItalic(style) && SEL_ICON_BTN_ACTIVE)}
                  aria-pressed={isTextItalic(style)}
                  onClick={() =>
                    patchTextStyle({ fontStyle: isTextItalic(style) ? 'normal' : 'italic' })
                  }
                >
                  <HiOutlineItalic className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip title={'删除线'} placement="top">
                <button
                  type="button"
                  aria-label={'删除线'}
                  className={cn(SEL_ICON_BTN, isTextStrike(style) && SEL_ICON_BTN_ACTIVE)}
                  aria-pressed={isTextStrike(style)}
                  onClick={() =>
                    patchTextStyle({
                      textDecoration: isTextStrike(style) ? 'none' : 'line-through',
                    })
                  }
                >
                  <HiOutlineStrikethrough className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip title={'对齐'} placement="top">
                <button
                  type="button"
                  aria-label={'对齐'}
                  className={btn}
                  onClick={() => {
                    const order = ['left', 'center', 'right'];
                    const i = order.indexOf(textAlign);
                    patchTextStyle({ textAlign: order[(i + 1) % order.length] });
                  }}
                >
                  <AlignIcon align={textAlign} />
                </button>
              </Tooltip>
              <Tooltip title={t('editor.openTextEditor')} placement="top">
                <button
                  type="button"
                  aria-label={t('editor.openTextEditor')}
                  className={SEL_ICON_BTN}
                  onClick={() => setMdOpen(true)}
                >
                  <HiOutlineCodeBracket className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Sep />
              <ExportSelectionPopover nodeIds={[nodeId]} />
            </>
          ) : null}

          {kind === 'image' ? (
            flipRotateOpen ? (
              <FlipRotateToolbar
                nodeId={nodeId}
                angle={Number(node?.attrs?.angle) || 0}
                flipX={node?.attrs?.flipX === true || node?.attrs?.flipX === 'true'}
                flipY={node?.attrs?.flipY === true || node?.attrs?.flipY === 'true'}
                downloadSlot={
                  <ExportSelectionPopover
                    nodeIds={[nodeId]}
                    triggerClassName={imageToolBtn}
                  />
                }
              />
            ) : isIconImageNode(node) ? (
              <IconAnnotateToolbar
                downloadSlot={
                  <ExportSelectionPopover
                    nodeIds={[nodeId]}
                    triggerClassName={cn(imageToolBtn, 'text-white/85 hover:bg-white/10')}
                  />
                }
              />
            ) : (
              <>
                <ImageToolbarEditTools
                  onUpscale={(preset) =>
                    runImageProcess('upscale', '放大中', {
                      targetWidth: preset.width,
                      targetHeight: preset.height,
                    })
                  }
                  onRemoveBg={() => runImageProcess('removeBg', '去背景中')}
                  onEraser={() =>
                    dispatch(openImageToolPanel({ nodeId, kind: 'eraser' }))
                  }
                  onEditElements={() =>
                    runImageProcess('editElements', '编辑元素中')
                  }
                  onEditText={() => runImageProcess('editText', '编辑文字中')}
                  onMultiAngle={() =>
                    dispatch(openImageToolPanel({ nodeId, kind: 'multiAngle' }))
                  }
                  moreSlot={
                    <ImageToolbarMoreDownload
                      onAction={(key) => {
                        if (key === 'expand') {
                          runImageProcess('expand', '扩展中', undefined, {
                            scale: '1.5x',
                            direction: 'all',
                          });
                          return;
                        }
                        if (key === 'crop') {
                          dispatch(openImageToolPanel({ nodeId, kind: 'crop' }));
                          return;
                        }
                        if (key === 'adjust') {
                          dispatch(openImageToolPanel({ nodeId, kind: 'adjust' }));
                          return;
                        }
                        if (key === 'flipRotate') {
                          dispatch(openImageToolPanel({ nodeId, kind: 'flipRotate' }));
                          return;
                        }
                        if (key === 'vector') {
                          runImageProcess('vector', '矢量化中');
                        }
                      }}
                    />
                  }
                  aspectLockSlot={
                    supportsCornerRadius(node) ? (
                      <Tooltip title={'圆角'} placement="top">
                        <button
                          type="button"
                          aria-label={'圆角'}
                          className={SEL_TOOL_BTN}
                          onClick={() =>
                            dispatch(
                              openShapeStylePanel({ kind: 'radius', nodeIds: [nodeId] })
                            )
                          }
                        >
                          <IconCornerRadius className="h-4 w-4 text-[var(--muted)]" />
                          <span className="tabular-nums">
                            {radiiFromAttrs(node.attrs).tl}
                          </span>
                        </button>
                      </Tooltip>
                    ) : null
                  }
                  downloadSlot={
                    <ExportSelectionPopover
                      nodeIds={[nodeId]}
                      triggerClassName={imageToolBtn}
                    />
                  }
                  previewSlot={
                    <ImageFullscreenPreviewButton src={String(node?.attrs?.src || '')} />
                  }
                />
              </>
            )
          ) : null}

          {kind === 'shape' || kind === 'rect' || kind === 'ellipse' || kind === 'path' ? (
            <ShapeSelectionToolbar nodeId={nodeId} node={node} box={box} />
          ) : null}
      </SelectionToolbarShell>

      {kind === 'text' ? (
        <TextEditDialog
          open={mdOpen}
          initialMarkdown={parseNodeMarkdown(node.attrs || {})}
          onClose={() => setMdOpen(false)}
          onSave={(md) => {
            const textStyle = parseNodeTextStyle(node.attrs || {});
            const attrs = buildMarkdownTextAttrs(md, textStyle);
            const plain = markdownToPlain(md);
            const measured = measurePlainTextSize(plain || ' ', textStyle);
            dispatch(
              patchDocumentNode({
                nodeId,
                patch: {
                  attrs,
                  width: Math.max(measured.width, 8),
                  height: Math.max(
                    measured.height,
                    Math.ceil((textStyle.fontSize || 16) * (textStyle.lineHeight || 1.4))
                  ),
                },
              })
            );
          }}
        />
      ) : null}
    </>
  );
}
