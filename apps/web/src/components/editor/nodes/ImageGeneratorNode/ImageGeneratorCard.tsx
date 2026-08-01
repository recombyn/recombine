import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import { HiOutlineBolt, HiOutlineChevronDown, HiOutlinePlus, HiOutlineViewfinderCircle } from 'react-icons/hi2';
import { generateImage, listModels, type LlmModel } from '@/apis/chat';
import { Dropdown, DropdownPanel, message, Tooltip } from '@/components/base';
import {
  rcbScreenPxToScene,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '@/components/rcb';
import { SELECTION_TOOLBAR_BELOW_BOX_GAP_PX } from '@/components/rcb/selection/chrome/SelectionToolbarShell';
import AgentComposerInput, {
  chipBaseKey,
  parseAtMentionQuery,
  stripTrailingAtQuery,
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import {
  ComposerAttachmentChip,
  composerAttachActionClass,
} from '@/components/editor/panels/agent/AgentComposerShell';
import { buildComposerContext, enrichComposerContextThumb, rasterizeNodesToPngDataUrl } from '@/components/editor/panels/AgentComposerInput';
import MentionAttachPanel, {
  type MentionAttachItem,
} from '@/components/editor/panels/agent/MentionAttachPanel';
import ImageAspectRatioPicker, {
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_RESOLUTION,
  modelImageLimits,
  resolveImagePixelSize,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import ModelPickerPanel, {
  ModelBrandIcon,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { modelIsImageGenerator } from '@/components/editor/panels/agent/llmModelMeta';
import {
  canAttachNodeToChat,
  captureVideoPosterFrame,
  clearImageProcessAttrs,
  expandSelectionWithGroups,
  fitImageSize,
  measureImageNaturalSize,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  clearCanvasAttachPick,
  consumePendingCanvasAttach,
  finishImageGenerator,
  patchDocumentNode,
  setDocumentFromCanvas,
  startCanvasAttachPick,
} from '@/store/modules/editor';
import { FREE_IMAGE_MODEL_ID } from '@/utils/wallet';
import { cn } from '@/utils/classnames';
import { estimateImageCredits } from '@/utils/imageCredits';
import { readFileAsDataUrl } from '@/utils/uploadImage';
import store from '@/store';

type Props = {
  nodeId: string;
  /** Screen-space box for the SVG plate (preview area). */
  plateStyle: CSSProperties;
  /** Current scene plate size — used to keep center when promoting. */
  sceneBox: { x: number; y: number; width: number; height: number };
  /** Composer only shows while the generator node is selected. */
  showComposer?: boolean;
  disabled?: boolean;
};

function ratioSummaryLabel(aspectRatio: string, t: (k: string) => string) {
  const raw = String(aspectRatio || '').trim();
  if (raw === 'smart') return t('agent.ratioSmart');
  if (/^\d+x\d+$/i.test(raw)) {
    const [a, b] = raw.toLowerCase().split('x');
    return `${a}×${b}`;
  }
  return raw || '1:1';
}

/** Keep plate area; apply new aspect ratio; return size centered on current box. */
function plateSizeForAspect(
  box: { x: number; y: number; width: number; height: number },
  aspectRatio: string,
  resolution: string
) {
  const area = Math.max(1, box.width * box.height);
  const pixels = resolveImagePixelSize(aspectRatio, resolution);
  const ratio = Math.max(0.05, pixels.w / Math.max(1, pixels.h));
  let height = Math.sqrt(area / ratio);
  let width = height * ratio;
  // Soft clamp so extreme ratios stay editable on canvas.
  const maxSide = Math.max(box.width, box.height) * 1.6;
  const minSide = 120;
  if (Math.max(width, height) > maxSide) {
    const s = maxSide / Math.max(width, height);
    width *= s;
    height *= s;
  }
  if (Math.min(width, height) < minSide) {
    const s = minSide / Math.min(width, height);
    width *= s;
    height *= s;
  }
  width = Math.max(minSide, Math.round(width));
  height = Math.max(minSide, Math.round(height));
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {
    width,
    height,
    x: Math.round(cx - width / 2),
    y: Math.round(cy - height / 2),
  };
}

/**
 * Image Generator card — preview plate + chat-style composer (settings / model / send).
 * On success, promotes this node into a normal image node.
 */
function readGenAttrString(attrs: Record<string, unknown> | null | undefined, key: string) {
  const raw = attrs?.[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
}

function readGenAttrCount(attrs: Record<string, unknown> | null | undefined) {
  const raw = attrs?.imageGenCount;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(4, Math.round(n)));
}

/** Apply a canvas pick (node / group / frame) into an image-node composer. */
export async function applyCanvasPickToImageComposer(opts: {
  document: any;
  payload: string | string[];
  existing: ComposerContext[];
  setContexts: (next: ComposerContext[]) => void;
  insertChip: (ctx: ComposerContext) => void;
  /** Image generator / quick-edit: reject video nodes (default true). Video gen passes false. */
  imagesOnly?: boolean;
}) {
  const {
    document: doc,
    payload,
    existing,
    setContexts,
    insertChip,
    imagesOnly = true,
  } = opts;
  let ids: string[] = [];
  let frameId: string | null = null;
  if (Array.isArray(payload)) {
    ids = payload.map(String).filter(Boolean);
  } else if (String(payload).startsWith('frame:')) {
    frameId = String(payload).slice('frame:'.length);
  } else {
    ids = [String(payload)];
  }

  if (imagesOnly) {
    ids = ids.filter((id) => {
      const node = doc?.deltaSetLike?.[id];
      return node?.key !== 'video';
    });
    if (!ids.length && !frameId) return;
  }

  const pushAttachment = (att: ComposerContext) => {
    const atts = existing.filter((c) => c.kind === 'attachment');
    const inline = existing.filter((c) => c.kind !== 'attachment');
    // Avoid duplicating the same key if setContexts is called twice in one pick.
    if (atts.some((c) => c.key === att.key) || inline.some((c) => c.key === att.key)) {
      setContexts([...atts, ...inline]);
      return;
    }
    setContexts([...atts, att, ...inline]);
  };

  // Group / multi — peel videos/images out; only rasterize leftover shapes together.
  if (ids.length > 1) {
    const videos: string[] = [];
    const images: string[] = [];
    const others: string[] = [];
    for (const mid of ids) {
      const n = doc?.deltaSetLike?.[mid];
      const s = String(n?.attrs?.src || '').trim();
      if (!imagesOnly && n?.key === 'video' && s) videos.push(mid);
      else if (n?.key === 'image' && s) images.push(mid);
      else others.push(mid);
    }

    for (const vid of videos) {
      const n = doc?.deltaSetLike?.[vid];
      const s = String(n?.attrs?.src || '').trim();
      const labeled = buildComposerContext(doc, [vid], null, existing);
      let thumb = String(n?.attrs?.poster || '').trim();
      if (!thumb) {
        try {
          thumb = await captureVideoPosterFrame(s);
        } catch {
          /* optional */
        }
      }
      pushAttachment({
        key: `attach:canvas:${vid}:${Date.now()}`,
        label: labeled?.label || vid,
        kind: 'attachment',
        payload: `[Canvas video]\nid: ${vid}${labeled?.payload ? `\n${labeled.payload}` : ''}`,
        dataUrl: s,
        thumbUrl: thumb || undefined,
      });
    }
    for (const iid of images) {
      const s = String(doc?.deltaSetLike?.[iid]?.attrs?.src || '').trim();
      const labeled = buildComposerContext(doc, [iid], null, existing);
      pushAttachment({
        key: `attach:canvas:${iid}:${Date.now()}`,
        label: labeled?.label || iid,
        kind: 'attachment',
        payload: labeled?.payload || `[Canvas image]\nid: ${iid}`,
        dataUrl: s,
        thumbUrl: s,
      });
    }

    if (others.length > 1) {
      const dataUrl = await rasterizeNodesToPngDataUrl(doc, others);
      if (dataUrl) {
        pushAttachment({
          key: `attach:canvas-group:${Date.now()}`,
          label: 'canvas-group.png',
          kind: 'attachment',
          payload: `[Canvas group]\nids: ${others.join(', ')}`,
          dataUrl,
          thumbUrl: dataUrl,
        });
        return;
      }
      const base = buildComposerContext(doc, others, frameId, existing);
      const ctx = await enrichComposerContextThumb(doc, base, { nodeIds: others, frameId });
      if (ctx) insertChip(ctx);
      return;
    }
    if (others.length === 1) {
      const oid = others[0]!;
      const base = buildComposerContext(doc, [oid], null, existing);
      const ctx = await enrichComposerContextThumb(doc, base, { nodeIds: [oid] });
      if (ctx) insertChip(ctx);
    }
    return;
  }

  if (frameId) {
    const base = buildComposerContext(doc, [], frameId, existing);
    const ctx = await enrichComposerContextThumb(doc, base, { frameId });
    if (ctx) insertChip(ctx);
    return;
  }

  const id = ids[0];
  if (!id) return;
  const node = doc?.deltaSetLike?.[id];
  if (imagesOnly && node?.key === 'video') return;
  const src = String(node?.attrs?.src || '').trim();
  if (node?.key === 'image' && src) {
    const labeled = buildComposerContext(doc, [id], null, existing);
    pushAttachment({
      key: `attach:canvas:${id}:${Date.now()}`,
      label: labeled?.label || id,
      kind: 'attachment',
      payload: labeled?.payload || `[Canvas image]\nid: ${id}`,
      dataUrl: src,
      thumbUrl: src,
    });
    return;
  }

  // Video generator (imagesOnly=false): canvas video → attachment strip + @ list
  // (same as file upload), not an inline input chip.
  if (!imagesOnly && node?.key === 'video' && src) {
    const labeled = buildComposerContext(doc, [id], null, existing);
    let thumb = String(node?.attrs?.poster || '').trim();
    if (!thumb) {
      try {
        thumb = await captureVideoPosterFrame(src);
      } catch {
        /* thumb optional — chip can fall back to label */
      }
    }
    pushAttachment({
      key: `attach:canvas:${id}:${Date.now()}`,
      label: labeled?.label || id,
      kind: 'attachment',
      payload: `[Canvas video]\nid: ${id}${labeled?.payload ? `\n${labeled.payload}` : ''}`,
      dataUrl: src,
      thumbUrl: thumb || undefined,
    });
    return;
  }

  const base = buildComposerContext(doc, [id], null, existing);
  const ctx = await enrichComposerContextThumb(doc, base, { nodeIds: [id] });
  if (ctx) insertChip(ctx);
}

/** Attach currently selected canvas nodes/frames into the image composer (excl. host). */
function attachSelectionToImageComposer(opts: {
  hostNodeId: string;
  document: any;
  selectedNodeIds: string[];
  selectedFrameIds: string[];
  existing: ComposerContext[];
  setContexts: (next: ComposerContext[]) => void;
  insertChip: (ctx: ComposerContext) => void;
}): boolean {
  const {
    hostNodeId,
    document: doc,
    selectedNodeIds,
    selectedFrameIds,
    existing,
    setContexts,
    insertChip,
  } = opts;
  const seed = expandSelectionWithGroups(
    doc,
    (selectedNodeIds || []).filter((id) => id && id !== hostNodeId)
  );
  const attachable = seed.filter((id) =>
    canAttachNodeToChat(doc?.deltaSetLike?.[id], { imagesOnly: true })
  );
  const frameId = (selectedFrameIds || []).find(Boolean) || null;
  if (!attachable.length && !frameId) return false;
  const payload =
    attachable.length > 1 ? attachable : attachable.length === 1 ? attachable[0]! : `frame:${frameId}`;
  void applyCanvasPickToImageComposer({
    document: doc,
    payload,
    existing,
    setContexts,
    insertChip,
  });
  return true;
}

function ImageGeneratorCard({
  nodeId,
  plateStyle,
  sceneBox,
  showComposer = true,
  disabled,
}: Props): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { zoom } = useRcbCamera();
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const genAttrs = useSelector(
    (state: any) => state.editor?.document?.deltaSetLike?.[nodeId]?.attrs as
      | Record<string, unknown>
      | undefined
  );
  const editorDocument = useSelector((state: any) => state.editor?.document);
  const canvasAttachPick = useSelector(
    (state: any) => state.editor?.canvasAttachPick as null | { target: string }
  );
  const pendingCanvasAttach = useSelector(
    (state: any) =>
      state.editor?.pendingCanvasAttach as null | {
        target: string;
        payload: string | string[];
      }
  );
  const pickTarget = `node:${nodeId}`;
  const pickingFromCanvas = canvasAttachPick?.target === pickTarget;
  const selectedNodeIds = useSelector(
    (state: any) => (state.editor?.selectedNodeIds || []) as string[]
  );
  const selectedFrameIds = useSelector(
    (state: any) => (state.editor?.selectedFrameIds || []) as string[]
  );

  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [resolution, setResolution] = useState<string>(() => {
    return readGenAttrString(genAttrs, 'imageGenResolution') || DEFAULT_IMAGE_RESOLUTION;
  });
  const [aspectRatio, setAspectRatio] = useState<string>(() => {
    return readGenAttrString(genAttrs, 'imageGenAspect') || DEFAULT_IMAGE_ASPECT_RATIO;
  });
  /** Keep latest resolution across batched picker callbacks (res + WxH rescale). */
  const resolutionRef = useRef(resolution);
  resolutionRef.current = resolution;
  const [imageCount, setImageCount] = useState<number>(() => {
    return readGenAttrCount(genAttrs) ?? DEFAULT_IMAGE_COUNT;
  });
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [modelId, setModelId] = useState(() => {
    return readGenAttrString(genAttrs, 'imageGenModel') || FREE_IMAGE_MODEL_ID;
  });
  const [contexts, setContexts] = useState<ComposerContext[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const contextsRef = useRef<ComposerContext[]>([]);
  contextsRef.current = contexts;

  useEffect(() => {
    if (!pendingCanvasAttach || pendingCanvasAttach.target !== pickTarget) return;
    const payload = pendingCanvasAttach.payload;
    dispatch(consumePendingCanvasAttach());
    void applyCanvasPickToImageComposer({
      document: editorDocument || (store.getState() as any).editor?.document,
      payload,
      existing: contextsRef.current,
      setContexts,
      insertChip: (ctx) => {
        inputRef.current?.insertContextAtCaret(ctx);
        inputRef.current?.focus();
      },
    });
  }, [pendingCanvasAttach, pickTarget, editorDocument, dispatch]);

  // Re-hydrate after overlay remount (e.g. geometry transform hides the portal).
  useEffect(() => {
    const nextAspect = readGenAttrString(genAttrs, 'imageGenAspect');
    if (nextAspect) setAspectRatio(nextAspect);
    const nextRes = readGenAttrString(genAttrs, 'imageGenResolution');
    if (nextRes) setResolution(nextRes);
    const nextCount = readGenAttrCount(genAttrs);
    if (nextCount != null) setImageCount(nextCount);
    const nextModel = readGenAttrString(genAttrs, 'imageGenModel');
    if (nextModel) setModelId(nextModel);
  }, [
    nodeId,
    genAttrs?.imageGenAspect,
    genAttrs?.imageGenResolution,
    genAttrs?.imageGenCount,
    genAttrs?.imageGenModel,
  ]);

  // Auto-focus when the generator composer appears (select plate / show again).
  useEffect(() => {
    if (!showComposer || disabled) return;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [showComposer, nodeId, disabled]);

  useEffect(() => {
    let cancelled = false;
    setModelsStatus('loading');
    listModels()
      .then((res) => {
        if (cancelled) return;
        const pool = [...(res?.models || []), ...(res?.imageModels || [])].filter(
          (m) => modelIsImageGenerator(m) || m.kind === 'image'
        );
        const seen = new Set<string>();
        const unique = pool.filter((m) => {
          if (!m?.id || seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        setModels(unique);
        setModelsStatus('ready');
        if (unique.length && !unique.some((m) => m.id === modelId)) {
          const preferred = unique.find((m) => m.id === FREE_IMAGE_MODEL_ID) || unique[0];
          if (preferred) setModelId(preferred.id);
        }
      })
      .catch(() => {
        if (!cancelled) setModelsStatus('error');
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachments = useMemo(
    () => contexts.filter((c) => c.kind === 'attachment'),
    [contexts]
  );
  /** Attachments render as thumbs above; keep long filenames out of the inline composer chips. */
  const inlineContexts = useMemo(
    () => contexts.filter((c) => c.kind !== 'attachment'),
    [contexts]
  );
  const selectedModel = models.find((m) => m.id === modelId);
  const creditCost = estimateImageCredits(selectedModel, imageCount, resolution);
  const settingsSummary = `${resolution} · ${ratioSummaryLabel(aspectRatio, t)} · ${t('agent.genCountN', { count: imageCount })}`;

  const removeContext = (key: string) =>
    setContexts((prev) =>
      prev.filter((c) => c.key !== key && chipBaseKey(c.key) !== chipBaseKey(key))
    );

  const onPickRef = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
    await attachRefFiles(files);
  };

  const attachRefFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    const results = await Promise.all(
      images.map(async (file, i) => {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          return {
            key: `attach:${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
            label: file.name || t('editor.tools.imageGenRef'),
            kind: 'attachment' as const,
            payload: '',
            dataUrl,
            thumbUrl: dataUrl,
          } satisfies ComposerContext;
        } catch {
          message.error(t('agent.attachReadFailed', { name: file.name }));
          return null;
        }
      })
    );
    const next = results.filter(Boolean) as ComposerContext[];
    if (!next.length) return;
    setContexts((prev) => [...prev, ...next]);
  };

  // `@` opens the attachment mention panel, mirroring the chat composer.
  const maybeOpenMentionFromAt = (next: string) => {
    const parsed = parseAtMentionQuery(next);
    setMentionQuery(parsed.query);
    setMentionOpen(parsed.open);
  };

  const mentionItems = useMemo(
    (): MentionAttachItem[] =>
      attachments.map((c, i) => ({
        id: c.key,
        label: t('agent.mentionAttachImageN', { n: i + 1 }),
        ...(c.thumbUrl || c.dataUrl ? { thumbUrl: String(c.thumbUrl || c.dataUrl) } : {}),
      })),
    [attachments, t]
  );

  const pickMentionAttach = (pickId: string) => {
    const list = contextsRef.current.filter((c) => c.kind === 'attachment');
    const idx = list.findIndex((c) => c.key === pickId);
    if (idx < 0) return;
    const att = list[idx]!;
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
    setPrompt(stripTrailingAtQuery(prompt));
    setMentionOpen(false);
    setMentionQuery('');
    queueMicrotask(() => {
      inputRef.current?.insertContextAtCaret(ctx);
      inputRef.current?.focus();
    });
  };

  const mentionFloating = useFloating({
    open: mentionOpen,
    onOpenChange: (open) => {
      setMentionOpen(open);
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
    if (!mentionOpen) return;
    mentionFloating.refs.setPositionReference({
      getBoundingClientRect: () =>
        inputRef.current?.getAtMentionAnchorRect?.() ?? new DOMRect(),
    });
    void mentionFloating.update();
  }, [mentionOpen, mentionQuery, prompt, mentionFloating.refs, mentionFloating.update]);

  const onGenerate = async () => {
    const text = prompt.trim();
    if (!text || sending || disabled) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSending(true);
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          attrs: {
            processStatus: 'running',
            processKind: 'generate',
            processLabel: t('editor.tools.imageGenerating'),
          },
        },
      })
    );
    try {
      const body: Parameters<typeof generateImage>[0] = {
        prompt: text,
        model: modelId,
        quality: DEFAULT_IMAGE_QUALITY,
        resolution,
      };
      // Smart ratio: omit so the model picks a fitting aspect.
      if (aspectRatio !== 'smart') body.aspect_ratio = aspectRatio;
      const refImages = attachments
        .map((c) => String(c.dataUrl || c.thumbUrl || '').trim())
        .filter(Boolean);
      if (refImages.length) body.images = refImages;
      // Parallel per-slot gens (provider `n` is unreliable) — same pattern as AgentDock.
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
      const src = urls[0] || '';
      if (!src) throw new Error(t('editor.tools.imageGenEmpty'));

      let width = sceneBox.width;
      let height = sceneBox.height;
      try {
        const natural = await measureImageNaturalSize(src);
        const fitted = fitImageSize(
          natural.width,
          natural.height,
          Math.max(sceneBox.width, sceneBox.height)
        );
        width = fitted.width;
        height = fitted.height;
      } catch {
        /* keep plate size */
      }
      const cx = sceneBox.x + sceneBox.width / 2;
      const cy = sceneBox.y + sceneBox.height / 2;
      dispatch(
        finishImageGenerator({
          nodeId,
          src,
          width,
          height,
          x: Math.round(cx - width / 2),
          y: Math.round(cy - height / 2),
          name: t('editor.tools.imageGenerator'),
          variants: urls,
          genPrompt: text,
        })
      );
    } catch (err: any) {
      if (ac.signal.aborted) return;
      const doc = (store.getState() as any).editor?.document;
      if (doc) {
        dispatch(setDocumentFromCanvas(clearImageProcessAttrs(doc, nodeId)));
      }
      const detail =
        err?.response?.data?.detail || err?.message || t('editor.tools.imageGenFail');
      message.error(typeof detail === 'string' ? detail : t('editor.tools.imageGenFail'));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setSending(false);
    }
  };

  const persistGenSettings = (
    patch: {
      aspect?: string;
      resolution?: string;
      count?: number;
      model?: string;
    },
    opts?: { skipHistory?: boolean }
  ) => {
    const attrs: Record<string, unknown> = {};
    if (patch.aspect != null) attrs.imageGenAspect = patch.aspect;
    if (patch.resolution != null) attrs.imageGenResolution = patch.resolution;
    if (patch.count != null) attrs.imageGenCount = patch.count;
    if (patch.model != null) attrs.imageGenModel = patch.model;
    if (!Object.keys(attrs).length) return;
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: { attrs },
        skipHistory: opts?.skipHistory !== false,
      })
    );
  };

  const applyAspectToNode = (nextAspect: string, nextResolution = resolutionRef.current) => {
    const res = String(nextResolution || resolutionRef.current || DEFAULT_IMAGE_RESOLUTION);
    resolutionRef.current = res;
    setAspectRatio(nextAspect);
    setResolution(res);
    if (disabled || sending) {
      persistGenSettings({ aspect: nextAspect, resolution: res });
      return;
    }
    // Smart = model picks aspect; keep the current plate (don't collapse to 1:1).
    if (String(nextAspect).trim() === 'smart') {
      persistGenSettings({ aspect: 'smart', resolution: res });
      return;
    }
    const next = plateSizeForAspect(sceneBox, nextAspect, res);
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
          attrs: {
            imageGenAspect: nextAspect,
            imageGenResolution: res,
          },
        },
      })
    );
  };

  // Same placement contract as selection toolbars: centered under the box.
  const composerStyle = useRcbScreenToolbarStyle({
    left: sceneBox.x + sceneBox.width / 2,
    top:
      sceneBox.y +
      sceneBox.height +
      rcbScreenPxToScene(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX, zoom),
    anchor: 'top',
  });

  return (
    <>
      {sending ? (
        <div
          className="pointer-events-none absolute z-[31] flex items-center justify-center"
          style={plateStyle}
          aria-hidden
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--ink)]" />
        </div>
      ) : null}

      {showComposer ? (
        <div
          data-image-generator
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
          {/* Reference images occupy their own row, using the chat attachment chip. */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
            {attachments.map((att) => (
              <ComposerAttachmentChip
                key={att.key}
                attachment={att}
                disabled={disabled || sending}
                onRemove={removeContext}
              />
            ))}
            <Tooltip tip={t('editor.tools.imageGenRef')} placement="top">
              <button
                type="button"
                disabled={disabled || sending}
                aria-label={t('editor.tools.imageGenRef')}
                onClick={() => fileRef.current?.click()}
                className={composerAttachActionClass()}
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
                disabled={disabled || sending}
                aria-label={t('agent.pickFromCanvas')}
                aria-pressed={pickingFromCanvas}
                onClick={() => {
                  if (pickingFromCanvas) {
                    dispatch(clearCanvasAttachPick());
                    return;
                  }
                  const doc =
                    editorDocument || (store.getState() as any).editor?.document;
                  const insertChip = (ctx: ComposerContext) => {
                    inputRef.current?.insertContextAtCaret(ctx);
                    inputRef.current?.focus();
                  };
                  // If something is already selected, add it now; otherwise enter one-shot pick.
                  attachSelectionToImageComposer({
                    hostNodeId: nodeId,
                    document: doc,
                    selectedNodeIds,
                    selectedFrameIds,
                    existing: contextsRef.current,
                    setContexts,
                    insertChip,
                  });
                  dispatch(startCanvasAttachPick({ target: pickTarget, accept: 'image' }));
                }}
                className={composerAttachActionClass(pickingFromCanvas)}
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
              onContextsChange={(next) => {
                setContexts([...attachments, ...next]);
              }}
              value={prompt}
              onChange={(next) => {
                setPrompt(next);
                maybeOpenMentionFromAt(next);
              }}
              onSubmit={() => void onGenerate()}
              disabled={disabled || sending}
              placeholder={t('editor.tools.imageGenPlaceholder')}
              className="min-h-full w-full text-[13px]"
              onPasteImages={(files) => {
                void attachRefFiles(files);
              }}
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
                  <div onPointerDown={(e) => e.stopPropagation()}>
                    <ImageAspectRatioPicker
                      variant="image"
                      resolution={resolution}
                      aspectRatio={aspectRatio}
                      imageCount={imageCount}
                      imageLimits={modelImageLimits(selectedModel)}
                      onResolutionChange={(r) => {
                        resolutionRef.current = r;
                        applyAspectToNode(aspectRatio, r);
                      }}
                      onAspectRatioChange={(r) =>
                        applyAspectToNode(r, resolutionRef.current)
                      }
                      onImageCountChange={(n) => {
                        setImageCount(n);
                        persistGenSettings({ count: n });
                      }}
                      disabled={disabled || sending}
                    />
                  </div>
                </DropdownPanel>
              )}
            >
              <button
                type="button"
                disabled={disabled || sending}
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
                        persistGenSettings({ model: id });
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
                    disabled={disabled || sending}
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

              <Tooltip tip={t('wallet.creditCostTip', { count: creditCost })} placement="top">
                <button
                  type="button"
                  disabled={disabled || sending || !prompt.trim()}
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
      ) : null}

      {showComposer && mentionOpen ? (
        <FloatingPortal>
          <div
            ref={mentionFloating.refs.setFloating}
            style={mentionFloating.floatingStyles as CSSProperties}
            className="z-[95]"
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

export default memo(ImageGeneratorCard);
