import type { ReactNode } from 'react';
import {
  HiOutlineCube,
  HiOutlinePencilSquare,
  HiOutlineSquare3Stack3D,
} from 'react-icons/hi2';
import { LuEraser } from 'react-icons/lu';
import { Icon } from '@/components/base';
import { cn } from '@/utils/classnames';
import ImageUpscaleMenu, { type UpscalePreset } from './ImageUpscaleMenu';
import { ImageToolSep, imageToolBtn } from './imageToolbarShared';

const TOOL_ICON_SIZE = 16;

/** Icon + Chinese label (Fig.2). */
function Tool({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(imageToolBtn, active && 'bg-[var(--accent-soft)]')}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/**
 * Image tools: 放大 · 去背景 · 橡皮 · 编辑元素 · 编辑文字 · 多角度 · 更多 · lock · | · 全屏 · 下载
 */
export default function ImageToolbarEditTools({
  onUpscale,
  onRemoveBg,
  onEraser,
  onEditElements,
  onEditText,
  onMultiAngle,
  moreSlot,
  aspectLockSlot,
  previewSlot,
  downloadSlot,
}: {
  onUpscale: (preset: UpscalePreset) => void;
  onRemoveBg: () => void;
  onEraser: () => void;
  onEditElements: () => void;
  onEditText: () => void;
  onMultiAngle: () => void;
  moreSlot: ReactNode;
  /** Optional aspect-ratio lock control before the preview/download group. */
  aspectLockSlot?: ReactNode;
  previewSlot?: ReactNode;
  downloadSlot: ReactNode;
}) {
  return (
    <>
      <ImageUpscaleMenu onPick={onUpscale} />
      <Tool label={'去背景'} onClick={onRemoveBg}>
        <Icon
          name="editor-remove_bg"
          width={TOOL_ICON_SIZE}
          height={TOOL_ICON_SIZE}
          className="text-current"
        />
      </Tool>
      <Tool label={'橡皮工具'} onClick={onEraser}>
        <LuEraser className="h-4 w-4" />
      </Tool>
      <Tool label={'编辑元素'} onClick={onEditElements}>
        <HiOutlineSquare3Stack3D className="h-4 w-4" />
      </Tool>
      <Tool label={'编辑文字'} onClick={onEditText}>
        <HiOutlinePencilSquare className="h-4 w-4" />
      </Tool>
      <Tool label={'多角度'} onClick={onMultiAngle}>
        <HiOutlineCube className="h-4 w-4" />
      </Tool>
      {moreSlot}
      {aspectLockSlot}
      <ImageToolSep />
      {previewSlot}
      {downloadSlot}
    </>
  );
}
