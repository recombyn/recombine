import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, memo } from 'react';
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
import { listModels, type LlmModel } from '@/apis/chat';
import {
  agentAttachmentLimit,
  isVolcanoCatalogModel,
} from '@/components/editor/panels/agent/llmModelMeta';
import { Icon } from '@/components/base/icon';
import AgentComposerShell, {
  type ComposerInteractionMode,
  type ImageModeComposerControls,
  type VideoModeComposerControls,
} from '@/components/editor/panels/agent/AgentComposerShell';
import {
  chipBaseKey,
  parseAtMentionQuery,
  stripTrailingAtQuery,
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import MentionAttachPanel, {
  type MentionAttachItem,
} from '@/components/editor/panels/agent/MentionAttachPanel';
import {
  DEFAULT_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_RESOLUTION,
  modelImageLimits,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import ModelPickerPanel, {
  isImageKind,
  isVideoKind,
  modelDescription,
  modelTabOf,
  ModelBrandIcon,
  type ModelPickerTab,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import {
  AgentRoutePrefsEditor,
  loadAgentRoutePrefs,
  warmOpenrouterAvailability,
  routeOverridesForApi,
} from '@/components/editor/panels/agent/AgentModelsPanel';
import { cn } from '@/utils/classnames';
import { FREE_IMAGE_MODEL_ID, planAllowsModelId, planAllowsModelPick, type PlanId } from '@/utils/wallet';
import { nanoid } from 'nanoid';
import {
  deleteUploadedFile,
  readFileAsDataUrl,
  uploadComposerAttachment,
} from '@/utils/uploadImage';
import { message } from '@/components/base';
import { useSelector } from 'react-redux';
import { estimateImageCredits, estimateVideoCredits } from '@/utils/imageCredits';

export type HomeAgentCategory =
  | 'website'
  | 'mobile'
  | 'image'
  | 'poster'
  | 'drawing'
  | 'video';

export type HomeAgentSubmitPayload = {
  prompt: string;
  attachments: ComposerContext[];
  modelId?: string;
  interactionMode?: ComposerInteractionMode;
  imageAspectRatio?: string;
  category?: HomeAgentCategory;
  scene?: HomeAgentCategory | null;
};

type Props = {
  onSubmit: (payload: HomeAgentSubmitPayload) => void;
  className?: string;
  category?: HomeAgentCategory;
  /** Keep hero category tabs in sync with composer Image mode. */
  onCategoryChange?: (category: HomeAgentCategory) => void;
};

/** Merge catalog + imageModels + videoModels; normalize kind (same as AgentDock). */
function normalizeModelList(
  models: LlmModel[] | undefined,
  imageModels?: LlmModel[] | null,
  videoModels?: LlmModel[] | null
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
  for (const m of videoModels || []) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m, kind: 'video' });
  }
  return [...byId.values()]
    .filter((m) => isVolcanoCatalogModel(m))
    .map((m) => {
      if (isVideoKind(m)) {
        return { ...m, kind: 'video' as const };
      }
      if (isImageKind(m)) {
        return { ...m, kind: 'image' as const };
      }
      if (m.kind === 'svg') return { ...m, kind: 'text' as const };
      return { ...m, kind: (m.kind || 'text') as LlmModel['kind'] };
    });
}

const DEFAULT_VIDEO_ASPECT_RATIO = '16:9';
const DEFAULT_VIDEO_RESOLUTION = '720p';
const DEFAULT_VIDEO_DURATION = 5;
const DEFAULT_VIDEO_MODEL_ID = 'or-seedance-2-0-fast';

function pickPreferredVideoModelId(models: LlmModel[]): string {
  const videos = models.filter((m) => isVideoKind(m));
  return (
    videos.find((m) => m.id === DEFAULT_VIDEO_MODEL_ID)?.id ||
    videos[0]?.id ||
    DEFAULT_VIDEO_MODEL_ID
  );
}

