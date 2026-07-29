import type { ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import {
  HiOutlineArrowPath,
  HiOutlineArrowsRightLeft,
  HiOutlineArrowsUpDown,
} from 'react-icons/hi2';
import { BiExit } from 'react-icons/bi';
import { MdOutlineFlip } from 'react-icons/md';
import Tooltip from '@/components/base/tooltip';
import { closeImageToolPanel, patchDocumentNode } from '@/store/modules/editor';
import { cn } from '@/utils/classnames';
import { imageToolBtn, ImageToolSep } from './imageToolbarShared';

type Props = {
  nodeId: string;
  angle: number;
  flipX: boolean;
  flipY: boolean;
  downloadSlot?: ReactNode;
};

function normAngle(deg: number) {
  const n = ((Number(deg) || 0) % 360) + 360;
  return Number((n % 360).toFixed(2));
}

/**
 * Flip & rotate strip: title on the left, exit (chat-style) on the right.
 */
export default function FlipRotateToolbar({
  nodeId,
  angle,
  flipX,
  flipY,
  downloadSlot,
}: Props): ReactNode {
  const dispatch = useDispatch();
  const displayAngle = Math.round(normAngle(angle));

  const patch = (attrs: Record<string, unknown>) => {
    dispatch(patchDocumentNode({ nodeId, patch: { attrs } }));
  };

  return (
    <>
      <span className="inline-flex h-8 items-center gap-1.5 px-1.5 text-[12px] font-medium text-[var(--ink)]">
        <MdOutlineFlip className="h-4 w-4 shrink-0" aria-hidden />
        <span>{'翻转与旋转'}</span>
      </span>

      <ImageToolSep />

      <Tooltip tip={'当前角度'} placement="top">
        <span className="inline-flex h-8 items-center gap-1 px-1.5 text-[12px] tabular-nums text-[var(--ink)]">
          <span className="relative inline-flex h-3.5 w-3.5 items-end justify-start" aria-hidden>
            <span className="absolute bottom-0 left-0 h-[10px] w-[10px] rounded-bl-[1px] border-b-2 border-l-2 border-[var(--ink)]" />
            <span className="absolute bottom-[1px] left-[1px] h-2 w-2 rounded-bl-full border-b border-l border-[var(--ink)] opacity-70" />
          </span>
          <span>
            {displayAngle}
            {' °'}
          </span>
        </span>
      </Tooltip>

      <ImageToolSep />

      <Tooltip tip={'旋转 90°'} placement="top">
        <button
          type="button"
          aria-label={'旋转 90°'}
          className={imageToolBtn}
          onClick={() => patch({ angle: normAngle(angle + 90) })}
        >
          <HiOutlineArrowPath className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip tip={'水平翻转'} placement="top">
        <button
          type="button"
          aria-label={'水平翻转'}
          className={cn(imageToolBtn, flipX && 'bg-[var(--accent-soft)]')}
          aria-pressed={flipX}
          onClick={() => patch({ flipX: flipX ? 'false' : 'true' })}
        >
          <HiOutlineArrowsRightLeft className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip tip={'垂直翻转'} placement="top">
        <button
          type="button"
          aria-label={'垂直翻转'}
          className={cn(imageToolBtn, flipY && 'bg-[var(--accent-soft)]')}
          aria-pressed={flipY}
          onClick={() => patch({ flipY: flipY ? 'false' : 'true' })}
        >
          <HiOutlineArrowsUpDown className="h-4 w-4" />
        </button>
      </Tooltip>

      <ImageToolSep />

      {downloadSlot}

      <ImageToolSep />

      <Tooltip tip={'退出'} placement="top">
        <button
          type="button"
          aria-label={'退出'}
          className={imageToolBtn}
          onClick={() => dispatch(closeImageToolPanel())}
        >
          <BiExit className="h-[18px] w-[18px]" />
        </button>
      </Tooltip>
    </>
  );
}
