/**
 * Lottie generator composer under the empty plate (FE-only).
 * Aspect + agent model + image/JSON refs → open Design Agent (agent looks at attachments).
 */
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineBolt,
  HiOutlineChevronDown,
  HiOutlinePlus,
  HiOutlineViewfinderCircle,
} from 'react-icons/hi2';
import { listModels, type LlmModel } from '@/apis/chat';
import { Dropdown, DropdownPanel, message, Tooltip } from '@/components/base';
import {
  rcbScreenPxToScene,
  useRcbCamera,
} from '@/components/rcb';
import {
  SELECTION_TOOLBAR_BELOW_BOX_GAP_PX,
  useChromePointerActivate,
  WorldScreenChromeRoot,
} from '@/components/rcb/selection/chrome/SelectionToolbarShell';
import AgentComposerInput, {
  chipBaseKey,
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import {
  ComposerAttachmentChip,
  composerAttachActionClass,
} from '@/components/editor/panels/agent/AgentComposerShell';
import { AspectRatioGlyph } from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import {
  AGENT_POPOVER_PANEL,
  ModelBrandIcon,
  modelDescription,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { applyCanvasPickToImageComposer } from '@/components/editor/nodes/ImageGeneratorNode/ImageGeneratorCard';
import {
  canAttachNodeToChat,
  expandSelectionWithGroups,
  parseLottieAnimationData,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  clearCanvasAttachPick,
  consumePendingCanvasAttach,
  EMPTY_ID_LIST,
  patchDocumentNode,
  startCanvasAttachPick,
} from '@/store/modules/editor';
import { cn } from '@/utils/classnames';
import { readFileAsDataUrl } from '@/utils/uploadImage';
import store from '@/store';

export const RESUME_AGENT_DRAFT_EVENT = 'resume:agent-draft';

export type ResumeAgentDraftDetail = {
  prompt: string;
  autoSubmit?: boolean;
  modelId?: string | null;
  interactionMode?: 'agent' | 'ask' | 'image' | 'video';
  attachments?: ComposerContext[];
};

type Props = {
  nodeId: string;
  sceneBox: { x: number; y: number; width: number; height: number };
  showComposer?: boolean;
  disabled?: boolean;
};

const LOTTIE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
const DEFAULT_LOTTIE_ASPECT = '1:1';
const DEFAULT_AGENT_MODEL_ID = '';

function readGenAttrString(attrs: Record<string, unknown> | null | undefined, key: string) {
  const raw = attrs?.[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
}

function modelIsAgentChat(model?: Pick<LlmModel, 'kind' | 'id'> | null): boolean {
  if (!model?.id) return false;
  if (model.id === 'auto') return false;
  if (model.kind === 'image' || model.kind === 'video') return false;
  return !/seedance|seedream|t2i|i2i/i.test(model.id);
}

function plateSizeForAspect(
  box: { x: number; y: number; width: number; height: number },
  aspectRatio: string
) {
  const [rw, rh] = String(aspectRatio || DEFAULT_LOTTIE_ASPECT)
    .split(':')
    .map(Number);
  const ratio = rw > 0 && rh > 0 ? rw / rh : 1;
  const area = Math.max(1, box.width * box.height);
  let height = Math.sqrt(area / ratio);
  let width = height * ratio;
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

function isJsonFile(file: File) {
  const name = (file.name || '').toLowerCase();
  return (
    file.type === 'application/json' ||
    file.type === 'text/json' ||
    name.endsWith('.json') ||
    name.endsWith('.lottie')
  );
}

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

function attachSelectionToLottieComposer(opts: {
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
    imagesOnly: true,
  });
  return true;
}

function dispatchAgentDraft(detail: ResumeAgentDraftDetail) {
  window.dispatchEvent(new CustomEvent(RESUME_AGENT_DRAFT_EVENT, { detail }));
}

function LottieAspectPanel({
  aspectRatio,
  onAspectRatioChange,
  disabled,
}: {
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  disabled?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div>
      <p className="mb-2 text-[12px] font-medium text-[var(--muted)]">{t('agent.chooseRatio')}</p>
      <div className="flex items-start justify-between gap-0.5 rounded-xl bg-[var(--rail)] p-1">
        {LOTTIE_ASPECT_RATIOS.map((ratio) => {
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
  );
}

function LottieAgentModelPanel({
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
      ? [{ id: '_loading', label: 'Loading...', provider: '', kind: 'chat' }]
      : models;

  return (
    <div
      className={cn(
        AGENT_POPOVER_PANEL,
        'max-h-[min(22rem,50vh)] w-[min(18rem,calc(100vw-2rem))]'
      )}
    >
      <div className="overflow-y-auto p-1.5">
        {pool.map((m) => {
          const active = m.id === selectedId;
          const loading = m.id === '_loading';
          return (
            <button
              key={m.id}
              type="button"
              disabled={loading}
              onClick={() => {
                if (!loading) onPick(m.id);
              }}
              className={cn(
                'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors',
                active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--rail)]',
                loading && 'opacity-60'
              )}
            >
              <ModelBrandIcon model={m} className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
                  {m.label || m.id}
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                  {loading ? '…' : modelDescription(m, t)}
                </span>
              </span>
            </button>
          );
        })}
        {status === 'error' ? (
          <p className="px-2 py-3 text-[12px] text-[var(--danger)]">
            {t('common.loadFail', { defaultValue: 'Load failed' })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function buildLottieAgentPrompt(opts: {
  prompt: string;
  aspectRatio: string;
  nodeId: string;
  sceneBox: { x: number; y: number; width: number; height: number };
  hasJsonRef: boolean;
  hasImageRef: boolean;
}): string {
  const { prompt, aspectRatio, nodeId, sceneBox, hasJsonRef, hasImageRef } = opts;
  const [rw, rh] = aspectRatio.split(':').map(Number);
  const ratio = rw > 0 && rh > 0 ? rw / rh : 1;
  const width = Math.max(120, Math.round(sceneBox.width));
  const height = Math.max(120, Math.round(width / ratio));
  const parts = [
    `Create a Lottie (Bodymovin) animation for: ${prompt.trim()}`,
    `Aspect ratio ${aspectRatio}. Prefer size about ${width}×${height}.`,
    `Call create_lottie with full animationData JSON (v/fr/ip/op/w/h/layers).`,
    `Pass replaceNodeId="${nodeId}" so it fills the existing Lottie generator plate at (${Math.round(sceneBox.x)}, ${Math.round(sceneBox.y)}).`,
    `Do not create a second plate. Keep the animation vector/shape based (no raster embeds).`,
  ];
  if (hasImageRef) {
    parts.push('Use attached reference image(s) for style / subject guidance.');
  }
  if (hasJsonRef) {
    parts.push(
      'Attached Lottie JSON is a reference — adapt or remix it; do not ignore animationData structure.'
    );
  }
  return parts.join(' ');
}

function LottieGeneratorCard({
  nodeId,
  sceneBox,
  showComposer = true,
  disabled = false,
}: Props): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { zoom } = useRcbCamera();
  const chromePointer = useChromePointerActivate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const contextsRef = useRef<ComposerContext[]>([]);

  const genAttrs = useSelector(
    (state: any) =>
      (state.editor?.document?.deltaSetLike?.[nodeId]?.attrs || null) as Record<
        string,
        unknown
      > | null
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
  const selectedNodeIds = useSelector(
    (state: any) => (state.editor?.selectedNodeIds as string[]) ?? EMPTY_ID_LIST
  );
  const selectedFrameIds = useSelector(
    (state: any) => (state.editor?.selectedFrameIds as string[]) ?? EMPTY_ID_LIST
  );

  const pickTarget = `node:${nodeId}`;
  const pickingFromCanvas = canvasAttachPick?.target === pickTarget;

  const [prompt, setPrompt] = useState('');
  const [contexts, setContexts] = useState<ComposerContext[]>([]);
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(
    () => readGenAttrString(genAttrs, 'lottieGenAspect') || DEFAULT_LOTTIE_ASPECT
  );
  const [modelId, setModelId] = useState(() => {
    const saved = readGenAttrString(genAttrs, 'lottieGenModel');
    return saved && saved !== 'auto' ? saved : DEFAULT_AGENT_MODEL_ID;
  });
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );

  contextsRef.current = contexts;

  useEffect(() => {
    if (!showComposer || disabled) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [showComposer, nodeId, disabled]);

  useEffect(() => {
    const nextAspect = readGenAttrString(genAttrs, 'lottieGenAspect');
    if (nextAspect) setAspectRatio(nextAspect);
    const nextModel = readGenAttrString(genAttrs, 'lottieGenModel');
    if (nextModel && nextModel !== 'auto') setModelId(nextModel);
  }, [nodeId, genAttrs?.lottieGenAspect, genAttrs?.lottieGenModel]);

  useEffect(() => {
    if (!pendingCanvasAttach || pendingCanvasAttach.target !== pickTarget) return;
    const payload = pendingCanvasAttach.payload;
    dispatch(consumePendingCanvasAttach());
    void applyCanvasPickToImageComposer({
      document: editorDocument || (store.getState() as any).editor?.document,
      payload,
      existing: contextsRef.current,
      setContexts,
      imagesOnly: true,
      insertChip: (ctx) => {
        inputRef.current?.insertContextAtCaret(ctx);
        inputRef.current?.focus();
      },
    });
  }, [pendingCanvasAttach, pickTarget, editorDocument, dispatch]);

  useEffect(() => {
    let cancelled = false;
    setModelsStatus('loading');
    listModels()
      .then((res) => {
        if (cancelled) return;
        const pool = [...(res?.models || [])].filter((m) => modelIsAgentChat(m));
        const seen = new Set<string>();
        const unique = pool.filter((m) => {
          if (!m?.id || seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        setModels(unique);
        setModelsStatus('ready');
        if (unique.length && (!modelId || !unique.some((m) => m.id === modelId))) {
          setModelId(unique[0]!.id);
        }
      })
      .catch(() => {
        if (!cancelled) setModelsStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachments = useMemo(
    () => contexts.filter((c) => c.kind === 'attachment'),
    [contexts]
  );
  const inlineContexts = useMemo(
    () => contexts.filter((c) => c.kind !== 'attachment'),
    [contexts]
  );
  const selectedModel = models.find((m) => m.id === modelId);
  const settingsSummary = aspectRatio;

  const removeContext = (key: string) =>
    setContexts((prev) =>
      prev.filter((c) => c.key !== key && chipBaseKey(c.key) !== chipBaseKey(key))
    );

  const attachRefFiles = async (files: File[]) => {
    const accepted = files.filter((f) => isImageFile(f) || isJsonFile(f));
    if (!accepted.length) {
      message.error(t('editor.tools.lottieGenUploadHint'));
      return;
    }
    const results = await Promise.all(
      accepted.map(async (file, i) => {
        const key = `attach:${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;
        try {
          if (isJsonFile(file)) {
            const text = await file.text();
            const parsed = parseLottieAnimationData(text);
            if (!parsed) {
              message.error(t('editor.tools.lottieGenInvalidJson'));
              return null;
            }
            const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(parsed))}`;
            return {
              key,
              label: file.name || 'animation.json',
              kind: 'attachment' as const,
              payload: `[Lottie JSON ref]\nname: ${file.name || 'animation.json'}`,
              dataUrl,
              thumbUrl: undefined,
            } satisfies ComposerContext;
          }
          const dataUrl = await readFileAsDataUrl(file);
          return {
            key,
            label: file.name || t('editor.tools.lottieGenRefImage'),
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

  const onPickRef = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    await attachRefFiles(files);
  };

  const persistGenSettings = (patch: { aspect?: string; model?: string }) => {
    const attrs: Record<string, unknown> = {};
    if (patch.aspect != null) attrs.lottieGenAspect = patch.aspect;
    if (patch.model != null) attrs.lottieGenModel = patch.model;
    if (!Object.keys(attrs).length) return;
    dispatch(patchDocumentNode({ nodeId, patch: { attrs } }));
  };

  const applyAspectToNode = (nextAspect: string) => {
    setAspectRatio(nextAspect);
    persistGenSettings({ aspect: nextAspect });
    const next = plateSizeForAspect(sceneBox, nextAspect);
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
          attrs: { lottieGenAspect: nextAspect },
        },
      })
    );
  };

  const onGenerate = () => {
    if (sending || disabled) return;
    const text = prompt.trim();
    if (!text) {
      message.error(t('editor.tools.lottieGenNeedPrompt'));
      return;
    }

    const atts = contextsRef.current.filter((c) => c.kind === 'attachment');
    const hasJsonRef = atts.some((c) => String(c.dataUrl || '').startsWith('data:application/json'));
    const hasImageRef = atts.some((c) => String(c.thumbUrl || c.dataUrl || '').startsWith('data:image'));

    setSending(true);
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          attrs: {
            processStatus: 'running',
            processKind: 'generate',
            processLabel: t('editor.tools.lottieGenerating'),
            lottieGenAspect: aspectRatio,
            lottieGenModel: modelId,
            genPrompt: text,
          },
        },
      })
    );

    dispatchAgentDraft({
      prompt: buildLottieAgentPrompt({
        prompt: text,
        aspectRatio,
        nodeId,
        sceneBox,
        hasJsonRef,
        hasImageRef,
      }),
      autoSubmit: true,
      modelId: modelId || null,
      interactionMode: 'agent',
      attachments: atts,
    });
    setSending(false);
  };

  if (!showComposer) return null;

  const composerLeft = sceneBox.x + sceneBox.width / 2;
  const composerTop =
    sceneBox.y +
    sceneBox.height +
    rcbScreenPxToScene(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX, zoom);

  return (
    <WorldScreenChromeRoot
      left={composerLeft}
      top={composerTop}
      anchor="top"
      data-lottie-generator
      data-sel-toolbar
      data-scene-node-id={nodeId}
      className="pointer-events-auto z-[32] overflow-visible"
      {...chromePointer}
    >
      <div
        className={cn(
          'flex h-[200px] w-[500px] flex-col overflow-hidden',
          'rounded-2xl border border-[var(--line)] bg-[var(--surface)]',
          'shadow-[0_8px_28px_rgba(15,23,42,0.12)]'
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
          {attachments.map((att) => (
            <ComposerAttachmentChip
              key={att.key}
              attachment={att}
              disabled={disabled || sending}
              onRemove={removeContext}
            />
          ))}
          <Tooltip tip={t('editor.tools.lottieGenUpload')} placement="top">
            <button
              type="button"
              disabled={disabled || sending}
              aria-label={t('editor.tools.lottieGenUpload')}
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
                const attached = attachSelectionToLottieComposer({
                  hostNodeId: nodeId,
                  document: doc,
                  selectedNodeIds,
                  selectedFrameIds,
                  existing: contextsRef.current,
                  setContexts,
                  insertChip,
                });
                if (!attached) {
                  dispatch(
                    startCanvasAttachPick({ target: pickTarget, accept: 'image' })
                  );
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
            accept="image/*,application/json,.json,.lottie"
            multiple
            className="hidden"
            onChange={(e) => void onPickRef(e)}
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
            onChange={setPrompt}
            onSubmit={() => onGenerate()}
            disabled={disabled || sending}
            placeholder={t('editor.tools.lottieGenPlaceholder')}
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
              <DropdownPanel className="w-[min(22rem,calc(100vw-2rem))] p-3">
                <p className="mb-2.5 text-[13px] font-semibold text-[var(--ink)]">
                  {t('editor.tools.lottieSettings')}
                </p>
                <div onPointerDown={(e) => e.stopPropagation()}>
                  <LottieAspectPanel
                    aspectRatio={aspectRatio}
                    onAspectRatioChange={applyAspectToNode}
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
                  <LottieAgentModelPanel
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

            <Tooltip tip={t('editor.tools.lottieGenSubmit')} placement="top">
              <button
                type="button"
                disabled={disabled || sending || !prompt.trim()}
                aria-label={t('editor.tools.lottieGenSubmit')}
                onClick={() => onGenerate()}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition',
                  'bg-[var(--ink)] text-[var(--on-brand)] disabled:opacity-40'
                )}
              >
                <HiOutlineBolt className="h-3.5 w-3.5" strokeWidth={2} />
                {sending ? '…' : t('editor.tools.lottieGenSubmit')}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </WorldScreenChromeRoot>
  );
}

export default memo(LottieGeneratorCard);
