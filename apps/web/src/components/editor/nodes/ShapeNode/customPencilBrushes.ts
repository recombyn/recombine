import {
  makeCustomStampBrush,
  setCustomPencilBrushes,
  type PencilBrushDef,
} from '@/components/editor/nodes/ShapeNode/pencilBrushes';
import { preloadStampSrc } from '@/components/editor/nodes/ShapeNode/stampTint';

const STORAGE_KEY = 'recombine-custom-pencil-brushes-v1';
const MAX_CUSTOM = 24;
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;

type StoredBrush = {
  id: string;
  label: string;
  stampSrc: string;
  sizeFactor?: number;
  spacingFactor?: number;
  createdAt?: number;
};

function safeParse(raw: string | null): StoredBrush[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b) => b && typeof b.id === 'string' && typeof b.stampSrc === 'string' && b.stampSrc.startsWith('data:')
    );
  } catch {
    return [];
  }
}

function toDefs(list: StoredBrush[]): PencilBrushDef[] {
  return list.map((b) =>
    makeCustomStampBrush({
      id: b.id,
      label: b.label || '自定义画笔',
      stampSrc: b.stampSrc,
      sizeFactor: b.sizeFactor,
      spacingFactor: b.spacingFactor,
    })
  );
}

function persist(list: StoredBrush[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_CUSTOM)));
  const defs = toDefs(list);
  setCustomPencilBrushes(defs);
  defs.forEach((d) => {
    if (d.stampSrc) preloadStampSrc(d.stampSrc);
  });
  return defs;
}

/** Load custom brushes from localStorage into the runtime registry. */
export function hydrateCustomPencilBrushes(): PencilBrushDef[] {
  const list = safeParse(localStorage.getItem(STORAGE_KEY));
  return persist(list);
}

export function listStoredCustomBrushes(): StoredBrush[] {
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

export function addCustomPencilBrush(brush: PencilBrushDef): PencilBrushDef[] {
  const prev = listStoredCustomBrushes().filter((b) => b.id !== brush.id);
  const next: StoredBrush[] = [
    {
      id: brush.id,
      label: brush.label,
      stampSrc: String(brush.stampSrc || ''),
      sizeFactor: brush.sizeFactor,
      spacingFactor: brush.spacingFactor,
      createdAt: Date.now(),
    },
    ...prev,
  ].slice(0, MAX_CUSTOM);
  return persist(next);
}

export function removeCustomPencilBrush(id: string): PencilBrushDef[] {
  const next = listStoredCustomBrushes().filter((b) => b.id !== id);
  return persist(next);
}

export function readBrushImageFile(file: File): Promise<{ dataUrl: string; name: string }> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件（PNG / JPG / SVG / WebP）'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error('图片请小于 1.5MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) {
        reject(new Error('无法读取该图片'));
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, '') || '自定义画笔';
      resolve({ dataUrl, name: name.slice(0, 24) });
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

// Hydrate as early as this module is imported (browser only).
if (typeof window !== 'undefined') {
  try {
    hydrateCustomPencilBrushes();
  } catch {
    /* ignore */
  }
}
