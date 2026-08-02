import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, memo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronDoubleDown,
  HiOutlineChevronDoubleUp,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineChevronUp,
  HiOutlineClipboard,
  HiOutlineClipboardDocument,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlinePhoto,
  HiOutlineArrowDownTray,
  HiOutlineScissors,
  HiOutlineSquare2Stack,
  HiOutlineTrash,
} from 'react-icons/hi2';
import { Icon } from '@/components/base';
import { useChromePointerActivate } from './SelectionToolbarShell';

type CtxAction =
  | 'upload'
  | 'addToChat'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'group'
  | 'ungroup'
  | 'front'
  | 'forward'
  | 'backward'
  | 'back'
  | 'toggleHidden'
  | 'toggleLocked'
  | 'toggleGrid'
  | 'exportPng'
  | 'exportJpg'
  | 'exportSvg'
  | 'exportMp4'
  | 'exportMp3'
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
  /** Show/hide + lock — node or frame target. */
  canLayerActions?: boolean;
  /** Export selection — false for image/video-generator plates (no pixels to export). */
  canExport?: boolean;
  /** Show/hide — false for generator-only selection. */
  canToggleHidden?: boolean;
  /** Lock — false for generator-only selection (frames still ok). */
  canToggleLocked?: boolean;
  /** Current visibility of the menu target (all hidden → show action). */
  targetHidden?: boolean;
  /** Current lock of the menu target (all locked → unlock action). */
  targetLocked?: boolean;
  /** Grid snap + overlay (on → show “hide grid” label). */
  gridOn?: boolean;
  /** Video-only selection → MP4 / MP3 instead of PNG / JPG / SVG. */
  exportKind?: 'image' | 'video';
  /** Box / multi-select that is not already one shared group. */
  canGroup?: boolean;
  /** Selection is exactly one shared group. */
  canUngroup?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canPaste?: boolean;
  modLabel: string;
  onAction: (action: CtxAction) => void;
  onClose: () => void;
};

const ICON_CLASS = 'h-3.5 w-3.5 shrink-0 text-[var(--muted)]';

function IconGrid({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
    >
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
      <path d="M2.5 8 H13.5" strokeLinecap="round" />
      <path d="M8 2.5 V13.5" strokeLinecap="round" />
    </svg>
  );
}

const itemClass =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:pointer-events-none disabled:opacity-40';

const PAD = 8;

/**
 * Menu is `position: fixed` on document.body — use viewport client coords.
 * Keep the click anchor; only shift when the panel would overflow.
 * Cap height so a tall menu scrolls instead of pinning to the corner.
 */
function clampFixedMenuPos(opts: {
  left: number;
  top: number;
  menuW: number;
  menuH: number;
}): { left: number; top: number; maxHeight: number } {
  const viewW = Math.max(1, window.innerWidth);
  const viewH = Math.max(1, window.innerHeight);
  const maxHeight = Math.max(120, viewH - PAD * 2);
  const h = Math.min(Math.max(1, opts.menuH), maxHeight);
  const w = Math.min(Math.max(1, opts.menuW), Math.max(1, viewW - PAD * 2));
  let left = opts.left;
  let top = opts.top;
  if (left + w > viewW - PAD) left = viewW - PAD - w;
  if (left < PAD) left = PAD;
  if (top + h > viewH - PAD) top = viewH - PAD - h;
  if (top < PAD) top = PAD;
  return { left, top, maxHeight };
}

function MenuItem({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={itemClass} disabled={disabled} onClick={onClick}>
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? (
        <kbd className="shrink-0 text-[10px] text-[var(--muted)]">{shortcut}</kbd>
      ) : null}
    </button>
  );
}

