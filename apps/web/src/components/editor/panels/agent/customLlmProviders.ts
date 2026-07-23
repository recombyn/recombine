/** Local custom LLM provider prefs (OpenAI-compatible). Stored in this browser. */

export type CustomLlmProvider = {
  id: string;
  name: string;
  website: string;
  apiKey: string;
  baseUrl: string;
  createdAt: number;
};

const STORAGE_KEY = 'resume.customLlmProviders.v1';
export const CUSTOM_MODEL_ID_PREFIX = 'custom:';

export function isCustomModelId(id: string | null | undefined): boolean {
  return Boolean(id && String(id).startsWith(CUSTOM_MODEL_ID_PREFIX));
}

export function loadCustomLlmProviders(): CustomLlmProvider[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === 'object' && typeof p.id === 'string')
      .map((p) => ({
        id: String(p.id),
        name: String(p.name || ''),
        website: String(p.website || ''),
        apiKey: String(p.apiKey || ''),
        baseUrl: String(p.baseUrl || '').replace(/\/+$/, ''),
        createdAt: Number(p.createdAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

export function saveCustomLlmProviders(list: CustomLlmProvider[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function createCustomLlmProviderId() {
  return `prov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Map saved providers → entries for the model picker (design / Agent tab). */
export function customProvidersAsModels(
  providers: CustomLlmProvider[] = loadCustomLlmProviders()
): Array<{
  id: string;
  label: string;
  provider: string;
  kind: 'text';
  maxAttachments: number;
}> {
  return providers.map((p) => ({
    id: `${CUSTOM_MODEL_ID_PREFIX}${p.id}`,
    label: p.name || 'Custom',
    provider: 'custom',
    kind: 'text' as const,
    maxAttachments: 5,
  }));
}
