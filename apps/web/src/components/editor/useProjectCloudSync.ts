/**
 * Debounced project sync: IndexedDB draft then PATCH (node delta) or PUT (full doc).
 * Local draft survives refresh / flaky network; cloud remains source of truth when newer.
 * Camera / selection live in a separate local session store — never uploaded.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  upsertProjectApi,
  patchProjectApi,
  deleteProjectApi,
  deleteProjectsApi,
  fetchProject,
} from '@/apis/projects';
import axios, { type AxiosError } from 'axios';
import store from '@/store';
import {
  clearEditorDirty,
  importDocument,
  persistCurrent,
  setTemplateThumbnail,
} from '@/store/modules/editor';
import { isOwnedTemplate } from '@/utils/templatesStorage';
import { getToken } from '@/utils/token';
import { buildProjectCoverTiles } from '@/utils/renderProjectThumbnail';
import { normalizeProjectThumbnailUrls } from '@/utils/projectThumb';
import {
  buildProjectDocumentPatch,
  deleteProjectDraft,
  deleteProjectDrafts,
  getProjectDraft,
  hashDocument,
  markProjectDraftSynced,
  putProjectDraft,
} from '@/components/editor/projectDraftStore';

const DEBOUNCE_MS = 800;
/** Coalesce rapid Ctrl/⌘+S into one flush. */
const MANUAL_SAVE_DEBOUNCE_MS = 300;
/** Delete / structural edits should hit the cloud ASAP (refresh must not restore old nodes). */
const FLUSH_NOW_EVENT = 'resume:flush-project';

/** Latest in-flight / queued editor flush — Home awaits this before re-listing projects. */
let flushChain: Promise<void> = Promise.resolve();
let flushRunner: ((opts?: FlushProjectOptions) => Promise<void>) | null = null;

export type FlushProjectOptions = {
  /**
   * Leave-editor / Home: always push document + regenerate auto cover,
   * even when Redux dirty is false or the local draft looks already synced.
   */
  force?: boolean;
};

/**
 * Force an immediate project sync (document + auto cover) and wait until it settles.
 * Safe to call from Home / leave-editor even when the hook is unmounted.
 */
export function flushCurrentProjectNow(opts?: FlushProjectOptions): Promise<void> {
  const run = flushRunner;
  if (!run) return flushChain;
  const next = flushChain.then(() => run(opts));
  // Keep the queue alive even if one pass fails.
  flushChain = next.catch(() => {});
  return next.then(() => undefined);
}

/** Multi-tab / stale client lost the race — server document is newer. */
export class ProjectRevisionConflictError extends Error {
  projectId: string;
  revision: number;
  updatedAt: number;

  constructor(opts: { projectId: string; revision: number; updatedAt?: number }) {
    super('project_revision_conflict');
    this.name = 'ProjectRevisionConflictError';
    this.projectId = opts.projectId;
    this.revision = opts.revision;
    this.updatedAt = opts.updatedAt || 0;
  }
}

function asConflict(err: unknown): ProjectRevisionConflictError | null {
  if (!axios.isAxiosError(err)) return null;
  const ax = err as AxiosError<{ detail?: unknown }>;
  if (ax.response?.status !== 412) return null;
  const detail = ax.response.data?.detail;
  const row =
    detail && typeof detail === 'object'
      ? (detail as Record<string, unknown>)
      : null;
  const revision = Number(row?.revision);
  return new ProjectRevisionConflictError({
    projectId: String(row?.id || ''),
    revision: Number.isFinite(revision) && revision >= 1 ? revision : 0,
    updatedAt: Number(row?.updatedAt) || 0,
  });
}

async function withProjectConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const conflict = asConflict(err);
    if (conflict) throw conflict;
    throw err;
  }
}

type ThumbUpload = {
  thumbnailDataUrl?: string;
  thumbnailDataUrls?: string[];
  thumbnailUrls?: string[];
};

function thumbPayloadFromTiles(tiles: {
  dataUrls?: string[];
  urls?: string[];
}): ThumbUpload {
  if (tiles.urls?.length) return { thumbnailUrls: tiles.urls.slice(0, 4) };
  if (tiles.dataUrls?.length) {
    const dataUrls = tiles.dataUrls.slice(0, 4);
    return dataUrls.length === 1
      ? { thumbnailDataUrl: dataUrls[0], thumbnailDataUrls: dataUrls }
      : { thumbnailDataUrls: dataUrls };
  }
  return {};
}

