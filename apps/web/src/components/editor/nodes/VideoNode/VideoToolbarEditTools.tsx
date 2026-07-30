import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineScissors } from 'react-icons/hi2';
import { LuCrop } from 'react-icons/lu';
import { MdOutlineFlip } from 'react-icons/md';
import { cn } from '@/utils/classnames';
import { videoToolBtn, VideoToolSep } from './videoToolbarShared';

/** Same 16×16 optical slot as image toolbar. */
const TOOL_ICON_SLOT =
  'pointer-events-none inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full';
const TOOL_ICON_STROKE = 1.75;

function ToolIconSlot({ children }: { children: ReactNode }) {
  return <span className={TOOL_ICON_SLOT}>{children}</span>;
}

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
      className={cn(videoToolBtn, active && 'bg-[var(--accent-soft)]')}
      onClick={onClick}
    >
      <ToolIconSlot>{children}</ToolIconSlot>
      <span>{label}</span>
    </button>
  );
}

/**
 * Video selection toolbar — trim / crop / flip & rotate / fullscreen / download.
 */
export default function VideoToolbarEditTools({
  onTrim,
  onCrop,
  onFlipRotate,
  downloadSlot,
  fullscreenSlot,
}: {
  onTrim?: () => void;
  onCrop?: () => void;
  onFlipRotate?: () => void;
  downloadSlot?: ReactNode;
  fullscreenSlot?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Tool label={t('editor.videoToolbar.trim')} onClick={onTrim}>
        <HiOutlineScissors strokeWidth={TOOL_ICON_STROKE} />
      </Tool>
      <Tool label={t('editor.videoToolbar.crop')} onClick={onCrop}>
        <LuCrop strokeWidth={TOOL_ICON_STROKE} />
      </Tool>
      {onFlipRotate ? (
        <Tool label={t('editor.videoToolbar.flip')} onClick={onFlipRotate}>
          <MdOutlineFlip />
        </Tool>
      ) : null}
      {downloadSlot || fullscreenSlot ? (
        <>
          <VideoToolSep />
          {fullscreenSlot}
          {downloadSlot}
        </>
      ) : null}
    </>
  );
}
