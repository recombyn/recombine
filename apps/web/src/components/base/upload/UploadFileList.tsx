import React, { useCallback } from 'react';
import { cn } from '@/utils/classnames';
import type { UploadFile, UploadListType } from './index';

interface UploadFileListProps {
  fileList: UploadFile[];
  onRemove: (file: UploadFile) => void;
  listType?: UploadListType;
}

/**
 * Renders the file list for picture, picture-card, or text modes.
 */
export const UploadFileList = ({
  fileList,
  onRemove,
  listType = 'text',
}: UploadFileListProps) => {
  const handleRemove = useCallback(
    (file: UploadFile, e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(file);
    },
    [onRemove]
  );

  if (listType === 'picture' || listType === 'picture-card') {
    return (
      <div className={cn('flex flex-wrap gap-2 mt-4', listType === 'picture-card' && 'mt-4')}>
        {fileList.map((file) => (
          <div
            key={file.uid}
            className={cn(
              'relative border border-[var(--color-border-default-base)] rounded-lg overflow-hidden',
              'bg-background-default-secondary',
              listType === 'picture-card' ? 'w-24 h-24' : 'w-20 h-20'
            )}
          >
            {file.url || (file.originFileObj && file.status === 'done') ? (
              <img
                src={file.url || URL.createObjectURL(file.originFileObj!)}
                alt={file.name}
                className='w-full h-full object-cover'
              />
            ) : (
              <div className='w-full h-full flex items-center justify-center text-text-default-tertiary'>
                {file.status === 'uploading' ? (
                  <div className='text-xs'>Uploading…</div>
                ) : file.status === 'error' ? (
                  <div className='text-xs text-red-500'>Error</div>
                ) : (
                  <div className='text-xs'>Preview</div>
                )}
              </div>
            )}
            {file.status === 'uploading' && (
              <div className='absolute inset-0 bg-black/50 flex items-center justify-center'>
                <div className='text-white text-xs'>{file.percent || 0}%</div>
              </div>
            )}
            <button
              type='button'
              className='absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70'
              onClick={(e) => handleRemove(file, e)}
              aria-label='Remove file'
            >
              ×
            </button>
            {file.status === 'error' && (
              <div className='absolute inset-0 bg-red-500/20 flex items-center justify-center'>
                <div className='text-red-500 text-xs'>Upload failed</div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Text list layout
  return (
    <div className='mt-4 space-y-2'>
      {fileList.map((file) => (
        <div
          key={file.uid}
          className={cn(
            'flex items-center gap-3 p-2 rounded border border-[var(--color-border-default-base)]',
            'bg-background-default-secondary',
            file.status === 'error' && 'border-red-500'
          )}
        >
          <div className='flex-1 min-w-0'>
            <div className='text-sm text-text-default-base truncate'>{file.name}</div>
            {file.status === 'uploading' && (
              <div className='mt-1'>
                <div className='h-1 bg-background-default-tertiary rounded-full overflow-hidden'>
                  <div
                    className='h-full bg-brand-base'
                    style={{ width: `${file.percent || 0}%` }}
                  />
                </div>
                <div className='text-xs text-text-default-tertiary mt-1'>
                  {file.percent || 0}%
                </div>
              </div>
            )}
            {file.status === 'error' && file.error && (
              <div className='text-xs text-red-500 mt-1'>{file.error.message}</div>
            )}
            {file.status === 'done' && (
              <div className='text-xs text-green-500 mt-1'>Upload complete</div>
            )}
          </div>
          <button
            type='button'
            className='flex-shrink-0 w-6 h-6 rounded text-text-default-secondary hover:text-text-default-base hover:bg-background-default-tertiary flex items-center justify-center'
            onClick={(e) => handleRemove(file, e)}
            aria-label='Remove file'
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

