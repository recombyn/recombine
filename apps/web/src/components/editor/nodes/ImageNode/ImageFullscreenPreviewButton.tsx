import { useState, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowsPointingOut } from 'react-icons/hi2';
import { Image } from '@/components/base/image';
import Tooltip from '@/components/base/tooltip';
import { imageToolBtn } from './imageToolbarShared';

/** Icon-only fullscreen lightbox for the selected image (before download). */
function ImageFullscreenPreviewButton({
  src,
}: {
  src?: string | null;
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const url = String(src || '').trim();
  if (!url) return null;

  return (
    <>
      <Tooltip
        title={t('editor.fullscreenPreview', { defaultValue: '全屏预览' })}
        placement="top"
      >
        <button
          type="button"
          aria-label={t('editor.fullscreenPreview', { defaultValue: '全屏预览' })}
          className={imageToolBtn}
          onClick={() => setOpen(true)}
        >
          <HiOutlineArrowsPointingOut className="h-4 w-4" />
        </button>
      </Tooltip>
      {/* Hidden host — drives the shared Image lightbox portal. */}
      <Image
        src={url}
        alt=""
        lazy={false}
        preview={{ open, onOpenChange: setOpen, previewOnClick: false }}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        imgClassName="!hidden"
      />
    </>
  );
}

export default memo(ImageFullscreenPreviewButton);
