/** Local custom LLM provider prefs (OpenAI-compatible). Stored in this browser. */

import type { LlmModel, ModelReferenceType } from '@/apis/chat';

/** User-facing model category when adding a custom provider (no image — not billed / not wired). */
export type CustomModelKind = 'text' | 'vision';

export type CustomLlmProvider = {
  id: string;
  name: string;
  website: string;
  apiKey: string;
  baseUrl: string;
  /** text | vision(multimodal). Legacy ``image`` is normalized to text. */
  modelKind: CustomModelKind;
  createdAt: number;
};

const STORAGE_KEY = 'resume.customLlmProviders.v1';
export const CUSTOM_MODEL_ID_PREFIX = 'custom:';

export function isCustomModelId(id: string | null | undefined): boolean {
  return Boolean(id && String(id).startsWith(CUSTOM_MODEL_ID_PREFIX));
}

function normalizeModelKind(raw: unknown): CustomModelKind {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  // Former ``image`` option removed — third-party image gen is unsupported / unbilled.
  if (v === 'vision' || v === 'multimodal' || v === 'multi') return 'vision';
  return 'text';
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
        modelKind: normalizeModelKind(p.modelKind ?? p.kind),
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

function referenceTypesFor(kind: CustomModelKind): ModelReferenceType[] {
  if (kind === 'vision') return ['text', 'vision'];
  return ['text'];
}

/** Map saved providers → entries for the model picker / route prefs. */
export function customProvidersAsModels(
  providers: CustomLlmProvider[] = loadCustomLlmProviders()
): LlmModel[] {
  return providers.map((p) => {
    const modelKind = normalizeModelKind(p.modelKind);
    const isVision = modelKind === 'vision';
    return {
      id: `${CUSTOM_MODEL_ID_PREFIX}${p.id}`,
      label: p.name || 'Custom',
      provider: 'custom',
      kind: 'text' as const,
      referenceTypes: referenceTypesFor(modelKind),
      maxAttachments: isVision ? 16 : 8,
      description: undefined,
      // Not on platform wallet — cost chip / credit estimate stay empty.
      price: null,
    };
  });
}
