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
import { fetchLlmModels, isVolcanoCatalogModel, type LlmModel } from '@/apis/chat';
import { Icon } from '@/components/base/icon';
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
import ModelPickerPanel, {
  isImageKind,
  modelDescription,
  modelTabOf,
  type ModelPickerTab,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { cn } from '@/utils/classnames';
import { nanoid } from 'nanoid';
import { deleteUploadedFile, uploadComposerAttachment } from '@/apis/upload';
import { message } from '@/components/base';

export type HomeAgentCategory = 'website' | 'mobile' | 'image' | 'poster';

export type HomeAgentSubmitPayload = {
  prompt: string;
  attachments: ComposerContext[];
  modelId?: string;
  imageAspectRatio?: string;
  imageQuality?: string;
  imageResolution?: string;
  category?: HomeAgentCategory;
  scene?: 'website' | 'mobile' | 'image' | 'poster' | null;
};

type Props = {
  onSubmit: (payload: HomeAgentSubmitPayload) => void;
  className?: string;
  category?: HomeAgentCategory;
};

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
  return [...byId.values()]
    .filter((m) => isVolcanoCatalogModel(m))
    .map((m) => {
    if (isImageKind(m)) {
      return { ...m, kind: 'image' as const };
    }
    if (m.kind === 'svg') return { ...m, kind: 'text' as const };
    return { ...m, kind: (m.kind || 'text') as LlmModel['kind'] };
  });
}

const TYPE_MS = 72;
const DELETE_MS = 36;
const HOLD_MS = 1800;

/** Typewriter cycle through prompt phrases (type → hold → delete → next). */
function useTypewriterCycle(phrases: string[]): string {
  const [index, setIndex] = useState(0);
  const [len, setLen] = useState(0);
  const [phase, setPhase] = useState<'type' | 'delete'>('type');
  const phrase = phrases.length ? phrases[index % phrases.length]! : '';

  useEffect(() => {
    if (!phrases.length) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === 'type') {
      if (len < phrase.length) {
        timer = setTimeout(() => setLen((n) => n + 1), TYPE_MS);
      } else {
        timer = setTimeout(() => setPhase('delete'), HOLD_MS);
      }
    } else if (len > 0) {
      timer = setTimeout(() => setLen((n) => n - 1), DELETE_MS);
    } else {
      timer = setTimeout(() => {
        setIndex((i) => (i + 1) % phrases.length);
        setPhase('type');
      }, 280);
    }
    return () => clearTimeout(timer);
  }, [phrases, phrase, index, len, phase]);

  return phrase.slice(0, len);
}

