import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  LuArrowUpRight,
  LuCircle,
  LuFrame,
  LuHand,
  LuHexagon,
  LuImage,
  LuImagePlus,
  LuImageUp,
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
import { RiVideoAiLine } from 'react-icons/ri';
import { Dropdown, Tooltip, message } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import { uploadImageFile, readFileAsDataUrl } from '@/utils/uploadImage';
import {
  setActiveTool,
  setShapeKind,
  startImageUploadPlaceholder,
  startVideoUploadPlaceholder,
  spawnImageGenerator,
  spawnVideoGenerator,
  finishImageProcess,
  failImageProcess,
} from '@/store/modules/editor';
import {
  captureVideoPosterFrame,
  fitImageSize,
  measureImageNaturalSize,
  measureVideoNaturalSize,
} from '@/components/rcb/scene/sceneDocument';
import { sceneToDocumentCoords } from '@/components/rcb/scene/svgToScene';
import {
  rcbCenterOnPoint,
  rcbFitImageIntoViewport,
  rcbScreenToScene,
  type RcbCamera,
} from '@/components/rcb';
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
    <Tooltip tip={tip} placement="top">
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
  compact = false,
}: {
  className?: string;
  /** Used to place toolbar image uploads at the visible viewport center. */
  camera?: RcbCamera;
  stageEl?: HTMLElement | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeTool = useSelector((state: any) => state.editor.activeTool);
  const shapeKind = useSelector((state: any) => state.editor.shapeKind);
  const document = useSelector((state: any) => state.editor.document);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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
      uploadMedia: t('editor.tools.uploadMedia', { defaultValue: '上传图片/视频' }),
      imageGenerator: t('editor.tools.imageGenerator'),
      videoGenerator: t('editor.tools.videoGenerator'),
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

  const spawnImageGeneratorAtView = () => {
    if (!document) return;
    let width = 360;
    let height = 360;
    let x = 40;
    let y = 40;
    if (camera && stageEl) {
      const view = stageEl.getBoundingClientRect();
      if (view.width > 0 && view.height > 0) {
        const sized = rcbFitImageIntoViewport(
          { width: 1024, height: 1024 },
          view,
          camera.zoom,
          { minRatio: 0.28, maxRatio: 0.42 }
        );
        width = sized.width;
        height = sized.height;
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
      spawnImageGenerator({
        x,
        y,
        width,
        height,
        name: L.imageGenerator,
      })
    );
  };

  const spawnVideoGeneratorAtView = () => {
    if (!document) return;
    let width = 640;
    let height = 360;
    let x = 40;
    let y = 40;
    if (camera && stageEl) {
      const view = stageEl.getBoundingClientRect();
      if (view.width > 0 && view.height > 0) {
        const sized = rcbFitImageIntoViewport(
          { width: 1280, height: 720 },
          view,
          camera.zoom,
          { minRatio: 0.28, maxRatio: 0.48 }
        );
        width = sized.width;
        height = sized.height;
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
      spawnVideoGenerator({
        x,
        y,
        width,
        height,
        name: L.videoGenerator,
      })
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        target?.closest?.('[contenteditable="true"],[data-agent-composer],[data-image-generator],[data-video-generator]')
      ) {
        return;
      }
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
      if (key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        mediaInputRef.current?.click();
      }
      if (key === 'a' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        spawnImageGeneratorAtView();
      }
      if (key === 'a' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        spawnVideoGeneratorAtView();
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
    // Intentionally stable: always call latest spawn via closure from this render's effect re-run when deps change.
  }, [camera, dispatch, document, L.imageGenerator, L.videoGenerator, stageEl]);

  const placeAtViewportCenter = (
    natural: { width: number; height: number }
  ): { width: number; height: number; x?: number; y?: number } => {
    const view = stageEl?.getBoundingClientRect() || null;
    const placeable =
      camera && stageEl && document && view && view.width > 0 && view.height > 0
        ? { camera, stageEl, document, view }
        : null;
    const { width, height } = placeable
      ? rcbFitImageIntoViewport(natural, placeable.view, placeable.camera.zoom)
      : fitImageSize(natural.width, natural.height, 2400);
    let x: number | undefined;
    let y: number | undefined;
    if (placeable) {
      const center = rcbScreenToScene(
        placeable.camera,
        placeable.stageEl,
        placeable.view.left + placeable.view.width / 2,
        placeable.view.top + placeable.view.height / 2
      );
      const placed = rcbCenterOnPoint(center, { width, height });
      const origin = sceneToDocumentCoords(placeable.document, placed.left, placed.top);
      x = origin.x;
      y = origin.y;
    }
    return { width, height, x, y };
  };

  const onPickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const preview = await readFileAsDataUrl(file);
      const natural = await measureImageNaturalSize(preview);
      const { width, height, x, y } = placeAtViewportCenter(natural);
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

  const onPickMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type.startsWith('video/')) {
      try {
        const preview = await readFileAsDataUrl(file);
        const natural = await measureVideoNaturalSize(preview);
        const { width, height, x, y } = placeAtViewportCenter({
          width: natural.width,
          height: natural.height,
        });
        let poster = '';
        try {
          poster = await captureVideoPosterFrame(preview);
        } catch {
          /* optional */
        }
        dispatch(
          startVideoUploadPlaceholder({
            src: preview,
            poster,
            width,
            height,
            x,
            y,
            label: L.uploading,
            name: file.name?.replace(/\.[^.]+$/, '') || 'Video',
          })
        );
        const uploaded = await uploadImageFile(file);
        dispatch(
          finishImageProcess({
            src: uploaded.url,
            attrs: {
              ...(uploaded.key ? { uploadKey: uploaded.key } : {}),
              ...(poster ? { poster } : {}),
              assetKind: 'video',
            },
          })
        );
      } catch (err: any) {
        dispatch(failImageProcess({}));
        const detail = err?.response?.data?.detail || err?.message || L.uploadFail;
        message.error(typeof detail === 'string' ? detail : L.uploadFail);
      }
      return;
    }
    // Image (or unknown → treat as image upload path).
    const synthetic = {
      target: { files: [file], value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    await onPickImage(synthetic);
  };

  const openImageUpload = () => {
    mediaInputRef.current?.click();
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
      <FloatingToolbar
        className={cn(compact ? 'gap-1.5 px-2.5 py-1.5' : 'gap-2.5 px-3.5 py-2', className)}
      >
      {/* Select / Move — click selects, hover for 选择/移动 */}
      <SplitToolButton
        tip={`${L.select} / ${L.pan}`}
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

      {!compact ? (
        <>
          {/* 钢笔 — options dock at page top-center while active */}
          <ToolBtn
            tip={L.pen}
            ariaLabel={L.pen}
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
            ariaLabel={L.pencil}
            active={pencilActive}
            onClick={() => dispatch(setActiveTool('pencil'))}
          >
            <ToolIcon>
              <PencilIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
            </ToolIcon>
          </ToolBtn>

          {/* 油漆桶 — uses pen stroke color as fill */}
          <ToolBtn
            tip={L.bucket}
            ariaLabel={L.bucket}
            active={bucketActive}
            onClick={() => dispatch(setActiveTool('bucket'))}
          >
            <ToolIcon>
              <LuPaintBucket className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
            </ToolIcon>
          </ToolBtn>
        </>
      ) : null}

      {/* 文字 */}
      <ToolBtn
        tip={L.text}
        active={textActive}
        onClick={() => dispatch(setActiveTool('text'))}
      >
        <ToolIcon>
          <TextIcon className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 智能画板 — free-draw; toolbar appears on the frame after commit */}
      <ToolBtn
        tip={L.frame}
        active={frameActive}
        onClick={() => dispatch(setActiveTool('frame'))}
      >
        <ToolIcon className="h-3.5 w-3.5">
          <LuFrame className="h-full w-full" strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 图片/视频上传 */}
      <ToolBtn
        tip={L.uploadMedia}
        active={imageActive}
        onClick={openImageUpload}
      >
        <ToolIcon>
          <LuImageUp className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />

      {/* 图像生成器 — places a generator node at viewport center */}
      <ToolBtn
        tip={L.imageGenerator}
        onClick={spawnImageGeneratorAtView}
      >
        <ToolIcon>
          <LuImagePlus className={TOOL_ICON_CLASS} strokeWidth={STROKE} />
        </ToolIcon>
      </ToolBtn>

      {/* 视频生成器 — Remix fill reads heavier than Lucide strokes; soften to match. */}
      <ToolBtn tip={L.videoGenerator} onClick={spawnVideoGeneratorAtView}>
        <ToolIcon className="h-[18px] w-[18px]">
          <RiVideoAiLine className="opacity-[0.72]" />
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
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onPickMedia}
      />
      </FloatingToolbar>
    </div>
  );
}
