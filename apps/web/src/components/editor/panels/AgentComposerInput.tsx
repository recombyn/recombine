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
  /** frame | text | image | shape | multi | group | attachment */
  kind: string;
  /** Payload sent with the chat message (keep small — no huge data URLs). */
  payload: string;
  /** Image ref for vision / create_image (https upload URL or data URL). */
  dataUrl?: string;
  /** Chip thumbnail (image node `src` or local data-URL preview). */
  thumbUrl?: string;
  /** Object storage key from POST /api/v1/uploads — used to delete on remove. */
  uploadKey?: string;
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
  const hasChip = Boolean(root.querySelector('[data-composer-chip="1"]'));
  // Interleaved mid-text chips: collapsing all text into one trailing node jumps
  // chips to the front. Only clear/replace when empty or there are no chips.
  if (hasChip && text !== '') {
    const current = readPlainText(root);
    if (current === text) return;
    // Typing / caret inserts already mutate the DOM via handleInput / insertContextAtCaret.
    return;
  }

  const sel = window.getSelection();
  const restore =
    sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).startContainer)
      ? getPlainTextCaretOffset(root)
      : null;

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

  root.appendChild(document.createTextNode(text || (hasChip ? '\u200b' : '')));

  if (restore != null && document.activeElement === root) {
    const range = setPlainTextCaretOffset(root, restore);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
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

const CHIP_STYLE = '2';
/** Separates stable ref id from per-insert instance id (`node:abc@@x7k`). */
export const CHIP_INSTANCE_SEP = '@@';

/** Stable identity without instance suffix (for payload / send parsing). */
export function chipBaseKey(key: string): string {
  const i = key.lastIndexOf(CHIP_INSTANCE_SEP);
  return i >= 0 ? key.slice(0, i) : key;
}

function withChipInstance(key: string): string {
  if (key.includes(CHIP_INSTANCE_SEP)) return key;
  const uid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${key}${CHIP_INSTANCE_SEP}${uid}`;
}

/** Drop browser `<br>` / empty blocks that create a blank line above chips. */
function scrubComposerScaffold(el: HTMLElement) {
  const keep = new Set<Node>();
  for (const chip of Array.from(el.querySelectorAll('[data-composer-chip="1"]'))) {
    keep.add(chip);
    const next = chip.nextSibling;
    if (
      next?.nodeType === Node.TEXT_NODE &&
      (next.textContent || '').includes('\u200b')
    ) {
      keep.add(next);
    }
  }
  if (readPlainText(el).trim() !== '') {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
        node.parentNode?.removeChild(node);
      }
    }
    return;
  }
  for (const node of Array.from(el.childNodes)) {
    if (keep.has(node)) continue;
    node.parentNode?.removeChild(node);
  }
}

function buildChip(
  opts: {
    kind: 'context';
    id: string;
    label: string;
    iconSvg: string;
    thumbUrl?: string;
    onRemove: () => void;
  }
): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.composerChip = '1';
  chip.dataset.chipStyle = CHIP_STYLE;
  chip.dataset.chipKind = opts.kind;
  chip.dataset.chipId = opts.id;
  // Pill chip; square thumb on the left (fig.2), not circular.
  chip.className =
    'mr-1 inline-flex h-[24px] max-w-full shrink-0 items-center gap-1 align-middle rounded-full border border-[var(--line)] bg-[var(--surface)] text-[12px] leading-none text-[var(--ink)]';

  let leading: HTMLElement;
  const thumb = String(opts.thumbUrl || '').trim();
  if (thumb) {
    chip.classList.add('pl-0.5', 'pr-2');
    const img = document.createElement('img');
    img.src = thumb;
    img.alt = '';
    img.draggable = false;
    img.className =
      'h-4 w-4 shrink-0 rounded-[3px] object-cover ring-1 ring-[var(--line)]';
    leading = img;
  } else {
    chip.classList.add('px-2');
    const icon = document.createElement('span');
    icon.className =
      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--canvas)] text-[var(--muted)] ring-1 ring-[var(--line)]';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = opts.iconSvg;
    leading = icon;
  }

  const label = document.createElement('span');
  label.className = 'truncate font-medium';
  label.textContent = opts.label;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remove context');
  remove.className =
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[12px] leading-none text-[var(--muted)] hover:text-[var(--ink)]';
  remove.textContent = '×';
  remove.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    opts.onRemove();
  });

  chip.append(leading, label, remove);
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
  /** Ignore select/focus caret noise while programmatically inserting a chip. */
  const insertingRef = useRef(false);

  contextsRef.current = contexts;
  onContextsChangeRef.current = onContextsChange;
  onChangeRef.current = onChange;

  const removeContextByKey = (key: string) => {
    onContextsChangeRef.current(contextsRef.current.filter((c) => c.key !== key));
  };

  const rememberCaret = () => {
    if (insertingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    const off = getPlainTextCaretOffset(el);
    if (off != null) savedCaretRef.current = off;
  };

  /**
   * Insert a chip at the saved/plain caret. Does not touch React state.
   * Returns true when a new DOM chip was inserted.
   */
  const insertChipAtSavedCaret = (ctx: ComposerContext): boolean => {
    const el = editorRef.current;
    if (!el) return false;

    scrubComposerScaffold(el);

    const chip = buildChip({
      kind: 'context',
      id: ctx.key,
      label: ctx.label,
      iconSvg: CONTEXT_ICON,
      thumbUrl: ctx.thumbUrl || ctx.dataUrl,
      onRemove: () => removeContextByKey(ctx.key),
    });

    const sel = window.getSelection();
    let range: Range | null = null;
    const plainLen = readPlainText(el).length;
    // Prefer saved caret. Never trust the live selection right after el.focus() —
    // browsers reset it to offset 0 (and may fire select → rememberCaret).
    // Empty composer: always append (avoids inserting after a leftover <br>).
    if (plainLen === 0) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    } else if (savedCaretRef.current != null) {
      range = setPlainTextCaretOffset(el, savedCaretRef.current);
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }

    range.deleteContents();
    range.insertNode(chip);
    const spacer = document.createTextNode('\u200b');
    chip.after(spacer);
    scrubComposerScaffold(el);

    const next = document.createRange();
    next.setStartAfter(spacer);
    next.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(next);
    savedCaretRef.current = getPlainTextCaretOffset(el);
    return true;
  };

  /**
   * Full rewrite. Chips go at the saved caret (or end), never forced to index 0.
   */
  const writeDom = (
    nextContexts: ComposerContext[],
    text: string,
    caret: 'end' | 'preserve' = 'end'
  ) => {
    const el = editorRef.current;
    if (!el) return;
    const plain = text || '';
    let at =
      caret === 'preserve' && savedCaretRef.current != null
        ? savedCaretRef.current
        : plain.length;
    at = Math.max(0, Math.min(at, plain.length));
    const before = plain.slice(0, at);
    const after = plain.slice(at);

    el.innerHTML = '';
    if (before) el.appendChild(document.createTextNode(before));
    for (const ctx of nextContexts) {
      el.appendChild(
        buildChip({
          kind: 'context',
          id: ctx.key,
          label: ctx.label,
          iconSvg: CONTEXT_ICON,
          thumbUrl: ctx.thumbUrl || ctx.dataUrl,
          onRemove: () => removeContextByKey(ctx.key),
        })
      );
    }
    const hasChip = nextContexts.length > 0;
    el.appendChild(document.createTextNode(after || (hasChip ? '\u200b' : '')));
    if (document.activeElement === el || hasChip) {
      el.focus();
      const range = setPlainTextCaretOffset(el, before.length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      // Place caret after chips when we inserted at `at`.
      if (hasChip) {
        const lastChip = el.querySelector(
          `[data-chip-kind="context"][data-chip-id="${CSS.escape(
            nextContexts[nextContexts.length - 1]!.key
          )}"]`
        );
        const spacer = lastChip?.nextSibling;
        if (spacer) {
          const afterChip = document.createRange();
          afterChip.setStartAfter(spacer);
          afterChip.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(afterChip);
        }
      }
      savedCaretRef.current = getPlainTextCaretOffset(el);
    }
  };

  // Capture caret before canvas/context-menu steals focus (blur selection is already gone).
  useLayoutEffect(() => {
    const onPointerDownCapture = (e: PointerEvent) => {
      const el = editorRef.current;
      if (!el || disabled) return;
      const t = e.target as Node | null;
      if (!t || el.contains(t)) return;
      rememberCaret();
    };
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [disabled]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = editorRef.current;
      if (!el) return;
      const alreadyFocused = document.activeElement === el;
      el.focus();
      // Keep mid-text caret when already focused (e.g. click bubbled from editor).
      if (!alreadyFocused) {
        if (savedCaretRef.current != null) {
          const range = setPlainTextCaretOffset(el, savedCaretRef.current);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        } else {
          placeCaretAtEnd(el);
          savedCaretRef.current = getPlainTextCaretOffset(el);
        }
      }
    },
    insertContextAtCaret: (ctx: ComposerContext) => {
      const el = editorRef.current;
      if (!el) return;

      // Block parent-driven rewrite before we mutate the DOM (and the follow-up tick).
      skipSyncRef.current = true;
      // Snapshot before focus(): browsers reset caret to 0 and fire select.
      const caretBeforeFocus = savedCaretRef.current;
      insertingRef.current = true;
      try {
        // Same element can be @-mentioned multiple times — unique instance key each insert.
        const unique: ComposerContext = { ...ctx, key: withChipInstance(ctx.key) };
        onContextsChangeRef.current([...contextsRef.current, unique]);

        el.focus();
        if (caretBeforeFocus != null) savedCaretRef.current = caretBeforeFocus;
        insertChipAtSavedCaret(unique);

        skipSyncRef.current = true;
        const text = readPlainText(el);
        onChangeRef.current(text);
        // Keep skip through the React commit that follows state updates.
        queueMicrotask(() => {
          skipSyncRef.current = true;
        });
      } finally {
        insertingRef.current = false;
      }
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
    const chipsStale = Boolean(
      el.querySelector(`[data-composer-chip]:not([data-chip-style="${CHIP_STYLE}"])`)
    );
    if (sameCtx && currentText === value && !chipsStale) {
      return;
    }
    // Contexts unchanged but React `value` changed (e.g. cleared after send).
    // Update plain text in place — do not rebuild chips (preserves mid-text chip order).
    if (sameCtx) {
      syncPlainText(el, value);
      return;
    }
    // New context chips only appended — insert at saved caret (not DOM end / not index 0).
    const onlyAppended =
      nextCtxKeys.length > domCtxKeys.length &&
      domCtxKeys.every((k, i) => nextCtxKeys[i] === k);
    if (onlyAppended) {
      insertingRef.current = true;
      try {
        for (const key of nextCtxKeys.slice(domCtxKeys.length)) {
          const ctx = contexts.find((c) => c.key === key);
          if (!ctx) continue;
          insertChipAtSavedCaret(ctx);
        }
      } finally {
        insertingRef.current = false;
      }
      skipSyncRef.current = true;
      const text = readPlainText(el);
      if (text !== value) onChangeRef.current(text);
      return;
    }
    writeDom(contexts, value, 'preserve');
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
    <div className={cn('relative w-full min-w-0 flex-1', className)}>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={showPlaceholder ? placeholder : undefined}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        data-agent-composer
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={rememberCaret}
        onClick={rememberCaret}
        onBlur={rememberCaret}
        onSelect={rememberCaret}
        className={cn(
          'w-full whitespace-pre-wrap break-words bg-transparent py-0.5 text-[13px] leading-5 text-[var(--ink)] outline-none',
          'min-h-[26px]',
          '[&_[data-composer-chip]]:align-middle',
          disabled && 'pointer-events-none opacity-50'
        )}
      />
      {showPlaceholder ? (
        <div
          className="pointer-events-none absolute inset-0 text-[13px] leading-5 text-[var(--muted)]"
          aria-hidden
        >
          {placeholder}
        </div>
      ) : null}
    </div>
  );
});

export default AgentComposerInput;
