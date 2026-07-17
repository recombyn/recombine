import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import { HiCheck } from 'react-icons/hi2';
import { fetchLlmModels, type LlmModel } from '@/apis/chat';
import AgentComposerShell from '@/components/editor/panels/agent/AgentComposerShell';
import {
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import {
  DEFAULT_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_RESOLUTION,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import { ModelBrandIcon } from '@/components/editor/panels/agent/modelIcons';
import { cn } from '@/utils/classnames';
import { nanoid } from 'nanoid';

export type HomeAgentSubmitPayload = {
  prompt: string;
  attachments: ComposerContext[];
  modelId?: string;
  imageAspectRatio?: string;
  imageQuality?: string;
  imageResolution?: string;
};

type Props = {
  onSubmit: (payload: HomeAgentSubmitPayload) => void;
  className?: string;
};

/** Same chrome as AgentDock model popover. */
const POPOVER_PANEL =
  'max-h-[min(320px,calc(100vh-96px))] w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

type ModelTabId = 'text' | 'image';
const MODEL_TAB_IDS: ModelTabId[] = ['text', 'image'];

function modelTabOf(m: Pick<LlmModel, 'kind' | 'id'> | null | undefined): ModelTabId {
  if (m?.kind === 'image') return 'image';
  if (m?.id && /seedream|image|i2i|t2i/i.test(m.id)) return 'image';
  return 'text';
}

/** Merge catalog + imageModels; normalize kind (same as AgentDock). */
function normalizeModelList(
  models: LlmModel[] | undefined,
  imageModels?: LlmModel[] | null
): LlmModel[] {
  const byId = new Map<string, LlmModel>();
  for (const m of models || []) {
    if (!m?.id) continue;
    byId.set(m.id, m);
  }
  for (const m of imageModels || []) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m, kind: 'image' });
  }
  return [...byId.values()].map((m) => {
    if (m.kind === 'image' || /seedream|image|i2i|t2i/i.test(m.id)) {
      return { ...m, kind: 'image' as const };
    }
    if (m.kind === 'svg') return { ...m, kind: 'text' as const };
    return { ...m, kind: (m.kind || 'text') as LlmModel['kind'] };
  });
}