function ExportSubmenu({
  disabled,
  kind = 'image',
  onPick,
}: {
  disabled?: boolean;
  kind?: 'image' | 'video';
  onPick: (
    action: 'exportPng' | 'exportJpg' | 'exportSvg' | 'exportMp4' | 'exportMp3'
  ) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const [side, setSide] = useState<'right' | 'left'>('right');
  const [vAlign, setVAlign] = useState<'top' | 'bottom'>('top');

  useLayoutEffect(() => {
    if (!open || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    setSide(spaceRight < 140 ? 'left' : 'right');

    const flyoutH = flyoutRef.current?.offsetHeight || 140;
    const spaceBelow = window.innerHeight - rect.top - PAD;
    const spaceAbove = rect.bottom - PAD;
    // Prefer top-align with the row; flip up when the flyout would go past the viewport.
    setVAlign(spaceBelow < flyoutH && spaceAbove > spaceBelow ? 'bottom' : 'top');
  }, [open]);

  const sideClass =
    side === 'right' ? 'left-full ml-1' : 'right-full mr-1';
  const vClass = vAlign === 'top' ? 'top-0' : 'bottom-0';

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => {
        if (!disabled) setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" className={itemClass} disabled={disabled}>
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
          <HiOutlineArrowDownTray className={ICON_CLASS} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate">{t('editor.contextMenu.export')}</span>
        <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
      </button>
      {open && !disabled ? (
        <div
          ref={flyoutRef}
          className={`absolute ${sideClass} ${vClass} z-[1] min-w-[7.5rem] overflow-hidden rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]`}
        >
          {kind === 'video' ? (
            <>
              <button type="button" className={itemClass} onClick={() => onPick('exportMp4')}>
                MP4
              </button>
              <button type="button" className={itemClass} onClick={() => onPick('exportMp3')}>
                MP3
              </button>
            </>
          ) : (
            <>
              <button type="button" className={itemClass} onClick={() => onPick('exportPng')}>
                PNG
              </button>
              <button type="button" className={itemClass} onClick={() => onPick('exportJpg')}>
                JPG
              </button>
              <button type="button" className={itemClass} onClick={() => onPick('exportSvg')}>
                SVG
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Right-click menu — `fixed` on body with viewport client coords (not scene space). */
function CanvasContextMenu({
  menu,
  hasNode,
  canAddToChat,
  canDelete,
  canLayerActions,
  canExport,
  canToggleHidden,
  canToggleLocked,
  targetHidden = false,
  targetLocked = false,
  gridOn = false,
  exportKind = 'image',
  canGroup = false,
  canUngroup = false,
  canUndo,
  canRedo,
  canPaste = false,
  modLabel,
  onAction,
  onClose,
}: CanvasContextMenuProps) {
  const { t } = useTranslation();
  const chromePointer = useChromePointerActivate();
  const deleteEnabled = canDelete ?? hasNode;
  const addToChatEnabled = canAddToChat ?? hasNode;
  const layerEnabled = canLayerActions ?? hasNode;
  const exportEnabled = canExport ?? layerEnabled;
  const hideEnabled = canToggleHidden ?? hasNode;
  const lockEnabled = canToggleLocked ?? layerEnabled;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const el = panelRef.current;
    setPos(
      clampFixedMenuPos({
        left: menu.clientX,
        top: menu.clientY,
        menuW: el?.offsetWidth || 200,
        menuH: el?.offsetHeight || 420,
      })
    );
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
        className="fixed z-[70] min-w-[200px] overflow-y-auto overflow-x-visible rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        style={{
          left: pos?.left ?? menu.clientX,
          top: pos?.top ?? menu.clientY,
          maxHeight: pos?.maxHeight,
        }}
        {...chromePointer}
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
          label={t('editor.contextMenu.uploadMedia')}
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
          icon={<Icon name="editor-group" width={14} height={14} className={ICON_CLASS} />}
          label={t('editor.contextMenu.group')}
          shortcut={`${modLabel}+G`}
          disabled={!canGroup}
          onClick={() => onAction('group')}
        />
        <MenuItem
          icon={<Icon name="editor-ungroup" width={14} height={14} className={ICON_CLASS} />}
          label={t('editor.contextMenu.ungroup')}
          shortcut={`${modLabel}+Shift+G`}
          disabled={!canUngroup}
          onClick={() => onAction('ungroup')}
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
          icon={
            targetHidden ? (
              <HiOutlineEyeSlash className={ICON_CLASS} strokeWidth={1.75} />
            ) : (
              <HiOutlineEye className={ICON_CLASS} strokeWidth={1.75} />
            )
          }
          label={
            targetHidden ? t('editor.contextMenu.show') : t('editor.contextMenu.hide')
          }
          shortcut={`${modLabel}+Shift+H`}
          disabled={!hideEnabled}
          onClick={() => onAction('toggleHidden')}
        />
        <MenuItem
          icon={
            targetLocked ? (
              <HiOutlineLockClosed className={ICON_CLASS} strokeWidth={1.75} />
            ) : (
              <HiOutlineLockOpen className={ICON_CLASS} strokeWidth={1.75} />
            )
          }
          label={
            targetLocked ? t('editor.contextMenu.unlock') : t('editor.contextMenu.lock')
          }
          shortcut={`${modLabel}+Shift+K`}
          disabled={!lockEnabled}
          onClick={() => onAction('toggleLocked')}
        />
        <MenuItem
          icon={<IconGrid className={ICON_CLASS} />}
          label={
            gridOn
              ? t('editor.contextMenu.hideGrid')
              : t('editor.contextMenu.showGrid')
          }
          onClick={() => onAction('toggleGrid')}
        />
        <div className="my-1 h-px bg-[var(--line)]" />
        <ExportSubmenu
          disabled={!exportEnabled}
          kind={exportKind}
          onPick={(action) => onAction(action)}
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

export default memo(CanvasContextMenu);