function applyThumbUpload(
  data: { thumbnailDataUrl?: string | null; thumbnailDataUrls?: string[] | null; thumbnailUrls?: string[] | null },
  thumb: ThumbUpload
) {
  if (thumb.thumbnailUrls?.length) data.thumbnailUrls = thumb.thumbnailUrls;
  if (thumb.thumbnailDataUrls?.length) data.thumbnailDataUrls = thumb.thumbnailDataUrls;
  if (thumb.thumbnailDataUrl) data.thumbnailDataUrl = thumb.thumbnailDataUrl;
}

function ackThumbnail(url: string | string[] | null | undefined, version?: number): string | string[] | null {
  const list = normalizeProjectThumbnailUrls(url, version);
  if (!list.length) return null;
  return list.length === 1 ? list[0] : list;
}

/** Push one owned project to the API (no-op when logged out). */
export async function pushProjectToCloud(payload: {
  id: string;
  name: string;
  document: unknown;
  thumb?: ThumbUpload;
  baseRevision?: number | null;
}): Promise<{ revision: number; thumbnailUrl?: string | string[] | null } | undefined> {
  if (!getToken()) return undefined;
  if (!payload.id || !payload.document) return undefined;
  const base =
    payload.baseRevision != null && Number.isFinite(Number(payload.baseRevision))
      ? Math.max(1, Math.floor(Number(payload.baseRevision)))
      : null;
  const data: Parameters<typeof upsertProjectApi>[0] = {
    id: payload.id,
    name: payload.name || 'Untitled',
    document: payload.document as Record<string, unknown>,
    // Auto cover always uploads; clears a stuck thumbnailCustom lock on the server.
    thumbnailCustom: false,
  };
  if (payload.thumb) applyThumbUpload(data, payload.thumb);
  if (base != null) data.baseRevision = base;
  if (import.meta.env.DEV) {
    console.info('[project-sync] PUT thumb', {
      id: payload.id,
      urls: payload.thumb?.thumbnailUrls?.length || 0,
      dataUrls: payload.thumb?.thumbnailDataUrls?.length || 0,
    });
  }
  const res = await withProjectConflict(() =>
    upsertProjectApi(
      data,
      base != null ? { 'If-Match': `"${base}"` } : undefined
    )
  );
  const revision = Number(res?.project?.revision);
  if (!(Number.isFinite(revision) && revision >= 1)) return undefined;
  if (import.meta.env.DEV) {
    console.info('[project-sync] PUT ack', {
      id: payload.id,
      revision,
      thumbnailUrl: res?.project?.thumbnailUrl,
      thumbnailCustom: res?.project?.thumbnailCustom,
    });
  }
  return {
    revision,
    thumbnailUrl: res?.project?.thumbnailUrl ?? null,
  };
}

/** Incremental node patch — requires a known baseRevision. */
export async function patchProjectToCloud(payload: {
  id: string;
  name: string;
  baseRevision: number;
  patch: NonNullable<ReturnType<typeof buildProjectDocumentPatch>>['patch'];
  thumb?: ThumbUpload;
}): Promise<{ revision: number; thumbnailUrl?: string | string[] | null } | undefined> {
  if (!getToken()) return undefined;
  if (!payload.id || !(payload.baseRevision >= 1)) return undefined;
  const base = Math.max(1, Math.floor(Number(payload.baseRevision)));
  const data: Parameters<typeof patchProjectApi>[1] = {
    baseRevision: base,
    name: payload.name || 'Untitled',
    thumbnailCustom: false,
  };
  if (payload.thumb) applyThumbUpload(data, payload.thumb);
  if (payload.patch.upsertNodes) {
    data.upsertNodes = payload.patch.upsertNodes as Record<string, unknown>;
  }
  if (payload.patch.removeNodeIds) data.removeNodeIds = payload.patch.removeNodeIds;
  if (payload.patch.pageChildren) data.pageChildren = payload.patch.pageChildren;
  if (payload.patch.frames) data.frames = payload.patch.frames;
  if (payload.patch.activeFrameId !== undefined) {
    data.activeFrameId = payload.patch.activeFrameId;
  }
  if (payload.patch.canvas) data.canvas = payload.patch.canvas;
  if (import.meta.env.DEV) {
    console.info('[project-sync] PATCH thumb', {
      id: payload.id,
      hasThumb: Boolean(thumb),
      thumbBytes: thumb ? Math.round(thumb.length / 1024) : 0,
    });
  }
  const res = await withProjectConflict(() =>
    patchProjectApi(payload.id, data, {
      'If-Match': `"${base}"`,
    })
  );
  const revision = Number(res?.project?.revision);
  if (!(Number.isFinite(revision) && revision >= 1)) return undefined;
  if (import.meta.env.DEV) {
    console.info('[project-sync] PATCH ack', {
      id: payload.id,
      revision,
      thumbnailUrl: res?.project?.thumbnailUrl,
      thumbnailCustom: res?.project?.thumbnailCustom,
    });
  }
  return {
    revision,
    thumbnailUrl: res?.project?.thumbnailUrl ?? null,
  };
}

