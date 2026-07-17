import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { cn } from '@/utils/classnames';

/** Selection / frame / pinned element reference chip. */
export type ComposerContext = {
  /** Unique key for dismiss tracking, e.g. frame:id or node:id */
  key: string;
  label: string;
  /** frame | text | image | shape | multi | attachment */
  kind: string;
  /** Payload sent with the chat message (keep small — no huge data URLs). */
  payload: string;
  /** Local image data URL for image gen / canvas place. */
  dataUrl?: string;
};

export type AgentComposerHandle = {
  focus: () => void;
  /** Insert a context chip at the caret (or last known caret / end). */
  insertContextAtCaret: (ctx: ComposerContext) => void;
};

function placeCaretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function readPlainText(root: HTMLElement): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.composerChip === '1') return;
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out.replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
}

/** Update plain text without rebuilding chips (keeps chip nodes in the DOM). */
function syncPlainText(root: HTMLElement, text: string) {
  const textNodes: ChildNode[] = [];
  const collect = (parent: Node) => {
    for (const n of Array.from(parent.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        textNodes.push(n);
        continue;
      }
      if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).dataset?.composerChip === '1') {
        continue;
      }
      collect(n);
    }
  };
  collect(root);
  textNodes.forEach((n) => n.parentNode?.removeChild(n));

  const hasChip = Boolean(root.querySelector('[data-composer-chip="1"]'));
  root.appendChild(document.createTextNode(text || (hasChip ? '\u200b' : '')));
}

/** Plain-text caret offset ignoring chips (for restore after blur). */
function getPlainTextCaretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const rangeBefore = document.createRange();
  rangeBefore.setStart(root, 0);
  rangeBefore.setEnd(range.startContainer, range.startOffset);
  const frag = rangeBefore.cloneContents();
  let offset = 0;
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      offset += (n.textContent || '').replace(/\u200b/g, '').length;
      return;
    }
    if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).dataset?.composerChip === '1') {
      return;
    }
    n.childNodes.forEach(walk);
  };
  frag.childNodes.forEach(walk);
  return offset;
}

function setPlainTextCaretOffset(root: HTMLElement, target: number): Range {
  const range = document.createRange();
  let remaining = Math.max(0, target);
  let found = false;

  const walk = (node: Node): boolean => {
    if (found) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent || '';
      const plain = raw.replace(/\u200b/g, '');
      // Map plain offset into raw text (account for zwsp roughly by using raw length when equal)
      if (remaining <= plain.length) {
        // Prefer placing in this text node
        let rawIdx = 0;
        let plainIdx = 0;
        while (rawIdx < raw.length && plainIdx < remaining) {
          if (raw[rawIdx] !== '\u200b') plainIdx += 1;
          rawIdx += 1;
        }
        range.setStart(node, rawIdx);
        range.collapse(true);
        found = true;
        return true;
      }
      remaining -= plain.length;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.dataset.composerChip === '1') return false;
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) break;
  }
  if (!found) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  return range;
}

function buildChip(
  opts: {
    kind: 'context';
    id: string;
    label: string;
    iconSvg: string;
    onRemove: () => void;
  }
): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.composerChip = '1';
  chip.dataset.chipKind = opts.kind;
  chip.dataset.chipId = opts.id;
  chip.className =
    'mr-1.5 inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 align-middle rounded border border-[var(--line)] bg-[var(--surface)] px-2 text-[12px] leading-none text-[var(--ink)]';

  const icon = document.createElement('span');
  icon.className = 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--muted)]';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = opts.iconSvg;

  const label = document.createElement('span');
  label.className = 'truncate font-medium';
  label.textContent = opts.label;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remove context');
  remove.className =
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[12px] leading-none text-[var(--muted)] hover:text-[var(--ink)]';
  remove.textContent = '×';
  remove.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    opts.onRemove();
  });

  chip.append(icon, label, remove);
  return chip;
}

const CONTEXT_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/></svg>';

/**
 * Contenteditable composer: context chips inline; supports insert-at-caret.
 */
const AgentComposerInput = forwardRef<
  AgentComposerHandle,
  {
    contexts: ComposerContext[];
    onContextsChange: (next: ComposerContext[]) => void;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onEscape?: () => void;
    disabled?: boolean;
    placeholder: string;
    className?: string;
  }
