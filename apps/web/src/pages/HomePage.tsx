import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createImportJob,
  getImportJob,
  importDocx,
  importImage,
  importPdf,
  type ImportJobResult,
  type ImportSourceType,
} from '@/apis/import';
import { healthCheck } from '@/apis/health';
import { message } from '@/components/base';
import ImportFileDialog, {
  IMPORT_ACCEPT,
  type ImportFileKind,
} from '@/components/home/ImportFileDialog';
import type { HomeAgentSubmitPayload } from '@/components/home/HomeAgentComposer';
import HomeTopBar from '@/components/layout/HomeTopBar';
import { HomeSidebar, HomeTemplateList, useHomeNav } from '@/components/layout/HomeBody';
import { store } from '@/store';
import { importDocument } from '@/store/modules/editor';
import { useGoEditor } from '@/utils/goEditor';
import {
  buildPlazaStyleSkillChip,
  type OfficialCaseMeta,
} from '@/utils/officialCases';
import { cn } from '@/utils/classnames';

function detectImportSourceType(file: File): ImportSourceType | null {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (/\.(psd|xd|rp|fig)$/i.test(name) || /photoshop|x-psd/i.test(type)) return null;
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return 'image';
  if (type.startsWith('image/')) return 'image';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (/\.(docx?|doc)$/i.test(name) || type.includes('word')) return 'docx';
  return null;
}

function fileForm(file: File, extra?: Record<string, string>): FormData {
  const data = new FormData();
  data.append('file', file);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) data.append(k, v);
  }
  return data;
}

async function importSync(file: File, sourceType: ImportSourceType): Promise<ImportJobResult> {
  const form = fileForm(file);
  const sync =
    sourceType === 'pdf'
      ? importPdf(form)
      : sourceType === 'docx'
        ? importDocx(form)
        : importImage(form);
  const res: any = await sync;
  return {
    job_id: res?.job_id ?? null,
    status: (res?.status as ImportJobResult['status']) || 'done',
    document: res?.document ?? null,
    meta: res?.meta ?? null,
    error: res?.error ?? null,
    progress: 100,
  };
}

