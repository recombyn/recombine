import { A4_PORTRAIT } from '@/store/scene/sceneDocument';

/** Frame / artboard size presets (toolbar dropdown + tabs). */
export type FramePresetCategory = 'mobile' | 'tablet' | 'paper' | 'ratio' | 'web';

export type FrameSizePreset = {
  key: string;
  label: string;
  category: FramePresetCategory;
  /** Fixed pixel size when set (canonical portrait / listed orientation). */
  width?: number;
  height?: number;
  /** Aspect ratio w/h when set (applied against current width) */
  ratio?: number;
  icon: 'square' | 'portrait' | 'tall' | 'landscape' | 'wide' | 'doc' | 'web' | 'phone' | 'tablet';
};

/** Tab order: devices ? web ? paper last. */
export const FRAME_PRESET_TABS: { id: Exclude<FramePresetCategory, 'ratio'>; label: string }[] = [
  { id: 'mobile', label: '移动设备' },
  { id: 'tablet', label: '平板电脑' },
  { id: 'web', label: '网页' },
  { id: 'paper', label: '纸张' },
];

export const FRAME_SIZE_PRESETS: FrameSizePreset[] = [
  // Mobile
  { key: 'iphone-14-pro-max', label: 'iPhone 14 Pro Max', category: 'mobile', width: 430, height: 932, icon: 'phone' },
  { key: 'iphone-14-pro', label: 'iPhone 14 Pro', category: 'mobile', width: 393, height: 852, icon: 'phone' },
  { key: 'iphone-14-plus', label: 'iPhone 14 Plus / 13 Pro Max', category: 'mobile', width: 428, height: 926, icon: 'phone' },
  { key: 'iphone-14', label: 'iPhone 14 / 13 / 12', category: 'mobile', width: 390, height: 844, icon: 'phone' },
  { key: 'iphone-13-mini', label: 'iPhone 13 mini', category: 'mobile', width: 375, height: 812, icon: 'phone' },
  { key: 'iphone-x', label: 'iPhone X / XS / 11 Pro', category: 'mobile', width: 375, height: 812, icon: 'phone' },
  { key: 'iphone-xr', label: 'iPhone XR / XS Max / 11', category: 'mobile', width: 414, height: 896, icon: 'phone' },
  { key: 'pixel-7-pro', label: 'Google Pixel 7 Pro / 6 Pro', category: 'mobile', width: 412, height: 892, icon: 'phone' },
  { key: 'pixel-7', label: 'Google Pixel 7 / 6 / 6a', category: 'mobile', width: 412, height: 915, icon: 'phone' },
  { key: 'galaxy-s10', label: 'Samsung Galaxy S10', category: 'mobile', width: 360, height: 760, icon: 'phone' },

  // Tablet
  { key: 'ipad-pro-12', label: 'iPad Pro 12.9"', category: 'tablet', width: 1024, height: 1366, icon: 'tablet' },
  { key: 'ipad-pro-11', label: 'iPad Pro 11"', category: 'tablet', width: 834, height: 1194, icon: 'tablet' },
  { key: 'ipad-air', label: 'iPad Air', category: 'tablet', width: 820, height: 1180, icon: 'tablet' },
  { key: 'ipad-mini', label: 'iPad mini', category: 'tablet', width: 744, height: 1133, icon: 'tablet' },
  { key: 'surface-pro-8', label: 'Surface Pro 8', category: 'tablet', width: 1440, height: 960, icon: 'tablet' },

  // Web
  { key: 'web-1280', label: '1280 × 720', category: 'web', width: 1280, height: 720, icon: 'web' },
  { key: 'web-1366', label: '1366 × 768', category: 'web', width: 1366, height: 768, icon: 'web' },
  { key: 'web-1440', label: '1440 × 900', category: 'web', width: 1440, height: 900, icon: 'web' },
  { key: 'web-1600', label: '1600 × 900', category: 'web', width: 1600, height: 900, icon: 'web' },
  { key: 'web-1920', label: '1920 × 1080', category: 'web', width: 1920, height: 1080, icon: 'web' },
  { key: 'web-2560', label: '2560 × 1440', category: 'web', width: 2560, height: 1440, icon: 'web' },

  // Paper @ 96dpi portrait (orientation toggle swaps)
  { key: 'a0', label: 'A0', category: 'paper', width: 3179, height: 4494, icon: 'doc' },
  { key: 'a1', label: 'A1', category: 'paper', width: 2245, height: 3179, icon: 'doc' },
  { key: 'a2', label: 'A2', category: 'paper', width: 1587, height: 2245, icon: 'doc' },
  { key: 'a3', label: 'A3', category: 'paper', width: 1123, height: 1588, icon: 'doc' },
  { key: 'a4', label: 'A4', category: 'paper', width: A4_PORTRAIT.width, height: A4_PORTRAIT.height, icon: 'doc' },
  { key: 'a5', label: 'A5', category: 'paper', width: 559, height: 794, icon: 'doc' },
  { key: 'a6', label: 'A6', category: 'paper', width: 397, height: 559, icon: 'doc' },
  { key: 'b4', label: 'B4', category: 'paper', width: 945, height: 1334, icon: 'doc' },
  { key: 'b5', label: 'B5', category: 'paper', width: 665, height: 945, icon: 'doc' },
  { key: 'letter', label: 'Letter', category: 'paper', width: 816, height: 1056, icon: 'doc' },
  { key: 'legal', label: 'Legal', category: 'paper', width: 816, height: 1344, icon: 'doc' },
  { key: 'tabloid', label: 'Tabloid', category: 'paper', width: 1056, height: 1632, icon: 'doc' },

  // Ratio (separate toolbar)
  { key: 'original', label: '原始', category: 'ratio', icon: 'square' },
  { key: '1:1', label: '1:1', category: 'ratio', ratio: 1, icon: 'square' },
  { key: '4:3', label: '4:3', category: 'ratio', ratio: 4 / 3, icon: 'landscape' },
  { key: '3:4', label: '3:4', category: 'ratio', ratio: 3 / 4, icon: 'portrait' },
  { key: '16:9', label: '16:9', category: 'ratio', ratio: 16 / 9, icon: 'wide' },
  { key: '9:16', label: '9:16', category: 'ratio', ratio: 9 / 16, icon: 'tall' },
];

