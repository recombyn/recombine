import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCube, HiOutlineDocumentText, HiOutlineSquare2Stack } from 'react-icons/hi2';
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
  badge,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      className={cn(imageToolBtn, 'relative', active && 'bg-[var(--accent-soft)]')}
      onClick={onClick}
    >
      {children}
      <span className="inline-flex items-center gap-1">
        {label}
        {badge ? (
          <span className="rounded px-1 py-px text-[10px] font-medium leading-none text-[#3B82F6] bg-[#EFF6FF] ring-1 ring-inset ring-[#BFDBFE]">
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Image selection toolbar edit actions (AI tools + optional trailing slots). */
function ImageToolbarEditTools({
  onUpscale,
  onRemoveBg,
  onEraser,
  onEditText,
  onEditElements,
  onMultiAngle,
  previewSlot,
  downloadSlot,
}: {
  onUpscale: (preset: UpscalePreset) => void;
  onRemoveBg: (mode: RemoveBgMode) => void;
  onEraser: () => void;
  onEditText?: () => void;
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
      {onEditElements ? (
        <Tool
          label={t('editor.imageToolbar.editElements')}
          badge="Beta"
          onClick={onEditElements}
        >
          <HiOutlineSquare2Stack className="h-4 w-4" />
        </Tool>
      ) : null}
      {onEditText ? (
        <Tool label={t('editor.imageToolbar.editText')} onClick={onEditText}>
          <HiOutlineDocumentText className="h-4 w-4" />
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
