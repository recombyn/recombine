/**
 * Floating quick-edit chat under a selected Lottie (toolbar → 快速编辑).
 * Regenerates animation in place via POST /design/lottie/generate.
 */
import {
  memo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import {
  HiArrowUp,
  HiOutlineChevronDown,
  HiOutlinePlus,
} from 'react-icons/hi2';
import { listModels, type LlmModel } from '@/apis/chat';
import { generateLottie } from '@/apis/design';
import { Dropdown, DropdownPanel, message, Tooltip } from '@/components/base';
import {
  RcbOverlayPortal,
  rcbScreenPxToScene,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '@/components/rcb';
import { SELECTION_TOOLBAR_BELOW_BOX_GAP_PX } from '@/components/rcb/selection/chrome/SelectionToolbarShell';
import AgentComposerInput, {
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import {
  ComposerAttachmentChip,
  composerAttachActionClass,
} from '@/components/editor/panels/agent/AgentComposerShell';
import ModelPickerPanel, {
  ModelBrandIcon,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { buildByokAwareModelList } from '@/components/editor/panels/agent/llmModelMeta';
import { customProvidersAsModels } from '@/components/editor/panels/agent/customLlmProviders';
import {
  clearImageProcessAttrs,
  parseLottieAnimationData,
  serializeLottieAnimationData,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  closeImageToolPanel,
  patchDocumentNode,
  pushEditorHistory,
  setDocumentFromCanvas,
} from '@/store/modules/editor';
import { cn } from '@/utils/classnames';
import { isDesktopLocal } from '@/utils/apiBase';
import { readFileAsDataUrl } from '@/utils/uploadImage';
import store from '@/store';

type SceneBox = { left: number; top: number; width: number; height: number };

const LOTTIE_DURATIONS = [1, 2, 3, 5, 8] as const;
const DEFAULT_DURATION = 3;

function modelIsAgentChat(model?: Pick<LlmModel, 'kind' | 'id'> | null): boolean {
  if (!model?.id || model.id === 'auto') return false;
  if (model.kind === 'image' || model.kind === 'video') return false;
  return !/seedance|seedream|t2i|i2i/i.test(model.id);
}

function buildLottieChatModelList(res?: { models?: LlmModel[] | null } | null): LlmModel[] {
  return buildByokAwareModelList({
    byok: customProvidersAsModels(),
    catalogs: [res?.models],
    filter: (m) => modelIsAgentChat(m),
  });
}

function LottieQuickEditComposer({
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
  const savedPrompt = String(node?.attrs?.genPrompt || '').trim();

  const [prompt, setPrompt] = useState(savedPrompt);
  const [contexts, setContexts] = useState<ComposerContext[]>([]);
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [duration, setDuration] = useState(DEFAULT_DURATION);

  useEffect(() => {
    setPrompt(savedPrompt);
  }, [nodeId, savedPrompt]);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [nodeId]);

  useEffect(() => {
    let cancelled = false;
    void listModels()
      .then((res) => {
        if (cancelled) return;
        const list = buildLottieChatModelList(res);
        setModels(list);
        if (list.length && !list.some((m) => m.id === modelId)) {
          setModelId(list[0]!.id);
        }
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const attachments = contexts.filter((c) => c.kind === 'attachment');
  const inlineContexts = contexts.filter((c) => c.kind !== 'attachment');
  const selectedModel = models.find((m) => m.id === modelId);
  const settingsSummary = `${duration}s`;

  const composerStyle = useRcbScreenToolbarStyle({
    left: box.left + box.width / 2,
    top: box.top + box.height + rcbScreenPxToScene(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX, zoom),
    anchor: 'top',
  });

  const removeContext = (key: string) => {
    setContexts((prev) => prev.filter((c) => c.key !== key));
  };

  const onPickRef = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
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
    if (next.length) setContexts((prev) => [...prev, ...next]);
  };

  const onGenerate = async () => {
    const text = prompt.trim();
    if (!text || sending) return;
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
      const imageRefUrls = attachments
        .map((c) => String(c.dataUrl || c.thumbUrl || '').trim())
        .filter(Boolean);
      const genW = Math.min(512, Math.max(32, Math.round(box.width)));
      const genH = Math.min(512, Math.max(32, Math.round(box.height)));
      const res = await generateLottie(
        {
          prompt: text,
          width: genW,
          height: genH,
          duration_sec: duration,
          model: modelId || undefined,
          ...(imageRefUrls.length ? { images: imageRefUrls } : {}),
        },
        { signal: ac.signal }
      );
      const animationData = parseLottieAnimationData(res?.animationData) || null;
      const json = serializeLottieAnimationData(animationData);
      if (!animationData || !json) throw new Error(t('editor.tools.lottieGenEmpty'));
      if (ac.signal.aborted) return;

      const aw = Math.max(1, Number(animationData.w) || genW);
      const ah = Math.max(1, Number(animationData.h) || genH);
      const fit = Math.min(box.width / aw, box.height / ah);
      const outW = Math.max(32, Math.round(aw * fit));
      const outH = Math.max(32, Math.round(ah * fit));

      dispatch(
        patchDocumentNode({
          nodeId,
          patch: {
            width: outW,
            height: outH,
            attrs: {
              animationData: json,
              genPrompt: text,
              processStatus: null,
              processKind: null,
              processLabel: null,
            },
          },
        })
      );
      dispatch(closeImageToolPanel());
    } catch (err: any) {
      if (ac.signal.aborted) return;
      const doc = (store.getState() as any).editor?.document;
      if (doc) dispatch(setDocumentFromCanvas(clearImageProcessAttrs(doc, nodeId)));
      const detail =
        err?.response?.data?.detail || err?.message || t('editor.tools.lottieGenFail');
      message.error(typeof detail === 'string' ? detail : t('editor.tools.lottieGenFail'));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setSending(false);
    }
  };

  if (!node) return null;

  return (
    <RcbOverlayPortal>
      <div
        data-lottie-edit-composer
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
          {attachments.map((att) => (
            <ComposerAttachmentChip
              key={att.key}
              attachment={att}
              disabled={sending}
              onRemove={removeContext}
            />
          ))}
          <Tooltip tip={t('editor.tools.lottieGenUpload', { defaultValue: '参考图' })} placement="top">
            <button
              type="button"
              disabled={sending}
              aria-label={t('editor.tools.lottieGenUpload', { defaultValue: '参考图' })}
              onClick={() => fileRef.current?.click()}
              className={composerAttachActionClass()}
            >
              <HiOutlinePlus className="h-4 w-4" strokeWidth={2} />
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
            placeholder={t('editor.tools.lottieGenPlaceholder', {
              defaultValue: '今天我们要创作什么',
            })}
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
              <DropdownPanel className="w-[min(16rem,calc(100vw-2rem))] p-3">
                <p className="mb-2 text-[12px] font-medium text-[var(--ink)]">
                  {t('editor.tools.lottieGenDuration', { defaultValue: '时长' })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LOTTIE_DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={cn(
                        'h-7 rounded-lg px-2.5 text-[12px] tabular-nums',
                        duration === d
                          ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                          : 'bg-[var(--accent-soft)] text-[var(--ink)]'
                      )}
                      onClick={() => setDuration(d)}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </DropdownPanel>
            )}
          >
            <button
              type="button"
              disabled={sending}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-medium',
                settingsOpen ? 'bg-[var(--accent-soft)]' : 'bg-[var(--canvas)]'
              )}
            >
              <span>{settingsSummary}</span>
              <HiOutlineChevronDown className="h-3 w-3 opacity-70" strokeWidth={2} />
            </button>
          </Dropdown>

          <div className="flex-1" />

          {!isDesktopLocal() && models.length > 0 ? (
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
                <div className="max-w-full" onPointerDown={(e) => e.stopPropagation()}>
                  <ModelPickerPanel
                    tab="design"
                    models={models}
                    selectedId={modelId}
                    hideAuto
                    useModelsAsIs
                    onPick={(id) => {
                      setModelId(id);
                      setModelOpen(false);
                    }}
                  />
                </div>
              )}
            >
              <button
                type="button"
                disabled={sending}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--canvas)]"
                title={selectedModel?.label || modelId}
              >
                <ModelBrandIcon model={selectedModel} className="h-4 w-4" />
              </button>
            </Dropdown>
          ) : null}

          <button
            type="button"
            disabled={sending || !prompt.trim()}
            aria-label={t('agent.send')}
            onClick={() => void onGenerate()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--on-brand)] disabled:opacity-40"
          >
            <HiArrowUp className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(LottieQuickEditComposer);
