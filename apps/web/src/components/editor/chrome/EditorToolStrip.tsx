import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiOutlineDocument, HiOutlinePhoto } from 'react-icons/hi2';
import { LuFrame, LuHand, LuMousePointer2 } from 'react-icons/lu';
import { Dropdown, Tooltip, message } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import { layerIconByKind } from '@/components/editor/chrome/layerIcons';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import { detectImportSourceType, importViaJob } from '@/apis/import';
import { cn } from '@/utils/classnames';
import {
  setActiveTool,
  setPendingImageSrc,
  setShapeKind,
  startImportPlaceholder,
  finishImportPlaceholder,
  cancelImportPlaceholder,
} from '@/store/modules/editor';

const FILE_ACCEPT =
  '.pdf,.doc,.docx,.psd,.xd,.rp,.fig,application/pdf,image/vnd.adobe.photoshop,application/octet-stream';

const MENU_ICON_CLASS = 'h-4 w-4';
const TOOL_ICON_CLASS = 'h-4 w-4 shrink-0';
const STROKE = 1.5;
const MENU_POPUP = 'min-w-[168px]';

function MenuLabel({
  iconKey,
  label,
  icon,
}: {
  iconKey?: string;
  label: string;
  icon?: ReactNode;
}) {
  const IconComp = iconKey ? layerIconByKind[iconKey] || layerIconByKind.rect : null;
  return (
    <span className="flex w-full items-center gap-2">
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ink)]">
        {icon ||
          (IconComp ? (
            <IconComp className={cn('block shrink-0', MENU_ICON_CLASS)} strokeWidth={STROKE} />
          ) : null)}
      </span>
      <span className="flex-1 text-[12px] text-[var(--ink)]">{label}</span>
    </span>
  );
}

const L = {
  select: '选择',
  pan: '移动',
  frame: '智能画板',
  shape: '形状',
  pen: '钢笔',
  pencil: '铅笔',
  text: '文字',
  rect: '矩形',
  line: '线条',
  arrow: '箭头',
  circle: '椭圆',
  polygon: '多边形',
  star: '星形',
  uploadImage: '图片',
  file: '文件',
  importing: '正在解析…',
  importOk: '导入成功',
  importFail: '导入失败',
  importUnsupported: '暂不支持该格式（PDF / Word / Figma / Axure / PS / XD）',
};

const SELECT_ITEMS: MenuItemType[] = [
  {
    key: 'select',
    label: (
      <MenuLabel
        label={L.select}
        icon={<LuMousePointer2 className={MENU_ICON_CLASS} strokeWidth={STROKE} />}
      />
    ),
  },
  {
    key: 'pan',
    label: (
      <MenuLabel
        label={L.pan}
        icon={<LuHand className={MENU_ICON_CLASS} strokeWidth={STROKE} />}
      />
    ),
  },
];

const SHAPE_ITEMS: MenuItemType[] = [
  { key: 'rect', label: <MenuLabel iconKey="rect" label={L.rect} /> },
  { key: 'line', label: <MenuLabel iconKey="line" label={L.line} /> },
  { key: 'arrow', label: <MenuLabel iconKey="arrow" label={L.arrow} /> },
  { key: 'circle', label: <MenuLabel iconKey="circle" label={L.circle} /> },
  { key: 'polygon', label: <MenuLabel iconKey="triangle" label={L.polygon} /> },
  { key: 'star', label: <MenuLabel iconKey="star" label={L.star} /> },
];

function ToolIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'pointer-events-none inline-flex items-center justify-center',
        TOOL_ICON_CLASS,
        '[&>svg]:block [&>svg]:h-full [&>svg]:w-full',
        className
      )}
    >
      {children}
    </span>
  );
}

function ToolBtn({
  tip,
  ariaLabel,
  active,
  onClick,
  children,
}: {
  /** When omitted, no hover tip (use for tools that open a secondary panel). */
  tip?: string;
  ariaLabel?: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const label = ariaLabel || tip;
  const btn = (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        active
          ? 'bg-[var(--ink)] text-[var(--on-brand)]'
          : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]'
      )}
    >
      {children}
    </button>
  );
  if (!tip) return btn;
  return (
    <Tooltip title={tip} placement="top">
      {btn}
    </Tooltip>
  );
}

