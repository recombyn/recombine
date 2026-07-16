/** Tree-shaped font catalog loader (mirrors videoEditor). */

import type { FontChild, FontFaceFormat, FontFamilyNode, FontWeightOption } from './fontCatalogTypes';

export type { FontChild, FontFaceFormat, FontFamilyNode, FontWeightOption } from './fontCatalogTypes';

const STYLE_ID = 'resume-dynamic-fonts';
const CATALOG_URL = '/mock/fonts.json';

let catalogCache: FontFamilyNode[] | null = null;
let loadPromise: Promise<FontFamilyNode[]> | null = null;
let facesInjected = false;

function normalizeCatalog(raw: unknown): FontFamilyNode[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .map((item: any) => ({
      family: String(item?.family || ''),
      displayName: String(item?.displayName || item?.family || ''),
      url: item?.url ? String(item.url) : undefined,
      format: item?.format as FontFaceFormat | undefined,
      children: Array.isArray(item?.children)
        ? item.children.map((c: any) => ({
            family: String(c?.family || item?.family || ''),
            displayName: String(c?.displayName || 'Regular'),
            url: c?.url ? String(c.url) : undefined,
            format: c?.format as FontFaceFormat | undefined,
            weight: Number.isFinite(Number(c?.weight)) ? Number(c.weight) : undefined,
          }))
        : [],
    }))
    .filter((f) => f.family);
}

function resolveFontUrl(url: string) {
  if (/^(https?:|data:|blob:)/i.test(url) || url.startsWith('/')) return url;
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

function formatHint(format?: FontFaceFormat, url?: string): FontFaceFormat {
  if (format) return format;
  if (url?.includes('.woff2')) return 'woff2';
  if (url?.includes('.woff')) return 'woff';
  if (url?.includes('.otf')) return 'opentype';
  return 'truetype';
}

/** Inject @font-face for catalog entries that declare a `url` (). */
export function injectFontFaces(catalog: FontFamilyNode[]) {
  if (typeof document === 'undefined' || facesInjected) return;
  const rules: string[] = [];

  catalog.forEach((font) => {
    if (font.children?.length) {
      font.children.forEach((child) => {
        if (!child.url) return;
        const src = resolveFontUrl(child.url);
        const fmt = formatHint(child.format, child.url);
        rules.push(
          `@font-face{font-family:'${child.family}';src:url('${src}') format('${fmt}');font-weight:${
            child.weight ?? 400
          };font-style:normal;font-display:swap;}`
        );
      });
    } else if (font.url) {
      const src = resolveFontUrl(font.url);
      const fmt = formatHint(font.format, font.url);
      rules.push(
        `@font-face{font-family:'${font.family}';src:url('${src}') format('${fmt}');font-weight:400;font-style:normal;font-display:swap;}`
      );
    }
  });

  if (!rules.length) {
    facesInjected = true;
    return;
  }

  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
  facesInjected = true;
}

export async function loadFontCatalog(): Promise<FontFamilyNode[]> {
  if (catalogCache) return catalogCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const res = await fetch(CATALOG_URL, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`fonts.json ${res.status}`);
      const data = normalizeCatalog(await res.json());
      catalogCache = data;
      injectFontFaces(data);
      return data;
    } catch {
      catalogCache = [];
      return [];
    }
  })();

  return loadPromise;
}

export function getFontCatalogSync(): FontFamilyNode[] {
  return catalogCache || [];
}

export function findFontFamily(family: string, catalog = getFontCatalogSync()): FontFamilyNode | undefined {
  const key = String(family || '');
  return (
    catalog.find((f) => f.family === key) ||
    catalog.find((f) => f.children?.some((c) => c.family === key))
  );
}

/** Map a stored face name back to the tree root family. */
export function getBaseFontFamily(fontFamily: string, catalog = getFontCatalogSync()): string {
  const key = String(fontFamily || '');
  for (const font of catalog) {
    if (font.family === key) return font.family;
    if (font.children?.some((c) => c.family === key)) return font.family;
  }
  if (/puhui|普惠/i.test(key) || key.startsWith('Alibaba PuHuiTi')) {
    return 'Alibaba PuHuiTi';
  }
  return key || 'Alibaba PuHuiTi';
}

export function getFontDisplayName(fontFamily: string, catalog = getFontCatalogSync()): string {
  const base = getBaseFontFamily(fontFamily, catalog);
  return catalog.find((f) => f.family === base)?.displayName || base;
}

/** Preview face for list rows (first child or base). */
export function getPreviewFontFamily(font: FontFamilyNode): string {
  if (font.children?.length) return font.children[0].family;
  return font.family;
}

export function getFontChildren(family: string, catalog = getFontCatalogSync()): FontChild[] {
  const base = getBaseFontFamily(family, catalog);
  return catalog.find((f) => f.family === base)?.children || [];
}

