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
import { generateVideo, listModels, type LlmModel } from '@/apis/chat';
import { Dropdown, DropdownPanel, message, Tooltip } from '@/components/base';
import {
  rcbScreenPxToScene,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '@/components/rcb';
import {
  SELECTION_TOOLBAR_BELOW_BOX_GAP_PX,
  useChromePointerActivate,
} from '@/components/rcb/selection/chrome/SelectionToolbarShell';
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
import MentionAttachPanel, {
  type MentionAttachItem,
} from '@/components/editor/panels/agent/MentionAttachPanel';
import { AspectRatioGlyph } from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import {
  AGENT_POPOVER_PANEL,
  ModelBrandIcon,
  modelDescription,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { applyCanvasPickToImageComposer } from '@/components/editor/nodes/ImageGeneratorNode/ImageGeneratorCard';
import {
  canAttachNodeToChat,
  captureVideoPosterFrame,
  clearImageProcessAttrs,
  expandSelectionWithGroups,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  clearCanvasAttachPick,
  consumePendingCanvasAttach,
  finishVideoGenerator,
  patchDocumentNode,
  setDocumentFromCanvas,
  startCanvasAttachPick,
  EMPTY_ID_LIST,
} from '@/store/modules/editor';
import { cn } from '@/utils/classnames';
import { estimateVideoCredits } from '@/utils/imageCredits';
import { uploadComposerAttachment, readFileAsDataUrl } from '@/utils/uploadImage';
import store from '@/store';

type Props = {
  nodeId: string;
  /** Scene plate box — composer anchors under it; promote keeps document geometry. */
  sceneBox: { x: number; y: number; width: number; height: number };
  /** Composer only shows while the generator node is selected. */
  showComposer?: boolean;
  disabled?: boolean;
};

const VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
const DEFAULT_VIDEO_ASPECT_RATIO: string = '16:9';

const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
const DEFAULT_VIDEO_RESOLUTION: string = '720p';

const VIDEO_DURATIONS = [4, 5, 6, 7, 8, 10, 12, 15] as const;
const DEFAULT_VIDEO_DURATION = 5;

const DEFAULT_VIDEO_MODEL_ID = 'or-seedance-2-0-fast';

function readGenAttrString(attrs: Record<string, unknown> | null | undefined, key: string) {
  const raw = attrs?.[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
}

function readGenAttrDuration(attrs: Record<string, unknown> | null | undefined) {
  const raw = attrs?.videoGenDuration;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(4, Math.min(15, Math.round(n)));
}

function modelIsVideoGenerator(model?: Pick<LlmModel, 'kind' | 'id'> | null): boolean {
  if (!model) return false;
  if (model.kind === 'video') return true;
  return /seedance/i.test(model.id || '');
}

/** Keep plate area; apply new aspect ratio; return size centered on current box. */
function plateSizeForVideoAspect(
  box: { x: number; y: number; width: number; height: number },
  aspectRatio: string
) {
  const [rw, rh] = String(aspectRatio || DEFAULT_VIDEO_ASPECT_RATIO)
    .split(':')
    .map(Number);
  const ratio = rw > 0 && rh > 0 ? rw / rh : 16 / 9;
  const area = Math.max(1, box.width * box.height);
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

/** Attach currently selected canvas nodes/frames into the video composer (excl. host). */
function attachSelectionToVideoComposer(opts: {
  hostNodeId: string;
  document: any;
  selectedNodeIds: string[];
  selectedFrameIds: string[];
  existing: ComposerContext[];
  setContexts: (
    next: ComposerContext[] | ((prev: ComposerContext[]) => ComposerContext[])
  ) => void;
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
  const attachable = seed.filter((id) => canAttachNodeToChat(doc?.deltaSetLike?.[id]));
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
    imagesOnly: false,
  });
  return true;
}

/** Model list — mirrors ModelPickerPanel's row layout, scoped to video models only. */
function VideoModelPickerPanel({
  models,
  selectedId,
  status,
  onPick,
}: {
  models: LlmModel[];
  selectedId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  onPick: (id: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const pool: LlmModel[] =
    !models.length && status === 'loading'
      ? [{ id: '_loading', label: 'Loading...', provider: '', kind: 'video' }]
      : models;

  return (
    <div className={cn(AGENT_POPOVER_PANEL, 'flex flex-col')}>
      <div className="max-h-[min(360px,calc(100vh-160px))] min-w-0 overflow-y-auto px-1.5 pb-1.5 pt-1.5">
        {status === 'error' && models.length === 0 ? (
          <div className="px-2 py-4 text-center text-[12px] text-[var(--muted)]">
            <p>{t('agent.apiDown')}</p>
            <p className="mt-1">{t('agent.apiDownHint')}</p>
          </div>
        ) : null}

        {!pool.length && status !== 'loading' ? (
          <div className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">
            {t('agent.emptyModels')}
          </div>
        ) : (
          pool.map((m) => {
            const selected = m.id === selectedId;
            const loading = m.id === '_loading';
            return (
              <button
                key={m.id}
                type="button"
                disabled={loading}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                  selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]',
                  loading && 'cursor-not-allowed'
                )}
                onClick={() => {
                  if (loading) return;
                  onPick(m.id);
                }}
              >
                <ModelBrandIcon model={m} size={20} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-5 text-[var(--ink)]">
                    {m.label || m.id}
                  </span>
                  <span className="mt-0.5 block truncate whitespace-nowrap text-[11px] leading-[1.35] text-[var(--muted)]">
                    {loading ? '...' : modelDescription(m, t)}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Pill track shared by the resolution / duration rows. */
function VideoSegmentedTrack({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--rail)] p-1">{children}</div>;
}

function VideoSegmentPill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex min-w-[2.75rem] flex-1 items-center justify-center rounded-lg px-2 py-2 text-[12px] font-medium tabular-nums transition disabled:opacity-40',
        active
          ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_3px_rgba(15,23,42,0.12)]'
          : 'bg-transparent text-[var(--muted)] hover:text-[var(--ink)]'
      )}
    >
      {children}
    </button>
  );
}

/** Aspect chips + resolution + duration — video's answer to ImageAspectRatioPicker. */
function VideoSettingsPanel({
  aspectRatio,
  resolution,
  duration,
  onAspectRatioChange,
  onResolutionChange,
  onDurationChange,
  disabled,
}: {
  aspectRatio: string;
  resolution: string;
  duration: number;
  onAspectRatioChange: (ratio: string) => void;
  onResolutionChange: (resolution: string) => void;
  onDurationChange: (duration: number) => void;
  disabled?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[12px] font-medium text-[var(--muted)]">{t('agent.chooseRatio')}</p>
        <div className="flex items-start justify-between gap-0.5 rounded-xl bg-[var(--rail)] p-1">
          {VIDEO_ASPECT_RATIOS.map((ratio) => {
            const active = aspectRatio === ratio;
            return (
              <button
                key={ratio}
                type="button"
                disabled={disabled}
                title={ratio}
                onClick={(e) => {
                  e.stopPropagation();
                  onAspectRatioChange(ratio);
                }}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 transition-colors disabled:opacity-40',
                  active
                    ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_3px_rgba(15,23,42,0.12)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                )}
              >
                <AspectRatioGlyph ratio={ratio} size={20} />
                <span className="max-w-full truncate text-[10px] font-medium tabular-nums">
                  {ratio}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[12px] font-medium text-[var(--muted)]">
          {t('agent.chooseResolution')}
        </p>
        <VideoSegmentedTrack>
          {VIDEO_RESOLUTIONS.map((r) => (
            <VideoSegmentPill
              key={r}
              active={resolution === r}
              disabled={disabled}
              onClick={() => onResolutionChange(r)}
            >
              {r}
            </VideoSegmentPill>
          ))}
        </VideoSegmentedTrack>
      </div>

      <div>
        <p className="mb-2 text-[12px] font-medium text-[var(--muted)]">
          {t('editor.tools.videoDuration', { defaultValue: '时长' })}
        </p>
        <VideoSegmentedTrack>
          {VIDEO_DURATIONS.map((n) => (
            <VideoSegmentPill
              key={n}
              active={duration === n}
              disabled={disabled}
              onClick={() => onDurationChange(n)}
            >
              {t('editor.tools.videoDurationNs', { n })}
            </VideoSegmentPill>
          ))}
        </VideoSegmentedTrack>
      </div>
    </div>
  );
}

function VideoGeneratorCard({
  nodeId,
  sceneBox,
  showComposer = true,
  disabled,
}: Props): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { zoom } = useRcbCamera();
  const chromePointer = useChromePointerActivate();
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
    (state: any) => (state.editor?.selectedNodeIds as string[]) ?? EMPTY_ID_LIST
  );
  const selectedFrameIds = useSelector(
    (state: any) => (state.editor?.selectedFrameIds as string[]) ?? EMPTY_ID_LIST
  );

  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [resolution, setResolution] = useState<string>(() => {
    return readGenAttrString(genAttrs, 'videoGenResolution') || DEFAULT_VIDEO_RESOLUTION;
  });
  const [aspectRatio, setAspectRatio] = useState<string>(() => {
    return readGenAttrString(genAttrs, 'videoGenAspect') || DEFAULT_VIDEO_ASPECT_RATIO;
  });
  const [duration, setDuration] = useState<number>(() => {
    return readGenAttrDuration(genAttrs) ?? DEFAULT_VIDEO_DURATION;
  });
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [modelId, setModelId] = useState(() => {
    return readGenAttrString(genAttrs, 'videoGenModel') || DEFAULT_VIDEO_MODEL_ID;
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
      imagesOnly: false,
      insertChip: (ctx) => {
        inputRef.current?.insertContextAtCaret(ctx);
        inputRef.current?.focus();
      },
    });
  }, [pendingCanvasAttach, pickTarget, editorDocument, dispatch]);

  // Re-hydrate after overlay remount (e.g. geometry transform hides the portal).
  useEffect(() => {
    const nextAspect = readGenAttrString(genAttrs, 'videoGenAspect');
    if (nextAspect) setAspectRatio(nextAspect);
    const nextRes = readGenAttrString(genAttrs, 'videoGenResolution');
    if (nextRes) setResolution(nextRes);
    const nextDuration = readGenAttrDuration(genAttrs);
    if (nextDuration != null) setDuration(nextDuration);
    const nextModel = readGenAttrString(genAttrs, 'videoGenModel');
    if (nextModel) setModelId(nextModel);
  }, [
    nodeId,
    genAttrs?.videoGenAspect,
    genAttrs?.videoGenResolution,
    genAttrs?.videoGenDuration,
    genAttrs?.videoGenModel,
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
        const pool = [...(res?.models || []), ...(res?.videoModels || [])].filter((m) =>
          modelIsVideoGenerator(m)
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
          const preferred = unique.find((m) => m.id === DEFAULT_VIDEO_MODEL_ID) || unique[0];
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
  const attachmentsUploading = attachments.some((c) => c.uploadStatus === 'uploading');
  /** Attachments render as thumbs above; keep long filenames out of the inline composer chips. */
  const inlineContexts = useMemo(
    () => contexts.filter((c) => c.kind !== 'attachment'),
    [contexts]
  );
  const selectedModel = models.find((m) => m.id === modelId);
  const creditCost = estimateVideoCredits(selectedModel);
  const settingsSummary = `${resolution} · ${aspectRatio} · ${duration}s`;

  const removeContext = (key: string) =>
    setContexts((prev) =>
      prev.filter((c) => c.key !== key && chipBaseKey(c.key) !== chipBaseKey(key))
    );

  const onPickRef = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    e.target.value = '';
    if (!files.length) return;
    await attachRefFiles(files);
  };

  const attachRefFiles = async (files: File[]) => {
    const media = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (!media.length) return;

    // Stage chips immediately with spinner, then upload (same pattern as AgentDock).
    const staged: Array<{
      file: File;
      key: string;
      preview: string;
      thumb: string;
      pending: ComposerContext;
    }> = [];
    for (let i = 0; i < media.length; i++) {
      const file = media[i]!;
      try {
        const preview = await readFileAsDataUrl(file);
        let thumb = preview;
        if (file.type.startsWith('video/')) {
          try {
            thumb = await captureVideoPosterFrame(preview);
          } catch {
            thumb = preview;
          }
        }
        const key = `attach:${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;
        staged.push({
          file,
          key,
          preview,
          thumb,
          pending: {
            key,
            label: file.name || t('editor.tools.videoGenRef'),
            kind: 'attachment',
            payload: file.type.startsWith('video/')
              ? `[Attached video]\nname: ${file.name}\nmime: ${file.type}`
              : `[Attached image]\nname: ${file.name}\nmime: ${file.type}`,
            dataUrl: preview,
            thumbUrl: thumb,
            uploadStatus: 'uploading',
          },
        });
      } catch {
        message.error(t('agent.attachReadFailed', { name: file.name }));
      }
    }
    if (!staged.length) return;
    setContexts((prev) => [...prev, ...staged.map((s) => s.pending)]);

    await Promise.all(
      staged.map(async ({ file, key, preview, thumb }) => {
        try {
          const uploaded = await uploadComposerAttachment(file, {
            previewDataUrl: thumb.startsWith('data:image/') ? thumb : preview,
          });
          const serverUrl = String(uploaded.url || '').trim();
          const localPreview = String(uploaded.previewDataUrl || thumb || preview).trim();
          // Local `/api/v1/uploads/…` needs auth — keep local data URL for media preview;
          // use public https URL when available.
          const mediaUrl =
            serverUrl.startsWith('http://') || serverUrl.startsWith('https://')
              ? serverUrl
              : preview;
          setContexts((prev) => {
            if (!prev.some((c) => c.key === key)) return prev;
            return prev.map((c) =>
              c.key === key
                ? {
                    ...c,
                    dataUrl: mediaUrl,
                    thumbUrl: localPreview.startsWith('data:image/')
                      ? localPreview
                      : thumb.startsWith('data:image/')
                        ? thumb
                        : localPreview,
                    uploadKey: uploaded.uploadKey || undefined,
                    uploadStatus: 'ready' as const,
                  }
                : c
            );
          });
        } catch (err: any) {
          setContexts((prev) => prev.filter((c) => c.key !== key));
          const detail =
            err?.response?.data?.detail || err?.message || t('agent.uploadFailed', { name: file.name });
          message.error(typeof detail === 'string' ? detail : t('agent.uploadFailed', { name: file.name }));
        }
      })
    );
  };

  // `@` opens the attachment mention panel, mirroring the chat composer.
  const maybeOpenMentionFromAt = (next: string) => {
    const parsed = parseAtMentionQuery(next);
    setMentionQuery(parsed.query);
    setMentionOpen(parsed.open);
  };

  const mentionItems = useMemo((): MentionAttachItem[] => {
    const isVideoAtt = (c: ComposerContext) => {
      const data = String(c.dataUrl || '');
      const thumb = String(c.thumbUrl || '');
      const blob = `${data} ${thumb} ${c.payload || ''}`;
      if (data.startsWith('data:video/')) return true;
      if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(blob)) return true;
      if (/\[Canvas video\]/i.test(String(c.payload || ''))) return true;
      return false;
    };
    return attachments.map((c, i) => ({
      id: c.key,
      label: isVideoAtt(c)
        ? t('agent.mentionAttachVideoN', { n: i + 1 })
        : t('agent.mentionAttachImageN', { n: i + 1 }),
      ...(c.thumbUrl || c.dataUrl ? { thumbUrl: String(c.thumbUrl || c.dataUrl) } : {}),
    }));
  }, [attachments, t]);

  const pickMentionAttach = (pickId: string) => {
    const list = contextsRef.current.filter((c) => c.kind === 'attachment');
    const idx = list.findIndex((c) => c.key === pickId);
    if (idx < 0) return;
    const att = list[idx]!;
    const n = idx + 1;
    const data = String(att.dataUrl || '');
    const blob = `${data} ${att.thumbUrl || ''} ${att.payload || ''}`;
    const isVideo =
      data.startsWith('data:video/') ||
      /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(blob) ||
      /\[Canvas video\]/i.test(String(att.payload || ''));
    const ctx: ComposerContext = {
      key: `attach-ref:${chipBaseKey(att.key)}`,
      label: isVideo
        ? t('agent.mentionAttachVideoN', { n })
        : t('agent.mentionAttachImageN', { n }),
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
    if (!text || sending || disabled || attachmentsUploading) return;
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
            processLabel: t('editor.tools.videoGenerating'),
          },
        },
      })
    );
    try {
      const body: Parameters<typeof generateVideo>[0] = {
        prompt: text,
        model: modelId,
        aspect_ratio: aspectRatio,
        resolution,
        duration,
      };
      // First-frame / style refs — video refs are attachable but never sent as body.images.
      // Canvas 编组 lands as kind:'group' chips (not attachment strip).
      const refImages = contextsRef.current
        .filter((c) => c.kind === 'attachment' || c.kind === 'group')
        .map((c) => String(c.dataUrl || c.thumbUrl || '').trim())
        .filter((u) => Boolean(u) && !u.startsWith('data:video/'));
      if (refImages.length) body.images = refImages;

      const res = await generateVideo(body, { signal: ac.signal });
      const pickUrl = (r: Awaited<ReturnType<typeof generateVideo>>) => {
        const fromVideos =
          Array.isArray(r?.videos) && r.videos.find((u) => String(u || '').trim());
        if (fromVideos) return String(fromVideos).trim();
        const fromAssets =
          Array.isArray(r?.assets) &&
          r.assets.map((a) => String(a?.url || '').trim()).find(Boolean);
        return fromAssets ? String(fromAssets).trim() : '';
      };
      const src = pickUrl(res);
      if (!src) throw new Error(t('editor.tools.videoGenEmpty'));

      let poster = '';
      try {
        poster = await captureVideoPosterFrame(src);
      } catch {
        /* poster is a nice-to-have — video still plays without it */
      }
      // Promote in place — keep the generator plate's document x/y/size so the
      // result appears exactly where the plate was (sceneBox is origin-relative).
      dispatch(
        finishVideoGenerator({
          nodeId,
          src,
          ...(poster ? { poster } : {}),
          name: t('editor.tools.videoGenerator'),
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
        err?.response?.data?.detail || err?.message || t('editor.tools.videoGenFail');
      message.error(typeof detail === 'string' ? detail : t('editor.tools.videoGenFail'));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setSending(false);
    }
  };

  const persistGenSettings = (
    patch: {
      aspect?: string;
      resolution?: string;
      duration?: number;
      model?: string;
    },
    opts?: { skipHistory?: boolean }
  ) => {
    const attrs: Record<string, unknown> = {};
    if (patch.aspect != null) attrs.videoGenAspect = patch.aspect;
    if (patch.resolution != null) attrs.videoGenResolution = patch.resolution;
    if (patch.duration != null) attrs.videoGenDuration = patch.duration;
    if (patch.model != null) attrs.videoGenModel = patch.model;
    if (!Object.keys(attrs).length) return;
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: { attrs },
        skipHistory: opts?.skipHistory !== false,
      })
    );
  };

  const applyAspectToNode = (nextAspect: string) => {
    setAspectRatio(nextAspect);
    if (disabled || sending) {
      persistGenSettings({ aspect: nextAspect });
      return;
    }
    const next = plateSizeForVideoAspect(sceneBox, nextAspect);
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
          attrs: {
            videoGenAspect: nextAspect,
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
      {showComposer ? (
        <div
          data-video-generator
          data-sel-toolbar
          data-scene-node-id={nodeId}
          className={cn(
            'pointer-events-auto absolute z-[32] flex h-[200px] w-[500px] flex-col overflow-visible',
            'rounded-2xl border border-[var(--line)] bg-[var(--surface)]',
            'shadow-[0_8px_28px_rgba(15,23,42,0.12)]'
          )}
          style={composerStyle}
          {...chromePointer}
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
            <Tooltip tip={t('editor.tools.videoGenRef')} placement="top">
              <button
                type="button"
                disabled={disabled || sending}
                aria-label={t('editor.tools.videoGenRef')}
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
                  const attached = attachSelectionToVideoComposer({
                    hostNodeId: nodeId,
                    document: doc,
                    selectedNodeIds,
                    selectedFrameIds,
                    existing: contextsRef.current,
                    setContexts,
                    insertChip,
                  });
                  if (!attached) {
                    dispatch(startCanvasAttachPick({ target: pickTarget }));
                  }
                }}
                className={composerAttachActionClass(pickingFromCanvas)}
              >
                <HiOutlineViewfinderCircle className="h-4 w-4" strokeWidth={2} />
              </button>
            </Tooltip>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
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
              placeholder={t('editor.tools.videoGenPlaceholder')}
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
                    {t('editor.tools.videoSettings')}
                  </p>
                  <div onPointerDown={(e) => e.stopPropagation()}>
                    <VideoSettingsPanel
                      aspectRatio={aspectRatio}
                      resolution={resolution}
                      duration={duration}
                      onAspectRatioChange={applyAspectToNode}
                      onResolutionChange={(r) => {
                        setResolution(r);
                        persistGenSettings({ resolution: r });
                      }}
                      onDurationChange={(n) => {
                        setDuration(n);
                        persistGenSettings({ duration: n });
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
                    <VideoModelPickerPanel
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
                  disabled={disabled || sending || attachmentsUploading || !prompt.trim()}
                  aria-label={t('editor.tools.videoGenSubmit')}
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

export default memo(VideoGeneratorCard);