>(function AgentComposerInput(
  {
    contexts,
    onContextsChange,
    value,
    onChange,
    onSubmit,
    onEscape,
    disabled,
    placeholder,
    className,
  },
  ref
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const contextsRef = useRef(contexts);
  const onContextsChangeRef = useRef(onContextsChange);
  const onChangeRef = useRef(onChange);
  const skipSyncRef = useRef(false);
  /** Last caret offset in plain text — survives blur (e.g. right-click canvas). */
  const savedCaretRef = useRef<number | null>(null);

  contextsRef.current = contexts;
  onContextsChangeRef.current = onContextsChange;
  onChangeRef.current = onChange;

  const removeContextByKey = (key: string) => {
    onContextsChangeRef.current(contextsRef.current.filter((c) => c.key !== key));
  };

  const rememberCaret = () => {
    const el = editorRef.current;
    if (!el) return;
    const off = getPlainTextCaretOffset(el);
    if (off != null) savedCaretRef.current = off;
  };

  /**
   * Full rewrite — chips stay in DOM order from `nextContexts` then text.
   * Prefer insertContextAtCaret for user-driven adds so chips can sit mid-text.
   */
  const writeDom = (
    nextContexts: ComposerContext[],
    text: string,
    caret: 'end' | 'preserve' = 'end'
  ) => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = '';
    for (const ctx of nextContexts) {
      el.appendChild(
        buildChip({
          kind: 'context',
          id: ctx.key,
          label: ctx.label,
          iconSvg: CONTEXT_ICON,
          onRemove: () => removeContextByKey(ctx.key),
        })
      );
    }
    const hasChip = nextContexts.length > 0;
    el.appendChild(document.createTextNode(text || (hasChip ? '\u200b' : '')));
    if (caret === 'end' && (hasChip || document.activeElement === el)) {
      el.focus();
      placeCaretAtEnd(el);
    }
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      placeCaretAtEnd(el);
    },
    insertContextAtCaret: (ctx: ComposerContext) => {
      const el = editorRef.current;
      if (!el) return;

      // Block parent-driven rewrite before we mutate the DOM (and the follow-up tick).
      skipSyncRef.current = true;

      const already = contextsRef.current.some((c) => c.key === ctx.key);
      if (!already) {
        onContextsChangeRef.current([...contextsRef.current, ctx]);
      }

      el.focus();
      const sel = window.getSelection();
      const hasCaretRecord = savedCaretRef.current != null;
      let range: Range | null = null;

      // Only honor an in-editor selection when we already have a caret snapshot
      // (right-click from canvas often leaves a selection outside / stale).
      if (hasCaretRecord && sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        if (el.contains(r.commonAncestorContainer)) range = r.cloneRange();
      }
      if (!range && hasCaretRecord) {
        range = setPlainTextCaretOffset(el, savedCaretRef.current!);
      }
      if (!range) {
        // No caret record → append at end of the input.
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }

      const existing = el.querySelector(
        `[data-chip-kind="context"][data-chip-id="${CSS.escape(ctx.key)}"]`
      ) as HTMLElement | null;
      if (existing) {
        existing.remove();
      }

      const chip = buildChip({
        kind: 'context',
        id: ctx.key,
        label: ctx.label,
        iconSvg: CONTEXT_ICON,
        onRemove: () => removeContextByKey(ctx.key),
      });

      range.deleteContents();
      range.insertNode(chip);
      const spacer = document.createTextNode('\u200b');
      chip.after(spacer);

      // Caret after the new chip (end of input when appended).
      const next = document.createRange();
      next.setStartAfter(spacer);
      next.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(next);
      if (!hasCaretRecord) {
        placeCaretAtEnd(el);
      }
      savedCaretRef.current = getPlainTextCaretOffset(el);

      skipSyncRef.current = true;
      const text = readPlainText(el);
      onChangeRef.current(text);
      // Keep skip through the React commit that follows state updates.
      queueMicrotask(() => {
        skipSyncRef.current = true;
      });
    },
  }));

  useLayoutEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    const currentText = readPlainText(el);
    const domCtxKeys = Array.from(
      el.querySelectorAll('[data-chip-kind="context"]')
    ).map((n) => (n as HTMLElement).dataset.chipId || '');
    const nextCtxKeys = contexts.map((c) => c.key);
    const sameCtx =
      domCtxKeys.length === nextCtxKeys.length &&
      domCtxKeys.every((k) => nextCtxKeys.includes(k)) &&
      nextCtxKeys.every((k) => domCtxKeys.includes(k));
    if (sameCtx && currentText === value) {
      return;
    }
    // Contexts unchanged but React `value` changed (e.g. cleared after send).
    // Update plain text in place — do not rebuild chips (preserves mid-text chip order).
    if (sameCtx) {
      syncPlainText(el, value);
      return;
    }
    // New context chips only appended — insert at end, keep existing DOM order.
    const onlyAppended =
      nextCtxKeys.length > domCtxKeys.length &&
      domCtxKeys.every((k, i) => nextCtxKeys[i] === k);
    if (onlyAppended) {
      for (const key of nextCtxKeys.slice(domCtxKeys.length)) {
        const ctx = contexts.find((c) => c.key === key);
        if (!ctx) continue;
        if (el.querySelector(`[data-chip-kind="context"][data-chip-id="${CSS.escape(key)}"]`)) {
          continue;
        }
        el.appendChild(
          buildChip({
            kind: 'context',
            id: ctx.key,
            label: ctx.label,
            iconSvg: CONTEXT_ICON,
            onRemove: () => removeContextByKey(ctx.key),
          })
        );
      }
      el.focus();
      placeCaretAtEnd(el);
      savedCaretRef.current = getPlainTextCaretOffset(el);
      return;
    }
    writeDom(contexts, value, 'end');
  }, [contexts, value]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    rememberCaret();
    const domKeys = Array.from(el.querySelectorAll('[data-chip-kind="context"]')).map(
      (n) => (n as HTMLElement).dataset.chipId || ''
    );
    const nextContexts = contextsRef.current.filter((c) => domKeys.includes(c.key));
    const ordered = domKeys
      .map((k) => nextContexts.find((c) => c.key === k) || contextsRef.current.find((c) => c.key === k))
      .filter(Boolean) as ComposerContext[];
    if (
      ordered.length !== contextsRef.current.length ||
      ordered.some((c, i) => c.key !== contextsRef.current[i]?.key)
    ) {
      onContextsChangeRef.current(ordered);
    }
    const next = readPlainText(el);
    skipSyncRef.current = true;
    onChangeRef.current(next);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onEscape?.();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (e.key !== 'Backspace') return;
    const el = editorRef.current;
    if (!el) return;
    const text = readPlainText(el);
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const chips = el.querySelectorAll('[data-composer-chip]');
    const lastChip = chips[chips.length - 1] as HTMLElement | undefined;
    const afterChip = lastChip?.nextSibling;
    const atChipEdge =
      !text.trim() ||
      (afterChip && range.startContainer === afterChip && range.startOffset <= 1);
    if (!atChipEdge) return;
    e.preventDefault();
    if (lastChip?.dataset.chipKind === 'context' && lastChip.dataset.chipId) {
      removeContextByKey(lastChip.dataset.chipId);
    }
  };

  const empty = !value.trim();
  const hasChips = contexts.length > 0;
  const showPlaceholder = empty && !hasChips && Boolean(placeholder.trim());

  return (
    <div className={cn('relative min-h-[40px] w-full min-w-0 flex-1', className)}>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={showPlaceholder ? placeholder : undefined}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={rememberCaret}
        onClick={rememberCaret}
        onBlur={rememberCaret}
        onSelect={rememberCaret}
        className={cn(
          'w-full whitespace-pre-wrap break-words bg-transparent text-[13px] leading-6 text-[var(--ink)] outline-none',
          'min-h-[40px]',
          disabled && 'pointer-events-none opacity-50'
        )}
      />
      {showPlaceholder ? (
        <div
          className="pointer-events-none absolute inset-0 text-[13px] leading-6 text-[var(--muted)]"
          aria-hidden
        >
          {placeholder}
        </div>
      ) : null}
    </div>
  );
});

export default AgentComposerInput;
