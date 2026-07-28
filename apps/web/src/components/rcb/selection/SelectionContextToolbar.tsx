import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineBars3,
  HiOutlineBars3BottomLeft,
  HiOutlineBars3BottomRight,
  HiOutlineBold,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCodeBracket,
  HiOutlineItalic,
  HiOutlineLink,
  HiOutlineLinkSlash,
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
import ImageQuickEditComposer from '@/components/editor/nodes/ImageNode/ImageQuickEditComposer';
import { ExportSelectionPopover } from '@/components/editor/panels/ExportSelectionPanel';
import { ImageToolSep, imageToolBtn } from '@/components/editor/nodes/ImageNode/imageToolbarShared';
import {
  buildMarkdownTextAttrs,
  buildTextAttrsPreservingMarkdown,
  isTextBold,
  isTextItalic,
  isTextStrike,
  measurePlainTextSize,
  parseNodeMarkdown,
  parseNodeTextStyle,
} from '@/components/rcb/scene/sceneText';
import { markdownToPlain } from '@/components/rcb/scene/sceneMarkdown';
import { isIconImageNode, isImageGeneratorNode, type ImageProcessKind } from '@/components/rcb/scene/sceneDocument';
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
import { SelectionToolbarShell } from '@/components/rcb/selection/SelectionToolbarShell';
import { radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import { supportsCornerRadius } from '@/components/rcb/scene/sceneDocument';
import {
  buildOutlinePathAsync,
  canOutlineNode,
  outlineNodePatch,
  requestEnterPathEdit,
} from '@/components/rcb/scene/outlineToPath';
import {
  familyHasBoldFace,
  getFontChildren,
  loadFontCatalog,
  parseWeightSelectValue,
  resolveWeightSelectValue,
  weightOptionsForFamily,
} from '@/components/rcb/scene/fontCatalog';
import { TbVectorBezier } from 'react-icons/tb';
import { message } from '@/components/base';
import { cn } from '@/utils/classnames';

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
  const quickEditOpen =
    kind === 'image' &&
    imageToolPanel?.kind === 'quickEdit' &&
    imageToolPanel?.nodeId === nodeId;
  const [mdOpen, setMdOpen] = useState(false);
  const [fontCatalogTick, setFontCatalogTick] = useState(0);
  const style = useMemo(
    () => (kind === 'text' ? parseNodeTextStyle(node?.attrs || {}) : null),
    [kind, node?.attrs]
  );

  useEffect(() => {
    let cancelled = false;
    loadFontCatalog().then(() => {
      if (!cancelled) setFontCatalogTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!node || !box) return null;
  // Generator plate uses its own composer overlay — hide photo AI selection chrome.
  if (isImageGeneratorNode(node)) return null;

  const patchTextStyle = (partial: Record<string, unknown>) => {
    const next = buildTextAttrsPreservingMarkdown(node.attrs || {}, {
      ...parseNodeTextStyle(node.attrs || {}),
      ...partial,
    } as any);
    dispatch(patchDocumentNode({ nodeId, patch: { attrs: next } }));
  };

  const textAlign = String(style?.textAlign || 'left');
  const fontFamily = String(style?.fontFamily || 'Alibaba PuHuiTi');
  void fontCatalogTick;
  const weightFaces = weightOptionsForFamily(fontFamily);
  const weightSelectOptions = weightFaces.map((o) => ({ value: o.value, label: o.label }));
  const weightSelectValue = resolveWeightSelectValue(fontFamily, style?.fontWeight);
  const weightDisplayLabel =
    weightFaces.find((o) => o.value === weightSelectValue)?.label ||
    weightFaces[0]?.label ||
    'Regular';
  const showWeightSelect = weightFaces.length > 1;
  const showBoldToggle = familyHasBoldFace(fontFamily);

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

  const showBlend = !(kind === 'image' && isIconImageNode(node));
  const imageAspectLocked = (() => {
    const raw = node?.attrs?.lockAspect;
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
    return kind === 'image';
  })();
  const blendControl = showBlend ? (
    <BlendModeControl
      blendMode={node?.attrs?.blendMode}
      opacity={node?.attrs?.opacity}
      allowPassThrough={kind === 'frame'}
      onBlendModeChange={(mode) =>
        dispatch(patchDocumentNode({ nodeId, patch: { attrs: { blendMode: mode } } }))
      }
      onOpacityChange={(opacity) =>
        dispatch(patchDocumentNode({ nodeId, patch: { attrs: { opacity } } }))
      }
    />
  ) : null;

  if (quickEditOpen) {
    return <ImageQuickEditComposer document={document} nodeId={nodeId} box={box} />;
  }

  return (
    <>
      <SelectionToolbarShell
        box={box}
        hasTitleLabel={kind === 'image'}
        bare={kind === 'image' && isIconImageNode(node)}
      >
          {/* Order: Style/Edit → Geometry → Blend/Opacity → Actions */}
          {kind === 'text' && style ? (
            <>
              <ColorPanelPopover
                value={String(style.fill || '#333333')}
                opacity={style.fillOpacity ?? 100}
                showAlpha
                onChange={(hex) => patchTextStyle({ fill: hex })}
                onOpacityChange={(opacity) => patchTextStyle({ fillOpacity: opacity })}
                title={'文字颜色'}
                placement="bottom-start"
                className={btn}
              />
              <FontFamilyPicker
                value={fontFamily}
                onChange={({ fontFamily: nextFamily, fontWeight }) => {
                  patchTextStyle({ fontFamily: nextFamily, fontWeight });
                  setFontCatalogTick((n) => n + 1);
                }}
              />
              {showWeightSelect ? (
                <ToolbarMenuSelect
                  value={weightSelectValue}
                  options={weightSelectOptions}
                  onChange={(v) => {
                    const parsed = parseWeightSelectValue(v);
                    patchTextStyle({ fontFamily: parsed.family, fontWeight: parsed.weight });
                  }}
                  displayLabel={weightDisplayLabel}
                />
              ) : null}
              <ToolbarMenuSelect
                value={String(style.fontSize)}
                options={SIZE_OPTIONS}
                onChange={(v) => patchTextStyle({ fontSize: Number(v) })}
                displayLabel={String(style.fontSize)}
                editable
                inputMin={1}
                inputMax={400}
              />
              {showBoldToggle ? (
                <Tooltip title={t('editor.imageToolbar.bold')} placement="top">
                  <button
                    type="button"
                    aria-label={t('editor.imageToolbar.bold')}
                    className={cn(SEL_ICON_BTN, isTextBold(style) && SEL_ICON_BTN_ACTIVE)}
                    aria-pressed={isTextBold(style)}
                    onClick={() => {
                      const children = getFontChildren(fontFamily);
                      const pickFace = (child: (typeof children)[number]) => {
                        const shared =
                          children.filter((c) => c.family === child.family).length > 1;
                        const key =
                          shared && child.weight != null
                            ? `${child.family}::${child.weight}`
                            : child.family;
                        const parsed = parseWeightSelectValue(key);
                        patchTextStyle({
                          fontFamily: parsed.family,
                          fontWeight: parsed.weight,
                        });
                      };
                      if (isTextBold(style)) {
                        const regular =
                          children.find((c) => (c.weight ?? 400) === 400) || children[0];
                        if (regular) pickFace(regular);
                        else patchTextStyle({ fontWeight: 'normal' });
                      } else {
                        const bold =
                          children.find((c) => (c.weight ?? 0) >= 700) ||
                          children.find((c) => (c.weight ?? 0) >= 600);
                        if (bold) pickFace(bold);
                      }
                    }}
                  >
                    <HiOutlineBold className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              ) : null}
              <Tooltip title={t('editor.imageToolbar.italic')} placement="top">
                <button
                  type="button"
                  aria-label={t('editor.imageToolbar.italic')}
                  className={cn(SEL_ICON_BTN, isTextItalic(style) && SEL_ICON_BTN_ACTIVE)}
                  aria-pressed={isTextItalic(style)}
                  onClick={() =>
                    patchTextStyle({ fontStyle: isTextItalic(style) ? 'normal' : 'italic' })
                  }
                >
                  <HiOutlineItalic className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip title={t('editor.imageToolbar.strike')} placement="top">
                <button
                  type="button"
                  aria-label={t('editor.imageToolbar.strike')}
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
              <Tooltip title={t('editor.imageToolbar.align')} placement="top">
                <button
                  type="button"
                  aria-label={t('editor.imageToolbar.align')}
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
              {canOutlineNode(node) ? (
                <Tooltip title="Outline" placement="top">
                  <button
                    type="button"
                    aria-label="Outline"
                    className={SEL_ICON_BTN}
                    onClick={() => {
                      void (async () => {
                        const hide = message.loading('Outlining…', 0);
                        try {
                          const outline = await buildOutlinePathAsync(node);
                          if (!outline?.pathD) {
                            message.error('Outline failed');
                            return;
                          }
                          const patch = outlineNodePatch(node, outline);
                          dispatch(
                            patchDocumentNode({
                              nodeId,
                              patch: {
                                key: 'shape',
                                x: patch.x,
                                y: patch.y,
                                width: patch.width,
                                height: patch.height,
                                attrs: patch.attrs,
                              },
                            })
                          );
                          requestEnterPathEdit(nodeId);
                          message.success('Outlined');
                        } finally {
                          hide();
                        }
                      })();
                    }}
                  >
                    <TbVectorBezier className="h-4 w-4" />
                  </button>
                </Tooltip>
              ) : null}
              {blendControl ? (
                <>
                  <Sep />
                  {blendControl}
                </>
              ) : null}
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
                <button
                  type="button"
                  className={imageToolBtn}
                  onClick={() =>
                    dispatch(openImageToolPanel({ nodeId, kind: 'quickEdit' }))
                  }
                >
                  <HiOutlineChatBubbleLeftRight className="h-4 w-4" strokeWidth={2} />
                  <span>{t('editor.imageToolbar.chat')}</span>
                </button>
                <ImageToolSep />
                <ImageToolbarEditTools
                  onUpscale={(preset) =>
                    runImageProcess('upscale', t('editor.imageToolbar.processingUpscale'), {
                      targetWidth: preset.width,
                      targetHeight: preset.height,
                    })
                  }
                  onRemoveBg={(mode) =>
                    runImageProcess(
                      'removeBg',
                      t('editor.imageToolbar.processingRemoveBg'),
                      undefined,
                      { cutoutMode: mode }
                    )
                  }
                  onEraser={() =>
                    dispatch(openImageToolPanel({ nodeId, kind: 'eraser' }))
                  }
                  onMultiAngle={() =>
                    dispatch(openImageToolPanel({ nodeId, kind: 'multiAngle' }))
                  }
                />
                {showBlend ? (
                  <>
                    <Sep />
                    <BlendModeControl
                      blendMode={node?.attrs?.blendMode}
                      opacity={node?.attrs?.opacity}
                      onBlendModeChange={(mode) =>
                        dispatch(
                          patchDocumentNode({ nodeId, patch: { attrs: { blendMode: mode } } })
                        )
                      }
                      onOpacityChange={(opacity) =>
                        dispatch(patchDocumentNode({ nodeId, patch: { attrs: { opacity } } }))
                      }
                      afterBlendSlot={
                        supportsCornerRadius(node) ? (
                          <Tooltip title={t('editor.imageToolbar.cornerRadius')} placement="top">
                            <button
                              type="button"
                              aria-label={t('editor.imageToolbar.cornerRadius')}
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
                    />
                  </>
                ) : null}
                <ImageToolbarMoreDownload
                  onAction={(key) => {
                    if (key === 'expand') {
                      dispatch(openImageToolPanel({ nodeId, kind: 'expand' }));
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
                  }}
                />
                <Sep />
                <Tooltip
                  title={
                    imageAspectLocked
                      ? t('editor.imageToolbar.unlockAspect')
                      : t('editor.imageToolbar.lockAspect')
                  }
                  placement="top"
                >
                  <button
                    type="button"
                    aria-label={
                      imageAspectLocked
                        ? t('editor.imageToolbar.unlockAspect')
                        : t('editor.imageToolbar.lockAspect')
                    }
                    aria-pressed={imageAspectLocked}
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
                      imageAspectLocked && 'bg-[var(--accent-soft)] text-[var(--ink)]'
                    )}
                    onClick={() =>
                      dispatch(
                        patchDocumentNode({
                          nodeId,
                          patch: {
                            attrs: { lockAspect: imageAspectLocked ? 'false' : 'true' },
                          },
                        })
                      )
                    }
                  >
                    {imageAspectLocked ? (
                      <HiOutlineLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                    ) : (
                      <HiOutlineLinkSlash className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                  </button>
                </Tooltip>
                <ImageFullscreenPreviewButton src={String(node?.attrs?.src || '')} />
                <ExportSelectionPopover
                  nodeIds={[nodeId]}
                  triggerClassName={imageToolBtn}
                />
              </>
            )
          ) : null}

          {kind === 'shape' || kind === 'rect' || kind === 'ellipse' || kind === 'path' ? (
            <>
              <ShapeSelectionToolbar nodeId={nodeId} node={node} box={box} hideExport />
              {blendControl ? (
                <>
                  <Sep />
                  {blendControl}
                </>
              ) : null}
              <Sep />
              <ExportSelectionPopover nodeIds={[nodeId]} />
            </>
          ) : null}
          {kind === 'svg' ? (
            <>
              {blendControl ? (
                <>
                  {blendControl}
                  <Sep />
                </>
              ) : null}
              <ExportSelectionPopover nodeIds={[nodeId]} />
            </>
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