/** Click activates tool; hover shows variant panel (no corner chevron). No tip — panel is the hint. */
function SplitToolButton({
  tip,
  active,
  menuOpen,
  onMenuOpenChange,
  items,
  selectedKeys,
  onMenuPick,
  onPrimaryClick,
  menuOffset = 10,
  children,
}: {
  /** Accessible name only; no hover tip (dropdown is the secondary panel). */
  tip: string;
  active?: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  items: MenuItemType[];
  selectedKeys: string[];
  onMenuPick: (key: string) => void;
  /** Click the icon → select / re-activate the current sub-tool. */
  onPrimaryClick: () => void;
  /** Gap between trigger and dropdown (px). */
  menuOffset?: number;
  children: ReactNode;
}) {
  return (
    <Dropdown
      trigger="hover"
      open={menuOpen}
      onOpenChange={onMenuOpenChange}
      placement="top-start"
      offset={menuOffset}
      items={items}
      selectedKeys={selectedKeys}
      onClick={onMenuPick}
      popupClassName={MENU_POPUP}
      floatingClassName="z-50"
      referenceClassName="inline-flex"
    >
      <button
        type="button"
        aria-label={tip}
        onClick={(e) => {
          e.preventDefault();
          onPrimaryClick();
        }}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          active
            ? 'bg-[var(--ink)] text-[var(--on-brand)]'
            : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]'
        )}
      >
        {children}
      </button>
    </Dropdown>
  );
}

/**
 * Bottom-center tool dock:
 * Select · 形状 · 钢笔 · 铅笔 · 文字 · 智能画板 · 图片 · 文件
 */
