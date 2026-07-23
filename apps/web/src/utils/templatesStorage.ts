/**
 * Ownership / listing rules:
 * - `user` / `import` → show in Projects (mine / assets) — cloud-backed only
 * - `case` → opened from plaza / inspiration / liked (session, memory only)
 * - `scratch` → blank / agent new canvas (session, memory only)
 *
 * First real edit claims `case` | `scratch` → `user` and then it syncs to Projects API.
 * Project library is NOT persisted in localStorage.
 */
export type TemplateSource = 'user' | 'import' | 'case' | 'scratch';

/** Normalize items (no source / openedAt). */
export function normalizeTemplate(item: any) {
  if (!item || typeof item !== 'object' || !item.id) return null;
  const updatedAt = Number(item.updatedAt) || Date.now();
  const source: TemplateSource =
    item.source === 'case' ||
    item.source === 'import' ||
    item.source === 'user' ||
    item.source === 'scratch'
      ? item.source
      : 'user';
  return {
    ...item,
    name: item.name || '未命名模板',
    updatedAt,
    openedAt: Number(item.openedAt) || updatedAt,
    source,
    ...(item.originCaseId ? { originCaseId: String(item.originCaseId) } : {}),
  };
}

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

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
