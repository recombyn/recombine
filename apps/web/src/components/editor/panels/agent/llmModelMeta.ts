/**
 * LLM catalog helpers for Agent UI (not HTTP — lives next to model pickers).
 */

import type { LlmModel, ModelReferenceType } from '@/apis/chat';

export function modelReferenceTypes(
  model?: Pick<
    LlmModel,
    'id' | 'kind' | 'referenceTypes' | 'reference_types' | 'maxAttachments' | 'max_attachments'
  > | null
): ModelReferenceType[] {
  if (!model) return [];
  const raw = model.referenceTypes ?? model.reference_types;
  if (Array.isArray(raw) && raw.length) {
    const out: ModelReferenceType[] = [];
    for (const t of raw) {
      if ((t === 'text' || t === 'vision' || t === 'image') && !out.includes(t)) out.push(t);
    }
    if (out.length) return out;
  }
  if (model.kind === 'image') return ['image'];
  if (modelSupportsVisionInput(model)) return ['text', 'vision'];
  return ['text'];
}

export function modelAllowsRouteSlot(
  model: Pick<
    LlmModel,
    'id' | 'kind' | 'referenceTypes' | 'reference_types' | 'maxAttachments' | 'max_attachments'
  > | null | undefined,
  slot: 'fast' | 'standard' | 'reasoning' | 'vision' | 'image'
): boolean {
  if (!model) return false;
  const types = modelReferenceTypes(model);
  if (slot === 'image') return types.includes('image') || model.kind === 'image';
  if (slot === 'vision') return types.includes('vision');
  return types.includes('text') || types.includes('vision');
}

export function isVolcanoCatalogModel(
  m?: Pick<LlmModel, 'provider' | 'enabled'> | null
): boolean {
  if (!m) return false;
  if (m.enabled === false) return false;
  return (m.provider || '').toLowerCase() !== 'deepseek';
}

export function maxAttachmentsFor(
  model?: Pick<LlmModel, 'kind' | 'maxAttachments' | 'max_attachments'> | null
): number {
  const raw = model?.maxAttachments ?? model?.max_attachments;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (model?.kind === 'image') return 14;
  return 5;
}

/**
 * Composer attach ceiling (Dock + Home share this).
 * Image mode → current image model; Agent/Ask → routed image model.
 */
export function agentAttachmentLimit(opts: {
  models: LlmModel[];
  modelId: string;
  isImageMode: boolean;
  rules?: Record<string, string> | null;
  routedImageId?: string | null;
  freeImageId?: string;
  autoModel?: LlmModel | null;
}): number {
  const {
    models,
    modelId,
    isImageMode,
    rules,
    routedImageId,
    freeImageId = 'doubao-seedream-5-0-lite',
    autoModel = null,
  } = opts;
  const images = models.filter(
    (m) => m.kind === 'image' || /seedream|t2i|i2i/i.test(m.id)
  );
  const pickImage = () =>
    images.find((m) => m.id === modelId) ||
    images.find((m) => m.id === freeImageId) ||
    images.find((m) => /seedream/i.test(m.id)) ||
    images[0];

  if (isImageMode) return maxAttachmentsFor(pickImage());

  const want =
    String(routedImageId || '').trim() ||
    String(rules?.['assets.image_default_model'] || '').trim() ||
    freeImageId;
  const routed =
    images.find((m) => m.id === want) || pickImage();
  const imageLimit = maxAttachmentsFor(routed);
  if (modelId === 'auto' || !modelId) return imageLimit;
  const chat = models.find((m) => m.id === modelId) || autoModel;
  if (!chat || chat.id === 'auto') return imageLimit;
  return Math.min(maxAttachmentsFor(chat), imageLimit);
}

export function modelSupportsVisionInput(
  model?: Pick<
    LlmModel,
    'id' | 'kind' | 'referenceTypes' | 'reference_types' | 'maxAttachments' | 'max_attachments'
  > | null
): boolean {
  if (!model || model.kind === 'image') return false;
  const tagged = model.referenceTypes ?? model.reference_types;
  if (Array.isArray(tagged) && tagged.length) {
    return tagged.includes('vision');
  }
  const id = String(model.id || '').toLowerCase();
  if (!id || id === 'auto' || id.includes('seedream')) return false;
  if (
    id.includes('seed-2-1') ||
    id.includes('seed-2.1') ||
    id.includes('vision') ||
    /(^|[-_])vl([-_]|$)/.test(id)
  ) {
    return true;
  }
  return maxAttachmentsFor(model) >= 16;
}

export function modelIsImageGenerator(
  model?: Pick<LlmModel, 'kind' | 'id'> | null
): boolean {
  if (!model) return false;
  if (model.kind === 'image') return true;
  const id = (model.id || '').toLowerCase();
  return /seedream|t2i|i2i/.test(id);
}
