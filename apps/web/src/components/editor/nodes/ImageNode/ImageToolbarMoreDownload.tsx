import { useMemo, useState, type ReactNode } from 'react';
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowsPointingOut,
  HiOutlineEllipsisHorizontal,
  HiOutlineScissors,
} from 'react-icons/hi2';
import { MdOutlineFlip } from 'react-icons/md';
import { TbVectorBezier } from 'react-icons/tb';
import { Dropdown } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import type { MenuItemType } from '@/components/base/dropdown';
import { cn } from '@/utils/classnames';
import { imageMoreRow, imageToolBtn } from './imageToolbarShared';

export type ImageMoreAction =
  | 'expand'
  | 'adjust'
  | 'crop'
  | 'vector'
  | 'flipRotate';

/** Fig.3 — More menu (left-aligned): 扩展 · 调整 · 裁剪 · 矢量 · 翻转与旋转 */
export default function ImageToolbarMoreDownload({
  onAction,
}: {
  onAction: (key: ImageMoreAction) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const items: MenuItemType[] = useMemo(
    () => [
      {
        key: 'expand',
        label: imageMoreRow(<HiOutlineArrowsPointingOut className="h-4 w-4" />, '扩展'),
      },
      {
        key: 'adjust',
        label: imageMoreRow(
          <HiOutlineAdjustmentsHorizontal className="h-4 w-4" />,
          '调整'
        ),
      },
      {
        key: 'crop',
        label: imageMoreRow(<HiOutlineScissors className="h-4 w-4" />, '裁剪'),
      },
      {
        key: 'vector',
        label: imageMoreRow(<TbVectorBezier className="h-4 w-4" />, '矢量'),
      },
      {
        key: 'flipRotate',
        label: imageMoreRow(<MdOutlineFlip className="h-4 w-4" />, '翻转与旋转'),
      },
    ],
    []
  );

  return (
    <Dropdown
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      offset={8}
      strategy="fixed"
      items={items}
      onClick={(key) => {
        onAction(key as ImageMoreAction);
        setOpen(false);
      }}
      popupClassName="min-w-[11.5rem]"
      floatingClassName="z-[80]"
      referenceClassName="inline-flex"
    >
      <Tooltip title={'更多'} placement="top">
        <button
          type="button"
          aria-label={'更多'}
          className={cn(imageToolBtn, open && 'bg-[var(--accent-soft)]')}
        >
          <HiOutlineEllipsisHorizontal className="h-4 w-4" />
        </button>
      </Tooltip>
    </Dropdown>
  );
}