/** Ratio presets live in a separate toolbar control (not in device tabs). */
export const FRAME_RATIO_PRESETS = FRAME_SIZE_PRESETS.filter((p) => p.category === 'ratio');

export function presetsByCategory(category: FramePresetCategory): FrameSizePreset[] {
  return FRAME_SIZE_PRESETS.filter((p) => p.category === category);
}

/** Swap width/height (portrait ↔ landscape). */
export function swapFrameOrientation(current: {
  width: number;
  height: number;
}): { width: number; height: number } {
  return {
    width: Math.max(40, Math.round(current.height)),
    height: Math.max(40, Math.round(current.width)),
  };
}

/**
 * Apply a size preset. Keeps the current landscape/portrait orientation when
 * the preset has a fixed size (so A4 + landscape toggle stays consistent).
 */
export function applyFramePreset(
  current: { width: number; height: number },
  preset: FrameSizePreset
): { width: number; height: number } {
  if (preset.width && preset.height) {
    const wantLandscape = current.width > current.height;
    const presetLandscape = preset.width > preset.height;
    if (wantLandscape !== presetLandscape) {
      return { width: preset.height, height: preset.width };
    }
    return { width: preset.width, height: preset.height };
  }
  if (preset.ratio && preset.ratio > 0) {
    const width = Math.max(40, Math.round(current.width));
    const height = Math.max(40, Math.round(width / preset.ratio));
    return { width, height };
  }
  return current;
}

export function matchFramePreset(width: number, height: number): string {
  for (const p of FRAME_SIZE_PRESETS) {
    if (p.key === 'original') continue;
    if (p.width && p.height) {
      if (Math.abs(p.width - width) <= 1 && Math.abs(p.height - height) <= 1) return p.key;
      if (Math.abs(p.width - height) <= 1 && Math.abs(p.height - width) <= 1) return p.key;
    } else if (p.ratio) {
      const r = width / Math.max(1, height);
      if (Math.abs(r - p.ratio) < 0.02) return p.key;
    }
  }
  return 'custom';
}

export function findFramePreset(key: string): FrameSizePreset | undefined {
  return FRAME_SIZE_PRESETS.find((p) => p.key === key);
}
