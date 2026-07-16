const STORAGE_KEY = 'resume-scene-templates-v1';

export type TemplateSource = 'user' | 'import' | 'case';

/** Normalize legacy localStorage items (no source / openedAt). */
export function normalizeTemplate(item: any) {
  if (!item || typeof item !== 'object' || !item.id) return null;
  const updatedAt = Number(item.updatedAt) || Date.now();
  const source: TemplateSource =
    item.source === 'case' || item.source === 'import' || item.source === 'user'
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

export function isOwnedTemplate(item: { source?: string } | null | undefined) {
  return Boolean(item && item.source !== 'case');
}

export function loadTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTemplate).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveTemplates(templates: unknown) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
