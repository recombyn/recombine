import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { cn } from '@/utils/classnames';

export type ComposerSkill = {
  label: string;
  slug: string;
};

export type AgentComposerHandle = {
  focus: () => void;
};

function readPlainText(root: HTMLElement): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.skillChip === '1') return;
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out.replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
}

function buildSkillChip(skill: ComposerSkill, onRemove: () => void): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.skillChip = '1';
  chip.dataset.skillSlug = skill.slug;
  chip.className =
    'mr-1.5 inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 align-middle rounded border border-[var(--line)] bg-[var(--surface)] px-2 text-[12px] leading-none text-[var(--ink)]';

  const icon = document.createElement('span');
  icon.className = 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--muted)]';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 2H9a3 3 0 0 0-3 3v14a1 1 0 0 0 1.447.894L12 18.118l4.553 1.776A1 1 0 0 0 18 19V5a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2h-1v14a3 3 0 0 1-3.894 2.894L12 20.118l-3.106 1.776A3 3 0 0 1 4 19V5a5 5 0 0 1 5-5h10a1 1 0 1 1 0 2z"/></svg>';

  const label = document.createElement('span');
  label.className = 'truncate font-medium';
  label.textContent = skill.label;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remove skill');
  remove.className =
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[12px] leading-none text-[var(--muted)] hover:text-[var(--ink)]';
  remove.textContent = '×';
  remove.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  });

  chip.append(icon, label, remove);
  return chip;
}

/**
 * Contenteditable composer: skill chips sit inline in the text flow (not a fixed left slot).
 */
const AgentComposerInput = forwardRef<
  AgentComposerHandle,
  {
    skill: ComposerSkill | null;
    onSkillClear: () => void;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onEscape?: () => void;
    disabled?: boolean;
    placeholder: string;
    className?: string;
  }
>(function AgentComposerInput(
  { skill, onSkillClear, value, onChange, onSubmit, onEscape, disabled, placeholder, className },
  ref
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const skillRef = useRef(skill);
  const onSkillClearRef = useRef(onSkillClear);
  const onChangeRef = useRef(onChange);
  const skipSyncRef = useRef(false);
  const [phPad, setPhPad] = useState(0);

  skillRef.current = skill;
  onSkillClearRef.current = onSkillClear;
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    },
  }));

  const writeDom = (nextSkill: ComposerSkill | null, text: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = '';
    if (nextSkill) {
      el.appendChild(
        buildSkillChip(nextSkill, () => {
          onSkillClearRef.current();
        })
      );
    }
    el.appendChild(document.createTextNode(text || (nextSkill ? '\u200b' : '')));
    const chip = el.querySelector('[data-skill-chip]') as HTMLElement | null;
    setPhPad(chip ? Math.ceil(chip.offsetWidth + 6) : 0);
  };

  useLayoutEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      const chip = editorRef.current?.querySelector('[data-skill-chip]') as HTMLElement | null;
      setPhPad(chip ? Math.ceil(chip.offsetWidth + 6) : 0);
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    const currentText = readPlainText(el);
    const currentSlug =
      (el.querySelector('[data-skill-chip]') as HTMLElement | null)?.dataset.skillSlug || null;
    const nextSlug = skill?.slug || null;
    if (currentSlug === nextSlug && currentText === value) {
      const chip = el.querySelector('[data-skill-chip]') as HTMLElement | null;
      setPhPad(chip ? Math.ceil(chip.offsetWidth + 6) : 0);
      return;
    }
    writeDom(skill, value);
  }, [skill, value]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const hasChip = Boolean(el.querySelector('[data-skill-chip]'));
    if (skillRef.current && !hasChip) {
      onSkillClearRef.current();
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
    if (e.key !== 'Backspace' || !skillRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    const text = readPlainText(el);
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const chip = el.querySelector('[data-skill-chip]');
    const afterChip = chip?.nextSibling;
    const atChipEdge =
      !text.trim() ||
      (afterChip &&
        range.startContainer === afterChip &&
        range.startOffset <= 1);
    if (atChipEdge) {
      e.preventDefault();
      onSkillClearRef.current();
    }
  };

  const empty = !value.trim();

  return (
    <div className={cn('relative min-h-[40px] w-full min-w-0 flex-1', className)}>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full whitespace-pre-wrap break-words bg-transparent text-[13px] leading-6 text-[var(--ink)] outline-none',
          'min-h-[40px]',
          disabled && 'pointer-events-none opacity-50'
        )}
      />
      {empty ? (
        <div
          className="pointer-events-none absolute inset-0 text-[13px] leading-6 text-[var(--muted)]"
          style={{ paddingLeft: phPad || undefined }}
          aria-hidden
        >
          {placeholder}
        </div>
      ) : null}
    </div>
  );
});

export default AgentComposerInput;
