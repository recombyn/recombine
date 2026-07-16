import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
import { BiBookAdd, BiExit, BiMessageSquareAdd, BiTimeFive } from 'react-icons/bi';
import {
  HiOutlineCheck,
  HiOutlineCube,
  HiOutlinePaperAirplane,
  HiOutlinePhoto,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiOutlineWrenchScrewdriver,
} from 'react-icons/hi2';
import {
  fetchLlmModels,
  generateImage,
  streamChatMessage,
  type ChatHistoryItem,
  type LlmModel,
} from '@/apis/chat';
import { patchDocumentNode, setPendingImageSrc } from '@/store/modules/editor';
import {
  useChatSessions,
  type ChatUiMessage,
} from '@/hooks/useChatSessions';
import type { ChatSession } from '@/components/editor/panels/chatSessions';
import { buildMarkdownTextAttrs, parseNodeText, parseNodeTextStyle } from '@/store/scene/sceneText';
import { message } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import AgentComposerInput, {
  type AgentComposerHandle,
} from '@/components/editor/panels/AgentComposerInput';
import { cn } from '@/utils/classnames';

type AgentDockProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
  draftPrompt?: string | null;
  onDraftConsumed?: () => void;
};

const SKILLS: { label: string; slug: string; desc: string; prompt: string }[] = [
  {
    label: '文案',
    slug: '/copywriting',
    desc: '润艺画布文案，使其更专业简洁。',
    prompt: '帮我润艺当前画布上的文案，使其更专业简洁。',
  },
  {
    label: '排版',
    slug: '/layout',
    desc: '优化对齐、间距与层级，让版式更清晰。',
    prompt: '帮我优化当前布局的对齐、间距与层级。',
  },
  {
    label: 'SVG 图标',
    slug: '/svg-icons',
    desc: '生成可在画布中使用的简洁 SVG 图标建议。',
    prompt: '为我生成一组可在画布中使用的简洁 SVG 图标建议。',
  },
  {
    label: '配色',
    slug: '/color-palette',
    desc: '为当前设计给出协调配色方案与用法。',
    prompt: '为当前设计给出一套协调的配色方案与用法说明。',
  },
  {
    label: '海报',
    slug: '/poster',
    desc: '策划海报构图与文案框架。',
    prompt: '帮我策划一张海报构图与文案框架。',
  },
  {
    label: 'UI 布局',
    slug: '/ui-layout',
    desc: '规划清晰的 UI 布局结构。',
    prompt: '帮我规划一套清晰的 UI 布局结构。',
  },
  {
    label: 'PDF 转 SVG',
    slug: '/pdf-to-svg',
    desc: '把 PDF 内容整理成可编辑的 SVG 图层方案。',
    prompt: '说明如何把 PDF 内容整理成可编辑的 SVG 图层方案。',
  },
  {
    label: '更多灵感',
    slug: '/ideas',
    desc: '几个适合当前主题的创意方向。',
    prompt: '给我几个适合当前画布主题的创意方向，简短列表即可。',
  },
];

function modelDescription(m: LlmModel): string {
  if (m.kind === 'image') return '图片生成模型，适合生成与编辑画布素材';
  return '对话模型，适合文案、排版与创意协作';
}

const POPOVER_PANEL =
  'max-h-[min(320px,calc(100vh-96px))] w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]';

const SKILL_PANEL =
  'max-h-[min(320px,calc(100vh-96px))] w-[min(280px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_32px_rgba(0,0,0,0.14)]';

type SkillItem = (typeof SKILLS)[number];

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