function aspectRatioForCategory(category: HomeAgentCategory): string {
  switch (category) {
    case 'mobile':
      return '390x844';
    case 'poster':
      return '1080x1920';
    case 'drawing':
      return '1080x1080';
    case 'image':
      return DEFAULT_IMAGE_ASPECT_RATIO as string;
    case 'video':
      return DEFAULT_VIDEO_ASPECT_RATIO;
    case 'website':
    default:
      return '1440x900';
  }
}

function modelTabForCategory(category: HomeAgentCategory): ModelPickerTab {
  if (category === 'image') return 'image';
  if (category === 'video') return 'video';
  return 'design';
}

function interactionModeForCategory(category: HomeAgentCategory): ComposerInteractionMode {
  if (category === 'image') return 'image';
  if (category === 'video') return 'video';
  return 'agent';
}

function designSceneCategoryOf(
  category: HomeAgentCategory
): 'website' | 'mobile' | 'image' | 'poster' {
  if (category === 'drawing' || category === 'video') return 'image';
  return category;
}

function pickPreferredImageModelId(models: LlmModel[]): string {
  const images = models.filter((m) => isImageKind(m));
  return (
    images.find((m) => m.id === FREE_IMAGE_MODEL_ID)?.id ||
    images.find((m) => /seedream/i.test(m.id))?.id ||
    images[0]?.id ||
    FREE_IMAGE_MODEL_ID
  );
}

function hasUploadingAttachment(contexts: ComposerContext[]): boolean {
  return contexts.some((c) => c.kind === 'attachment' && c.uploadStatus === 'uploading');
}

function resolveHomeSubmitModelId(opts: {
  canPickModel: boolean;
  isImageModelSelected: boolean;
  modelId: string;
}): string {
  if (!opts.canPickModel) {
    return opts.isImageModelSelected ? FREE_IMAGE_MODEL_ID : 'auto';
  }
  return opts.modelId;
}

function resolveHomeIsImageSubmit(opts: {
  isImageInteraction: boolean;
  canPickModel: boolean;
  category: HomeAgentCategory;
  isImageModelSelected: boolean;
  resolvedModelId: string;
  models: LlmModel[];
}): boolean {
  if (opts.isImageInteraction) return true;
  if (opts.canPickModel) {
    return (
      opts.category === 'image' ||
      isImageKind(opts.models.find((m) => m.id === opts.resolvedModelId))
    );
  }
  return opts.isImageModelSelected || opts.category === 'image';
}

function resolveModelIdAfterCatalogLoad(
  prev: string,
  list: LlmModel[],
  canPickModel: boolean
): string {
  if (!canPickModel) {
    return planAllowsModelId('free', prev) ? prev : 'auto';
  }
  return prev === 'auto' || (prev && list.some((m) => m.id === prev)) ? prev || 'auto' : 'auto';
}

const TYPE_MS = 72;
const DELETE_MS = 36;
const HOLD_MS = 1800;

/** Typewriter cycle through prompt phrases (type → hold → delete → next). */
function useTypewriterCycle(phrases: string[], enabled = true): string {
  const [index, setIndex] = useState(0);
  const [len, setLen] = useState(0);
  const [phase, setPhase] = useState<'type' | 'delete'>('type');
  const phrase = phrases.length ? phrases[index % phrases.length]! : '';

  useEffect(() => {
    if (!enabled || !phrases.length) {
      setLen(0);
      setPhase('type');
      return undefined;
    }
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
  }, [enabled, phrases, phrase, index, len, phase]);

  if (!enabled) return '';
  return phrase.slice(0, len);
}

