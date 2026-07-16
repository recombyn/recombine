import React, { useState, useCallback, useRef, DragEvent } from 'react';
import { cva } from 'class-variance-authority';
import { nanoid } from 'nanoid';
import { cn } from '@/utils/classnames';
import { UploadFileList } from './UploadFileList';
import { UploadDragger } from './UploadDragger';

// uploading | done | error
export type UploadFileStatus = 'uploading' | 'done' | 'error';

export interface UploadFile {
  uid: string;
  name: string;
  status?: UploadFileStatus;
  originFileObj?: File;
  url?: string;
  percent?: number;
  error?: Error;
  response?: unknown;
}

export type UploadSize = 'small' | 'middle' | 'large';

export type UploadListType = 'text' | 'picture' | 'picture-card';

export interface UploadProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  fileList?: UploadFile[];
  onChange?: (info: { fileList: UploadFile[] }) => void;
  beforeUpload?: (file: File, fileList: File[]) => boolean | Promise<boolean>;
  customRequest?: (options: {
    file: File;
    onProgress: (percent: number) => void;
    onSuccess: (response: unknown) => void;
    onError: (error: Error) => void;
  }) => void;
  onRemove?: (file: UploadFile) => void | boolean | Promise<boolean>;
  listType?: UploadListType;
  maxCount?: number;
  maxSize?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  showUploadList?: boolean;
  dragger?: boolean;
}

const uploadVariants = cva(
  'inline-block',
  {
    variants: {
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: '',
      },
    },
    defaultVariants: {
      disabled: false,
    },
  }
);

// Hidden file input, optional dragger, file list below trigger
const Upload = ({
  accept,
  multiple = false,
  disabled = false,
  fileList: controlledFileList,
  onChange,
  beforeUpload,
  customRequest,
  onRemove,
  listType = 'text',
  maxCount,
  maxSize,
  className,
  style,
  children,
  showUploadList = true,
  dragger = false,
}: UploadProps) => {
  const [internalFileList, setInternalFileList] = useState<UploadFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isControlled = controlledFileList !== undefined;
  const fileList = isControlled ? controlledFileList : internalFileList;

  // Push snapshot to internal state and onChange
  const updateFileList = useCallback(
    (newFileList: UploadFile[]) => {
      if (!isControlled) {
        setInternalFileList(newFileList);
      }
      onChange?.({ fileList: newFileList });
    },
    [isControlled, onChange]
  );

  // Validate maxSize/maxCount, beforeUpload, then enqueue (customRequest or instant done)
  const handleFileChange = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const newFiles: UploadFile[] = [];

      for (const file of fileArray) {
        if (maxSize && file.size > maxSize) {
          const error = new Error(`File exceeds size limit ${(maxSize / 1024 / 1024).toFixed(2)}MB`);
          newFiles.push({
            uid: nanoid(),
            name: file.name,
            status: 'error',
            originFileObj: file,
            error,
          });
          continue;
        }

        if (maxCount && fileList.length + newFiles.length >= maxCount) {
          break;
        }

        let shouldUpload = true;
        if (beforeUpload) {
          const result = beforeUpload(file, [...fileList.map((f) => f.originFileObj!).filter(Boolean), ...fileArray]);
          if (result instanceof Promise) {
            shouldUpload = await result;
          } else {
            shouldUpload = result;
          }
        }

        if (!shouldUpload) {
          continue;
        }

        const uploadFile: UploadFile = {
          uid: nanoid(),
          name: file.name,
          status: 'uploading',
          originFileObj: file,
          percent: 0,
        };

        newFiles.push(uploadFile);

        if (customRequest) {
          customRequest({
            file,
            onProgress: (percent) => {
              const updatedList = [...fileList, ...newFiles].map((f) =>
                f.uid === uploadFile.uid ? { ...f, percent, status: 'uploading' as UploadFileStatus } : f
              );
              updateFileList(updatedList);
            },
            onSuccess: (response) => {
              const updatedList = fileList.map((f) =>
                f.uid === uploadFile.uid
                  ? { ...f, status: 'done' as UploadFileStatus, percent: 100, response }
                  : f
              );
              updateFileList(updatedList);
            },
            onError: (error) => {
              const updatedList = fileList.map((f) =>
                f.uid === uploadFile.uid ? { ...f, status: 'error' as UploadFileStatus, error } : f
              );
              updateFileList(updatedList);
            },
          });
        } else {
          uploadFile.status = 'done';
          uploadFile.percent = 100;
        }
      }

      if (newFiles.length > 0) {
        updateFileList([...fileList, ...newFiles]);
      }
    },
    [fileList, maxCount, maxSize, beforeUpload, customRequest, updateFileList]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileChange(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = ''; // allow re-picking same file
    },
    [handleFileChange]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleRemove = useCallback(
    async (file: UploadFile) => {
      let shouldRemove = true;
      if (onRemove) {
        const result = onRemove(file);
        if (result instanceof Promise) {
          shouldRemove = await result;
        } else if (result === false) {
          shouldRemove = false;
        }
      }

      if (shouldRemove) {
        const newFileList = fileList.filter((f) => f.uid !== file.uid);
        updateFileList(newFileList);
      }
    },
    [fileList, onRemove, updateFileList]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      handleFileChange(e.dataTransfer.files);
    },
    [disabled, handleFileChange]
  );

  const renderUploadTrigger = () => {
    if (dragger) {
      return (
        <UploadDragger
          disabled={disabled}
          onDrop={handleDrop}
          onClick={handleClick}
          className={className}
          style={style}
        >
          {children}
        </UploadDragger>
      );
    }

    return (
      <div
        className={cn(uploadVariants({ disabled }), className)}
        style={style}
        onClick={handleClick}
      >
        {children}
      </div>
    );
  };

  return (
    <div className='upload-wrapper'>
      <input
        ref={fileInputRef}
        type='file'
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
        className='hidden'
        aria-label='File input'
      />
      {renderUploadTrigger()}
      {showUploadList && fileList.length > 0 && (
        <UploadFileList
          fileList={fileList}
          onRemove={handleRemove}
          listType={listType}
        />
      )}
    </div>
  );
};

export { Upload };
export default Upload;
