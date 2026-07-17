import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { BiExit, BiMessageSquareAdd, BiTimeFive } from 'react-icons/bi';
import {
  HiCheck,
  HiOutlineChevronRight,
  HiOutlineCog6Tooth,
  HiOutlineTrash,
} from 'react-icons/hi2';
import {
  fetchLlmModels,
  generateImage,
  maxAttachmentsFor,
  type ChatHistoryItem,
  type LlmModel,
} from '@/apis/chat';
import { ModelBrandIcon } from '@/components/editor/panels/agent/modelIcons';
import { patchDocumentNode, setAgentBusy, setDocument, setPendingImageSrc } from '@/store/modules/editor';
import {
  useChatSessions,
  type ChatUiMessage,
} from '@/hooks/useChatSessions';
import type { ChatSession } from '@/components/editor/panels/chatSessions';
import { buildMarkdownTextAttrs, parseNodeText, parseNodeTextStyle } from '@/store/scene/sceneText';
import { message } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import {
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import { runDesignAgent } from '@/components/editor/panels/agent/runDesignAgent';
import ChatTurnList from '@/components/editor/panels/agent/ChatTurnList';
import AgentComposerShell from '@/components/editor/panels/agent/AgentComposerShell';
import AgentSettingsDialog from '@/components/editor/panels/agent/AgentSettingsDialog';
import {
  categoryLabel,
  getPipeline,
  parseContinueChoice,
  readCollabMode,
  writeCollabMode,
  type AgentCollabMode,
  type DesignCategory,
} from '@/components/editor/panels/agent/designPipeline';
import {
  DEFAULT_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_RESOLUTION,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import { AUTO_STYLE_GUIDE } from '@/components/editor/panels/agent/designStyles';
import { cn } from '@/utils/classnames';

type AgentDockProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
  draftPrompt?: string | null;
  /** When true with draftPrompt, auto-send after models are ready (home → editor). */
  autoSubmitDraft?: boolean;
  onDraftConsumed?: () => void;
  draftAttachments?: ComposerContext[];
  /** Home → editor: preferred model + Seedream settings. */
  draftModelId?: string | null;
  draftImageAspectRatio?: string | null;
  draftImageQuality?: string | null;
  draftImageResolution?: string | null;
  /** Right-click 「添加到 Chat」— node id to pin into the composer at caret. */
  attachNodeId?: string | null;
  onAttachConsumed?: () => void;
  /** Onboarding spotlight target id (`data-tour`). */
  dataTour?: string;
};

function modelDescription(m: LlmModel, t: TFunction): string {
  if (m.kind === 'image') return t('agent.modelDescImage');
  if (m.thinking || m.id.includes('reasoner')) return t('agent.modelDescReasoner');
  if (m.id.includes('deepseek')) return t('agent.modelDescDeepseek');
  return t('agent.modelDescChat');
}

type ModelTabId = 'text' | 'image';

const MODEL_TAB_IDS: ModelTabId[] = ['text', 'image'];

function modelTabOf(m: Pick<LlmModel, 'kind' | 'id'> | null | undefined): ModelTabId {
  if (m?.kind === 'image') return 'image';
  // Seedream / image ids even if kind was omitted by an older API payload
  if (m?.id && /seedream|image|i2i|t2i/i.test(m.id)) return 'image';
  return 'text';
}

/** Merge catalog + imageModels; normalize kind so tabs never miss Seedream. */
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
    const maxAttachments = maxAttachmentsFor(m);
    const base = { ...m, maxAttachments };
    if (m.kind === 'image' || /seedream|image|i2i|t2i/i.test(m.id)) {
      return { ...base, kind: 'image' as const };
    }
    // Former "画布" svg bucket → show under 对话
    if (m.kind === 'svg') return { ...base, kind: 'text' as const };
    return { ...base, kind: (m.kind || 'text') as LlmModel['kind'] };
  });
}

const POPOVER_PANEL =
  'max-h-[min(320px,calc(100vh-96px))] w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

function nodeKindLabel(node: any): string {
  const shape = String(node?.attrs?.shapeType || '');
  const key = String(node?.key || '');
  const map: Record<string, string> = {
    text: '文字',
    image: '图片',
    rect: '矩形',
    line: '线条',
    arrow: '箭头',
    ellipse: '椭圆',
    circle: '椭圆',
    triangle: '多边形',
    polygon: '多边形',
    star: '星形',
    pen: '钢笔',
    pencil: '铅笔',
    path: '路径',
  };
  return map[shape] || map[key] || key || '元素';
}

/** Unique chip label: 矩形1 / 矩形2 / 多边形1 … (stable by position). */
function numberedNodeLabel(document: any, nodeId: string): string {
  const node = document?.deltaSetLike?.[nodeId];
  if (!node) return '元素';
  const base = nodeKindLabel(node);
  const delta = document?.deltaSetLike || {};
  const peers = Object.keys(delta)
    .filter((id) => {
      const n = delta[id];
      return Boolean(n) && nodeKindLabel(n) === base;
    })
    .sort((a, b) => {
      const na = delta[a];
      const nb = delta[b];
      const ya = Number(na?.y) || 0;
      const yb = Number(nb?.y) || 0;
      if (ya !== yb) return ya - yb;
      const xa = Number(na?.x) || 0;
      const xb = Number(nb?.x) || 0;
      if (xa !== xb) return xa - xb;
      return a.localeCompare(b);
    });
  const idx = Math.max(1, peers.indexOf(nodeId) + 1);
  return `${base}${idx}`;
}

