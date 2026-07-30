import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { HiOutlineBolt, HiOutlineChevronDown, HiOutlinePlus, HiOutlineViewfinderCircle } from 'react-icons/hi2';
import { generateImage, listModels, type LlmModel } from '@/apis/chat';
import { Dropdown, DropdownPanel, message, Tooltip } from '@/components/base';
import {
  RcbOverlayPortal,
  rcbScreenPxToScene,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '@/components/rcb';
import { SELECTION_TOOLBAR_BELOW_BOX_GAP_PX } from '@/components/rcb/selection/SelectionToolbarShell';
import AgentComposerInput, {
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import {
  ComposerAttachmentChip,
  COMPOSER_ATTACH_ACTION_CLASS,
  COMPOSER_ATTACH_ACTION_IDLE,
  COMPOSER_ATTACH_ACTION_ACTIVE,
} from '@/components/editor/panels/agent/AgentComposerShell';
import {
  applyCanvasPickToImageComposer,
} from '@/components/editor/nodes/ImageGeneratorNode/ImageGeneratorCard';
import ImageAspectRatioPicker, {
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_RESOLUTION,
  modelImageLimits,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import ModelPickerPanel, {
  ModelBrandIcon,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { modelIsImageGenerator } from '@/components/editor/panels/agent/llmModelMeta';
import {
  listImageVariantUrls,
  writeImageVariantsAttr,
  canAttachNodeToChat,
} from '@/components/rcb/scene/sceneDocument';
import {
  clearCanvasAttachPick,
  closeImageToolPanel,
  consumePendingCanvasAttach,
  finishImageProcess,
  patchDocumentNode,
  pushEditorHistory,
  startCanvasAttachPick,
} from '@/store/modules/editor';
import { FREE_IMAGE_MODEL_ID, planAllowsModelPick, type PlanId } from '@/utils/wallet';
import { cn } from '@/utils/classnames';
import { estimateImageCredits } from '@/utils/imageCredits';
import { readFileAsDataUrl } from '@/utils/uploadImage';
import store from '@/store';

type SceneBox = { left: number; top: number; width: number; height: number };

function ratioSummaryLabel(aspectRatio: string, t: (k: string) => string) {
  const raw = String(aspectRatio || '').trim();
  if (raw === 'smart') return t('agent.ratioSmart');
  if (/^\d+x\d+$/i.test(raw)) {
    const [a, b] = raw.toLowerCase().split('x');
    return `${a}×${b}`;
  }
  return raw || '1:1';
}

/**
 * Floating quick-edit composer under a selected image (Chat on image toolbar).
 * Prefills `attrs.genPrompt` when the image was prompt-generated; sends the
 * current image as the primary reference for i2i edits.
 */
function ImageQuickEditComposer({
  document,
  nodeId,
  box,
}: {
  document: any;
  nodeId: string;
  box: SceneBox;
}): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const camera = useRcbCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  const inputRef = useRef<AgentComposerHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const node = document?.deltaSetLike?.[nodeId];
  const src = String(node?.attrs?.src || '').trim();
  const savedPrompt = String(node?.attrs?.genPrompt || '').trim();

  const [prompt, setPrompt] = useState(savedPrompt);
  const [contexts, setContexts] = useState<ComposerContext[]>([]);
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [modelId, setModelId] = useState(FREE_IMAGE_MODEL_ID);
  const [resolution, setResolution] = useState(DEFAULT_IMAGE_RESOLUTION);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_IMAGE_ASPECT_RATIO);
  const [imageCount, setImageCount] = useState(DEFAULT_IMAGE_COUNT);

  const planId = useSelector((s: any) => (s.wallet?.planId as PlanId) || 'free');
  const canPickModel = planAllowsModelPick(planId);
  const canvasAttachPick = useSelector(
    (s: any) => s.editor?.canvasAttachPick as null | { target: string }
  );
  const pendingCanvasAttach = useSelector(
    (s: any) =>
      s.editor?.pendingCanvasAttach as null | {
        target: string;
        payload: string | string[];
      }
  );
  const pickTarget = `node:${nodeId}`;
  const pickingFromCanvas = canvasAttachPick?.target === pickTarget;
  const contextsRef = useRef(contexts);
  contextsRef.current = contexts;

  useEffect(() => {
    setPrompt(savedPrompt);
  }, [nodeId, savedPrompt]);

  useEffect(() => {
    if (!pendingCanvasAttach || pendingCanvasAttach.target !== pickTarget) return;
    const payload = pendingCanvasAttach.payload;
    dispatch(consumePendingCanvasAttach());
    void applyCanvasPickToImageComposer({
      document,
      payload,
      existing: contextsRef.current,
      setContexts,
      insertChip: (ctx) => {
        inputRef.current?.insertContextAtCaret(ctx);
        inputRef.current?.focus();
      },
    });
  }, [pendingCanvasAttach, pickTarget, document, dispatch]);

  // Auto-focus prompt when the floating chat panel opens.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [nodeId]);

  useEffect(() => {
    let cancelled = false;
    setModelsStatus('loading');
    void listModels()
      .then((res) => {
        if (cancelled) return;
        // Same pool as ImageGeneratorCard — image catalog lives in imageModels.
        const pool = [...(res?.models || []), ...(res?.imageModels || [])].filter(
          (m) => modelIsImageGenerator(m) || m.kind === 'image'
        );
        const seen = new Set<string>();
        const imgs = pool.filter((m) => {
          if (!m?.id || seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        setModels(imgs);
        setModelsStatus('ready');
        if (!canPickModel) {
          setModelId(FREE_IMAGE_MODEL_ID);
          return;
        }
        const prefer =
          imgs.find((m) => m.id === modelId) ||
          imgs.find((m) => m.id === FREE_IMAGE_MODEL_ID) ||
          imgs.find((m) => /seedream/i.test(m.id)) ||
          imgs[0];
        if (prefer?.id) setModelId(prefer.id);
      })
      .catch(() => {
        if (!cancelled) setModelsStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
  }, [nodeId, canPickModel]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const attachments = contexts.filter((c) => c.kind === 'attachment');
  const inlineContexts = contexts.filter((c) => c.kind !== 'attachment');
  const selectedModel = models.find((m) => m.id === modelId);
  const creditCost = estimateImageCredits(selectedModel, imageCount, resolution);
  const settingsSummary = `${resolution} · ${ratioSummaryLabel(aspectRatio, t)} · ${imageCount}`;

  const composerStyle = useRcbScreenToolbarStyle({
    left: box.left + box.width / 2,
    top: box.top + box.height + rcbScreenPxToScene(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX, zoom),
    anchor: 'top',
  });

  const removeContext = (key: string) => {
    setContexts((prev) => prev.filter((c) => c.key !== key));
  };

  const onPickRef = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
    void (async () => {
      const results = await Promise.all(
        files.map(async (file, i) => {
          try {
            const dataUrl = await readFileAsDataUrl(file);
            return {
              key: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
              kind: 'attachment' as const,
              label: file.name || 'image',
              payload: dataUrl,
              dataUrl,
              thumbUrl: dataUrl,
            } satisfies ComposerContext;
          } catch {
            return null;
          }
        })
      );
      const next = results.filter(Boolean) as ComposerContext[];
      if (!next.length) return;
      setContexts((prev) => [...prev, ...next]);
    })();
  };

  const onGenerate = async () => {
    const text = prompt.trim();
    if (!text || sending || !src) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSending(true);
    dispatch(pushEditorHistory());
    dispatch(
      patchDocumentNode({
        nodeId,
        skipHistory: true,
        patch: {
          attrs: {
            processStatus: 'running',
            processKind: 'quickEdit',
            processLabel: t('editor.imageToolbar.processingQuickEdit'),
          },
        },
      })
    );
    try {
      const body: Parameters<typeof generateImage>[0] = {
        prompt: text,
        model: canPickModel ? modelId : FREE_IMAGE_MODEL_ID,
        quality: DEFAULT_IMAGE_QUALITY,
        resolution,
        images: [
          src,
          ...attachments
            .map((c) => String(c.dataUrl || c.thumbUrl || '').trim())
            .filter(Boolean),
        ],
      };
      if (aspectRatio !== 'smart') body.aspect_ratio = aspectRatio;

      const count = Math.max(1, Math.min(4, Math.round(imageCount) || 1));
      const pickUrl = (res: Awaited<ReturnType<typeof generateImage>>) => {
        const fromImages =
          Array.isArray(res?.images) && res.images.find((u) => String(u || '').trim());
        if (fromImages) return String(fromImages).trim();
        const fromAssets =
          Array.isArray(res?.assets) &&
          res.assets.map((a) => String(a?.url || '').trim()).find(Boolean);
        return fromAssets ? String(fromAssets).trim() : '';
      };
      const slotUrls = await Promise.all(
        Array.from({ length: count }, async () => {
          if (ac.signal.aborted) return '';
          try {
            const res = await generateImage(body, { signal: ac.signal });
            return pickUrl(res);
          } catch {
            return '';
          }
        })
      );
      const urls = slotUrls.filter(Boolean);
      const nextSrc = urls[0] || '';
      if (!nextSrc) throw new Error(t('editor.tools.imageGenEmpty'));

      const prev = listImageVariantUrls(node);
      const stack = [...new Set([nextSrc, ...urls, ...prev.filter((u) => u !== nextSrc)])];
      const variantAttrs: Record<string, unknown> = {};
      writeImageVariantsAttr(variantAttrs, stack);

      dispatch(
        finishImageProcess({
          nodeId,
          src: nextSrc,
          attrs: {
            genPrompt: text,
            ...variantAttrs,
          },
        })
      );
      dispatch(closeImageToolPanel());
    } catch (err: any) {
      if (ac.signal.aborted) return;
      dispatch(finishImageProcess({ nodeId }));
      const detail =
        err?.response?.data?.detail || err?.message || t('editor.tools.imageGenFail');
      message.error(typeof detail === 'string' ? detail : t('editor.tools.imageGenFail'));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setSending(false);
    }
  };

  const subjectChip = useMemo(
    () =>
      src
        ? ({
            key: `subject-${nodeId}`,
            kind: 'attachment',
            label: t('editor.imageToolbar.chatSubject'),
            payload: src,
            dataUrl: src,
            thumbUrl: src,
          } satisfies ComposerContext)
        : null,
    [nodeId, src, t]
  );

  if (!node || !src) return null;

  return (
    <RcbOverlayPortal>
      <div
        data-image-quick-edit
        data-sel-toolbar
        data-scene-node-id={nodeId}
        className={cn(
          'pointer-events-auto absolute z-[32] flex h-[200px] w-[500px] flex-col overflow-visible',
          'rounded-2xl border border-[var(--line)] bg-[var(--surface)]',
          'shadow-[0_8px_28px_rgba(15,23,42,0.12)]'
        )}
        style={composerStyle}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation?.();
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
          {subjectChip ? (
            <ComposerAttachmentChip
              attachment={subjectChip}
              removable={false}
              onRemove={() => undefined}
            />
          ) : null}
          {attachments.map((att) => (
            <ComposerAttachmentChip
              key={att.key}
              attachment={att}
              disabled={sending}
              onRemove={removeContext}
            />
          ))}
          <Tooltip tip={t('editor.tools.imageGenRef')} placement="top">
            <button
              type="button"
              disabled={sending}
              aria-label={t('editor.tools.imageGenRef')}
              onClick={() => fileRef.current?.click()}
              className={cn(COMPOSER_ATTACH_ACTION_CLASS, COMPOSER_ATTACH_ACTION_IDLE)}
            >
              <HiOutlinePlus className="h-4 w-4" strokeWidth={2} />
            </button>
          </Tooltip>
          <Tooltip
            tip={
              pickingFromCanvas
                ? t('agent.pickFromCanvasCancel')
                : t('agent.pickFromCanvas')
            }
            placement="top"
          >
            <button
              type="button"
              disabled={sending}
              aria-label={t('agent.pickFromCanvas')}
              aria-pressed={pickingFromCanvas}
              onClick={() => {
                if (pickingFromCanvas) {
                  dispatch(clearCanvasAttachPick());
                  return;
                }
                dispatch(startCanvasAttachPick({ target: pickTarget, accept: 'image' }));
              }}
              className={cn(
                COMPOSER_ATTACH_ACTION_CLASS,
                pickingFromCanvas
                  ? COMPOSER_ATTACH_ACTION_ACTIVE
                  : COMPOSER_ATTACH_ACTION_IDLE
              )}
            >
              <HiOutlineViewfinderCircle className="h-4 w-4" strokeWidth={2} />
            </button>
          </Tooltip>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPickRef}
          />
        </div>

        <div
          className="min-h-0 min-w-0 flex-1 cursor-text overflow-y-auto px-3 pt-2"
          onClick={(e) => {
            if ((e.target as HTMLElement | null)?.closest?.('[data-agent-composer]')) return;
            inputRef.current?.focus();
          }}
        >
          <AgentComposerInput
            ref={inputRef}
            contexts={inlineContexts}
            onContextsChange={(next) => setContexts([...attachments, ...next])}
            value={prompt}
            onChange={setPrompt}
            onSubmit={() => void onGenerate()}
            disabled={sending}
            placeholder={t('editor.tools.imageGenPlaceholder')}
            className="min-h-full w-full text-[13px]"
          />
        </div>

        <div className="mt-1 flex items-center gap-1.5 px-2.5 pb-2">
          <Dropdown
            trigger="click"
            placement="top-start"
            strategy="fixed"
            offset={8}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            items={[]}
            floatingClassName="z-[90]"
            referenceClassName="inline-flex min-w-0"
            popupRender={() => (
              <DropdownPanel className="w-[min(26rem,calc(100vw-2rem))] p-3">
                <p className="mb-2.5 text-[13px] font-semibold text-[var(--ink)]">
                  {t('editor.tools.imageSettings')}
                </p>
                <ImageAspectRatioPicker
                  variant="image"
                  resolution={resolution}
                  aspectRatio={aspectRatio}
                  imageCount={imageCount}
                  imageLimits={modelImageLimits(selectedModel)}
                  onResolutionChange={setResolution}
                  onAspectRatioChange={setAspectRatio}
                  onImageCountChange={setImageCount}
                  disabled={sending}
                />
              </DropdownPanel>
            )}
          >
            <button
              type="button"
              disabled={sending}
              className={cn(
                'inline-flex h-7 max-w-[min(100%,11rem)] items-center gap-1 truncate rounded-full px-2 text-[12px] font-medium transition-colors disabled:opacity-40',
                settingsOpen
                  ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                  : 'bg-[var(--canvas)] text-[var(--ink)] hover:bg-[var(--accent-soft)]'
              )}
            >
              <span className="truncate">{settingsSummary}</span>
              <HiOutlineChevronDown
                className={cn(
                  'h-3 w-3 shrink-0 opacity-70 transition-transform duration-150',
                  settingsOpen && 'rotate-180'
                )}
                strokeWidth={2}
              />
            </button>
          </Dropdown>

          <div className="ml-auto flex items-center gap-1">
            {canPickModel ? (
              <Dropdown
                trigger="click"
                placement="top-end"
                strategy="fixed"
                offset={8}
                open={modelOpen}
                onOpenChange={setModelOpen}
                items={[]}
                floatingClassName="z-[90]"
                referenceClassName="inline-flex"
                popupRender={() => (
                  <div onPointerDown={(e) => e.stopPropagation()}>
                    <ModelPickerPanel
                      tab="image"
                      models={models}
                      selectedId={modelId}
                      status={modelsStatus}
                      onPick={(id) => {
                        setModelId(id);
                        setModelOpen(false);
                      }}
                    />
                  </div>
                )}
              >
                <Tooltip
                  tip={selectedModel?.label || modelId}
                  placement="top"
                  disabled={modelOpen}
                >
                  <button
                    type="button"
                    disabled={sending}
                    aria-label={selectedModel?.label || modelId}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40"
                  >
                    <ModelBrandIcon
                      model={selectedModel || { id: modelId }}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                  </button>
                </Tooltip>
              </Dropdown>
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center">
                <ModelBrandIcon model={{ id: FREE_IMAGE_MODEL_ID }} className="h-3.5 w-3.5" />
              </span>
            )}

            <Tooltip tip={t('wallet.creditCostTip', { count: creditCost })} placement="top">
              <button
                type="button"
                disabled={sending || !prompt.trim()}
                onClick={() => void onGenerate()}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition',
                  'bg-[var(--ink)] text-[var(--on-brand)] disabled:opacity-40'
                )}
              >
                <HiOutlineBolt className="h-3.5 w-3.5" strokeWidth={2} />
                {sending ? '…' : <span className="tabular-nums">{creditCost}</span>}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(ImageQuickEditComposer);