export async function removeProjectFromCloud(id: string): Promise<void> {
  if (!id) return;
  await deleteProjectDraft(id);
  if (!getToken()) return;
  try {
    await deleteProjectApi(id);
  } catch {
    /* ignore — local delete still proceeds */
  }
}

/** Batch remove owned projects from the API (no-op when logged out). */
export async function removeProjectsFromCloud(ids: string[]): Promise<void> {
  const list = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!list.length) return;
  await deleteProjectDrafts(list);
  if (!getToken()) return;
  await deleteProjectsApi(list);
}

/** Ask the open editor to flush the project to the cloud immediately. */
export function requestProjectFlush() {
  try {
    window.dispatchEvent(new CustomEvent(FLUSH_NOW_EVENT));
  } catch {
    /* ignore */
  }
  void flushCurrentProjectNow();
}

/** Rename an owned project on the API (home grid / offline-safe local first). */
export async function renameProjectOnCloud(id: string, name: string): Promise<void> {
  const projectId = String(id || '').trim();
  const nextName = String(name || '').trim() || 'Untitled';
  if (!projectId) return;

  const draft = await getProjectDraft(projectId);
  if (draft?.document) {
    await putProjectDraft({
      projectId,
      name: nextName,
      document: draft.document,
      updatedAt: Date.now(),
      keepSyncedAt: true,
      keepCloudRevision: true,
      keepBaseDocument: true,
    });
  }

  if (!getToken()) return;

  const rev =
    draft?.cloudRevision != null && Number(draft.cloudRevision) >= 1
      ? Number(draft.cloudRevision)
      : null;
  if (rev != null && draft?.document) {
    try {
      const acked = await patchProjectToCloud({
        id: projectId,
        name: nextName,
        baseRevision: rev,
        patch: {},
      });
      await markProjectDraftSynced(
        projectId,
        hashDocument(draft.document),
        acked?.revision ?? rev
      );
      return;
    } catch (err) {
      if (!(err instanceof ProjectRevisionConflictError)) {
        /* fall through to full fetch + put */
      }
    }
  }

  try {
    const res = await fetchProject(projectId);
    const proj = res.project;
    if (!proj?.document) return;
    const existingUrls = normalizeProjectThumbnailUrls(proj.thumbnailUrl);
    const acked = await pushProjectToCloud({
      id: projectId,
      name: nextName,
      document: proj.document,
      thumb: existingUrls.length ? { thumbnailUrls: existingUrls } : undefined,
      baseRevision: Number(proj.revision) >= 1 ? Number(proj.revision) : null,
    });
    await putProjectDraft({
      projectId,
      name: nextName,
      document: proj.document,
      updatedAt: Date.now(),
      syncedAt: Date.now(),
      cloudRevision: acked?.revision ?? Number(proj.revision) ?? null,
      baseDocument: proj.document,
    });
  } catch {
    /* local rename already applied — stay pending for next sync */
  }
}

/** On 412: adopt cloud document so this tab does not overwrite a newer revision. */
async function adoptCloudOnConflict(
  dispatch: ReturnType<typeof useDispatch>,
  projectId: string,
  fallbackName: string
): Promise<boolean> {
  try {
    const res = await fetchProject(projectId);
    const proj = res.project;
    if (!proj?.document) return false;
    const revision = Number(proj.revision);
    dispatch(
      importDocument({
        id: proj.id || projectId,
        name: proj.name || fallbackName,
        document: proj.document,
        source: 'user',
      })
    );
    await putProjectDraft({
      projectId: proj.id || projectId,
      name: proj.name || fallbackName,
      document: proj.document,
      updatedAt: Number(proj.updatedAt) || Date.now(),
      syncedAt: Date.now(),
      cloudRevision: Number.isFinite(revision) && revision >= 1 ? revision : null,
      baseDocument: proj.document,
    });
    dispatch(clearEditorDirty());
    return true;
  } catch {
    return false;
  }
}