function selectionContext(document: any, nodeId: string | null) {
  if (!document || !nodeId) return null;
  const node = document.deltaSetLike?.[nodeId];
  if (!node) return null;
  if (node.key === 'text') {
    const text = parseNodeText(node.attrs || {});
    return {
      kind: 'text' as const,
      nodeId,
      preview: text.slice(0, 200),
      style: parseNodeTextStyle(node.attrs || {}),
    };
  }
  if (node.key === 'image') {
    return {
      kind: 'image' as const,
      nodeId,
      width: Number(node.width) || 0,
      height: Number(node.height) || 0,
    };
  }
  return {
    kind: (node.key || 'shape') as string,
    nodeId,
    shapeType: node.attrs?.shapeType,
  };
}

function buildComposerContext(
  document: any,
  selectedNodeIds: string[],
  activeFrameId: string | null
): ComposerContext | null {
  const ids = selectedNodeIds.filter(Boolean);
  if (ids.length === 1) {
    const id = ids[0];
    const node = document?.deltaSetLike?.[id];
    if (!node) return null;
    const label = numberedNodeLabel(document, id);
    const kindLabel = nodeKindLabel(node);
    const w = Math.round(Number(node.width) || 0);
    const h = Math.round(Number(node.height) || 0);
    const x = Math.round(Number(node.x) || 0);
    const y = Math.round(Number(node.y) || 0);
    const fill = String(node.attrs?.['fill-color'] ?? node.attrs?.fill ?? '');
    const lines = [
      '[Target element — EDIT THIS, do not create a duplicate]',
      `id: ${id}`,
      `name: ${label}`,
      `kind: ${kindLabel}`,
      `box: ${w}×${h} at (${x}, ${y})`,
      fill ? `fill: ${fill}` : null,
      'RULE: For color/size/text changes call update_node with this exact id. Never create_shape for an existing @-mentioned element.',
    ].filter(Boolean) as string[];
    if (node.key === 'text') {
      const preview = parseNodeText(node.attrs || {}).slice(0, 200);
      lines.push(`text: ${preview || '(empty)'}`);
    }
    return {
      key: `node:${id}`,
      label,
      kind: String(node.key || 'shape'),
      payload: lines.join('\n'),
    };
  }
  if (ids.length > 1) {
    const names = ids
      .map((id) => numberedNodeLabel(document, id))
      .slice(0, 4)
      .join('、');
    return {
      key: `nodes:${ids.slice().sort().join(',')}`,
      label: `${ids.length} 个对象`,
      kind: 'multi',
      payload: [
        '[Target elements — EDIT THESE]',
        `count: ${ids.length}`,
        `ids: ${ids.join(', ')}`,
        `names: ${names}`,
        'RULE: Call update_node (or delete_nodes) on these ids. Do not create_shape duplicates.',
      ].join('\n'),
    };
  }

  if (!activeFrameId || !document) return null;
  const frames = Array.isArray(document.frames) ? document.frames : [];
  const frame = frames.find((f: any) => f?.id === activeFrameId);
  if (!frame) return null;
  const name = String(frame.name || 'Frame');
  const w = Math.round(Number(frame.width) || 0);
  const h = Math.round(Number(frame.height) || 0);
  return {
    key: `frame:${activeFrameId}`,
    label: name,
    kind: 'frame',
    payload: [
      '[Target canvas / artboard]',
      `id: ${activeFrameId}`,
      `name: ${name}`,
      `size: ${w}×${h}`,
      'Implement the user request ON this canvas (generate / place content inside this frame).',
    ].join('\n'),
  };
}

const AGENT_DOCK_WIDTH_KEY = 'agent-dock-width';
const AGENT_DOCK_MIN_W = 280;
const AGENT_DOCK_MAX_W = 560;
const AGENT_DOCK_DEFAULT_W = 360;

function clampAgentDockWidth(width: number): number {
  const viewportCap =
    typeof window !== 'undefined'
      ? Math.max(AGENT_DOCK_MIN_W, window.innerWidth - 360)
      : AGENT_DOCK_MAX_W;
  return Math.min(
    AGENT_DOCK_MAX_W,
    viewportCap,
    Math.max(AGENT_DOCK_MIN_W, Math.round(width))
  );
}

function readStoredAgentDockWidth(): number {
  try {
    const raw = localStorage.getItem(AGENT_DOCK_WIDTH_KEY);
    if (!raw) return AGENT_DOCK_DEFAULT_W;
    const n = Number(raw);
    if (!Number.isFinite(n)) return AGENT_DOCK_DEFAULT_W;
    return clampAgentDockWidth(n);
  } catch {
    return AGENT_DOCK_DEFAULT_W;
  }
}

