/**
 * Debounced project sync: in-memory Redux + PUT /api/v1/projects.
 * Project library is cloud-only (no localStorage).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { upsertProjectApi, deleteProjectApi, deleteProjectsApi } from '@/apis/projects';
import store from '@/store';
import { clearEditorDirty, persistCurrent, setTemplateThumbnail } from '@/store/modules/editor';
import { isOwnedTemplate } from '@/utils/templatesStorage';
import { getToken } from '@/utils/token';
import { renderProjectThumbnail } from '@/utils/renderProjectThumbnail';

const DEBOUNCE_MS = 800;
/** Delete / structural edits should hit the cloud ASAP (refresh must not restore old nodes). */
const FLUSH_NOW_EVENT = 'resume:flush-project';

function thumbForUpload(thumbnail: unknown): string | undefined {
  if (typeof thumbnail !== 'string') return undefined;
  if (thumbnail.startsWith('data:image/')) return thumbnail;
  return undefined;
}

/** Push one owned project to the API (no-op when logged out). */
export async function pushProjectToCloud(payload: {
  id: string;
  name: string;
  document: unknown;
  thumbnail?: unknown;
}): Promise<void> {
  if (!getToken()) return;
  if (!payload.id || !payload.document) return;
  await upsertProjectApi({
    id: payload.id,
    name: payload.name || 'Untitled',
    document: payload.document as Record<string, unknown>,
    thumbnailDataUrl: thumbForUpload(payload.thumbnail),
  });
}

export async function removeProjectFromCloud(id: string): Promise<void> {
  if (!getToken() || !id) return;
  try {
    await deleteProjectApi(id);
  } catch {
    /* ignore — local delete still proceeds */
  }
}

/** Batch remove owned projects from the API (no-op when logged out). */
export async function removeProjectsFromCloud(ids: string[]): Promise<void> {
  const list = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!getToken() || !list.length) return;
  await deleteProjectsApi(list);
}

/** Ask the open editor to flush the project to the cloud immediately. */
export function requestProjectFlush() {
  try {
    window.dispatchEvent(new CustomEvent(FLUSH_NOW_EVENT));
  } catch {
    /* ignore */
  }
}

/** Editor: debounce local persist + cloud upsert while editing. */
export function useProjectCloudSync() {
  const dispatch = useDispatch();
  const dirty = useSelector((s: any) => Boolean(s.editor.dirty));
  const document = useSelector((s: any) => s.editor.document);
  const currentId = useSelector((s: any) => s.editor.currentId as string | null);
  const template = useSelector((s: any) =>
    s.editor.templates.find((t: any) => t.id === s.editor.currentId)
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const latestRef = useRef({ document, currentId, template, dirty });
  latestRef.current = { document, currentId, template, dirty };

  const flush = useCallback(async () => {
    // Read Redux directly — requestProjectFlush may fire before this hook re-renders,
    // so latestRef can still hold the pre-delete document.
    const ed = store.getState().editor as {
      dirty: boolean;
      document: unknown;
      currentId: string | null;
      templates: any[];
    };
    const isDirty = Boolean(ed.dirty);
    const doc = ed.document;
    const id = ed.currentId;
    const tpl = ed.templates.find((t) => t.id === id);
    if (!isDirty || !doc || !id || !tpl) return;
    if (!isOwnedTemplate(tpl)) return;
    if (flushingRef.current) return;
    flushingRef.current = true;

    // Snapshot into the in-memory library entry, but keep dirty until cloud ACK.
    dispatch(persistCurrent({ keepDirty: true }));
    const pushedDoc = (store.getState().editor as { document: unknown }).document;
    let thumbDataUrl: string | undefined;
    try {
      thumbDataUrl = (await renderProjectThumbnail(pushedDoc)) || undefined;
      if (thumbDataUrl) {
        dispatch(setTemplateThumbnail({ id, thumbnail: thumbDataUrl }));
      }
    } catch {
      /* thumb is best-effort — still upload the document */
    }
    try {
      await pushProjectToCloud({
        id,
        name: String(tpl.name || 'Untitled'),
        document: pushedDoc,
        thumbnail: thumbDataUrl || tpl.thumbnail,
      });
      // Another edit landed while uploading — leave dirty so the next flush runs.
      const after = store.getState().editor as { document: unknown };
      if (after.document === pushedDoc) {
        dispatch(clearEditorDirty());
      }
    } catch {
      // Stay dirty so the next debounce / tab-hide / delete flush retries.
    } finally {
      flushingRef.current = false;
    }
  }, [dispatch]);

  const scheduleFlush = useCallback(
    (delayMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, delayMs);
    },
    [flush]
  );

  useEffect(() => {
    if (!dirty || !document || !currentId || !template) return;
    if (!isOwnedTemplate(template)) return;
    scheduleFlush(DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dirty, document, currentId, template, scheduleFlush]);

  // Immediate flush after delete / other structural edits.
  useEffect(() => {
    const onFlushNow = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      void flush();
    };
    window.addEventListener(FLUSH_NOW_EVENT, onFlushNow);
    return () => window.removeEventListener(FLUSH_NOW_EVENT, onFlushNow);
  }, [flush]);

  // Flush when leaving the editor tab / unmounting.
  useEffect(() => {
    const onHide = () => {
      if (!latestRef.current.dirty) return;
      void flush();
    };
    const onVisibility = () => {
      if (window.document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    window.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.document.removeEventListener('visibilitychange', onVisibility);
      void flush();
    };
  }, [flush]);
}
