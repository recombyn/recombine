import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronDoubleDown,
  HiOutlineChevronDoubleUp,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineClipboard,
  HiOutlineClipboardDocument,
  HiOutlinePhoto,
  HiOutlineScissors,
  HiOutlineSquare2Stack,
  HiOutlineTrash,
} from 'react-icons/hi2';

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

const ICON_CLASS = 'h-3.5 w-3.5 shrink-0 text-[var(--muted)]';

const itemClass =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:pointer-events-none disabled:opacity-40';

const PAD = 8;

function MenuItem({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={itemClass} disabled={disabled} onClick={onClick}>
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <kbd className="shrink-0 text-[10px] text-[var(--muted)]">{shortcut}</kbd>
    </button>
  );
}

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
  const { t } = useTranslation();
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
        className="fixed z-[70] min-w-[200px] overflow-hidden rounded-[4px] bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        style={{ left: pos?.left ?? menu.clientX, top: pos?.top ?? menu.clientY }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MenuItem
          icon={<HiOutlineChatBubbleLeftRight className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.addToChat')}
          shortcut={`${modLabel}+Shift+L`}
          disabled={!addToChatEnabled}
          onClick={() => onAction('addToChat')}
        />
        <MenuItem
          icon={<HiOutlinePhoto className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.uploadImage')}
          shortcut={`${modLabel}+Shift+I`}
          disabled={Boolean(menu.nodeId)}
          onClick={() => onAction('upload')}
        />
        <MenuItem
          icon={<HiOutlineArrowUturnLeft className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.undo')}
          shortcut={`${modLabel}+Z`}
          disabled={!canUndo}
          onClick={() => onAction('undo')}
        />
        <MenuItem
          icon={<HiOutlineArrowUturnRight className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.redo')}
          shortcut={`${modLabel}+Y`}
          disabled={!canRedo}
          onClick={() => onAction('redo')}
        />
        <div className="my-1 h-px bg-[var(--line)]" />
        <MenuItem
          icon={<HiOutlineScissors className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.cut')}
          shortcut={`${modLabel}+X`}
          disabled={!hasNode}
          onClick={() => onAction('cut')}
        />
        <MenuItem
          icon={<HiOutlineClipboardDocument className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.copy')}
          shortcut={`${modLabel}+C`}
          disabled={!hasNode}
          onClick={() => onAction('copy')}
        />
        <MenuItem
          icon={<HiOutlineSquare2Stack className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.duplicate')}
          shortcut={`${modLabel}+D`}
          disabled={!hasNode}
          onClick={() => onAction('duplicate')}
        />
        <MenuItem
          icon={<HiOutlineClipboard className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.paste')}
          shortcut={`${modLabel}+V`}
          disabled={!canPaste}
          onClick={() => onAction('paste')}
        />
        <div className="my-1 h-px bg-[var(--line)]" />
        <MenuItem
          icon={<HiOutlineChevronDoubleUp className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.bringToFront')}
          shortcut="]"
          disabled={!hasNode}
          onClick={() => onAction('front')}
        />
        <MenuItem
          icon={<HiOutlineChevronUp className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.bringForward')}
          shortcut={`${modLabel}+]`}
          disabled={!hasNode}
          onClick={() => onAction('forward')}
        />
        <MenuItem
          icon={<HiOutlineChevronDown className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.sendBackward')}
          shortcut={`${modLabel}+[`}
          disabled={!hasNode}
          onClick={() => onAction('backward')}
        />
        <MenuItem
          icon={<HiOutlineChevronDoubleDown className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.sendToBack')}
          shortcut="["
          disabled={!hasNode}
          onClick={() => onAction('back')}
        />
        <div className="my-1 h-px bg-[var(--line)]" />
        <MenuItem
          icon={<HiOutlineTrash className={ICON_CLASS} strokeWidth={1.75} />}
          label={t('editor.contextMenu.delete')}
          shortcut="Del"
          disabled={!deleteEnabled}
          onClick={() => onAction('delete')}
        />
      </div>
    </>,
    document.body
  );
}

export type { CtxAction };