/** Home-page agent composer — same shell + model popover as editor AgentDock. */
export default function HomeAgentComposer({ onSubmit, className, category = 'website' }: Props): ReactNode {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const [value, setValue] = useState('');
  const [contexts, setContexts] = useState<ComposerContext[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelId, setModelId] = useState('auto');
  const [modelTab, setModelTab] = useState<ModelPickerTab>(
    category === 'image' ? 'image' : 'design'
  );
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelOpen, setModelOpen] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(() =>
    category === 'mobile' ? '390x844' : category === 'poster' ? '1080x1920' : '1440x900'
  );
  const [imageQuality, setImageQuality] = useState(DEFAULT_IMAGE_QUALITY as string);
  const [imageResolution, setImageResolution] = useState(DEFAULT_IMAGE_RESOLUTION as string);

  useEffect(() => {
    setModelTab(category === 'image' ? 'image' : 'design');
    if (category === 'mobile') setImageAspectRatio('390x844');
    else if (category === 'poster') setImageAspectRatio('1080x1920');
    else if (category === 'website') setImageAspectRatio('1440x900');
    else if (category === 'image') setImageAspectRatio(DEFAULT_IMAGE_ASPECT_RATIO as string);

    if (category === 'image') {
      const images = models.filter((m) => isImageKind(m));
      const preferred =
        images.find((m) => /seedream/i.test(m.id)) || images[0];
      if (preferred) setModelId(preferred.id);
      else setModelId('auto');
    } else {
      setModelId('auto');
    }
    // Only react to category — models list is read at switch time.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [category]);

  const placeholderPrefix = t('home.composerPlaceholderPrefix');
  const placeholderPrompts = useMemo(() => {
    const raw = t('home.composerPlaceholderPrompts', { returnObjects: true });
    return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
  }, [t, i18n.language]);
  const typedPrompt = useTypewriterCycle(placeholderPrompts);
  const [caretOn, setCaretOn] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => setCaretOn((v) => !v), 530);
    return () => window.clearInterval(id);
  }, []);
  const composerPlaceholder = `${placeholderPrefix}${typedPrompt}${caretOn ? '|' : ' '}`;

  useEffect(() => {
    let cancelled = false;
    setModelsStatus('loading');
    fetchLlmModels()
      .then((res) => {
        if (cancelled) return;
        const list = normalizeModelList(res?.models, res?.imageModels);
        setModels(list);
        setModelsStatus('ready');
        setModelId((prev) =>
          prev === 'auto' || (prev && list.some((m) => m.id === prev)) ? prev || 'auto' : 'auto'
        );
      })
      .catch(() => {
        if (!cancelled) {
          setModels([]);
          setModelsStatus('error');
        }
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
  const selectedModel =
    modelId === 'auto'
      ? ({ id: 'auto', label: 'Auto', provider: 'system', kind: 'text' } as LlmModel)
      : models.find((x) => x.id === modelId);
  const isImageModelSelected = modelTab === 'image' || modelTabOf(selectedModel) === 'image';
  const modelTitle = useMemo(() => {
    if (modelId === 'auto') {
      return modelDescription(
        { id: 'auto', label: 'Auto', provider: 'system', kind: 'text' },
        t
      );
    }
    const m = selectedModel;
    if (!m) return t('agent.selectModel', { defaultValue: 'Models' });
    return `${m.label || m.id} — ${modelDescription(m, t)}`;
  }, [modelId, selectedModel, t]);

  const imageAspectProps = {
    aspectPickerVariant: (isImageModelSelected ? 'image' : 'design') as 'design' | 'image',
    imageAspectRatio,
    onImageAspectRatioChange: setImageAspectRatio,
    onDesignSceneChange: (scene: 'website' | 'mobile' | 'image' | 'poster' | null) => {
      if (scene === 'image') {
        setModelTab('image');
        const images = models.filter((m) => isImageKind(m));
        const preferred =
          images.find((m) => /seedream/i.test(m.id)) || images[0];
        if (preferred) setModelId(preferred.id);
      } else {
        setModelTab('design');
        setModelId('auto');
      }
    },
    imageQuality,
    onImageQualityChange: setImageQuality,
    imageResolution,
    onImageResolutionChange: setImageResolution,
  };

  const handleSubmit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    const isImage = category === 'image' || isImageModelSelected;
    onSubmit({
      prompt,
      attachments: contexts.filter((c) => c.kind === 'attachment'),
      modelId: modelId === 'auto' ? undefined : modelId || undefined,
      category,
      scene: category,
      ...(isImage
        ? {
            imageAspectRatio,
            imageQuality,
            imageResolution,
          }
        : { imageAspectRatio }),
    });
  };

  const onAttachFiles = async (files: File[]) => {
    const MAX = 10 * 1024 * 1024;
    const next: ComposerContext[] = [];
    for (const file of files.slice(0, 4)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX) {
        message.warning(t('agent.attachTooLarge', { name: file.name }));
        continue;
      }
      try {
        const uploaded = await uploadComposerAttachment(file);
        next.push({
          key: `att-${nanoid(8)}`,
          label: file.name || 'image',
          kind: 'attachment',
          payload: file.name || 'image',
          dataUrl: uploaded.imageRef,
          thumbUrl: uploaded.previewDataUrl,
          uploadKey: uploaded.uploadKey || undefined,
        });
      } catch {
        message.error(t('agent.uploadFailed', { name: file.name }));
      }
    }
    if (next.length) setContexts((prev) => [...prev, ...next]);
  };

  const onContextsChange = (next: ComposerContext[]) => {
    const removed = contexts.filter((c) => !next.some((n) => n.key === c.key));
    for (const c of removed) {
      if (c.kind === 'attachment' && c.uploadKey) {
        void deleteUploadedFile(c.uploadKey).catch(() => {});
      }
    }
    setContexts(next);
  };

  const pickModel = (id: string) => {
    setModelId(id);
    setModelTab(id === 'auto' ? 'design' : modelTabOf(models.find((m) => m.id === id)));
    setModelOpen(false);
  };

  const switchModelTab = (tab: ModelPickerTab) => {
    // Tab is only a filter for browsing — do not reset the active model.
    setModelTab(tab);
  };

  return (
    <>
      <AgentComposerShell
        className={cn(
          'min-h-[120px] w-full overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]',
          className
        )}
        inputRef={inputRef}
        contexts={contexts}
        onContextsChange={onContextsChange}
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={composerPlaceholder}
        canSend={canSend}
        onAttachFiles={onAttachFiles}
        attachTooltip={t('agent.uploadImage')}
        {...imageAspectProps}
        modelButtonProps={{
          ref: modelFloating.refs.setReference,
          title: modelTitle,
          open: modelOpen,
          onClick: () => {
            setModelTab(modelId === 'auto' ? 'design' : modelTabOf(models.find((m) => m.id === modelId)));
            setModelOpen((v) => !v);
          },
          getReferenceProps: modelIx.getReferenceProps,
          icon: <Icon name="editor-model-cube" width={16} height={16} />,
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
            <ModelPickerPanel
              tab={modelTab}
              onTabChange={switchModelTab}
              models={models}
              selectedId={modelId}
              onPick={pickModel}
              status={modelsStatus}
            />
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}