/** Agent panel: chat + model picker + Agent input. */
export default function AgentDock({
  open,
  onClose,
  className,
  draftPrompt,
  autoSubmitDraft = false,
  onDraftConsumed,
  draftAttachments,
  draftModelId,
  draftImageAspectRatio,
  draftImageQuality,
  draftImageResolution,
  attachNodeId,
  onAttachConsumed,
  dataTour,
}: AgentDockProps): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const store = useStore();
  const document = useSelector((s: any) => s.editor.document);
  const selectedNodeId = useSelector((s: any) => s.editor.selectedNodeId as string | null);
  const activeFrameId = useSelector(
    (s: any) => (s.editor.document?.activeFrameId as string | null) ?? null
  );
  const ctx = useMemo(
    () => selectionContext(document, selectedNodeId),
    [document, selectedNodeId]
  );

  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModel] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>(DEFAULT_IMAGE_ASPECT_RATIO);
  const [imageQuality, setImageQuality] = useState<string>(DEFAULT_IMAGE_QUALITY);
  const [imageResolution, setImageResolution] = useState<string>(DEFAULT_IMAGE_RESOLUTION);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  /** @ / cube → model panel */
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [modelTab, setModelTab] = useState<ModelTabId>('text');
  /** Context chips in the composer (right-click 添加到 Chat + file attachments). */
  const [contextChips, setContextChips] = useState<ComposerContext[]>([]);
  const pinnedContextKeysRef = useRef<Set<string>>(new Set());
  const contextDismissedKeyRef = useRef<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collabMode, setCollabMode] = useState<AgentCollabMode>(() => readCollabMode());
  const [newChatTip, setNewChatTip] = useState(false);
  /** Cursor-like: edit a past user message in-place. */
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [dockWidth, setDockWidth] = useState(AGENT_DOCK_DEFAULT_W);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const currentId = useSelector((s: any) => s.editor.currentId as string | null);
  const {
    sessions,
    sessionId,
    messages,
    setMessages,
    chatTitle,
    startNewChat: resetChatSession,
    openSession: loadChatSession,
    deleteSession: removeChatSession,
    formatChatTime,
    newMessageId,
  } = useChatSessions(currentId);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Pre-command document snapshots keyed by user message id. In-memory only. */
  const checkpointsRef = useRef<Map<string, any>>(new Map());
  /** After agent mutates canvas: show Undo / Keep / Review above composer. */
  const [pendingReview, setPendingReview] = useState<{
    userMessageId: string;
    assistantId: string;
  } | null>(null);
  /** Paused fixed pipeline — resume when user clicks 继续：… */
  const pipelineSessionRef = useRef<{
    category: DesignCategory;
    brief: string;
    nextIndex: number;
  } | null>(null);
  const newChatTipTimer = useRef<number | null>(null);

  useEffect(() => {
    setDockWidth(readStoredAgentDockWidth());
  }, []);

  useEffect(() => {
    const onWinResize = () => setDockWidth((w) => clampAgentDockWidth(w));
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, []);

  useEffect(
    () => () => {
      // `document` is shadowed by the scene document from Redux.
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    },
    []
  );

  const persistDockWidth = (width: number) => {
    const next = clampAgentDockWidth(width);
    setDockWidth(next);
    try {
      localStorage.setItem(AGENT_DOCK_WIDTH_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const onDockResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeDragRef.current = { startX: e.clientX, startW: dockWidth };
    window.document.body.style.cursor = 'col-resize';
    window.document.body.style.userSelect = 'none';
  };

  const onDockResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    // Left edge: drag left → wider
    setDockWidth(clampAgentDockWidth(drag.startW + (drag.startX - e.clientX)));
  };

  const endDockResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    window.document.body.style.cursor = '';
    window.document.body.style.userSelect = '';
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDockWidth((w) => {
      try {
        localStorage.setItem(AGENT_DOCK_WIDTH_KEY, String(w));
      } catch {
        /* ignore */
      }
      return w;
    });
  };

  useEffect(() => {
    if (!open) return;
    setModelPanelOpen(false);
    let cancelled = false;
    setModelsStatus('loading');
    fetchLlmModels()
      .then((res) => {
        if (cancelled) return;
        const list = normalizeModelList(res?.models, res?.imageModels);
        setModels(list);
        setModelsStatus('ready');
        setAvailable(Boolean(res?.available));
        const preferred =
          list.find((m) => m.id === 'deepseek-chat')?.id ||
          list.find((m) => m.id === 'deepseek-reasoner')?.id ||
          list.find((m) => m.provider === 'deepseek' && m.kind !== 'image')?.id ||
          list.find((m) => m.kind !== 'image')?.id ||
          list[0]?.id ||
          '';
        setModel((prev) => {
          if (prev && list.some((m) => m.id === prev)) return prev;
          return preferred;
        });
        if (!res?.available) {
          message.warning(
            '未配置 API Key。请在 apps/api/.env 中设置 DEEPSEEK_API_KEY 或 LLM_API_KEY。'
          );
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setModels([]);
        setModelsStatus('error');
        setAvailable(false);
        message.error(
          err?.message ||
            '无法加载模型列表。请先启动后端：npm run dev:api（端口 8000）'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || draftPrompt == null || draftPrompt === '') return;
    const text = draftPrompt;
    const shouldAuto = autoSubmitDraft;
    if (draftAttachments?.length) {
      setContextChips((prev) => {
        const keys = new Set(prev.map((c) => c.key));
        const merged = [...prev];
        for (const a of draftAttachments) {
          if (!keys.has(a.key)) merged.push(a);
        }
        return merged;
      });
    }
    if (draftModelId) {
      setModel(draftModelId);
      setModelTab(modelTabOf({ id: draftModelId }));
    }
    if (draftImageAspectRatio) setImageAspectRatio(draftImageAspectRatio);
    if (draftImageQuality) setImageQuality(draftImageQuality);
    if (draftImageResolution) setImageResolution(draftImageResolution);
    onDraftConsumed?.();
    if (shouldAuto) {
      // Wait until model list settles so send() sees available / model id.
      const trySend = () => {
        if (modelsStatus === 'loading' || modelsStatus === 'idle') return false;
        void send(text);
        return true;
      };
      if (!trySend()) {
        const id = window.setInterval(() => {
          if (trySend()) window.clearInterval(id);
        }, 80);
        window.setTimeout(() => window.clearInterval(id), 8000);
      }
    } else {
      setInput(text);
      queueMicrotask(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot draft consume
  }, [open, draftPrompt, autoSubmitDraft, onDraftConsumed]);

  /** Right-click 「添加到 Chat」— insert at last caret (do not setState first — that rewrites chips to the front). */
  useEffect(() => {
    if (!open || !attachNodeId || !document) return;
    const isFrame = attachNodeId.startsWith('frame:');
    const ctx = isFrame
      ? buildComposerContext(document, [], attachNodeId.slice('frame:'.length))
      : buildComposerContext(document, [attachNodeId], null);
    onAttachConsumed?.();
    if (!ctx) return;
    pinnedContextKeysRef.current.add(ctx.key);
    contextDismissedKeyRef.current = null;
    // Defer so blur caret snapshot is already stored on the composer.
    queueMicrotask(() => {
      inputRef.current?.insertContextAtCaret(ctx);
    });
  }, [open, attachNodeId, document, onAttachConsumed]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, historyOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const showAlreadyNewTip = () => {
    setNewChatTip(true);
    if (newChatTipTimer.current) window.clearTimeout(newChatTipTimer.current);
    newChatTipTimer.current = window.setTimeout(() => {
      setNewChatTip(false);
      newChatTipTimer.current = null;
    }, 1800);
  };

  const startNewChat = () => {
    if (messages.length === 0 && !historyOpen) {
      showAlreadyNewTip();
      return;
    }
    abortRef.current?.abort();
    setSending(false);
    resetChatSession();
    setInput('');
    setEditDraft('');
    setEditingUserId(null);
    setContextChips([]);
    pinnedContextKeysRef.current.clear();
    setPendingReview(null);
    pipelineSessionRef.current = null;
    contextDismissedKeyRef.current = null;
    setHistoryOpen(false);
    setModelPanelOpen(false);
  };

  useEffect(
    () => () => {
      if (newChatTipTimer.current) window.clearTimeout(newChatTipTimer.current);
    },
    []
  );

  const openSession = (s: ChatSession) => {
    abortRef.current?.abort();
    setSending(false);
    loadChatSession(s.id);
    setHistoryOpen(false);
    setInput('');
    setEditDraft('');
    setEditingUserId(null);
    setPendingReview(null);
  };

  const deleteSession = (id: string) => {
    removeChatSession(id);
    if (id === sessionId) {
      abortRef.current?.abort();
      setSending(false);
      setInput('');
      setEditDraft('');
      setEditingUserId(null);
      setPendingReview(null);
      setHistoryOpen(false);
    }
  };

  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    const live = sending || messages.some((m) => m.streaming);
    if (!live) return;
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sending, messages]);

  const chatTurns = useMemo(() => {
    const turns: Array<{ user: ChatUiMessage | null; assistant?: ChatUiMessage }> = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        const next = messages[i + 1];
        if (next?.role === 'assistant') {
          turns.push({ user: m, assistant: next });
          i += 1;
        } else {
          turns.push({ user: m });
        }
      } else {
        turns.push({ user: null, assistant: m });
      }
    }
    return turns;
  }, [messages]);

  const formatWorked = (assistant?: ChatUiMessage) => {
    if (!assistant) return null;
    if (assistant.streaming) {
      const ms = Math.max(0, tickNow - (assistant.startedAt || tickNow));
      const s = Math.max(1, Math.round(ms / 1000));
      return `Working… ${s}s`;
    }
    if (assistant.durationMs != null) {
      const s = Math.max(1, Math.round(assistant.durationMs / 1000));
      return `Worked for ${s}s`;
    }
    return null;
  };

  const clearContextChips = () => {
    const keys = contextChips.map((c) => c.key);
    if (keys.length) contextDismissedKeyRef.current = keys[keys.length - 1];
    keys.forEach((k) => pinnedContextKeysRef.current.delete(k));
    setContextChips([]);
  };

  const onContextsChange = (next: ComposerContext[]) => {
    const removed = contextChips.filter((c) => !next.some((n) => n.key === c.key));
    for (const c of removed) {
      pinnedContextKeysRef.current.delete(c.key);
      contextDismissedKeyRef.current = c.key;
    }
    setContextChips(next);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(file);
    });

  const handleAttachFiles = async (files: File[]) => {
    const MAX = 10 * 1024 * 1024;
    const selected = models.find((m) => m.id === model);
    const limit = maxAttachmentsFor(selected);
    let remaining = Math.max(
      0,
      limit - contextChips.filter((c) => c.kind === 'attachment').length
    );
    if (remaining <= 0) {
      message.warning(t('agent.attachMaxReached', { count: limit }));
      return;
    }
    for (const file of files) {
      if (remaining <= 0) {
        message.warning(t('agent.attachMaxReached', { count: limit }));
        break;
      }
      if (!file.type.startsWith('image/')) {
        message.warning(t('agent.attachImageOnly', { name: file.name }));
        continue;
      }
      if (file.size > MAX) {
        message.warning(t('agent.attachTooLarge', { name: file.name }));
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        if (!dataUrl.startsWith('data:image/')) {
          message.warning(t('agent.attachReadFailed', { name: file.name }));
          continue;
        }
        const key = `attachment:${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`;
        const ctx: ComposerContext = {
          key,
          label: file.name,
          kind: 'attachment',
          payload: `[Attached image]\nname: ${file.name}\nmime: ${file.type}`,
          dataUrl,
        };
        pinnedContextKeysRef.current.add(key);
        // Attachments render above the input (not as inline chips).
        setContextChips((prev) => [...prev.filter((c) => c.key !== key), ctx]);
        remaining -= 1;
      } catch {
        message.error(t('agent.uploadFailed', { name: file.name }));
      }
    }
  };

  const selectedModelLabel =
    models.find((m) => m.id === model)?.label || (models[0]?.label ?? 'Agent');
  const selectedModel = models.find((m) => m.id === model);
  const isImageModelSelected = selectedModel?.kind === 'image';
  const attachmentLimit = maxAttachmentsFor(selectedModel);
  const attachmentCount = contextChips.filter((c) => c.kind === 'attachment').length;
  const attachFull = attachmentCount >= attachmentLimit;
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
  const attachProps = {
    onAttachFiles: attachFull ? undefined : handleAttachFiles,
    attachTooltip: attachFull
      ? t('agent.attachMaxReached', { count: attachmentLimit })
      : t('agent.uploadImage'),
  };

  const applyTextToSelection = (content: string) => {
    if (!ctx || ctx.kind !== 'text') return;
    const plain = content.trim();
    if (!plain) return;
    dispatch(
      patchDocumentNode({
        nodeId: ctx.nodeId,
        patch: { attrs: buildMarkdownTextAttrs(plain, ctx.style) },
      })
    );
  };

  const buildUserMessage = (text: string) => {
    const parts: string[] = [];
    if (contextChips.length) {
      parts.push(
        ...contextChips.map((c) =>
          c.kind === 'attachment'
            ? `[Attached image]\nname: ${c.label}\n(Use this image as reference; binary is provided separately to the image model when applicable.)`
            : c.payload
        )
      );
    } else if (ctx) {
      // Fallback if chip dismissed but selection still useful for Apply.
      if (ctx.kind === 'text') {
        parts.push(`[Target element]\nkind: text\nid: ${ctx.nodeId}\ntext: ${ctx.preview || '(empty)'}`);
      } else if (ctx.kind === 'image') {
        parts.push(
          `[Target element]\nkind: image\nid: ${ctx.nodeId}\nsize: ${Math.round(ctx.width)}×${Math.round(ctx.height)}`
        );
      } else {
        parts.push(`[Target element]\nkind: ${ctx.kind}\nid: ${ctx.nodeId}`);
      }
    }
    parts.push(`User request:\n${text}`);
    return parts.join('\n\n');
  };

  const finishAssistantPatch = (
    m: ChatUiMessage,
    patch: Partial<ChatUiMessage> = {}
  ): ChatUiMessage => ({
    ...m,
    ...patch,
    streaming: false,
    durationMs:
      typeof patch.durationMs === 'number'
        ? patch.durationMs
        : m.startedAt
          ? Date.now() - m.startedAt
          : m.durationMs,
  });

  const send = async (
    opts?:
      | string
      | {
          text?: string;
          priorMessages?: ChatUiMessage[];
          displayContent?: string;
          raw?: boolean;
        }
  ) => {
    const options = typeof opts === 'string' ? { text: opts } : opts || {};
    const extra = (options.text ?? input).trim();
    const text = options.raw ? extra : extra;
    if (!text || sending) return;
    if (available === false) {
      message.warning(
        '未配置 API Key。请在 apps/api/.env 中设置 DEEPSEEK_API_KEY 或 LLM_API_KEY。'
      );
      return;
    }

    const baseMessages = options.priorMessages ?? messages;
    const contextLabel =
      contextChips.length === 1
        ? `@${contextChips[0].label}`
        : contextChips.length > 1
          ? `@${contextChips.length} refs`
          : null;
    const userFacing =
      options.displayContent ??
      [!options.raw && contextLabel, text].filter(Boolean).join('\n');
    const userMsg: ChatUiMessage = { id: newMessageId(), role: 'user', content: userFacing };
    const assistantId = newMessageId();
    const history: ChatHistoryItem[] = baseMessages
      .filter((m) => !m.streaming && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    setInput('');
    setModelPanelOpen(false);
    setEditingUserId(null);
    setEditDraft('');
    setPendingReview(null);
    const attachedImages = contextChips
      .map((c) => c.dataUrl)
      .filter((u): u is string => Boolean(u));
    setContextChips((prev) => {
      for (const c of prev) {
        if (c.kind === 'attachment') pinnedContextKeysRef.current.delete(c.key);
      }
      return prev.filter((c) => c.kind !== 'attachment');
    });
    setSending(true);
    setMessages([
      ...baseMessages,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', thinking: '', steps: [], streaming: true, startedAt: Date.now() },
    ]);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const selected = models.find((m) => m.id === model);
    const isImageModel = selected?.kind === 'image';

    if (isImageModel) {
      try {
        const result = await generateImage({
          prompt: buildUserMessage(text),
          model: model || undefined,
          aspect_ratio: imageAspectRatio || undefined,
          quality: imageQuality || undefined,
          resolution: imageResolution || undefined,
          images: attachedImages.length ? attachedImages : undefined,
        });
        const img = result.images?.[0];
        const note =
          result.text?.trim() ||
          (img ? t('agent.imageGenerated') : t('agent.imageFailed'));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? finishAssistantPatch(m, { content: note }) : m
          )
        );
        if (img) {
          dispatch(setPendingImageSrc(img));
        }
      } catch (err: any) {
        const detail =
          err?.response?.data?.detail || err?.message || 'Image generation failed';
        const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
        message.error(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? finishAssistantPatch(m, { content: m.content || t('agent.requestFailed') })
              : m
          )
        );
      }
      setSending(false);
      return;
    }

    // Cursor-like agent: DeepSeek tools → SVG canvas mutations.
    const frameChip = contextChips.find((c) => c.kind === 'frame');
    const targetFrameId = frameChip
      ? frameChip.key.replace(/^frame:/, '')
      : activeFrameId;

    const MUTATING = new Set([
      'create_shape',
      'create_text',
      'create_image',
      'update_node',
      'delete_nodes',
      'update_frame',
      'create_frame',
    ]);
    let canvasMutated = false;
    const docBefore = (store.getState() as any).editor.document;
    if (docBefore) {
      try {
        checkpointsRef.current.set(userMsg.id, JSON.parse(JSON.stringify(docBefore)));
      } catch {
        /* ignore snapshot failure */
      }
    }

    const userImages = contextChips
      .filter((c) => c.kind === 'attachment' && c.dataUrl)
      .map((c) => String(c.dataUrl));
    const attachmentNote = userImages.length
      ? `[User attached images: ${userImages.length}]\nUse create_image with attachmentIndex 0..${userImages.length - 1} to place them.\nWithout attachmentIndex, create_image inserts a placeholder SVG.`
      : `[No user images attached]\nFor photo/illustration slots call create_image (placeholder). Do not generate bitmaps.`;

    dispatch(setAgentBusy(true));
    try {
      const resume = pipelineSessionRef.current;
      let pipelineResume:
        | { category: DesignCategory; phaseIndex: number; brief: string }
        | null = null;
      const rawText = options.raw ? text : null;
      if (rawText && resume) {
        const pipe = getPipeline(resume.category);
        const cont = parseContinueChoice(options.displayContent || rawText, pipe);
        if (cont === -1) {
          pipelineSessionRef.current = null;
        } else if (cont != null) {
          pipelineResume = {
            category: resume.category,
            phaseIndex: cont,
            brief: resume.brief,
          };
        } else if (/^继续/.test(rawText) || /^继续/.test(String(options.displayContent || ''))) {
          pipelineResume = {
            category: resume.category,
            phaseIndex: resume.nextIndex,
            brief: resume.brief,
          };
        }
      }

      await runDesignAgent({
        userMessage: options.raw ? text : buildUserMessage(text),
        styleGuide: AUTO_STYLE_GUIDE,
        collabMode,
        pipelineResume,
        model: model || undefined,
        history: history.filter(
          (h): h is { role: 'user' | 'assistant'; content: string } =>
            h.role === 'user' || h.role === 'assistant'
        ),
        contextPayload: options.raw
          ? null
          : [attachmentNote, contextChips.map((c) => c.payload).filter(Boolean).join('\n\n')]
              .filter(Boolean)
              .join('\n\n') || null,
        dispatch,
        getDocument: () => (store.getState() as any).editor.document,
        targetFrameId,
        userImages,
        signal: ac.signal,
        onEvent: (ev) => {
          if (ev.type === 'thinking') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, thinking: (m.thinking || '') + ev.text } : m
              )
            );
            return;
          }
          if (ev.type === 'token') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + ev.text } : m))
            );
            return;
          }
          if (ev.type === 'phase') {
            const p = ev.progress;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      pipeline: {
                        category: categoryLabel(p.category),
                        labels: p.labels,
                        currentIndex: p.currentIndex,
                        stepConfirm: p.stepConfirm,
                        collabMode: p.collabMode,
                      },
                    }
                  : m
              )
            );
            pipelineSessionRef.current = {
              category: p.category,
              brief: pipelineResume?.brief || (options.raw ? text : buildUserMessage(text)),
              nextIndex: p.currentIndex + 1,
            };
            return;
          }
          if (ev.type === 'tool_start') {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const steps = [...(m.steps || [])];
                steps.push({ id: ev.id, name: ev.name, status: 'running' });
                return { ...m, steps };
              })
            );
            return;
          }
          if (ev.type === 'tool_result') {
            if (MUTATING.has(ev.name) && ev.result.status !== 'error') {
              canvasMutated = true;
            }
            const askOpts = Array.isArray(ev.result.artifacts?.options)
              ? (ev.result.artifacts!.options as unknown[]).map((x) => String(x))
              : undefined;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const steps = (m.steps || []).map((s) =>
                  s.id === ev.id
                    ? {
                        ...s,
                        status: (ev.result.status === 'error' ? 'error' : 'done') as
                          | 'done'
                          | 'error',
                        summary: ev.result.summary,
                      }
                    : s
                );
                if (ev.name === 'ask_user' || ev.result.artifacts?.ask) {
                  return {
                    ...m,
                    steps,
                    content: m.content || ev.result.summary || m.content,
                    choices: askOpts?.length ? askOpts : m.choices,
                  };
                }
                return { ...m, steps };
              })
            );
            return;
          }
          if (ev.type === 'error') {
            message.error(ev.message);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? finishAssistantPatch(m, {
                      content: m.content || ev.message || t('agent.requestFailed'),
                    })
                  : m
              )
            );
            return;
          }
          if (ev.type === 'done') {
            if (ev.pipelinePaused && pipelineSessionRef.current) {
              // keep session for 继续
            } else if (!ev.choices?.length) {
              pipelineSessionRef.current = null;
            }
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantId) {
                  return finishAssistantPatch(m, {
                    content:
                      m.content ||
                      ev.summary ||
                      (m.steps?.length ? t('agent.designDone') : m.content),
                    ...(ev.choices?.length ? { choices: ev.choices } : {}),
                  });
                }
                if (
                  m.id === userMsg.id &&
                  canvasMutated &&
                  checkpointsRef.current.has(userMsg.id)
                ) {
                  return { ...m, canRestore: true };
                }
                return m;
              })
            );
          }
        },
      });
    } finally {
      dispatch(setAgentBusy(false));
      if (canvasMutated && checkpointsRef.current.has(userMsg.id)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === userMsg.id ? { ...m, canRestore: true } : m))
        );
        setPendingReview({ userMessageId: userMsg.id, assistantId });
      }
    }

    setSending(false);
  };

  const dismissPendingReview = (opts?: { dropCheckpoint?: boolean }) => {
    if (opts?.dropCheckpoint && pendingReview) {
      checkpointsRef.current.delete(pendingReview.userMessageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingReview.userMessageId ? { ...m, canRestore: false } : m
        )
      );
    }
    setPendingReview(null);
  };

  const undoPendingReview = () => {
    if (!pendingReview) return;
    restoreCheckpoint(pendingReview.userMessageId);
    dismissPendingReview({ dropCheckpoint: true });
  };

  const keepPendingReview = () => {
    dismissPendingReview({ dropCheckpoint: true });
  };

  const reviewPendingChanges = () => {
    if (!pendingReview) return;
    const el = listRef.current?.querySelector(
      `[data-assistant-id="${CSS.escape(pendingReview.assistantId)}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const beginEditUserMessage = (m: ChatUiMessage) => {
    if (m.role !== 'user' || sending || m.streaming) return;
    setEditingUserId(m.id);
    setEditDraft(m.content);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const cancelEditUserMessage = () => {
    setEditingUserId(null);
    setEditDraft('');
  };

  const submitEditUserMessage = () => {
    const id = editingUserId;
    if (!id || sending) return;
    const draft = editDraft.trim();
    if (!draft) return;
    const idx = messages.findIndex((x) => x.id === id);
    if (idx < 0) return;
    void send({
      text: draft,
      priorMessages: messages.slice(0, idx),
    });
  };

  const restoreCheckpoint = (userMessageId: string) => {
    const snap = checkpointsRef.current.get(userMessageId);
    if (!snap) {
      message.warning(t('agent.checkpointInvalid'));
      return;
    }
    dispatch(setDocument(JSON.parse(JSON.stringify(snap))));
    message.success(t('agent.restored'));
  };

  const closePopovers = () => {
    setModelPanelOpen(false);
  };

  const maybeOpenModelFromAt = (value: string) => {
    const at = value.lastIndexOf('@');
    if (at >= 0) {
      const after = value.slice(at + 1);
      if (!/\s/.test(after)) {
        setModelTab(modelTabOf(models.find((m) => m.id === model)));
        setModelPanelOpen(true);
        return;
      }
    }
    setModelPanelOpen(false);
  };

  const onInputChange = (value: string) => {
    setInput(value);
    maybeOpenModelFromAt(value);
  };

  const onEditDraftChange = (value: string) => {
    setEditDraft(value);
    maybeOpenModelFromAt(value);
  };

  const pickModel = (id: string) => {
    const next = models.find((m) => m.id === id);
    const limit = maxAttachmentsFor(next);
    setContextChips((prev) => {
      const attachments = prev.filter((c) => c.kind === 'attachment');
      if (attachments.length <= limit) return prev;
      const keep = new Set(attachments.slice(0, limit).map((c) => c.key));
      for (const a of attachments) {
        if (!keep.has(a.key)) pinnedContextKeysRef.current.delete(a.key);
      }
      message.warning(t('agent.attachTrimmed', { count: limit }));
      return prev.filter((c) => c.kind !== 'attachment' || keep.has(c.key));
    });
    setModel(id);
    closePopovers();
    // Only strip a trailing @-query used to open the model panel (ASCII token).
    // Do NOT use /@[^\s]*$/ — Chinese has no spaces, so that wipes the whole draft.
    const stripModelAtQuery = (prev: string) =>
      prev.replace(/@[a-zA-Z0-9._/-]*$/, '');
    if (editingUserId) setEditDraft(stripModelAtQuery);
    else setInput(stripModelAtQuery);
    inputRef.current?.focus();
  };

  /** Anchor model menu to its icon (not full-width over the composer). */
  const modelFloating = useFloating({
    open: modelPanelOpen,
    onOpenChange: setModelPanelOpen,
    placement: 'top-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ['top-end', 'bottom-start'] }),
      shift({ padding: 12 }),
    ],
  });
  const modelDismiss = useDismiss(modelFloating.context);
  const modelIx = useInteractions([modelDismiss]);

  if (!open) return null;

  const composerPlaceholder = isImageModelSelected
    ? t('agent.placeholderImage')
    : contextChips.length
      ? t('agent.placeholderSkill')
      : t('agent.placeholderDefault');

  const modelButtonProps = {
    ref: modelFloating.refs.setReference,
    title: selectedModelLabel,
    open: modelPanelOpen,
    onClick: () => {
      const current = models.find((m) => m.id === model);
      setModelTab(modelTabOf(current));
      setModelPanelOpen((v) => !v);
    },
    getReferenceProps: modelIx.getReferenceProps,
    icon: <ModelBrandIcon model={selectedModel || { id: model }} size={18} />,
  };

  const escapeComposer = (opts?: { cancelEdit?: boolean }) => {
    if (modelPanelOpen) {
      closePopovers();
      return;
    }
    if (contextChips.length) {
      clearContextChips();
      return;
    }
    if (opts?.cancelEdit) cancelEditUserMessage();
    else closePopovers();
  };

  const editComposerNode = editingUserId ? (
    <AgentComposerShell
      inputRef={inputRef}
      contexts={contextChips}
      onContextsChange={onContextsChange}
      value={editDraft}
      onChange={onEditDraftChange}
      onSubmit={() => void submitEditUserMessage()}
      onEscape={() => escapeComposer({ cancelEdit: true })}
      disabled={sending}
      placeholder={composerPlaceholder}
      canSend={!sending && !!editDraft.trim() && available !== false}
      {...attachProps}
      modelButtonProps={modelButtonProps}
      {...imageAspectProps}
    />
  ) : null;

  return (
    <aside
      data-tour={dataTour}
      style={{ width: dockWidth }}
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)]',
        className
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('agent.resizeDock')}
        aria-valuemin={AGENT_DOCK_MIN_W}
        aria-valuemax={AGENT_DOCK_MAX_W}
        aria-valuenow={dockWidth}
        className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40"
        onPointerDown={onDockResizePointerDown}
        onPointerMove={onDockResizePointerMove}
        onPointerUp={endDockResize}
        onPointerCancel={endDockResize}
        onDoubleClick={() => persistDockWidth(AGENT_DOCK_DEFAULT_W)}
      />
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--ink)]">
          {historyOpen ? t('agent.history') : chatTitle}
        </span>
        <div className="relative flex items-center gap-0.5">
          <Tooltip title={t('agent.newChat')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.newChat')}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              onClick={startNewChat}
            >
              <BiMessageSquareAdd className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
          {newChatTip ? (
            <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-30 -translate-x-1/4">
              <div className="relative rounded bg-[var(--ink)] px-2.5 py-1.5 text-[11px] text-[var(--on-brand)] shadow-md">
                <span
                  className="absolute left-6 top-0 h-2 w-2 -translate-y-1/2 rotate-45 bg-[var(--ink)]"
                  aria-hidden
                />
                {t('agent.alreadyNewChat')}
              </div>
            </div>
          ) : null}
          <Tooltip title={t('agent.history')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.history')}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
                historyOpen && 'bg-[var(--accent-soft)] text-[var(--ink)]'
              )}
              onClick={() => {
                closePopovers();
                setHistoryOpen((v) => !v);
              }}
            >
              <BiTimeFive className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
          <Tooltip title={t('agent.settings')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.settings')}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              onClick={() => {
                closePopovers();
                setSettingsOpen(true);
              }}
            >
              <HiOutlineCog6Tooth className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
          <Tooltip title={t('agent.exit')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.exit')}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              onClick={() => {
                abortRef.current?.abort();
                setSending(false);
                closePopovers();
                setHistoryOpen(false);
                onClose();
              }}
            >
              <BiExit className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
        </div>
      </div>

      <AgentSettingsDialog
        open={settingsOpen}
        mode={collabMode}
        onClose={() => setSettingsOpen(false)}
        onChangeMode={(next) => {
          setCollabMode(next);
          writeCollabMode(next);
        }}
      />

      <div ref={listRef} className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 py-2">
        {historyOpen ? (
          sessions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-1">
              <p className="text-center text-[13px] text-[var(--muted)]">
                {t('agent.noHistory')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              {sessions.map((s) => {
                const active = s.id === sessionId;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded px-2.5 py-2 transition-colors',
                      active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openSession(s)}
                    >
                      <div className="truncate text-[13px] text-[var(--ink)]">{s.title}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {formatChatTime(s.updatedAt)}
                        {' · '}
                        {t('agent.messageCount', { count: s.messages.length })}
                      </div>
                    </button>
                    <Tooltip title={t('agent.delete')} placement="top">
                      <button
                        type="button"
                        aria-label={t('agent.delete')}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--muted)] opacity-0 transition hover:bg-[var(--surface)] hover:text-red-500 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(s.id);
                        }}
                      >
                        <HiOutlineTrash className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          )
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <p className="text-center text-[14px] text-[var(--muted)]">
              {t('agent.emptyHint', { defaultValue: '描述你想要的设计，或上传参考图开始' })}
            </p>
          </div>
        ) : (
          <ChatTurnList
            turns={chatTurns}
            editingUserId={editingUserId}
            editComposer={editComposerNode}
            sending={sending}
            canApplyText={ctx?.kind === 'text'}
            formatWorked={formatWorked}
            hasCheckpoint={(id) => checkpointsRef.current.has(id)}
            onBeginEdit={beginEditUserMessage}
            onCancelEdit={cancelEditUserMessage}
            onRestore={restoreCheckpoint}
            onApplyText={applyTextToSelection}
            onChoice={(choice) => {
              if (sending || choice === '取消') return;
              let text = choice;
              if (/390/.test(choice)) {
                text =
                  '请先创建手机画布（宽390×高844），然后继续完成我上一条消息里的设计需求，直接在画布上绘制，不要只回复文字。';
              } else if (/794|画板/.test(choice) && !/指定/.test(choice)) {
                text =
                  '请先创建画板（宽794×高1123），然后继续完成我上一条消息里的设计需求，直接在画布上绘制，不要只回复文字。';
              } else if (/指定|已有/.test(choice)) {
                text = '请先用 get_scene_summary 列出画板，再问我选哪一块，确认后再绘制。';
              } else if (/到此为止/.test(choice)) {
                pipelineSessionRef.current = null;
                text = '好的，先停在这里，等我下一步指示再继续。';
              }
              void send({ text, raw: true, displayContent: choice });
            }}
          />
        )}
      </div>

      {historyOpen || editingUserId ? null : (
        <div className="relative shrink-0 px-3 pb-3 pt-0.5" data-tour="editor-agent-chat">
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--canvas)] shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            {pendingReview && !sending ? (
              <div className="flex h-9 items-center gap-2 px-3">
                <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted)]">
                  {t('agent.reviewHint')}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-md px-2 text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    onClick={undoPendingReview}
                  >
                    {t('agent.undo')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-md px-2 text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    onClick={keepPendingReview}
                  >
                    {t('agent.keep')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-md bg-[var(--accent-soft)] px-2.5 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--line)]"
                    onClick={reviewPendingChanges}
                  >
                    {t('agent.review')}
                  </button>
                </div>
              </div>
            ) : null}
            <AgentComposerShell
              className="rounded-none border-0 shadow-none"
              inputRef={inputRef}
              contexts={contextChips}
              onContextsChange={onContextsChange}
              value={input}
              onChange={onInputChange}
              onSubmit={() => void send()}
              onEscape={() => escapeComposer()}
              disabled={sending}
              placeholder={composerPlaceholder}
              canSend={
                !sending && !!input.trim() && available !== false
              }
              {...attachProps}
              modelButtonProps={modelButtonProps}
              {...imageAspectProps}
            />
          </div>
        </div>
      )}

      {!historyOpen ? (
        <FloatingPortal>
          {modelPanelOpen ? (
            <div
              ref={modelFloating.refs.setFloating}
              style={modelFloating.floatingStyles as CSSProperties}
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
                  {modelsStatus === 'error' && models.length === 0 ? (
                    <div className="px-2 py-4 text-center text-[12px] text-[var(--muted)]">
                      <p>{t('agent.apiDown')}</p>
                      <p className="mt-1">{t('agent.apiDownHint')}</p>
                    </div>
                  ) : null}
                  {(() => {
                    const loading =
                      !models.length && modelsStatus === 'loading'
                        ? [{ id: '_loading', label: 'Loading...', provider: '', kind: modelTab as LlmModel['kind'] }]
                        : [];
                    const list = (models.length ? models : loading).filter(
                      (m) => modelTabOf(m) === modelTab
                    );
                    if (!list.length && modelsStatus !== 'loading') {
                      return (
                        <div className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">
                          {t('agent.emptyModels')}
                        </div>
                      );
                    }
                    return list.map((m) => {
                      const active = m.id === model;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={m.id === '_loading'}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                            active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]',
                            m.id === '_loading' && 'opacity-50'
                          )}
                          onClick={() => pickModel(m.id)}
                        >
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)]">
                            <ModelBrandIcon model={m} size={18} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                              {m.label}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                              {m.id === '_loading' ? '...' : modelDescription(m as LlmModel, t)}
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
                    });
                  })()}
                </div>
              </div>
            </div>
          ) : null}
        </FloatingPortal>
      ) : null}
    </aside>
  );
}
