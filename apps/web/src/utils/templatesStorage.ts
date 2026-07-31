/**
 * Ownership / listing rules:
 * - `user` / `import` → show in Projects (mine / assets) — cloud-backed
 * - `case` → opened from plaza / inspiration / liked (session, memory only)
 * - `scratch` → blank / agent new canvas (session, memory only)
 *
 * First real edit claims `case` | `scratch` → `user` and then it syncs to Projects API.
 * Project library list is NOT in localStorage; per-project drafts use IndexedDB
 * (`projectPersistenceKey` / projectDraftStore).
 */
export type TemplateSource = 'user' | 'import' | 'case' | 'scratch';

/** Listed under Projects / Me assets — not mere open sessions. */
export function isOwnedTemplate(item: { source?: string } | null | undefined) {
  return Boolean(item && (item.source === 'user' || item.source === 'import'));
}

/** Temporary open that should not appear in Projects until claimed. */
export function isSessionTemplate(item: { source?: string } | null | undefined) {
  return Boolean(item && (item.source === 'case' || item.source === 'scratch'));
}

/** Always empty — projects come from GET /api/v1/projects. */
export function loadTemplates() {
  return [] as any[];
}

/** No-op — do not write project library to disk. */
export function saveTemplates(_templates?: unknown) {}
