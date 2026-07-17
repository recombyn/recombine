import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type CtxAction =
  | 'upload'
  | 'addToChat'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'front'
  | 'forward'
  | 'backward'
  | 'back'
  | 'delete';

export type ContextMenuState = {
  clientX: number;
  clientY: number;
  sceneX: number;
  sceneY: number;
  nodeId: string | null;
  /** Artboard under cursor / selected when opening the menu. */
  frameId?: string | null;
};

type CanvasContextMenuProps = {
  menu: ContextMenuState | null;
  hasNode: boolean;
  /** Enable 「添加到 Chat」 for selected node or artboard. */
  canAddToChat?: boolean;
  /** Nodes or active artboard frame. */
  canDelete?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canPaste?: boolean;
  modLabel: string;
  onAction: (action: CtxAction) => void;
  onClose: () => void;
};

const itemClass =
  'flex w-full items-center justify-between gap-8 px-3 py-1.5 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:pointer-events-none disabled:opacity-40';

const PAD = 8;

/** Right-click menu — screen-space portal (not scaled by canvas camera). */
export default function CanvasContextMenu({
  menu,
  hasNode,
  canAddToChat,
  canDelete,
  canUndo,
  canRedo,
  canPaste = false,
  modLabel,
  onAction,
  onClose,
}: CanvasContextMenuProps) {
  const deleteEnabled = canDelete ?? hasNode;
  const addToChatEnabled = canAddToChat ?? hasNode;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const el = panelRef.current;
    const w = el?.offsetWidth || 200;
    const h = el?.offsetHeight || 320;
    const maxL = Math.max(PAD, window.innerWidth - w - PAD);
    const maxT = Math.max(PAD, window.innerHeight - h - PAD);
    setPos({
      left: Math.min(Math.max(PAD, menu.clientX), maxL),
      top: Math.min(Math.max(PAD, menu.clientY), maxT),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onPointerDown={onClose} aria-hidden />
      <div
        ref={panelRef}
        data-ctx-menu
        className="fixed z-[70] min-w-[180px] overflow-hidden rounded-[4px] bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        style={{ left: pos?.left ?? menu.clientX, top: pos?.top ?? menu.clientY }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={itemClass}
          disabled={!addToChatEnabled}
          onClick={() => onAction('addToChat')}
        >
          <span>{'添加到 Chat'}</span>
        </button>
        <button
          type="button"
          className={itemClass}
          disabled={Boolean(menu.nodeId)}
          onClick={() => onAction('upload')}
        >
          <span>{'上传图片'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+Shift+I</kbd>
        </button>
        <button type="button" className={itemClass} disabled={!canUndo} onClick={() => onAction('undo')}>
          <span>{'撤销'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+Z</kbd>
        </button>
        <button type="button" className={itemClass} disabled={!canRedo} onClick={() => onAction('redo')}>
          <span>{'重做'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+Y</kbd>
        </button>
        <div className="my-1 h-px bg-[var(--line)]" />
        <button type="button" className={itemClass} disabled={!hasNode} onClick={() => onAction('cut')}>
          <span>{'剪切'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+X</kbd>
        </button>
        <button type="button" className={itemClass} disabled={!hasNode} onClick={() => onAction('copy')}>
          <span>{'复制'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+C</kbd>
        </button>
        <button
          type="button"
          className={itemClass}
          disabled={!hasNode}
          onClick={() => onAction('duplicate')}
        >
          <span>{'副本'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+D</kbd>
        </button>
        <button
          type="button"
          className={itemClass}
          disabled={!canPaste}
          onClick={() => onAction('paste')}
        >
          <span>{'粘贴'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+V</kbd>
        </button>
        <div className="my-1 h-px bg-[var(--line)]" />
        <button type="button" className={itemClass} disabled={!hasNode} onClick={() => onAction('front')}>
          <span>{'置于顶层'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">]</kbd>
        </button>
        <button
          type="button"
          className={itemClass}
          disabled={!hasNode}
          onClick={() => onAction('forward')}
        >
          <span>{'上移一层'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+]</kbd>
        </button>
        <button
          type="button"
          className={itemClass}
          disabled={!hasNode}
          onClick={() => onAction('backward')}
        >
          <span>{'下移一层'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">{modLabel}+[</kbd>
        </button>
        <button type="button" className={itemClass} disabled={!hasNode} onClick={() => onAction('back')}>
          <span>{'置于底层'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">[</kbd>
        </button>
        <div className="my-1 h-px bg-[var(--line)]" />
        <button
          type="button"
          className={itemClass}
          disabled={!deleteEnabled}
          onClick={() => onAction('delete')}
        >
          <span>{'删除'}</span>
          <kbd className="text-[10px] text-[var(--muted)]">Del</kbd>
        </button>
      </div>
    </>,
    document.body
  );
}

export type { CtxAction };