/** Editor: debounce local draft + cloud upsert while editing. */
export function useProjectCloudSync() {
  const dispatch = useDispatch();
  const dirty = useSelector((s: any) => Boolean(s.editor.dirty));
  const document = useSelector((s: any) => s.editor.document);
  const currentId = useSelector((s: any) => s.editor.currentId as string | null);
  const template = useSelector((s: any) =>
    s.editor.templates.find((t: any) => t.id === s.editor.currentId)
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const flushRef = useRef<(opts?: FlushProjectOptions) => Promise<void>>(async () => {});
  const latestRef = useRef({ document, currentId, template, dirty });
  latestRef.current = { document, currentId, template, dirty };

  const scheduleFlush = useCallback((delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushCurrentProjectNow();
    }, delayMs);
  }, []);

  const flush = useCallback(async (opts?: FlushProjectOptions) => {
    // Read Redux directly — requestProjectFlush may fire before this hook re-renders,
    // so latestRef can still hold the pre-delete document.
    const force = Boolean(opts?.force);
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
    if ((!isDirty && !force) || !doc || !id || !tpl) return;
    if (id.startsWith('share_')) return;
    if (!isOwnedTemplate(tpl)) return;
    if (flushingRef.current) return;
    flushingRef.current = true;

    try {
      // Snapshot into the in-memory library entry, but keep dirty until cloud ACK
      // (or until local draft is enough when logged out).
      dispatch(persistCurrent({ keepDirty: true }));
      const pushedDoc = (store.getState().editor as { document: unknown }).document;
      const name = String(tpl.name || 'Untitled');
      const contentHash = hashDocument(pushedDoc);

      // 1) Local persistenceKey draft first ( durable before cloud).
      const draft = await putProjectDraft({
        projectId: id,
        name,
        document: pushedDoc,
        updatedAt: Date.now(),
        keepSyncedAt: true,
        keepCloudRevision: true,
        keepBaseDocument: true,
      });

      // Logged out: local draft is enough — clear dirty.
      if (!getToken()) {
        const after = store.getState().editor as { document: unknown };
        if (after.document === pushedDoc) dispatch(clearEditorDirty());
        return;
      }

      // Skip cloud when content + name already ACKed — unless leave-force (refresh cover).
      if (
        !force &&
        draft?.syncedAt &&
        draft.contentHash === contentHash &&
        String(draft.name || '') === name
      ) {
        const after = store.getState().editor as { document: unknown };
        if (after.document === pushedDoc) dispatch(clearEditorDirty());
        return;
      }

      let thumb: ThumbUpload = {};
      try {
        // Up to 4 per-element snapshots (never skip for thumbnailCustom).
        const tiles = await buildProjectCoverTiles(pushedDoc);
        thumb = thumbPayloadFromTiles(tiles);
        const localPreview =
          tiles.urls?.length
            ? tiles.urls
            : tiles.dataUrls?.length
              ? tiles.dataUrls
              : null;
        if (import.meta.env.DEV) {
          console.info('[project-sync] cover tiles', {
            id,
            urls: tiles.urls?.length || 0,
            dataUrls: tiles.dataUrls?.length || 0,
          });
        }
        if (localPreview) {
          dispatch(
            setTemplateThumbnail({
              id,
              thumbnail: localPreview.length === 1 ? localPreview[0] : localPreview,
              custom: false,
            })
          );
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[project-sync] cover tiles failed', err);
        /* thumb is best-effort — still upload the document */
      }

      const baseRevision =
        draft?.cloudRevision != null && Number(draft.cloudRevision) >= 1
          ? Number(draft.cloudRevision)
          : null;
      const baseDoc = draft?.baseDocument ?? null;
      const delta =
        baseDoc && baseRevision != null
          ? buildProjectDocumentPatch(baseDoc, pushedDoc)
          : null;

      try {
        let acked:
          | { revision: number; thumbnailUrl?: string | string[] | null }
          | undefined;
        if (delta && !delta.preferFull && baseRevision != null) {
          // 2a) Incremental node PATCH when the delta is small enough.
          try {
            acked = await patchProjectToCloud({
              id,
              name,
              baseRevision,
              patch: delta.patch,
              thumb,
            });
          } catch (err) {
            // Revision conflict must surface; any other patch failure → full PUT.
            if (err instanceof ProjectRevisionConflictError) throw err;
            acked = await pushProjectToCloud({
              id,
              name,
              document: pushedDoc,
              thumb,
              baseRevision,
            });
          }
        } else {
          // 2b) Full-document PUT (create, large delta, missing base, or untracked fields).
          acked = await pushProjectToCloud({
            id,
            name,
            document: pushedDoc,
            thumb,
            baseRevision,
          });
        }
        const nextThumb = ackThumbnail(acked?.thumbnailUrl, acked?.revision ?? Date.now());
        // Always mirror server cover URL into the card (source of truth after ACK).
        if (nextThumb) {
          dispatch(
            setTemplateThumbnail({
              id,
              thumbnail: nextThumb,
              custom: false,
            })
          );
        }
        await markProjectDraftSynced(id, contentHash, acked?.revision ?? null);
        // Another edit landed while uploading — leave dirty so the next flush runs.
        const after = store.getState().editor as { document: unknown };
        if (after.document === pushedDoc) {
          dispatch(clearEditorDirty());
        }
      } catch (err) {
        if (err instanceof ProjectRevisionConflictError) {
          // If our unsynced local draft is newer than the conflicting cloud row,
          // force a full PUT (no If-Match) instead of adopting and wiping edits.
          const local = await getProjectDraft(id).catch(() => null);
          const localNewer =
            Boolean(local?.document) &&
            !local?.syncedAt &&
            Number(local?.updatedAt || 0) > Number(err.updatedAt || 0);
          if (localNewer) {
            try {
              const acked = await pushProjectToCloud({
                id,
                name,
                document: pushedDoc,
                thumb,
                baseRevision: null,
              });
              const nextThumb = ackThumbnail(
                acked?.thumbnailUrl,
                acked?.revision ?? Date.now()
              );
              if (nextThumb) {
                dispatch(
                  setTemplateThumbnail({
                    id,
                    thumbnail: nextThumb,
                    custom: false,
                  })
                );
              }
              await markProjectDraftSynced(id, contentHash, acked?.revision ?? null);
              const after = store.getState().editor as { document: unknown };
              if (after.document === pushedDoc) dispatch(clearEditorDirty());
            } catch {
              /* stay dirty for retry */
            }
          } else {
            await adoptCloudOnConflict(dispatch, id, name);
          }
        }
        // Stay dirty so the next debounce / tab-hide / delete flush retries
        // (unless adopt / force-put cleared dirty). Local draft already holds bytes.
      }
    } finally {
      flushingRef.current = false;
      const still = store.getState().editor as { dirty: boolean; currentId: string | null };
      if (still.dirty && still.currentId === id) {
        scheduleFlush(DEBOUNCE_MS);
      }
    }
  }, [dispatch, scheduleFlush]);

  flushRef.current = flush;
  flushRunner = flush;

  useEffect(() => {
    if (!dirty || !document || !currentId || !template) return;
    if (String(currentId).startsWith('share_')) return;
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
      if (manualSaveTimerRef.current) clearTimeout(manualSaveTimerRef.current);
      manualSaveTimerRef.current = null;
      void flushCurrentProjectNow();
    };
    window.addEventListener(FLUSH_NOW_EVENT, onFlushNow);
    return () => window.removeEventListener(FLUSH_NOW_EVENT, onFlushNow);
  }, [flush]);

  // Ctrl/⌘+S — manual save (debounced so key-repeat / rapid presses don't spam).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (manualSaveTimerRef.current) clearTimeout(manualSaveTimerRef.current);
      manualSaveTimerRef.current = setTimeout(() => {
        manualSaveTimerRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        void flushCurrentProjectNow({ force: true });
      }, MANUAL_SAVE_DEBOUNCE_MS);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (manualSaveTimerRef.current) clearTimeout(manualSaveTimerRef.current);
      manualSaveTimerRef.current = null;
    };
  }, []);

  // Flush when tab hides (if dirty); unmount always force-saves doc + cover.
  useEffect(() => {
    const onHide = () => {
      if (!latestRef.current.dirty) return;
      void flushCurrentProjectNow();
    };
    const onVisibility = () => {
      if (window.document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    window.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.document.removeEventListener('visibilitychange', onVisibility);
      void flushCurrentProjectNow({ force: true });
    };
  }, [flush]);
}