export default function EditorToolStrip({ className }: { className?: string }) {
  const dispatch = useDispatch();
  const activeTool = useSelector((state: any) => state.editor.activeTool);
  const shapeKind = useSelector((state: any) => state.editor.shapeKind);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === 'v' && !e.shiftKey) dispatch(setActiveTool('select'));
      if (key === 'h' && !e.shiftKey) dispatch(setActiveTool('pan'));
      if (key === 'f' && !e.shiftKey) dispatch(setActiveTool('frame'));
      if (key === 't' && !e.shiftKey) dispatch(setActiveTool('text'));
      if (key === 'r' && !e.shiftKey) dispatch(setShapeKind('rect'));
      if (key === 'l' && !e.shiftKey) dispatch(setShapeKind('line'));
      if (key === 'l' && e.shiftKey) dispatch(setShapeKind('arrow'));
      if (key === 'o' && !e.shiftKey) dispatch(setShapeKind('circle'));
      if (key === 'i' && e.shiftKey) {
        dispatch(setActiveTool('image'));
        imageInputRef.current?.click();
      }
      if (key === 'p' && !e.shiftKey) dispatch(setActiveTool('pen'));
      if (key === 'p' && e.shiftKey) dispatch(setActiveTool('pencil'));
      if (key === 'escape') dispatch(setActiveTool('select'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const onPickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    dispatch(setPendingImageSrc(dataUrl));
    event.target.value = '';
  };

  const onPickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const sourceType = detectImportSourceType(file);
    if (!sourceType || sourceType === 'image') {
      message.error(L.importUnsupported);
      event.target.value = '';
      return;
    }
    setImporting(true);
    const label =
      sourceType === 'design'
        ? '解析设计文件中'
        : sourceType === 'docx'
          ? '解析 Word 中'
          : '解析 PDF 中';
    dispatch(startImportPlaceholder({ label }));
    try {
      const res = await importViaJob(file, sourceType);
      if (res.status === 'failed' || !res.document) {
        dispatch(cancelImportPlaceholder());
        message.error(res.error || L.importFail);
        return;
      }
      dispatch(finishImportPlaceholder({ document: res.document }));
      message.success(L.importOk);
    } catch (err: any) {
      dispatch(cancelImportPlaceholder());
      message.error(err?.response?.data?.detail || err?.message || L.importFail);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const openImageUpload = () => {
    imageInputRef.current?.click();
  };

  const openFileUpload = () => {
    fileInputRef.current?.click();
  };

  const pickSelect = (key: string) => dispatch(setActiveTool(key === 'pan' ? 'pan' : 'select'));
  const pickShape = (id: string) => {
    if (id === 'image') return;
    dispatch(setShapeKind(id));
  };

  const shapeIconKind =
    shapeKind && shapeKind !== 'image' && layerIconByKind[shapeKind] ? shapeKind : 'rect';
  const ShapeIcon = layerIconByKind[shapeIconKind];
  const PenIcon = layerIconByKind.pen;
  const PencilIcon = layerIconByKind.pencil;
  const TextIcon = layerIconByKind.text;

  const selectOrPan = activeTool === 'select' || activeTool === 'pan';
  const selectActive = selectOrPan;
  const frameActive = activeTool === 'frame';
  const shapeActive = activeTool === 'shape';
  const imageActive = activeTool === 'image';
  const penActive = activeTool === 'pen';
  const pencilActive = activeTool === 'pencil';
  const textActive = activeTool === 'text';

  return (
    <FloatingToolbar
      className={cn('gap-2.5 px-3.5 py-2', className)}
    >
      {/* Select / Move — click selects, hover for 选择/移动 */}
      <SplitToolButton
        tip={`${L.select} / ${L.pan} (V / H)`}
        active={selectActive}
        menuOpen={openMenu === 'select'}
        onMenuOpenChange={(open) => {
          setOpenMenu(open ? 'select' : null);
        }}
        items={SELECT_ITEMS}
        selectedKeys={[activeTool === 'pan' ? 'pan' : 'select']}
        onMenuPick={pickSelect}
        onPrimaryClick={() =>
          dispatch(setActiveTool(activeTool === 'pan' ? 'pan' : 'select'))
        }
      >
        <ToolIcon>
          {activeTool === 'pan' ? (
            <LuHand className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
          ) : (
            <LuMousePointer2 className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
          )}
        </ToolIcon>
      </SplitToolButton>

      {/* 形状 — click draws current shape, hover to switch */}
      <SplitToolButton
        tip={L.shape}
        active={shapeActive}
        menuOpen={openMenu === 'shape'}
        onMenuOpenChange={(open) => {
          setOpenMenu(open ? 'shape' : null);
        }}
        items={SHAPE_ITEMS}
        selectedKeys={[shapeKind]}
        onMenuPick={pickShape}
        onPrimaryClick={() =>
          dispatch(setShapeKind(shapeKind && shapeKind !== 'image' ? shapeKind : 'rect'))
        }
      >
        <ToolIcon>
          <ShapeIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </SplitToolButton>

      {/* 钢笔 — options dock at page top-center while active */}
      <ToolBtn
        ariaLabel={`${L.pen} P`}
        active={penActive}
        onClick={() => dispatch(setActiveTool('pen'))}
      >
        <ToolIcon>
          <PenIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 铅笔 — options dock at page top-center while active */}
      <ToolBtn
        ariaLabel={`${L.pencil} ⇧P`}
        active={pencilActive}
        onClick={() => dispatch(setActiveTool('pencil'))}
      >
        <ToolIcon>
          <PencilIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 文字 */}
      <ToolBtn tip={`${L.text} T`} active={textActive} onClick={() => dispatch(setActiveTool('text'))}>
        <ToolIcon>
          <TextIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 智能画板 — free-draw; toolbar appears on the frame after commit */}
      <ToolBtn
        tip={`${L.frame} F`}
        active={frameActive}
        onClick={() => dispatch(setActiveTool('frame'))}
      >
        <ToolIcon>
          <LuFrame className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 图片 */}
      <ToolBtn tip={`${L.uploadImage} (I)`} active={imageActive} onClick={openImageUpload}>
        <ToolIcon>
          <HiOutlinePhoto className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 文件 — PDF / Word / Figma / Axure / PS / XD */}
      <ToolBtn tip={importing ? L.importing : L.file} active={importing} onClick={openFileUpload}>
        <ToolIcon>
          <HiOutlineDocument className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickImage}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={onPickFile}
      />
    </FloatingToolbar>
  );
}
