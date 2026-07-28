/**
 * Import API — PDF / DOCX / image → Scene JSON.
 */

import { request } from '@/utils/request';

export type ImportSourceType = 'pdf' | 'docx' | 'image';

export type ImportJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type ImportJobResult = {
  job_id: string | null;
  status: ImportJobStatus;
  progress?: number;
  document?: Record<string, unknown> | null;
  meta?: {
    source_type?: ImportSourceType;
    page_count?: number;
    page_images?: string[];
    object_urls?: string[];
    palette?: string[];
    engines?: string[];
    warnings?: string[];
  } | null;
  error?: string | null;
};

export const importPdf = (data: FormData) =>
  request({
    url: '/api/v1/import/pdf',
    method: 'post',
    data,
    timeout: 180000,
  });

export const importDocx = (data: FormData) =>
  request({
    url: '/api/v1/import/docx',
    method: 'post',
    data,
    timeout: 180000,
  });

export const importImage = (data: FormData) =>
  request({
    url: '/api/v1/import/image',
    method: 'post',
    data,
    timeout: 180000,
  });

export const createImportJob = (data: FormData) =>
  request<{ job_id: string; status: 'queued' }>({
    url: '/api/v1/import/jobs',
    method: 'post',
    data,
    timeout: 120000,
  });

export const getImportJob = (jobId: string) =>
  request<ImportJobResult>({
    url: `/api/v1/import/jobs/${jobId}`,
    method: 'get',
    timeout: 30000,
  });