/** Home-page agent composer — same shell + model popover as editor AgentDock. */
function HomeAgentComposer({
  onSubmit,
  className,
  category = 'poster',
  onCategoryChange,
}: Props): ReactNode {
  const { t, i18n } = useTranslation();
  const planId = useSelector((s: any) => (s.wallet?.planId as PlanId) || 'free');
  const canPickModel = planAllowsModelPick(planId);
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const [value, setValue] = useState('');
  const [contexts, setContexts] = useState<ComposerContext[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelId, setModelId] = useState('auto');
  const [modelTab, setModelTab] = useState<ModelPickerTab>(() =>
    modelTabForCategory(category)
  );
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelOpen, setModelOpen] = useState(false);
  const [mentionPanelOpen, setMentionPanelOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [interactionMode, setInteractionMode] = useState<ComposerInteractionMode>(() =>
    interactionModeForCategory(category)
  );
  const [imageModelPanelOpen, setImageModelPanelOpen] = useState(false);
  const [videoModelPanelOpen, setVideoModelPanelOpen] = useState(false);
  const [imageResolution, setImageResolution] = useState(DEFAULT_IMAGE_RESOLUTION);
  const [imageGenAspectRatio, setImageGenAspectRatio] = useState(DEFAULT_IMAGE_ASPECT_RATIO);
  const [imageGenCount, setImageGenCount] = useState(DEFAULT_IMAGE_COUNT);
  const [videoResolution, setVideoResolution] = useState(DEFAULT_VIDEO_RESOLUTION);
  const [videoGenAspectRatio, setVideoGenAspectRatio] = useState(DEFAULT_VIDEO_ASPECT_RATIO);
  const [videoGenDuration, setVideoGenDuration] = useState(DEFAULT_VIDEO_DURATION);
  const contextsRef = useRef(contexts);
  contextsRef.current = contexts;
  const [imageAspectRatio, setImageAspectRatio] = useState(() =>
    aspectRatioForCategory(category)
  );

  const enterVideoMode = (nextModels: LlmModel[] = models) => {
    setInteractionMode('video');
    setModelTab('video');
    setModelOpen(false);
    setModelId(canPickModel ? pickPreferredVideoModelId(nextModels) : DEFAULT_VIDEO_MODEL_ID);
  };

  const leaveVideoMode = () => {
    setInteractionMode((m) => (m === 'video' ? 'agent' : m));
    setModelTab('design');
    setModelId('auto');
    setVideoModelPanelOpen(false);
  };

  const enterImageMode = (nextModels: LlmModel[] = models) => {
    setInteractionMode('image');
    setModelTab('image');
    setModelOpen(false);
    setModelId(canPickModel ? pickPreferredImageModelId(nextModels) : FREE_IMAGE_MODEL_ID);
  };

  const leaveImageMode = () => {
    setInteractionMode((m) => (m === 'image' ? 'agent' : m));
    setModelTab('design');
    setModelId('auto');
    setImageModelPanelOpen(false);
  };

  useEffect(() => {
    setImageAspectRatio(aspectRatioForCategory(category));
    // Hero Image / Video tabs ↔ composer interaction chrome.
    if (category === 'image') {
      leaveVideoMode();
      enterImageMode();
    } else if (category === 'video') {
      leaveImageMode();
      enterVideoMode();
    } else {
      leaveImageMode();
      leaveVideoMode();
    }
    // Only react to category — models list is read at switch time.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [category, canPickModel]);

  useEffect(() => {
    if (canPickModel) return;
    setModelId((prev) => {
      if (prev === FREE_IMAGE_MODEL_ID) {
        setModelTab('image');
        return prev;
      }
      setModelTab('design');
      return 'auto';
    });
  }, [canPickModel]);

  const placeholderPrefix = t('home.composerPlaceholderPrefix');
  const placeholderPrompts = useMemo(() => {
    // Optional per-category list: home.composerPlaceholderPromptsByCategory.{category}
    const byCat = t(`home.composerPlaceholderPromptsByCategory.${category}`, {
      returnObjects: true,
      defaultValue: [],
    });
    if (Array.isArray(byCat) && byCat.length) return byCat.map(String).filter(Boolean);
    const raw = t('home.composerPlaceholderPrompts', { returnObjects: true });
    return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
  }, [t, i18n.language, category]);
  // Pause typewriter while the user has text/chips — avoids re-render storms during paste/typing.
  const typewriterOn = !value.trim() && contexts.length === 0;
  const typedPrompt = useTypewriterCycle(placeholderPrompts, typewriterOn);
  const [caretOn, setCaretOn] = useState(true);
  useEffect(() => {
    if (!typewriterOn) return undefined;
    const id = window.setInterval(() => setCaretOn((v) => !v), 530);
    return () => window.clearInterval(id);
  }, [typewriterOn]);
  const composerPlaceholder = typewriterOn
    ? `${placeholderPrefix}${typedPrompt}${caretOn ? '|' : ' '}`
    : '';

  useEffect(() => {
    let cancelled = false;
    setModelsStatus('loading');
    listModels()
      .then((res) => {
        if (cancelled) return;
        warmOpenrouterAvailability(res?.openrouterAvailable);
        const list = normalizeModelList(res?.models, res?.imageModels, res?.videoModels);
        setModels(list);
        setModelsStatus('ready');
        setModelId((prev) => resolveModelIdAfterCatalogLoad(prev, list, canPickModel));
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
  }, [canPickModel]);

  const canSend = value.trim().length > 0 && !hasUploadingAttachment(contexts);
  const selectedModel =
    modelId === 'auto'
      ? ({ id: 'auto', label: 'Auto', provider: 'system', kind: 'text' } as LlmModel)
      : models.find((x) => x.id === modelId);
  const isVideoInteraction = interactionMode === 'video';
  const isVideoModelSelected =
    isVideoInteraction || modelTab === 'video' || modelTabOf(selectedModel) === 'video';
  const isImageInteraction = interactionMode === 'image';
  const isImageModelSelected =
    !isVideoInteraction &&
    (isImageInteraction || modelTab === 'image' || modelTabOf(selectedModel) === 'image');
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

  const imageModels = models.filter((m) => isImageKind(m));
  const imageModeSelectedModel =
    imageModels.find((m) => m.id === modelId) ||
    imageModels.find((m) => m.id === FREE_IMAGE_MODEL_ID) ||
    imageModels[0];

  const attachmentLimit = agentAttachmentLimit({
    models,
    modelId,
    isImageMode: isImageModelSelected || isVideoModelSelected,
    routedImageId: routeOverridesForApi(loadAgentRoutePrefs())?.image,
    freeImageId: FREE_IMAGE_MODEL_ID,
  });
  const attachmentCount = contexts.filter((c) => c.kind === 'attachment').length;
  const attachFull = attachmentCount >= attachmentLimit;

  const imageModeControls: ImageModeComposerControls | null = isImageInteraction
    ? {
        resolution: imageResolution,
        aspectRatio: imageGenAspectRatio,
        imageCount: imageGenCount,
        onResolutionChange: (r) => setImageResolution(r as typeof imageResolution),
        onAspectRatioChange: (r) => setImageGenAspectRatio(r as typeof imageGenAspectRatio),
        onImageCountChange: (n) =>
          setImageGenCount(
            Math.max(1, Math.min(4, Math.round(n) || 1)) as typeof imageGenCount
          ),
        imageLimits: modelImageLimits(imageModeSelectedModel),
        creditCost: estimateImageCredits(
          imageModeSelectedModel,
          imageGenCount,
          imageResolution
        ),
        modelLabel: String(
          imageModeSelectedModel?.label || modelId || FREE_IMAGE_MODEL_ID
        ),
        modelIcon: (
          <ModelBrandIcon
            model={imageModeSelectedModel || { id: modelId || FREE_IMAGE_MODEL_ID }}
            className="h-3.5 w-3.5 shrink-0"
          />
        ),
        modelOpen: imageModelPanelOpen,
        onModelOpenChange: setImageModelPanelOpen,
        modelPanel: (
          <ModelPickerPanel
            tab="image"
            models={models}
            selectedId={modelId}
            status={modelsStatus}
            autoOnly={!canPickModel}
            onPick={(id) => {
              setModelId(id);
              setModelTab('image');
              setImageModelPanelOpen(false);
            }}
          />
        ),
      }
    : null;

  const videoModels = models.filter((m) => isVideoKind(m));
  const videoModeSelectedModel =
    videoModels.find((m) => m.id === modelId) ||
    videoModels.find((m) => m.id === DEFAULT_VIDEO_MODEL_ID) ||
    videoModels[0];
  const videoModeControls: VideoModeComposerControls | null = isVideoInteraction
    ? {
        resolution: videoResolution,
        aspectRatio: videoGenAspectRatio,
        duration: videoGenDuration,
        onResolutionChange: (r) => setVideoResolution(r),
        onAspectRatioChange: (r) => setVideoGenAspectRatio(r),
        onDurationChange: (d) =>
          setVideoGenDuration(Math.max(1, Math.round(d) || DEFAULT_VIDEO_DURATION)),
        creditCost: estimateVideoCredits(videoModeSelectedModel),
        modelLabel: String(
          videoModeSelectedModel?.label || modelId || DEFAULT_VIDEO_MODEL_ID
        ),
        modelIcon: (
          <ModelBrandIcon
            model={videoModeSelectedModel || { id: modelId || DEFAULT_VIDEO_MODEL_ID }}
            className="h-3.5 w-3.5 shrink-0"
          />
        ),
        modelOpen: videoModelPanelOpen,
        onModelOpenChange: setVideoModelPanelOpen,
        modelPanel: (
          <ModelPickerPanel
            tab="video"
            models={models}
            selectedId={modelId}
            status={modelsStatus}
            autoOnly={!canPickModel}
            onPick={(id) => {
              setModelId(id);
              setModelTab('video');
              setVideoModelPanelOpen(false);
            }}
          />
        ),
      }
    : null;

  const imageAspectProps = {
    // Design canvas size chip — hidden in Image / Video chat mode.
    showDesignSizePicker: !isImageInteraction && !isVideoInteraction,
    imageAspectRatio,
    onImageAspectRatioChange: setImageAspectRatio,
    aspectMenuPlacement: 'bottom-start' as const,
    // Size panel has no "drawing" tab — use image presets (square canvases).
    designSceneCategory: designSceneCategoryOf(category),
    onDesignSceneChange: (scene: 'website' | 'mobile' | 'image' | 'poster' | null) => {
      // Same as editor: picking Image in the size panel enters Image chat chrome.
      // Do not force default WxH here — SizePresetPanel already applied the picked size
      // (resetting to 1080×1920 etc. made A0 / custom poster picks look like a no-op).
      if (scene === 'image') {
        enterImageMode();
        return;
      }
      leaveImageMode();
    },
  };

  const handleSubmit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    if (hasUploadingAttachment(contexts)) {
      message.warning(t('agent.attachWaitUpload'));
      return;
    }
    const resolvedModelId = resolveHomeSubmitModelId({
      canPickModel,
      isImageModelSelected,
      modelId,
    });
    const isImage = !isVideoInteraction && resolveHomeIsImageSubmit({
      isImageInteraction,
      canPickModel,
      category,
      isImageModelSelected,
      resolvedModelId,
      models,
    });

    let submitMode: ComposerInteractionMode = interactionMode;
    if (isVideoInteraction) submitMode = 'video';
    else if (isImage) submitMode = 'image';

    let scene: HomeAgentCategory | null = category;
    if (isVideoInteraction || category === 'video') scene = null;
    else if (isImage) scene = 'image';

    let submitAspect = imageAspectRatio;
    if (isImage) submitAspect = String(imageGenAspectRatio);
    else if (isVideoInteraction) submitAspect = String(videoGenAspectRatio);

    onSubmit({
      prompt,
      attachments: contexts.filter((c) => c.kind === 'attachment'),
      modelId: resolvedModelId === 'auto' ? undefined : resolvedModelId || undefined,
      interactionMode: submitMode,
      category,
      scene,
      // Design canvas size for agent scenes; image-gen ratio for Image chat mode.
      imageAspectRatio: submitAspect,
    });
  };

  const onAttachFiles = async (files: File[], opts?: { mention?: boolean }) => {
    const MAX = 10 * 1024 * 1024;
    const slots = Math.max(0, attachmentLimit - attachmentCount);
    if (slots <= 0) {
      message.warning(t('agent.attachMaxReached', { count: attachmentLimit }));
      return;
    }

    const accepted: File[] = [];
    for (const file of files.slice(0, slots)) {
      if (isVideoInteraction) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      } else if (!file.type.startsWith('image/')) {
        continue;
      }
      if (file.size > MAX) {
        message.warning(t('agent.attachTooLarge', { name: file.name }));
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;

    const previews = await Promise.all(
      accepted.map(async (file) => {
        try {
          return { file, preview: await readFileAsDataUrl(file), ok: true as const };
        } catch {
          message.error(t('agent.attachReadFailed', { name: file.name }));
          return { file, preview: '', ok: false as const };
        }
      })
    );
    const readable = previews.filter((p) => p.ok);
    if (!readable.length) return;

    let mentionOrdinal = contextsRef.current.filter((c) => c.kind === 'attachment').length;
    const batch = readable.map(({ file, preview }) => {
      const key = `att-${nanoid(8)}`;
      const pending: ComposerContext = {
        key,
        label: file.name || 'image',
        kind: 'attachment',
        payload: file.name || 'image',
        dataUrl: preview,
        thumbUrl: preview,
        uploadStatus: 'uploading',
      };
      mentionOrdinal += 1;
      const n = mentionOrdinal;
      const mentionCtx: ComposerContext | null = opts?.mention
        ? {
            key: `attach-ref:${chipBaseKey(key)}`,
            label: t('agent.mentionAttachImageN', { n }),
            kind: 'image',
            payload: pending.payload || `[User attachment ${n}]`,
            dataUrl: preview,
            thumbUrl: preview,
          }
        : null;
      return { file, key, preview, pending, mentionCtx };
    });

    setContexts((prev) => {
      const extra: ComposerContext[] = [];
      for (const item of batch) {
        extra.push(item.pending);
        if (item.mentionCtx) extra.push(item.mentionCtx);
      }
      return [...prev, ...extra];
    });
    if (opts?.mention) {
      queueMicrotask(() => inputRef.current?.focus());
    }

    await Promise.all(
      batch.map(async ({ file, key, preview }) => {
        try {
          const uploaded = await uploadComposerAttachment(file, {
            previewDataUrl: preview,
          });
          setContexts((prev) => {
            if (!prev.some((c) => c.key === key)) {
              if (uploaded.uploadKey) {
                void deleteUploadedFile(uploaded.uploadKey).catch(() => {});
              }
              return prev;
            }
            return prev.map((c) =>
              c.key === key
                ? {
                    ...c,
                    dataUrl: uploaded.imageRef,
                    thumbUrl: uploaded.previewDataUrl || preview,
                    uploadKey: uploaded.uploadKey || undefined,
                    uploadStatus: 'ready' as const,
                  }
                : c
            );
          });
        } catch {
          setContexts((prev) => prev.filter((c) => c.key !== key));
          message.error(t('agent.uploadFailed', { name: file.name }));
        }
      })
    );
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

  const maybeOpenMentionFromAt = (next: string) => {
    const parsed = parseAtMentionQuery(next);
    if (!parsed.open) {
      setMentionPanelOpen(false);
      setMentionQuery('');
      return;
    }
    setModelOpen(false);
    setMentionQuery(parsed.query);
    setMentionPanelOpen(true);
  };

  const mentionItems = useMemo((): MentionAttachItem[] => {
    const attachments = contexts.filter((c) => c.kind === 'attachment');
    return attachments.map((c, i) => ({
      id: c.key,
      label: t('agent.mentionAttachImageN', { n: i + 1 }),
      ...(c.thumbUrl || c.dataUrl
        ? { thumbUrl: String(c.thumbUrl || c.dataUrl) }
        : {}),
    }));
  }, [contexts, t]);

  const pickMentionAttach = (pickId: string) => {
    const attachments = contextsRef.current.filter((c) => c.kind === 'attachment');
    const idx = attachments.findIndex((c) => c.key === pickId);
    if (idx < 0) return;
    const att = attachments[idx]!;
    const n = idx + 1;
    const ctx: ComposerContext = {
      key: `attach-ref:${chipBaseKey(att.key)}`,
      label: t('agent.mentionAttachImageN', { n }),
      kind: 'image',
      payload: att.payload || `[User attachment ${n}]`,
      ...(att.dataUrl ? { dataUrl: att.dataUrl } : {}),
      ...(att.thumbUrl || att.dataUrl
        ? { thumbUrl: String(att.thumbUrl || att.dataUrl) }
        : {}),
    };
    setValue(stripTrailingAtQuery);
    setMentionPanelOpen(false);
    setMentionQuery('');
    queueMicrotask(() => {
      inputRef.current?.insertContextAtCaret(ctx);
      inputRef.current?.focus();
    });
  };

  const mentionFloating = useFloating({
    open: mentionPanelOpen,
    onOpenChange: (open) => {
      setMentionPanelOpen(open);
      if (!open) setMentionQuery('');
    },
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 12, fallbackPlacements: ['top-start', 'bottom-end', 'top-end'] }),
      shift({ padding: 12 }),
    ],
  });
  const mentionDismiss = useDismiss(mentionFloating.context);
  const mentionIx = useInteractions([mentionDismiss]);

  useLayoutEffect(() => {
    if (!mentionPanelOpen) return;
    const editor =
      (document.querySelector('[data-agent-composer]') as HTMLElement | null) || undefined;
    mentionFloating.refs.setPositionReference({
      contextElement: editor,
      getBoundingClientRect: () =>
        inputRef.current?.getAtMentionAnchorRect?.() ??
        editor?.getBoundingClientRect() ??
        new DOMRect(),
    });
    void mentionFloating.update();
  }, [mentionPanelOpen, mentionQuery, value, mentionFloating.refs, mentionFloating.update]);

  return (
    <>
      <AgentComposerShell
        className={cn(
          'min-h-[120px] w-full overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_4px_20px_rgba(0,0,0,0.05)]',
          className
        )}
        inputRef={inputRef}
        contexts={contexts}
        onContextsChange={onContextsChange}
        value={value}
        onChange={(next) => {
          setValue(next);
          maybeOpenMentionFromAt(next);
        }}
        onSubmit={handleSubmit}
        placeholder={composerPlaceholder}
        canSend={canSend}
        onAttachFiles={attachFull ? undefined : onAttachFiles}
        attachTooltip={
          attachFull
            ? t('agent.attachMaxReached', { count: attachmentLimit })
            : t('agent.uploadImage')
        }
        interactionMode={interactionMode}
        onInteractionModeChange={(mode) => {
          if (mode === 'image') {
            onCategoryChange?.('image');
            enterImageMode();
            return;
          }
          if (mode === 'video') {
            onCategoryChange?.('video');
            enterVideoMode();
            return;
          }
          if (category === 'image' || category === 'video') {
            // Leave Image/Video tab when leaving that mode (restore last design category in parent).
            onCategoryChange?.('poster');
          }
          leaveVideoMode();
          leaveImageMode();
          setInteractionMode(mode);
          setImageModelPanelOpen(false);
          setModelId('auto');
          setModelTab('design');
        }}
        imageModeControls={imageModeControls}
        videoModeControls={videoModeControls}
        {...imageAspectProps}
        modelButtonProps={{
          title: modelTitle,
          label:
            modelId === 'auto'
              ? t('agent.autoToggle')
              : selectedModel?.label || modelId,
          open: modelOpen,
          panelPlacement: 'bottom-start',
          onOpenChange: (next) => {
            if (next) {
              setMentionPanelOpen(false);
              setMentionQuery('');
              // Same as editor AgentDock: open route prefs, not a forked image list.
              setModelId('auto');
              setModelTab('design');
            }
            setModelOpen(next);
          },
          panel: (
            <AgentRoutePrefsEditor compact modeLabel={t('agent.interactionAgent')} />
          ),
          icon: <Icon name="editor-model-cube" width={16} height={16} />,
        }}
      />
      {mentionPanelOpen ? (
        <FloatingPortal>
          <div
            ref={mentionFloating.refs.setFloating}
            style={mentionFloating.floatingStyles as CSSProperties}
            className="z-[80]"
            {...mentionIx.getFloatingProps()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MentionAttachPanel
              items={mentionItems}
              query={mentionQuery}
              onPick={pickMentionAttach}
            />
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}

export default memo(HomeAgentComposer);