async function importViaJob(
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

  let canQueue = false;
  try {
    const health = await healthCheck();
    canQueue = Boolean(health?.checks?.redis && health?.checks?.worker);
  } catch {
    canQueue = false;
  }

  if (allowSyncFallback && !canQueue) {
    options?.onProgress?.({ job_id: null, status: 'processing', progress: 20 });
    return importSync(file, sourceType);
  }

  let created: { job_id: string; status: 'queued' };
  try {
    created = await createImportJob(fileForm(file, { source_type: sourceType }));
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
    if (status.status === 'done' || status.status === 'failed') return status;
    if (allowSyncFallback && status.status === 'queued' && Date.now() - started > 8000) {
      return importSync(file, sourceType);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  if (allowSyncFallback) return importSync(file, sourceType);
  throw new Error('Import job timed out');
}

/**
 * Scene document validation for JSON import (mirrors workflow Zod.safeParse flow).
 * Required: width, height, deltaSetLike.ROOT.children — extra fields allowed.
 */

const RootNodeSchema = z
  .object({
    children: z.array(z.string(), { required_error: 'ROOT.children is required' }),
  })
  .catchall(z.unknown());

const SceneNodeSchema = z
  .object({
    key: z.enum(['text', 'rect', 'shape', 'image'], {
      errorMap: () => ({ message: 'Node key must be text | rect | shape | image' }),
    }),
    x: z.number({ required_error: 'Node x is required' }),
    y: z.number({ required_error: 'Node y is required' }),
    width: z.number({ required_error: 'Node width is required' }),
    height: z.number({ required_error: 'Node height is required' }),
  })
  .catchall(z.unknown());

const DeltaSetLikeSchema = z
  .object({
    ROOT: RootNodeSchema,
  })
  .catchall(z.union([SceneNodeSchema, z.record(z.unknown())]));

const SceneDocumentSchema = z
  .object({
    width: z.number({ required_error: 'width is required' }),
    height: z.number({ required_error: 'height is required' }),
    deltaSetLike: DeltaSetLikeSchema,
  })
  .catchall(z.unknown());

type SceneDocumentImport = z.infer<typeof SceneDocumentSchema>;

type ValidateSceneResult =
  | { valid: true; data: SceneDocumentImport }
  | { valid: false; error: string };

/** Validate parsed JSON as a scene document. */
function validateSceneDocument(data: unknown): ValidateSceneResult {
  try {
    const result = SceneDocumentSchema.safeParse(data);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    const errorMessages = result.error.issues.map((err) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    });
    return {
      valid: false,
      error: `Validation failed: ${errorMessages.join('; ')}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/** Parse file text → JSON → schema check. */
function parseAndValidateSceneJson(rawText: string): ValidateSceneResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { valid: false, error: 'Invalid JSON format' };
  }
  return validateSceneDocument(parsed);
}

function currentProjectId(): string | undefined {
  const id = (store.getState() as any)?.editor?.currentId;
  return typeof id === 'string' && id.trim() ? id : undefined;
}

function mapAgentBootAttachments(attachments: HomeAgentSubmitPayload['attachments']) {
  return attachments
    .filter((a) => a.dataUrl || a.thumbUrl)
    .map((a) => {
      const ref = String(a.dataUrl || '').trim();
      const remote = ref.startsWith('http://') || ref.startsWith('https://');
      return {
        key: a.key,
        label: a.label,
        kind: 'attachment' as const,
        dataUrl: a.dataUrl,
        thumbUrl: remote ? undefined : a.thumbUrl,
        uploadKey: a.uploadKey,
      };
    });
}

function resolveImportEmptyMessage(
  t: (key: string, opts?: Record<string, unknown>) => string,
  sourceType: ImportSourceType,
  warnings: string[]
): string {
  const joined = warnings.join('\n');
  if (/Poppler|pdftoppm/i.test(joined)) return t('home.importNeedPoppler');
  if (/LibreOffice|soffice/i.test(joined) && sourceType === 'docx') {
    return t('home.importNeedLibreOffice');
  }
  if (sourceType === 'image') return t('home.importImageEmpty');
  if (sourceType === 'pdf') return t('home.importPdfEmpty');
  return t('home.importEmpty');
}

function showImportWarningsIfAny(
  t: (key: string, opts?: Record<string, unknown>) => string,
  warnings: string[]
) {
  if (warnings.some((w) => /text-only DOCX|approximate/i.test(w))) {
    message.warning(t('home.importDocxFallback'), 6);
    return;
  }
  if (warnings.some((w) => /raster-fallback|OCR produced no text/i.test(w))) {
    message.warning(t('home.importRasterFallback'), 6);
  }
}

export default function HomePage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const goEditor = useGoEditor();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { nav, setNav, query, importing, setImporting, importingName, setImportingName } =
    useHomeNav();

  const handleCreate = () => {
    goEditor({ createNew: true, newWindow: true });
  };

  const handleAgentSubmit = (payload: HomeAgentSubmitPayload) => {
    const prompt = payload.prompt.trim();
    if (!prompt) return;
    goEditor({
      createNew: true,
      fromHomeAgent: true,
      newWindow: true,
      homeAgentBoot: {
        prompt,
        autoSubmit: true,
        modelId: payload.modelId ?? null,
        interactionMode: payload.interactionMode ?? null,
        imageAspectRatio: payload.imageAspectRatio ?? null,
        scene: payload.scene ?? null,
        attachments: mapAgentBootAttachments(payload.attachments),
      },
    });
  };

  const handleOpenCase = (meta: OfficialCaseMeta) => {
    // Blank canvas + skill chip in chat — do not clone the case document or dump prompt text.
    goEditor({
      createNew: true,
      fromHomeAgent: true,
      newWindow: true,
      homeAgentBoot: {
        prompt: '',
        autoSubmit: false,
        scene: meta.category,
        contexts: [buildPlazaStyleSkillChip(meta, t)],
      },
    });
  };

  const handleImportJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const validation = parseAndValidateSceneJson(text);
      if (validation.valid === false) {
        console.error('Import JSON validation error:', validation.error);
        message.error(t('home.importJsonInvalid'));
        return;
      }
      dispatch(
        importDocument({
          name: file.name.replace(/\.json$/i, ''),
          document: validation.data,
          source: 'import',
        })
      );
      message.success(t('home.importSuccess'));
      goEditor({ projectId: currentProjectId() });
    } catch (error) {
      console.error('Import JSON error:', error);
      message.error(t('home.importJsonFailed'));
    } finally {
      event.target.value = '';
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    const sourceType = detectImportSourceType(file);
    if (!sourceType) {
      message.error(t('home.importUnsupported'));
      event.target.value = '';
      return;
    }

    setImportingName(name);
    setImporting(true);
    message.loading(t('home.importing'));
    try {
      const res = await importViaJob(file, sourceType);
      if (res.status === 'failed') {
        message.error(res.error || t('home.importFailed'));
        return;
      }
      const document = res.document as any;
      if (!document) {
        message.error(t('home.importNoDocument'));
        return;
      }
      const children = document?.deltaSetLike?.ROOT?.children;
      const warnings = res.meta?.warnings || [];
      if (!children?.length) {
        message.error(resolveImportEmptyMessage(t, sourceType, warnings), 8);
        return;
      }
      dispatch(importDocument({ name, document, source: 'import' }));
      showImportWarningsIfAny(t, warnings);
      message.success(t('home.importSuccess'));
      goEditor({ projectId: currentProjectId() });
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.code;
      if (status === 502 || status === 504 || code === 'ERR_NETWORK' || code === 'ECONNABORTED') {
        message.error(t('home.importApiDown'));
      } else {
        message.error(err?.response?.data?.detail || err?.message || t('home.importFailed'));
      }
    } finally {
      setImporting(false);
      setImportingName('');
      event.target.value = '';
    }
  };

  const openFilePicker = (kind: ImportFileKind) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = IMPORT_ACCEPT[kind];
    input.value = '';
    input.click();
  };

  return (
    <div
      className={cn(
        'relative h-full overflow-hidden',
        'home-hero-canvas'
      )}
    >
      <HomeSidebar
        nav={nav}
        setNav={setNav}
        importing={importing}
        onCreate={handleCreate}
      />
      <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden md:pl-[76px]">
        <HomeTopBar setNav={setNav} onCreate={handleCreate} />
        <HomeTemplateList
          nav={nav}
          setNav={setNav}
          query={query}
          importing={importing}
          importingName={importingName}
          onCreate={handleCreate}
          onAgentSubmit={handleAgentSubmit}
          onOpenCase={handleOpenCase}
        />
      </div>
      <ImportFileDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={openFilePicker}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportJson}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT.image}
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  );
}
