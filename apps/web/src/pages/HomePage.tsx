import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { detectImportSourceType, importViaJob } from '@/apis/import';
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
import { saveHomeAgentBoot } from '@/utils/homeAgentBoot';
import type { OfficialCaseMeta } from '@/utils/officialCases';
import { cn } from '@/utils/classnames';

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
    goEditor({ createNew: true });
  };

  const handleAgentSubmit = (payload: HomeAgentSubmitPayload) => {
    const prompt = payload.prompt.trim();
    if (!prompt) return;
    saveHomeAgentBoot({
      prompt,
      autoSubmit: true,
      modelId: payload.modelId ?? null,
      imageAspectRatio: payload.imageAspectRatio ?? null,
      imageQuality: payload.imageQuality ?? null,
      imageResolution: payload.imageResolution ?? null,
      scene: payload.scene ?? null,
      attachments: payload.attachments
        .filter((a) => a.dataUrl || a.thumbUrl)
        .map((a) => {
          const ref = String(a.dataUrl || '').trim();
          const remote = ref.startsWith('http://') || ref.startsWith('https://');
          return {
            key: a.key,
            label: a.label,
            kind: 'attachment' as const,
            dataUrl: a.dataUrl,
            // Skip huge data-URL thumbs when vision ref is already a public https URL.
            thumbUrl: remote ? undefined : a.thumbUrl,
            uploadKey: a.uploadKey,
          };
        }),
    });
    goEditor({ createNew: true, fromHomeAgent: true });
  };

  const handleOpenCase = (
    meta: OfficialCaseMeta,
    document: unknown,
    opts?: { prompt?: string }
  ) => {
    const name =
      (meta.name || '').trim() ||
      (meta.nameKey ? t(`home.cases.${meta.nameKey}`) : t('home.untitled'));
    dispatch(
      importDocument({
        name,
        document,
        source: 'case',
        originCaseId: meta.id,
      })
    );
    const prompt = (opts?.prompt || '').trim();
    if (prompt) {
      saveHomeAgentBoot({ prompt, autoSubmit: false });
      goEditor({ projectId: currentProjectId(), fromHomeAgent: true });
    } else {
      goEditor({ projectId: currentProjectId() });
    }
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
        const joined = warnings.join('\n');
        if (/Poppler|pdftoppm/i.test(joined)) {
          message.error(t('home.importNeedPoppler'), 8);
        } else if (/LibreOffice|soffice/i.test(joined) && sourceType === 'docx') {
          message.error(t('home.importNeedLibreOffice'), 8);
        } else if (sourceType === 'image') {
          message.error(t('home.importImageEmpty'));
        } else if (sourceType === 'pdf') {
          message.error(t('home.importPdfEmpty'), 8);
        } else {
          message.error(t('home.importEmpty'), 8);
        }
        return;
      }
      dispatch(importDocument({ name, document, source: 'import' }));
      if (warnings.some((w) => /text-only DOCX|approximate/i.test(w))) {
        message.warning(t('home.importDocxFallback'), 6);
      } else if (warnings.some((w) => /raster-fallback|OCR produced no text/i.test(w))) {
        message.warning(t('home.importRasterFallback'), 6);
      }
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
    <div className="relative flex h-full overflow-hidden bg-[var(--canvas)]">
      <HomeSidebar
        nav={nav}
        setNav={setNav}
        importing={importing}
        onCreate={handleCreate}
      />
      <div
        className={cn(
          'relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden',
          nav === 'home' ? 'home-hero-canvas' : 'bg-[var(--surface)]'
        )}
      >
        <HomeTopBar />
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
