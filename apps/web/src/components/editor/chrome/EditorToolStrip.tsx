import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlinePhoto } from 'react-icons/hi2';
import {
  LuArrowUpRight,
  LuCircle,
  LuFrame,
  LuHand,
  LuHexagon,
  LuImage,
  LuMinus,
  LuMousePointer2,
  LuPaintBucket,
  LuPenTool,
  LuPencil,
  LuSquare,
  LuStar,
  LuTriangle,
  LuType,
} from 'react-icons/lu';
import { Dropdown, Tooltip, message } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import FontGeneratorPanel from '@/components/editor/chrome/FontGeneratorPanel';
import { uploadImageFile, readFileAsDataUrl } from '@/apis/upload';
import {
  setActiveTool,
  setShapeKind,
  startImageUploadPlaceholder,
  finishImageProcess,
  failImageProcess,
} from '@/store/modules/editor';
import {
  fitImageSize,
  measureImageNaturalSize,
} from '@/components/rcb/scene/sceneDocument';
import { sceneToDocumentCoords } from '@/components/rcb/scene/svgToScene';
import { rcbCenterOnPoint, rcbScreenToScene, type RcbCamera } from '@/components/rcb';
import { cn } from '@/utils/classnames';

const MENU_ICON_CLASS = 'h-4 w-4';
const TOOL_ICON_CLASS = 'h-4 w-4 shrink-0';
const STROKE = 1.5;
const MENU_POPUP = 'min-w-[168px]';

type LayerIconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

/** One family (Lucide) so layer glyphs share stroke weight and optical size. */
const layerIconByKind: Record<string, LayerIconComponent> = {
  text: LuType,
  image: LuImage,
  rect: LuSquare,
  line: LuMinus,
  arrow: LuArrowUpRight,
  circle: LuCircle,
  triangle: LuTriangle,
  star: LuStar,
  polygon: LuHexagon,
  pen: LuPenTool,
  pencil: LuPencil,
  path: LuPenTool,
};

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
  disabled,
  onClick,
  children,
}: {
  /** When omitted, no hover tip (use for tools that open a secondary panel). */
  tip?: string;
  ariaLabel?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const label = ariaLabel || tip;
  const btn = (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        disabled && 'pointer-events-none opacity-40',
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
  disabled,
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
  disabled?: boolean;
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
      open={disabled ? false : menuOpen}
      onOpenChange={(open) => {
        if (disabled) return;
        onMenuOpenChange(open);
      }}
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
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (disabled) return;
          onPrimaryClick();
        }}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          disabled && 'pointer-events-none opacity-40',
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
 * Select · 形状 · 钢笔 · 画笔 · 文字 · 智能画板 · 图片
 */
