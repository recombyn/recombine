import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCube, HiOutlineLanguage, HiOutlineSquare2Stack } from 'react-icons/hi2';
import { LuEraser } from 'react-icons/lu';
import { cn } from '@/utils/classnames';
import ImageUpscaleMenu, { type UpscalePreset } from './ImageUpscaleMenu';
import ImageRemoveBgMenu, { type RemoveBgMode } from './ImageRemoveBgMenu';
import { ImageToolSep, imageToolBtn } from './imageToolbarShared';

export type { RemoveBgMode };

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
      className={cn(imageToolBtn, 'relative', active && 'bg-[var(--accent-soft)]')}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/** Image selection toolbar edit actions (AI tools + optional trailing slots). */
function ImageToolbarEditTools({
  onUpscale,
  onRemoveBg,
  onEraser,
  onReplaceText,
  onEditElements,
  onMultiAngle,
  previewSlot,
  downloadSlot,
}: {
  onUpscale: (preset: UpscalePreset) => void;
  onRemoveBg: (mode: RemoveBgMode) => void;
  onEraser: () => void;
  onReplaceText?: () => void;
  onEditElements?: () => void;
  onMultiAngle: () => void;
  previewSlot?: ReactNode;
  downloadSlot?: ReactNode;
}) {
  const { t } = useTranslation();
  const hasTrailing = Boolean(previewSlot || downloadSlot);
  return (
    <>
      <ImageUpscaleMenu onPick={onUpscale} />
      <ImageRemoveBgMenu onPick={onRemoveBg} />
      <Tool label={t('editor.imageToolbar.eraser')} onClick={onEraser}>
        <LuEraser className="h-4 w-4" />
      </Tool>
      {onReplaceText ? (
        <Tool label={t('editor.imageToolbar.replaceText')} onClick={onReplaceText}>
          <HiOutlineLanguage className="h-4 w-4" />
        </Tool>
      ) : null}
      {onEditElements ? (
        <Tool label={t('editor.imageToolbar.editElements')} onClick={onEditElements}>
          <HiOutlineSquare2Stack className="h-4 w-4" />
        </Tool>
      ) : null}
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

export default memo(ImageToolbarEditTools);
