import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCube,
  HiOutlineSquare3Stack3D,
} from 'react-icons/hi2';
import { LuEraser } from 'react-icons/lu';
import { Icon } from '@/components/base';
import { cn } from '@/utils/classnames';
import ImageUpscaleMenu, { type UpscalePreset } from './ImageUpscaleMenu';
import { ImageToolSep, imageToolBtn } from './imageToolbarShared';

const TOOL_ICON_SIZE = 16;

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

/** Image selection toolbar edit actions (AI tools + optional trailing slots). */
export default function ImageToolbarEditTools({
  onUpscale,
  onRemoveBg,
  onEraser,
  onEditElements,
  onMultiAngle,
  previewSlot,
  downloadSlot,
}: {
  onUpscale: (preset: UpscalePreset) => void;
  onRemoveBg: () => void;
  onEraser: () => void;
  onEditElements: () => void;
  onMultiAngle: () => void;
  previewSlot?: ReactNode;
  downloadSlot?: ReactNode;
}) {
  const { t } = useTranslation();
  const hasTrailing = Boolean(previewSlot || downloadSlot);
  return (
    <>
      <ImageUpscaleMenu onPick={onUpscale} />
      <Tool label={t('editor.imageToolbar.removeBg')} onClick={onRemoveBg}>
        <Icon
          name="editor-remove_bg"
          width={TOOL_ICON_SIZE}
          height={TOOL_ICON_SIZE}
          className="text-current"
        />
      </Tool>
      <Tool label={t('editor.imageToolbar.eraser')} onClick={onEraser}>
        <LuEraser className="h-4 w-4" />
      </Tool>
      <Tool label={t('editor.imageToolbar.editElements')} onClick={onEditElements}>
        <HiOutlineSquare3Stack3D className="h-4 w-4" />
      </Tool>
      <Tool label={t('editor.imageToolbar.multiAngle')} onClick={onMultiAngle}>
        <HiOutlineCube className="h-4 w-4" />
      </Tool>
      {hasTrailing ? (
        <>
          <ImageToolSep />
          {previewSlot}
          {downloadSlot}
        </>
      ) : null}
    </>
  );
}