function modelDescription(m: LlmModel, t: (key: string) => string): string {
  if (m.kind === 'image') return t('agent.modelDescImage');
  if (m.thinking || m.id.includes('reasoner')) return t('agent.modelDescReasoner');
  if (m.id.includes('deepseek')) return t('agent.modelDescDeepseek');
  return t('agent.modelDescChat');
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Home-page agent composer — same shell + model popover as editor AgentDock. */
export default function HomeAgentComposer({ onSubmit, className }: Props): ReactNode {
  const { t } = useTranslation();
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const [value, setValue] = useState('');
  const [contexts, setContexts] = useState<ComposerContext[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [modelTab, setModelTab] = useState<ModelTabId>('text');
  const [modelOpen, setModelOpen] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(DEFAULT_IMAGE_ASPECT_RATIO as string);
  const [imageQuality, setImageQuality] = useState(DEFAULT_IMAGE_QUALITY as string);
  const [imageResolution, setImageResolution] = useState(DEFAULT_IMAGE_RESOLUTION as string);

  useEffect(() => {
    let cancelled = false;
    fetchLlmModels()
      .then((res) => {
        if (cancelled) return;
        const list = normalizeModelList(res?.models, res?.imageModels);
        setModels(list);
        const preferred =
          list.find((m) => m.id === 'deepseek-chat')?.id ||
          list.find((m) => m.kind !== 'image')?.id ||
          list[0]?.id ||
          '';
        setModelId((prev) => (prev && list.some((m) => m.id === prev) ? prev : preferred));
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const modelFloating = useFloating({
    open: modelOpen,
    onOpenChange: setModelOpen,
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ['bottom-end', 'top-start', 'top-end'] }),
      shift({ padding: 12 }),
    ],
  });
  const modelIx = useInteractions([useDismiss(modelFloating.context)]);

  const canSend = value.trim().length > 0;
  const selectedModel = models.find((x) => x.id === modelId);
  const isImageModelSelected = modelTabOf(selectedModel) === 'image';
  const modelTitle = useMemo(() => {
    return (
      selectedModel?.label ||
      selectedModel?.id ||
      t('agent.selectModel', { defaultValue: '选择模型' })
    );
  }, [selectedModel, t]);

  const imageAspectProps = isImageModelSelected
    ? {
        imageAspectRatio,
        onImageAspectRatioChange: setImageAspectRatio,
        imageQuality,
        onImageQualityChange: setImageQuality,
        imageResolution,
        onImageResolutionChange: setImageResolution,
      }
    : {};

  const handleSubmit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    onSubmit({
      prompt,
      attachments: contexts.filter((c) => c.kind === 'attachment'),
      modelId: modelId || undefined,
      ...(isImageModelSelected
        ? {
            imageAspectRatio,
            imageQuality,
            imageResolution,
          }
        : {}),
    });
  };

  const onAttachFiles = async (files: File[]) => {
    const next: ComposerContext[] = [];
    for (const file of files.slice(0, 4)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await fileToDataUrl(file);
        next.push({
          key: `att-${nanoid(8)}`,
          label: file.name || 'image',
          kind: 'attachment',
          payload: file.name || 'image',
          dataUrl,
        });
      } catch {
        /* skip */
      }
    }
    if (next.length) setContexts((prev) => [...prev, ...next]);
  };

  const pickModel = (id: string) => {
    setModelId(id);
    setModelOpen(false);
  };

  const tabModels = models.filter((m) => modelTabOf(m) === modelTab);

  return (
    <>
      <AgentComposerShell
        className={cn(
          'min-h-[120px] w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]',
          className
        )}
        inputRef={inputRef}
        contexts={contexts}
        onContextsChange={setContexts}
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={t('home.composerPlaceholder')}
        canSend={canSend}
        onAttachFiles={onAttachFiles}
        attachTooltip={t('agent.uploadImage')}
        {...imageAspectProps}
        modelButtonProps={{
          ref: modelFloating.refs.setReference,
          title: modelTitle,
          open: modelOpen,
          onClick: () => {
            setModelTab(modelTabOf(models.find((m) => m.id === modelId)));
            setModelOpen((v) => !v);
          },
          getReferenceProps: modelIx.getReferenceProps,
          icon: (
            <ModelBrandIcon
              model={models.find((m) => m.id === modelId) || { id: modelId }}
              size={18}
            />
          ),
        }}
      />

      <FloatingPortal>
        {modelOpen ? (
          <div
            ref={modelFloating.refs.setFloating}
            style={modelFloating.floatingStyles}
            className="z-[80]"
            {...modelIx.getFloatingProps()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className={POPOVER_PANEL}>
              <div className="px-3 pb-2 pt-3">
                <p className="text-[13px] font-semibold text-[var(--ink)]">{t('agent.selectModel')}</p>
                <div
                  role="tablist"
                  aria-label={t('agent.modelCategory')}
                  className="mt-2 flex gap-0.5 rounded-lg bg-[var(--canvas)] p-0.5 ring-1 ring-[var(--line)]"
                >
                  {MODEL_TAB_IDS.map((tabId) => {
                    const active = modelTab === tabId;
                    return (
                      <button
                        key={tabId}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={cn(
                          'flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors',
                          active
                            ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm'
                            : 'text-[var(--muted)] hover:text-[var(--ink)]'
                        )}
                        onClick={() => setModelTab(tabId)}
                      >
                        {tabId === 'text' ? t('agent.tabChat') : t('agent.tabImage')}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="max-h-[min(240px,calc(100vh-180px))] overflow-y-auto px-1.5 pb-1.5">
                {!tabModels.length ? (
                  <div className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">
                    {models.length === 0
                      ? t('home.composerModelsLoading')
                      : t('agent.emptyModels')}
                  </div>
                ) : (
                  tabModels.map((m) => {
                    const active = m.id === modelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                          active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'
                        )}
                        onClick={() => pickModel(m.id)}
                      >
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)]">
                          <ModelBrandIcon model={m} size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                            {m.label || m.id}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                            {modelDescription(m, t)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[var(--muted)]',
                            active
                              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--on-brand)]'
                              : 'border-[var(--line)]'
                          )}
                          aria-hidden
                        >
                          {active ? <HiCheck className="h-3.5 w-3.5" /> : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}
