export function boolEffectAttr(v: unknown, fallback: boolean) {
  if (v == null) return fallback;
  return v === true || v === 'true';
}

export function normalizeColor(color: unknown) {
  if (!color || typeof color !== 'string') return '#333333';
  const trimmed = color.trim();
  const cssVarMatch = trimmed.match(/rgb\(var\((--[\w-]+)\)\)/i);
  const CSS_VAR_COLORS: Record<string, string> = {
    '--orange-6': '#FF7D00',
    '--red-6': '#F53F3F',
    '--blue-6': '#165DFF',
  };
  if (cssVarMatch && CSS_VAR_COLORS[cssVarMatch[1]]) return CSS_VAR_COLORS[cssVarMatch[1]];
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  return trimmed;
}

export function hexWithOpacity(hex: string, opacityPct: number) {
  const normalized = normalizeColor(hex);
  const pct = Math.min(100, Math.max(0, opacityPct));
  if (pct >= 100) return normalized;
  const raw = normalized.replace('#', '');
  if (raw.length !== 6) return normalized;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${pct / 100})`;
}

export function resolveFillColor(node: any, fallback = '#FFFFFF') {
  const attrs = node?.attrs || {};
  if (!boolEffectAttr(attrs['fill-enabled'], true)) return 'rgba(0,0,0,0)';
  const fill = attrs['fill-color'] ?? fallback;
  if (fill === 'transparent') return 'rgba(0,0,0,0)';
  const opacity = Number(attrs['fill-opacity'] ?? 100);
  if (!boolEffectAttr(attrs['fill-visible'], true)) return 'rgba(0,0,0,0)';
  return hexWithOpacity(fill, opacity);
}

export function resolveStroke(node: any, fallback = '#333333') {
  const attrs = node?.attrs || {};
  if (!boolEffectAttr(attrs['stroke-enabled'], true) || !boolEffectAttr(attrs['stroke-visible'], true)) {
    return { stroke: 'transparent', strokeWidth: 0 };
  }
  const stroke = normalizeColor(attrs['border-color'] || attrs.stroke || fallback);
  const opacity = Number(attrs['stroke-opacity'] ?? 100);
  const color = hexWithOpacity(stroke, opacity);
  const rawW = attrs['border-width'] ?? attrs.strokeWidth;
  const strokeWidth = Math.max(0, Number(rawW == null ? 1 : rawW));
  return { stroke: color, strokeWidth };
}

export type StrokeAlign = 'center' | 'inside' | 'outside';
export type StrokeLinecap = 'butt' | 'round' | 'square';
export type StrokeLinejoin = 'miter' | 'round' | 'bevel';

export function resolveStrokeAlign(attrs: Record<string, unknown> | null | undefined): StrokeAlign {
  const v = String(attrs?.strokeAlign || attrs?.['stroke-align'] || 'center');
  if (v === 'inside' || v === 'outside' || v === 'center') return v;
  return 'center';
}

export function resolveStrokeLinecap(attrs: Record<string, unknown> | null | undefined): StrokeLinecap {
  const v = String(attrs?.strokeLinecap || attrs?.['stroke-linecap'] || 'butt');
  if (v === 'butt' || v === 'round' || v === 'square') return v;
  return 'butt';
}

export function resolveStrokeLinejoin(attrs: Record<string, unknown> | null | undefined): StrokeLinejoin {
  const v = String(attrs?.strokeLinejoin || attrs?.['stroke-linejoin'] || 'miter');
  if (v === 'miter' || v === 'round' || v === 'bevel') return v;
  return 'miter';
}

export type ShadowSpec = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
} | null;

export function resolveShadow(node: any): ShadowSpec {
  const attrs = node?.attrs || {};
  if (!boolEffectAttr(attrs['shadow-enabled'], false) || !boolEffectAttr(attrs['shadow-visible'], true)) {
    return null;
  }
  return {
    color: String(attrs['shadow-color'] || 'rgba(0,0,0,0.25)'),
    blur: Math.max(0, Number(attrs['shadow-blur'] ?? 4)),
    offsetX: Number(attrs['shadow-x'] ?? 0),
    offsetY: Number(attrs['shadow-y'] ?? 2),
  };
}
