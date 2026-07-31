/**
 * Image upload → backend → Tencent COS (or local store).
 */

import { request } from '@/utils/request';

export type UploadedFileItem = {
  url: string;
  key?: string;
  mime?: string;
  name?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
};

export type UploadFilesResult = {
  items: UploadedFileItem[];
};

/** Upload one or more images/videos. Form field name: `files`. */
export const uploadFiles = (
  data: FormData,
  opts?: { timeout?: number; signal?: AbortSignal }
) =>
  request<UploadFilesResult>({
    url: '/api/v1/uploads',
    method: 'post',
    data,
    // Videos can be large — default 10 minutes.
    timeout: opts?.timeout ?? 600000,
    signal: opts?.signal,
  });

/** DELETE /api/v1/uploads/files/{encodedKeyPath} */
export const deleteUploadedFile = (encodedKeyPath: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/uploads/files/${encodedKeyPath}`,
    method: 'delete',
  });