export default function EditorToolStrip({
  className,
  camera,
  stageEl = null,
}: {
  className?: string;
  /** Used to place toolbar image uploads at the visible viewport center. */
  camera?: RcbCamera;
  stageEl?: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeTool = useSelector((state: any) => state.editor.activeTool);
  const shapeKind = useSelector((state: any) => state.editor.shapeKind);
  const document = useSelector((state: any) => state.editor.document);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [fontGenOpen, setFontGenOpen] = useState(false);

  const L = useMemo(
    () => ({
      select: t('editor.tools.select'),
      pan: t('editor.tools.pan'),
      frame: t('editor.tools.frame'),
      shape: t('editor.tools.shape'),
      pen: t('editor.tools.pen'),
      pencil: t('editor.tools.pencil'),
      bucket: t('editor.tools.bucket'),
      text: t('editor.tools.text'),
      rect: t('editor.tools.rect'),
      line: t('editor.tools.line'),
      arrow: t('editor.tools.arrow'),
      circle: t('editor.tools.circle'),
      polygon: t('editor.tools.polygon'),
      star: t('editor.tools.star'),
      uploadImage: t('editor.tools.uploadImage'),
      fontGen: t('editor.tools.fontGen'),
      uploading: t('editor.tools.uploading'),
      uploadFail: t('editor.tools.uploadFail'),
    }),
    [t]
  );

  const selectItems: MenuItemType[] = useMemo(
    () => [
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
    ],
    [L.pan, L.select]
  );

  const shapeItems: MenuItemType[] = useMemo(
    () => [
      { key: 'rect', label: <MenuLabel iconKey="rect" label={L.rect} /> },
      { key: 'line', label: <MenuLabel iconKey="line" label={L.line} /> },
      { key: 'arrow', label: <MenuLabel iconKey="arrow" label={L.arrow} /> },
      { key: 'circle', label: <MenuLabel iconKey="circle" label={L.circle} /> },
      { key: 'polygon', label: <MenuLabel iconKey="triangle" label={L.polygon} /> },
      { key: 'star', label: <MenuLabel iconKey="star" label={L.star} /> },
    ],
    [L.arrow, L.circle, L.line, L.polygon, L.rect, L.star]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === 'v' && !e.shiftKey) {
        window.dispatchEvent(new Event('resume:exit-path-edit'));
        dispatch(setActiveTool('select'));
      }
      if (key === 'h' && !e.shiftKey) {
        window.dispatchEvent(new Event('resume:exit-path-edit'));
        dispatch(setActiveTool('pan'));
      }
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
      if (key === 'b' && !e.shiftKey) dispatch(setActiveTool('bucket'));
      if (key === 'escape') {
        window.dispatchEvent(new Event('resume:exit-path-edit'));
        dispatch(setActiveTool('select'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const onPickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const preview = await readFileAsDataUrl(file);
      const natural = await measureImageNaturalSize(preview);
      // Keep natural aspect; soft-cap long edge so huge photos stay editable on canvas.
      const { width, height } = fitImageSize(natural.width, natural.height, 2400);
      let x: number | undefined;
      let y: number | undefined;
      // Place at the current visible viewport center (not artboard / world origin).
      if (camera && stageEl && document) {
        const view = stageEl.getBoundingClientRect();
        if (view.width > 0 && view.height > 0) {
          const center = rcbScreenToScene(
            camera,
            stageEl,
            view.left + view.width / 2,
            view.top + view.height / 2
          );
          const placed = rcbCenterOnPoint(center, { width, height });
          const origin = sceneToDocumentCoords(document, placed.left, placed.top);
          x = origin.x;
          y = origin.y;
        }
      }
      dispatch(
        startImageUploadPlaceholder({
          src: preview,
          width,
          height,
          x,
          y,
          label: L.uploading,
          name: file.name?.replace(/\.[^.]+$/, '') || 'Image',
        })
      );
      const uploaded = await uploadImageFile(file);
      dispatch(
        finishImageProcess({
          src: uploaded.url,
          attrs: uploaded.key ? { uploadKey: uploaded.key } : undefined,
        })
      );
    } catch (err: any) {
      dispatch(failImageProcess({}));
      const detail = err?.response?.data?.detail || err?.message || L.uploadFail;
      message.error(typeof detail === 'string' ? detail : L.uploadFail);
    }
  };

  const openImageUpload = () => {
    imageInputRef.current?.click();
  };

  const pickSelect = (key: string) => {
    // Bottom Select / Pan: leave path-edit if open (✓ / Esc also exit).
    window.dispatchEvent(new Event('resume:exit-path-edit'));
    dispatch(setActiveTool(key === 'pan' ? 'pan' : 'select'));
  };
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
  const bucketActive = activeTool === 'bucket';
  const textActive = activeTool === 'text';

  return (
    <div className="relative">
      <FontGeneratorPanel open={fontGenOpen} onClose={() => setFontGenOpen(false)} />
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
        items={selectItems}
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
        items={shapeItems}
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
        tip={`${L.pen} P`}
        ariaLabel={`${L.pen} P`}
        active={penActive}
        onClick={() => dispatch(setActiveTool('pen'))}
      >
        <ToolIcon>
          <PenIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 画笔 — options dock at page top-center while active */}
      <ToolBtn
        tip={L.pencil}
        ariaLabel={`${L.pencil} Shift+P`}
        active={pencilActive}
        onClick={() => dispatch(setActiveTool('pencil'))}
      >
        <ToolIcon>
          <PencilIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 油漆桶 — uses pen stroke color as fill */}
      <ToolBtn
        tip={`${L.bucket} B`}
        ariaLabel={`${L.bucket} B`}
        active={bucketActive}
        onClick={() => dispatch(setActiveTool('bucket'))}
      >
        <ToolIcon>
          <LuPaintBucket className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 文字 */}
      <ToolBtn
        tip={`${L.text} T`}
        active={textActive}
        onClick={() => dispatch(setActiveTool('text'))}
      >
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
        <ToolIcon className="h-3.5 w-3.5">
          <LuFrame className="h-full w-full" strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 图片 */}
      <ToolBtn
        tip={`${L.uploadImage} (I)`}
        active={imageActive}
        onClick={openImageUpload}
      >
        <ToolIcon>
          <HiOutlinePhoto className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 字体生成器 */}
      <ToolBtn
        tip={L.fontGen}
        active={fontGenOpen}
        onClick={() => setFontGenOpen((v) => !v)}
      >
        <ToolIcon>
          <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-current text-[8px] font-semibold leading-none">
            T
            <span className="absolute -bottom-0.5 -right-0.5 flex h-1.5 w-1.5 items-center justify-center rounded-full bg-current text-[4px] font-bold leading-none text-[var(--surface)]">
              +
            </span>
          </span>
        </ToolIcon>
      </ToolBtn>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickImage}
      />
      </FloatingToolbar>
    </div>
  );
}
