/** Layer blend modes (Figma / CSS mix-blend-mode). */

export type BlendModeId =
  | 'pass-through'
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type BlendModeOption = {
  id: BlendModeId;
  label: string;
  groupStart?: boolean;
};

export const BLEND_MODE_OPTIONS: BlendModeOption[] = [
  { id: 'pass-through' },
  { id: 'normal' },
  { id: 'darken' },
  { id: 'multiply' },
  { id: 'color-burn' },
  { id: 'lighten' },
  { id: 'screen' },
  { id: 'color-dodge' },
  { id: 'overlay' },
  { id: 'soft-light' },
  { id: 'hard-light' },
  { id: 'difference' },
  { id: 'exclusion' },
  { id: 'hue' },
  { id: 'saturation' },
  { id: 'color' },
  { id: 'luminosity' },
];

const BLEND_MODE_SET = new Set(BLEND_MODE_OPTIONS.map((o) => o.id));

export function parseBlendMode(raw: unknown, opts?: { allowPassThrough?: boolean }): BlendModeId {
  const s = String(raw || '').trim().toLowerCase();
  const normalized =
    s === 'passthrough' || s === 'pass_through' ? 'pass-through' : s;
  if (BLEND_MODE_SET.has(normalized as BlendModeId)) {
    const id = normalized as BlendModeId;
    if (id === 'pass-through' && !opts?.allowPassThrough) return 'normal';
    return id;
  }
  return 'normal';
}

export function blendModeLabel(id: BlendModeId): string {
  return BLEND_MODE_OPTIONS.find((o) => o.id === id)?.label || id;
}

export function blendModeToCss(id: BlendModeId): string {
  if (id === 'pass-through') return '';
  return id;
}

export function parseLayerOpacity(raw: unknown, fallback = 1): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

export function layerOpacityToPct(opacity01: number): number {
  return Math.round(Math.min(1, Math.max(0, opacity01)) * 100);
}
