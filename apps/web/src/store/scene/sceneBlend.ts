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
  { id: 'pass-through', label: '穿透' },
  { id: 'normal', label: '正常' },
  { id: 'darken', label: '变暗' },
  { id: 'multiply', label: '正片叠底' },
  { id: 'color-burn', label: '颜色加深' },
  { id: 'lighten', label: '变亮' },
  { id: 'screen', label: '滤色' },
  { id: 'color-dodge', label: '颜色减淡' },
  { id: 'overlay', label: '叠加' },
  { id: 'soft-light', label: '柔光' },
  { id: 'hard-light', label: '强光' },
  { id: 'difference', label: '差值' },
  { id: 'exclusion', label: '排除' },
  { id: 'hue', label: '色相' },
  { id: 'saturation', label: '饱和度' },
  { id: 'color', label: '颜色' },
  { id: 'luminosity', label: '明度' },
];

const BLEND_MODE_SET = new Set(BLEND_MODE_OPTIONS.map((o) => o.id));

export function parseBlendMode(raw: unknown): BlendModeId {
  const s = String(raw || '').trim().toLowerCase();
  if (BLEND_MODE_SET.has(s as BlendModeId)) return s as BlendModeId;
  if (s === 'passthrough' || s === 'pass_through') return 'pass-through';
  return 'pass-through';
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
