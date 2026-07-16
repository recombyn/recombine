import React from 'react';
import { Icon } from '@/components/base/icon';
import { Button } from '@/components/base/button';

export interface PreviewToolbarProps {
  showCounter?: boolean;
  current?: number;
  total?: number;
  scale?: number;
  onFlipY?: () => void;
  onFlipX?: () => void;
  onRotateLeft?: () => void;
  onRotateRight?: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
}

/** Lightbox toolbar: flip, rotate, zoom. */
const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  showCounter = false,
  current = 0,
  total = 0,
  scale = 1,
  onFlipY,
  onFlipX,
  onRotateLeft,
  onRotateRight,
  onZoomOut,
  onZoomIn,
}) => {
  const minScale = 0.5;
  const maxScale = 5;
  const isZoomOutDisabled = scale <= minScale;
  const isZoomInDisabled = scale >= maxScale;
  return (
    <div
      className='fixed bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10'
      onClick={(e) => e.stopPropagation()}
    >
      {showCounter && total > 1 && (
        <div className='px-3 py-1 rounded-full bg-[var(--color-background-default-base)]/80 text-sm text-white'>
          {current + 1} / {total}
        </div>
      )}
      <div className='flex items-center px-6 h-[42px] rounded-full bg-black/50 backdrop-blur-sm'>
        {onFlipY && (
          <Button
            onClick={onFlipY}
            bordered={false}
            className='!bg-transparent !backdrop-filter-none !shadow-none'
            aria-label='Flip vertical'
            icon={<Icon name='base-flip-vertical-icon' width={16} height={16} color='#ffffff' className='rotate-90' />}
          />
        )}
        {onFlipX && (
          <Button
            onClick={onFlipX}
            bordered={false}
            className='!bg-transparent !backdrop-filter-none !shadow-none'
            aria-label='Flip horizontal'
            icon={<Icon name='base-flip-horizontal-icon' width={16} height={16} color='#ffffff' />}
          />
        )}
        {onRotateLeft && (
          <Button
            onClick={onRotateLeft}
            bordered={false}
            className='!bg-transparent !backdrop-filter-none !shadow-none'
            aria-label='Rotate left'
            icon={<Icon name='base-rotate-left-icon' width={16} height={16} color='#ffffff' />}
          />
        )}
        {onRotateRight && (
          <Button
            onClick={onRotateRight}
            bordered={false}
            className='!bg-transparent !backdrop-filter-none !shadow-none'
            aria-label='Rotate right'
            icon={<Icon name='base-rotate-right-icon' width={16} height={16} color='#ffffff' />}
          />
        )}
        {onZoomOut && (
          <Button
            onClick={onZoomOut}
            bordered={false}
            disabled={isZoomOutDisabled}
            className='!bg-transparent !backdrop-filter-none !shadow-none'
            aria-label='Zoom out'
            icon={<Icon name='base-zoom-out-icon' width={16} height={16} color='#ffffff' />}
          />
        )}
        {onZoomIn && (
          <Button
            onClick={onZoomIn}
            bordered={false}
            disabled={isZoomInDisabled}
            className='!bg-transparent !backdrop-filter-none !shadow-none'
            aria-label='Zoom in'
            icon={<Icon name='base-zoom-in-icon' width={16} height={16} color='#ffffff' />}
          />
        )}
      </div>
    </div>
  );
};

export default PreviewToolbar;