export function getDefaultFontChild(family: string, catalog = getFontCatalogSync()): FontChild | null {
  const children = getFontChildren(family, catalog);
  if (!children.length) {
    const node = findFontFamily(family, catalog);
    return node ? { family: node.family, displayName: 'Regular', weight: 400, url: node.url } : null;
  }
  return children.find((c) => /^regular$/i.test(c.displayName) || c.displayName === '常规') || children[0];
}

export function findFontChild(fontFamily: string, catalog = getFontCatalogSync()): FontChild | null {
  const key = String(fontFamily || '');
  for (const font of catalog) {
    const hit = font.children?.find((c) => c.family === key);
    if (hit) return hit;
    if (font.family === key && (!font.children || font.children.length === 0)) {
      return { family: font.family, displayName: 'Regular', weight: 400, url: font.url };
    }
  }
  return getDefaultFontChild(key, catalog);
}

function childSelectKey(child: FontChild, siblings: FontChild[]): string {
  const shared = siblings.filter((c) => c.family === child.family).length > 1;
  if (shared && child.weight != null) return `${child.family}::${child.weight}`;
  return child.family;
}

export function weightOptionsForFamily(
  fontFamily: string,
  catalog = getFontCatalogSync()
): FontWeightOption[] {
  const children = getFontChildren(fontFamily, catalog);
  if (!children.length) {
    return [{ value: getBaseFontFamily(fontFamily, catalog), label: 'Regular', weight: 400 }];
  }
  return children.map((c) => ({
    value: childSelectKey(c, children),
    label: c.displayName,
    weight: c.weight,
  }));
}

export function resolveWeightSelectValue(
  fontFamily: string,
  fontWeight: string | number | undefined,
  catalog = getFontCatalogSync()
): string {
  const children = getFontChildren(fontFamily, catalog);
  if (!children.length) return getBaseFontFamily(fontFamily, catalog);

  const numeric =
    fontWeight === 'bold' || fontWeight === '700'
      ? 700
      : fontWeight === 'normal' || fontWeight === '400'
        ? 400
        : Number(fontWeight);

  const byFamily = children.filter((c) => c.family === fontFamily);
  if (byFamily.length > 1 && Number.isFinite(numeric)) {
    const match = byFamily.find((c) => c.weight === numeric);
    if (match) return childSelectKey(match, children);
  }

  const exact = children.find((c) => c.family === fontFamily);
  if (exact) return childSelectKey(exact, children);

  if (Number.isFinite(numeric)) {
    const byW = children.find((c) => c.weight === numeric);
    if (byW) return childSelectKey(byW, children);
  }

  const def = getDefaultFontChild(fontFamily, catalog);
  return def ? childSelectKey(def, children) : fontFamily;
}

export function applyFontFamilySelection(
  baseOrFace: string,
  catalog = getFontCatalogSync()
): { fontFamily: string; fontWeight: string } {
  const base = getBaseFontFamily(baseOrFace, catalog);
  const child = getDefaultFontChild(baseOrFace, catalog);
  if (!child) return { fontFamily: baseOrFace, fontWeight: 'normal' };
  // Dedicated face name (e.g. "… Bold") already embeds weight — keep CSS weight normal.
  if (child.family !== base && child.url) {
    return { fontFamily: child.family, fontWeight: 'normal' };
  }
  const w = child.weight;
  let fontWeight = 'normal';
  if (w != null) {
    if (w >= 600) fontWeight = 'bold';
    else if (w === 400) fontWeight = 'normal';
    else fontWeight = String(w);
  }
  return { fontFamily: child.family, fontWeight };
}

export function parseWeightSelectValue(
  value: string,
  catalog = getFontCatalogSync()
): { family: string; weight: string } {
  const [familyPart, weightPart] = String(value).split('::');
  const family = familyPart || value;
  const base = getBaseFontFamily(family, catalog);
  const child =
    getFontChildren(base, catalog).find((c) => {
      if (weightPart != null && weightPart !== '') {
        return c.family === family && String(c.weight) === weightPart;
      }
      return c.family === family;
    }) || findFontChild(family, catalog);

  // Dedicated @font-face family for this weight
  if (child && child.family !== base && child.url) {
    return { family: child.family, weight: 'normal' };
  }

  if (weightPart != null && weightPart !== '') {
    const w = Number(weightPart);
    if (w >= 600) return { family, weight: 'bold' };
    if (w === 400) return { family, weight: 'normal' };
    return { family, weight: String(w) };
  }

  const w = child?.weight;
  if (w != null) {
    if (w >= 600) return { family, weight: 'bold' };
    if (w === 400) return { family, weight: 'normal' };
    return { family, weight: String(w) };
  }
  return { family, weight: 'normal' };
}

/** Flat options for legacy callers. */
export function flatFontOptions(catalog = getFontCatalogSync()) {
  return catalog.map((f) => ({ value: f.family, label: f.displayName }));
}
