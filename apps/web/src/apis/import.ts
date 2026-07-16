/**
 * Import API — PDF / DOCX / image / design → Scene JSON.
 * Thin HTTP helpers only; job polling orchestration stays in importViaJob.
 */

import { healthCheck } from '@/apis/health';
import { request } from '@/utils/request';

export type ImportSourceType = 'pdf' | 'docx' | 'image' | 'design';

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const importPdf = (file: File) => {
  const data = new FormData();
  data.append('file', file);
  return request({
    url: '/api/v1/import/pdf',
    method: 'post',
    data,
    timeout: 180000,
  });
};

export const importDocx = (file: File) => {
  const data = new FormData();
  data.append('file', file);
  return request({
    url: '/api/v1/import/docx',
    method: 'post',
    data,
    timeout: 180000,
  });
};

export const importImage = (file: File) => {
  const data = new FormData();
  data.append('file', file);
  return request({
    url: '/api/v1/import/image',
    method: 'post',
    data,
    timeout: 180000,
  });
};

export const importDesign = (file: File) => {
  const data = new FormData();
  data.append('file', file);
  return request({
    url: '/api/v1/import/design',
    method: 'post',
    data,
    timeout: 180000,
  });
};

export const createImportJob = (file: File, sourceType: ImportSourceType) => {
  const data = new FormData();
  data.append('file', file);
  data.append('source_type', sourceType);
  return request<{ job_id: string; status: 'queued' }>({
    url: '/api/v1/import/jobs',
    method: 'post',
    data,
    timeout: 120000,
  });
};

export const getImportJob = (jobId: string) =>
  request<ImportJobResult>({
    url: `/api/v1/import/jobs/${jobId}`,
    method: 'get',
    timeout: 30000,
  });

async function importSync(file: File, sourceType: ImportSourceType): Promise<ImportJobResult> {
  const sync =
    sourceType === 'pdf'
      ? importPdf(file)
      : sourceType === 'docx'
        ? importDocx(file)
        : sourceType === 'design'
          ? importDesign(file)
          : importImage(file);
  const res: any = await sync;
  return {
    job_id: res?.job_id ?? null,
    status: (res?.status as ImportJobStatus) || 'done',
    document: res?.document ?? null,
    meta: res?.meta ?? null,
    error: res?.error ?? null,
    progress: 100,
  };
}

async function canUseJobQueue(): Promise<boolean> {
  try {
    const health = await healthCheck();
    return Boolean(health?.checks?.redis && health?.checks?.worker);
  } catch {
    return false;
  }
}

/** Prefer async job when Redis+worker healthy; otherwise sync. */
export async function importViaJob(
  file: File,
  sourceType: ImportSourceType,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (status: ImportJobResult) => void;
    allowSyncFallback?: boolean;
  }
): Promise<ImportJobResult> {
  const intervalMs = options?.intervalMs ?? 1200;
  const timeoutMs = options?.timeoutMs ?? 180000;
  const allowSyncFallback = options?.allowSyncFallback !== false;

  if (allowSyncFallback && !(await canUseJobQueue())) {
    options?.onProgress?.({ job_id: null, status: 'processing', progress: 20 });
    return importSync(file, sourceType);
  }

  let created: { job_id: string; status: 'queued' };
  try {
    created = await createImportJob(file, sourceType);
  } catch (err) {
    if (!allowSyncFallback) throw err;
    options?.onProgress?.({ job_id: null, status: 'processing', progress: 20 });
    return importSync(file, sourceType);
  }

  const jobId = created.job_id;
  const started = Date.now();
  options?.onProgress?.({ job_id: jobId, status: 'queued', progress: 0 });

  while (Date.now() - started < timeoutMs) {
    let status: ImportJobResult;
    try {
      status = await getImportJob(jobId);
    } catch (err) {
      if (!allowSyncFallback) throw err;
      return importSync(file, sourceType);
    }
    options?.onProgress?.(status);
    if (status.status === 'done' || status.status === 'failed') {
      return status;
    }
    if (allowSyncFallback && status.status === 'queued' && Date.now() - started > 8000) {
      return importSync(file, sourceType);
    }
    await sleep(intervalMs);
  }

  if (allowSyncFallback) {
    return importSync(file, sourceType);
  }
  throw new Error('Import job timed out');
}

export function detectImportSourceType(file: File): ImportSourceType | null {
  const name = file.name.toLowerCase();
  const type = file.type;
  // Design tools before image/* — PSD often reports image/vnd.adobe.photoshop
  if (/\.(psd|xd|rp|fig)$/i.test(name)) return 'design';
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return 'image';
  if (type.startsWith('image/') && !/photoshop|x-psd/i.test(type)) return 'image';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (/\.(docx?|doc)$/i.test(name) || type.includes('word')) return 'docx';
  return null;
}
