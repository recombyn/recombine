import React, { useState, useCallback, DragEvent } from 'react';
import { cn } from '@/utils/classnames';

interface UploadDraggerProps {
  disabled?: boolean;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Dashed drop zone that forwards files to the parent `Upload`.
 */
export const UploadDragger = ({
  disabled,
  onDrop,
  onClick,
  className,
  style,
  children,
}: UploadDraggerProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragging(true);
    },
    [disabled]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    },
    []
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      setIsDragging(false);
      onDrop(e);
    },
    [onDrop]
  );

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-lg cursor-pointer',
        'border-[var(--color-border-default-base)]',
        'bg-background-default-secondary',
        isDragging && 'border-brand-base bg-background-default-tertiary',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      style={style}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onClick}
    >
      <div className='p-8 text-center'>
        {children || (
          <>
            <div className='mb-4 text-4xl text-text-default-secondary'>📁</div>
            <p className='text-sm text-text-default-base mb-2'>
              Click or drag files here to upload
            </p>
            <p className='text-xs text-text-default-tertiary'>
              Single or multiple files supported
            </p>
          </>
        )}
      </div>
    </div>
  );
};

