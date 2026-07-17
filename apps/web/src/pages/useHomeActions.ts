import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { detectImportSourceType, importViaJob } from '@/apis';
import { message } from '@/components/base';
import type { HomeAgentSubmitPayload } from '@/components/home/HomeAgentComposer';
import type { OfficialCaseMeta } from '@/cases/officialCases';
import { saveHomeAgentBoot } from '@/lib/homeAgentBoot';
import { useGoEditor } from '@/hooks/useGoEditor';
import { parseAndValidateSceneJson } from '@/pages/validateSceneDocument';
import { importDocument } from '@/store/modules/editor';

export function useHomeActions(
  jsonInputRef: React.RefObject<HTMLInputElement | null>,
  fileInputRef: React.RefObject<HTMLInputElement | null>,
  setImporting: (v: boolean) => void,
  setImportingName: (name: string) => void,
  setImportOpen?: (v: boolean) => void
) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const goEditor = useGoEditor();

  /** Navigate first; EditorPage creates the blank document after mount. */
  const handleCreate = () => {
    goEditor({ createNew: true });
  };

  /** Home composer send → blank project + agent auto-submit. Requires non-empty text. */
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
      attachments: payload.attachments
        .filter((a) => a.dataUrl)
        .map((a) => ({
          key: a.key,
          label: a.label,
          kind: 'attachment' as const,
          dataUrl: a.dataUrl,
        })),
    });
    goEditor({ createNew: true, fromHomeAgent: true });
  };

  /** Inspiration card → clone case into a new project and open editor. */
  const handleOpenCase = (meta: OfficialCaseMeta, document: unknown) => {
    const name =
      (meta.name || '').trim() ||
      (meta.nameKey ? t(`home.cases.${meta.nameKey}`) : t('home.untitled'));
    dispatch(importDocument({ name, document }));
    goEditor();
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
        })
      );
      message.success(t('home.importSuccess'));
      goEditor();
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
        } else if (sourceType === 'design') {
          message.error(t('home.importEmpty'), 8);
        } else {
          message.error(t('home.importEmpty'), 8);
        }
        return;
      }
      dispatch(importDocument({ name, document }));
      if (warnings.some((w) => /text-only DOCX|approximate/i.test(w))) {
        message.warning(t('home.importDocxFallback'), 6);
      } else if (warnings.some((w) => /raster-fallback|OCR produced no text/i.test(w))) {
        message.warning(t('home.importRasterFallback'), 6);
      }
      message.success(t('home.importSuccess'));
      goEditor();
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

  const onCreateMenu = (key: string) => {
    if (key === 'create') handleCreate();
    if (key === 'json') jsonInputRef.current?.click();
    if (key === 'file') setImportOpen?.(true);
  };

  return {
    handleCreate,
    handleAgentSubmit,
    handleOpenCase,
    handleImportJson,
    handleImportFile,
    onCreateMenu,
  };
}