/** Agent panel: Skills + @ mention picker + Agent input. */
export default function AgentDock({
  open,
  onClose,
  className,
  draftPrompt,
  onDraftConsumed,
}: AgentDockProps): ReactNode {
  const dispatch = useDispatch();
  const document = useSelector((s: any) => s.editor.document);
  const selectedNodeId = useSelector((s: any) => s.editor.selectedNodeId as string | null);
  const ctx = useMemo(
    () => selectionContext(document, selectedNodeId),
    [document, selectedNodeId]
  );

  const [models, setModels] = useState<LlmModel[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  /** @ / cube → model panel; Skill icon → skill panel */
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  /** Skill chip attached to the composer (fig.2). */
  const [activeSkill, setActiveSkill] = useState<SkillItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatTip, setNewChatTip] = useState(false);
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
  } = useChatSessions();
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const newChatTipTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setModelPanelOpen(false);
    setSkillPanelOpen(false);
    let cancelled = false;
    fetchLlmModels()
      .then((res) => {
        if (cancelled) return;
        const list = res?.models || [];
        setModels(list);
        setAvailable(Boolean(res?.available));
        setModel((prev) => prev || list[0]?.id || '');
        if (!res?.available) {
          message.warning(
            '未配置 API Key。请在 apps/api/.env 中设置 LLM_API_KEY（豆包 / DeepSeek 等）。'
          );
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setAvailable(false);
        message.error(err?.message || '请求失败，请稍后重试');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || draftPrompt == null || draftPrompt === '') return;
    setInput(draftPrompt);
    onDraftConsumed?.();
  }, [open, draftPrompt, onDraftConsumed]);

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
    setActiveSkill(null);
    setHistoryOpen(false);
    setModelPanelOpen(false);
    setSkillPanelOpen(false);
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
    setActiveSkill(null);
  };

  const deleteSession = (id: string) => {
    removeChatSession(id);
    if (id === sessionId) {
      abortRef.current?.abort();
      setSending(false);
      setInput('');
      setActiveSkill(null);
      setHistoryOpen(false);
    }
  };

  const selectedModelLabel =
    models.find((m) => m.id === model)?.label || (models[0]?.label ?? 'Agent');

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
    if (!ctx) return text;
    if (ctx.kind === 'text') {
      return `Selected text:\n${ctx.preview || '(empty)'}\n\nUser request:\n${text}`;
    }
    if (ctx.kind === 'image') {
      return `Selected image ${Math.round(ctx.width)}x${Math.round(ctx.height)}px\n\nUser request:\n${text}`;
    }
    return `Selected ${ctx.kind}\n\nUser request:\n${text}`;
  };

  const send = async (overrideText?: string) => {
    const extra = (overrideText ?? input).trim();
    const text = activeSkill
      ? extra
        ? `${activeSkill.prompt}\n\n${extra}`
        : activeSkill.prompt
      : extra;
    if (!text || sending) return;
    if (available === false) {
      message.warning(
        '未配置 API Key。请在 apps/api/.env 中设置 LLM_API_KEY（豆包 / DeepSeek 等）。'
      );
      return;
    }

    const userMsg: ChatUiMessage = { id: newMessageId(), role: 'user', content: text };
    const assistantId = newMessageId();
    const history: ChatHistoryItem[] = messages
      .filter((m) => !m.streaming && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    setInput('');
    setActiveSkill(null);
    setModelPanelOpen(false);
    setSkillPanelOpen(false);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
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
        });
        const img = result.images?.[0];
        const note =
          result.text?.trim() ||
          (img
            ? '图片已生成，已添加到画布。'
            : '图片生成失败');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false, content: note } : m
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
              ? { ...m, streaming: false, content: m.content || '请求失败' }
              : m
          )
        );
      }
      setSending(false);
      return;
    }

    await streamChatMessage({
      message: buildUserMessage(text),
      model: model || undefined,
      history,
      signal: ac.signal,
      onToken: (token) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m))
        );
      },
      onError: (msg) => {
        message.error(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, content: m.content || '请求失败' }
              : m
          )
        );
      },
      onDone: () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
        );
      },
    });

    setSending(false);
  };

  const closePopovers = () => {
    setModelPanelOpen(false);
    setSkillPanelOpen(false);
  };

  const onInputChange = (value: string) => {
    setInput(value);
    const at = value.lastIndexOf('@');
    if (at >= 0) {
      const after = value.slice(at + 1);
      if (!/\s/.test(after)) {
        setSkillPanelOpen(false);
        setModelPanelOpen(true);
        return;
      }
    }
    setModelPanelOpen(false);
  };

  const pickModel = (id: string) => {
    setModel(id);
    closePopovers();
    setInput((prev) => prev.replace(/@[^\s]*$/, ''));
    inputRef.current?.focus();
  };

  const pickSkill = (skill: SkillItem) => {
    setActiveSkill(skill);
    closePopovers();
    inputRef.current?.focus();
  };

  /** Anchor model / skill menus to their icons (not full-width over the composer). */
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

  const skillFloating = useFloating({
    open: skillPanelOpen,
    onOpenChange: setSkillPanelOpen,
    placement: 'top-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ['top-end', 'bottom-start'] }),
      shift({ padding: 12 }),
    ],
  });
  const skillDismiss = useDismiss(skillFloating.context);
  const skillIx = useInteractions([skillDismiss]);

  if (!open) return null;

  return (
    <aside
      className={cn(
        'flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)]',
        className
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--ink)]">
          {historyOpen ? '历史对话' : chatTitle}
        </span>
        <div className="relative flex items-center gap-0.5">
          <Tooltip title={'新对话'} placement="bottom">
            <button
              type="button"
              aria-label={'新对话'}
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
                {'当前已是新对话'}
              </div>
            </div>
          ) : null}
          <Tooltip title={'历史对话'} placement="bottom">
            <button
              type="button"
              aria-label={'历史对话'}
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
          <Tooltip title={'退出'} placement="bottom">
            <button
              type="button"
              aria-label={'退出'}
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

      <div ref={listRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2">
        {historyOpen ? (
          sessions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-1">
              <p className="text-center text-[13px] text-[var(--muted)]">
                {'暂无历史对话'}
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
                        {s.messages.length}
                        {'条'}
                      </div>
                    </button>
                    <Tooltip title={'删除'} placement="top">
                      <button
                        type="button"
                        aria-label={'删除'}
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
          <div className="flex flex-1 flex-col items-center justify-center px-1">
            <p className="mb-4 text-center text-[14px] font-semibold text-[var(--ink)]">
              {'试试这些 Skills'}
            </p>
            <div className="flex w-full max-w-[280px] flex-wrap justify-center gap-1.5">
              {SKILLS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => pickSkill(s)}
                  className="inline-flex h-6 items-center rounded-full border border-[var(--line)] bg-[var(--accent-soft)] px-2.5 text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--line)] hover:text-[var(--ink)]"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-1">
                <div
                  className={cn(
                    'max-w-[95%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'ml-auto bg-[var(--ink)] text-[var(--on-brand)]'
                      : 'mr-auto bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)]'
                  )}
                >
                  {m.content || (m.streaming ? '...' : '')}
                  {m.streaming && m.content ? (
                    <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
                  ) : null}
                </div>
                {m.role === 'assistant' && !m.streaming && m.content && ctx?.kind === 'text' ? (
                  <button
                    type="button"
                    className="mr-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    onClick={() => applyTextToSelection(m.content)}
                  >
                    <HiOutlineCheck className="h-3.5 w-3.5" />
                    Apply
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {historyOpen ? null : (
      <div className="relative shrink-0 px-3 pb-3 pt-0.5">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--canvas)] px-3 pb-2.5 pt-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
          <div
            className="flex min-h-[40px] items-start"
            onClick={() => inputRef.current?.focus()}
          >
            <AgentComposerInput
              ref={inputRef}
              skill={activeSkill}
              onSkillClear={() => setActiveSkill(null)}
              value={input}
              onChange={onInputChange}
              onSubmit={() => void send()}
              onEscape={() => {
                if (skillPanelOpen || modelPanelOpen) {
                  closePopovers();
                  return;
                }
                if (activeSkill) {
                  setActiveSkill(null);
                  return;
                }
                closePopovers();
              }}
              disabled={sending}
              placeholder={
                activeSkill
                  ? '可选：补充说明后发送'
                  : '@Search for image, model, or project'
              }
            />
          </div>
          <div className="mt-1.5 flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Attach"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            >
              <HiOutlinePlus className="h-4 w-4" />
            </button>
            <Tooltip title={selectedModelLabel} placement="top" disabled={modelPanelOpen}>
              <button
                type="button"
                ref={modelFloating.refs.setReference}
                aria-label={'选择模型'}
                aria-expanded={modelPanelOpen}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
                  modelPanelOpen && 'bg-[var(--accent-soft)] text-[var(--ink)]'
                )}
                {...modelIx.getReferenceProps({
                  onClick: () => {
                    setModelPanelOpen((v) => !v);
                    setSkillPanelOpen(false);
                  },
                })}
              >
                <HiOutlineCube className="h-[18px] w-[18px]" />
              </button>
            </Tooltip>
            <Tooltip title="Skill" placement="top" disabled={skillPanelOpen}>
              <button
                type="button"
                ref={skillFloating.refs.setReference}
                aria-label="Skill"
                aria-expanded={skillPanelOpen}
                aria-haspopup="listbox"
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
                  (skillPanelOpen || activeSkill) && 'bg-[var(--accent-soft)] text-[var(--ink)]'
                )}
                {...skillIx.getReferenceProps({
                  onClick: () => {
                    setSkillPanelOpen((v) => !v);
                    setModelPanelOpen(false);
                  },
                })}
              >
                <BiBookAdd className="h-[18px] w-[18px]" />
              </button>
            </Tooltip>

            <button
              type="button"
              aria-label="Send"
              disabled={sending || (!input.trim() && !activeSkill) || available === false}
              onClick={() => void send()}
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--on-brand)] transition-opacity disabled:opacity-35"
            >
              <HiOutlinePaperAirplane className="h-4 w-4" />
            </button>
          </div>
        </div>

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
                <div className="px-3 pb-1.5 pt-3">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">{'选择模型'}</p>
                </div>
                <div className="max-h-[min(260px,calc(100vh-140px))] overflow-y-auto px-1.5 pb-1.5">
                  {(models.length
                    ? models
                    : [{ id: '_loading', label: 'Loading...', provider: '', kind: 'text' as const }]
                  ).map((m) => {
                    const active = m.id === model;
                    const ImageIcon = m.kind === 'image' ? HiOutlinePhoto : HiOutlineSparkles;
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
                          <ImageIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                            {m.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                            {m.id === '_loading' ? '...' : modelDescription(m as LlmModel)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted)]',
                            active && 'border-[var(--ink)] text-[var(--ink)]'
                          )}
                        >
                          <HiOutlinePlus className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {skillPanelOpen ? (
            <div
              ref={skillFloating.refs.setFloating}
              style={skillFloating.floatingStyles as CSSProperties}
              className="z-[80]"
              {...skillIx.getFloatingProps()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className={SKILL_PANEL}>
                <div className="px-3 pb-1.5 pt-3">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">Skill</p>
                </div>
                <div
                  role="listbox"
                  aria-label="Skill"
                  className="max-h-[min(260px,calc(100vh-140px))] overflow-y-auto px-1.5 pb-1.5"
                >
                  {SKILLS.map((s) => {
                    const selected = activeSkill?.slug === s.slug;
                    return (
                      <button
                        key={s.slug}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={cn(
                          'flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--accent-soft)]',
                          selected && 'bg-[var(--accent-soft)]'
                        )}
                        onClick={() => pickSkill(s)}
                      >
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)]">
                          <HiOutlineWrenchScrewdriver className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-[var(--ink)]">
                              {s.label}
                            </span>
                            <span className="inline-flex max-w-full truncate rounded bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] ring-1 ring-[var(--line)]">
                              {s.slug}
                            </span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">
                            {s.desc}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </FloatingPortal>
      </div>
      )}
    </aside>
  );
}
