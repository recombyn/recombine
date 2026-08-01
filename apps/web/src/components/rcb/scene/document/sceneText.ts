import { markdownToPlain } from './sceneMarkdown';
import { normalizeColor } from './sceneEffects';

const APP_FONT_FAMILY = 'Alibaba PuHuiTi';
const FABRIC_FONT_FAMILY = APP_FONT_FAMILY;

/** Canvas / SVG text face from a CSS stack or stored value. */
export function toFabricFontFamily(raw: unknown, fallback = FABRIC_FONT_FAMILY): string {
  if (raw == null) return fallback;
  const first = String(raw)
    .split(',')[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, '');
  if (!first || first.toLowerCase() === 'sans-serif' || first.toLowerCase() === 'serif') {
    return fallback;
  }
  if (first === '阿里巴巴普惠体' || first === '普惠体') return APP_FONT_FAMILY;
  return first;
}

export type TextStyle = {
  fontSize: number;
  fill: string;
  /** 0–100 text fill alpha (stored as attrs['fill-opacity']). */
  fillOpacity: number;
  fontWeight: string;
  fontFamily: string;
  fontStyle: string;
  textAlign: string;
  lineHeight: number;
  letterSpacing: number;
  /** CSS text-decoration: none | line-through | underline | …
   *  (comma-separated when stacking). */
  textDecoration: string;
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontSize: 14,
  fill: '#333333',
  fillOpacity: 100,
  fontWeight: 'normal',
  fontFamily: FABRIC_FONT_FAMILY,
  fontStyle: 'normal',
  textAlign: 'left',
  lineHeight: 1.4,
  letterSpacing: 0,
  textDecoration: 'none',
};

export function isTextBold(style: Partial<TextStyle> | null | undefined) {
  const w = style?.fontWeight;
  return w === 'bold' || Number(w) >= 600;
}

export function isTextItalic(style: Partial<TextStyle> | null | undefined) {
  return String(style?.fontStyle || '') === 'italic';
}

function textDecorationTokens(raw: unknown): Set<string> {
  return new Set(
    String(raw || '')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t && t !== 'none')
  );
}

export function isTextStrike(style: Partial<TextStyle> | null | undefined) {
  return textDecorationTokens(style?.textDecoration).has('line-through');
}

export function isTextUnderline(style: Partial<TextStyle> | null | undefined) {
  return textDecorationTokens(style?.textDecoration).has('underline');
}

export function isTextOverline(style: Partial<TextStyle> | null | undefined) {
  return textDecorationTokens(style?.textDecoration).has('overline');
}

/** Toggle one CSS text-decoration token; returns canonical string or `none`. */
export function toggleTextDecoration(
  current: unknown,
  token: 'underline' | 'overline' | 'line-through'
): string {
  const set = textDecorationTokens(current);
  if (set.has(token)) set.delete(token);
  else set.add(token);
  if (!set.size) return 'none';
  return (['underline', 'overline', 'line-through'] as const)
    .filter((t) => set.has(t))
    .join(' ');
}

/** Default text-box width when placing / typing (wrap instead of growing sideways). */
export const DEFAULT_TEXT_BOX_WIDTH = 240;

function measureLineWidth(
  ctx: CanvasRenderingContext2D | null,
  line: string,
  fontSize: number,
  letterSpacing: number
) {
  const raw = line.length ? line : ' ';
  if (ctx) {
    const base = ctx.measureText(raw).width;
    return base + letterSpacing * Math.max(0, raw.length - 1);
  }
  let approx = 0;
  for (const ch of raw) {
    approx += /[\u3400-\u9fff]/.test(ch) ? fontSize : fontSize * 0.55;
  }
  return approx + letterSpacing * Math.max(0, raw.length - 1);
}

function getMeasureContext(style: TextStyle): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const fontSize = Math.max(1, Number(style.fontSize) || 14);
  const family = toFabricFontFamily(style.fontFamily);
  const weight = style.fontWeight || 'normal';
  const italic = style.fontStyle === 'italic' ? 'italic ' : '';
  ctx.font = `${italic}${weight} ${fontSize}px "${family}"`;
  return ctx;
}

/**
 * Visual lines as painted on canvas — soft-wrap when the text box is fixed-width
 * (`autoSize=false`); otherwise hard `\n` only. Keep Outline / SVG / measure in sync.
 */
export function textVisualLines(
  text: string,
  style: Partial<TextStyle> = {},
  opts: { width: number; autoSize?: boolean }
): string[] {
  const plain = String(text ?? '');
  const boxW = Math.max(0, Number(opts.width) || 0);
  const autoSize = opts.autoSize !== false;
  if (!autoSize && boxW > 8) {
    return wrapPlainTextLines(plain || ' ', style, boxW);
  }
  const lines = plain.split(/\n/);
  return lines.length ? lines : [''];
}

/**
 * Soft-wrap plain text into visual lines that fit `maxWidth` (CJK breaks per char).
 * Hard `\n` still starts a new paragraph line.
 */
export function wrapPlainTextLines(
  text: string,
  style: Partial<TextStyle> = {},
  maxWidth = DEFAULT_TEXT_BOX_WIDTH
): string[] {
  const merged = { ...DEFAULT_TEXT_STYLE, ...style };
  const fontSize = Math.max(1, Number(merged.fontSize) || 14);
  const letterSpacing = Number(merged.letterSpacing) || 0;
  // Match measurePlainTextSize (tight ink width). An old 8px pad made one-line
  // text wrap when node.width === content width.
  const limit = Math.max(fontSize, maxWidth + 0.5);
  const ctx = getMeasureContext(merged);
  const paragraphs = String(text ?? '').split('\n');
  const out: string[] = [];

  for (const para of paragraphs) {
    if (!para.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const ch of para) {
      const next = line + ch;
      if (measureLineWidth(ctx, next, fontSize, letterSpacing) <= limit || !line) {
        line = next;
      } else {
        out.push(line);
        line = ch;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

/** Measure plain text box so new text nodes hug their content (not a fixed 200–240 width). */
export function measurePlainTextSize(text: string, style: Partial<TextStyle> = {}) {
  const merged = { ...DEFAULT_TEXT_STYLE, ...style };
  const fontSize = Math.max(1, Number(merged.fontSize) || 14);
  const lineHeight = Math.max(0.8, Number(merged.lineHeight) || 1.4);
  const letterSpacing = Number(merged.letterSpacing) || 0;
  const lines = String(text ?? '').split('\n');
  const sample = lines.length ? lines : [' '];
  const ctx = getMeasureContext(merged);

  let maxW = 0;
  for (const line of sample) {
    maxW = Math.max(maxW, measureLineWidth(ctx, line.length ? line : ' ', fontSize, letterSpacing));
  }

  // Tight box = ink metrics only (no asymmetric pad — that made selection bottom-heavy
  // and caused a jump vs the inline editor).
  return {
    width: Math.max(24, Math.ceil(maxW)),
    height: Math.max(
      Math.ceil(fontSize * lineHeight),
      Math.ceil(sample.length * fontSize * lineHeight)
    ),
  };
}

/** Box size when text wraps inside a fixed width (height grows, width stays). */
export function measureWrappedTextSize(
  text: string,
  style: Partial<TextStyle> = {},
  maxWidth = DEFAULT_TEXT_BOX_WIDTH
) {
  const merged = { ...DEFAULT_TEXT_STYLE, ...style };
  const fontSize = Math.max(1, Number(merged.fontSize) || 14);
  const lineHeight = Math.max(0.8, Number(merged.lineHeight) || 1.4);
  const boxW = Math.max(24, Math.round(maxWidth) || DEFAULT_TEXT_BOX_WIDTH);
  const lines = wrapPlainTextLines(text, merged, boxW);
  return {
    width: boxW,
    height: Math.max(
      Math.ceil(fontSize * lineHeight),
      Math.ceil(Math.max(1, lines.length) * fontSize * lineHeight)
    ),
    lines,
  };
}

/** Resolve editor / node width for wrapping (empty caret stays thin until typing). */
export function resolveTextBoxWidth(nodeWidth: unknown, hasContent: boolean) {
  const w = Number(nodeWidth);
  if (hasContent) {
    return Math.max(24, Number.isFinite(w) && w > 8 ? Math.round(w) : DEFAULT_TEXT_BOX_WIDTH);
  }
  if (Number.isFinite(w) && w > 8) return Math.round(w);
  return 2;
}

/** Content height of n line boxes (CSS-style). */
export function textContentHeight(
  fontSize: number,
  lineHeight: number,
  lineCount = 1
) {
  const fs = Math.max(1, fontSize);
  const lh = Math.max(0.8, lineHeight);
  return Math.max(1, lineCount) * fs * lh;
}

/**
 * SVG text `y` for `dominant-baseline: text-before-edge` so the line box
 * is vertically centered inside the selection height.
 */
export function textVerticalOriginY(
  boxH: number,
  fontSize: number,
  lineHeight: number,
  lineCount = 1
) {
  const fs = Math.max(1, fontSize);
  const lh = Math.max(0.8, lineHeight);
  const contentH = textContentHeight(fs, lh, lineCount);
  // Center the CSS line-box stack; do not add half-leading (that pushed ink down
  // and left a large empty gap above the glyphs inside the selection chrome).
  return Math.max(0, (Math.max(1, boxH) - contentH) / 2);
}

export function parseNodeText(attrs: Record<string, any> = {}) {
  if (attrs.ORIGIN_DATA) {
    try {
      const blocks = JSON.parse(attrs.ORIGIN_DATA);
      return blocks
        .map((block: any) => {
          if (block.children) {
            return block.children.map((child: any) => child.text || '').join('');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    } catch {
      /* fall through */
    }
  }

  if (attrs.DATA) {
    try {
      const runs = JSON.parse(attrs.DATA);
      return runs
        .map((run: any) => (run.chars || []).map((item: any) => item.char).join(''))
        .join('\n');
    } catch {
      /* fall through */
    }
  }

  return '';
}

/** Markdown source for the property editor (falls back to plain text). */
export function parseNodeMarkdown(attrs: Record<string, any> = {}) {
  if (typeof attrs.markdown === 'string') return attrs.markdown;
  return parseNodeText(attrs);
}

export function parseNodeTextStyle(attrs: Record<string, any> = {}): TextStyle {
  const style: TextStyle = { ...DEFAULT_TEXT_STYLE };

  if (attrs.DATA) {
    try {
      const runs = JSON.parse(attrs.DATA);
      const firstChar = runs?.[0]?.chars?.find((item: any) => item.char?.trim());
      const config = firstChar?.config || {};
      if (config.SIZE) style.fontSize = Number(config.SIZE) || style.fontSize;
      if (config.COLOR) style.fill = normalizeColor(config.COLOR);
      if (config.WEIGHT) style.fontWeight = config.WEIGHT === 'bold' ? 'bold' : String(config.WEIGHT);
      if (config.FAMILY) style.fontFamily = toFabricFontFamily(config.FAMILY);
      if (config.STYLE) style.fontStyle = config.STYLE;
      if (config.ALIGN) style.textAlign = config.ALIGN;
      if (config.LINE_HEIGHT) style.lineHeight = Number(config.LINE_HEIGHT) || style.lineHeight;
      if (config.LETTER_SPACING != null) style.letterSpacing = Number(config.LETTER_SPACING) || 0;
      if (config.DECORATION) style.textDecoration = String(config.DECORATION);
    } catch {
      /* ignore */
    }
  }

  if (attrs.ORIGIN_DATA) {
    try {
      const blocks = JSON.parse(attrs.ORIGIN_DATA);
      const child = blocks?.[0]?.children?.[0];
      const fontBase = child?.['font-base'] || {};
      if (child?.bold) style.fontWeight = 'bold';
      if (child?.italic) style.fontStyle = 'italic';
      {
        const deco = textDecorationTokens(style.textDecoration);
        if (child?.strike || child?.strikethrough) deco.add('line-through');
        if (child?.underline) deco.add('underline');
        if (child?.overline) deco.add('overline');
        style.textDecoration = deco.size
          ? (['underline', 'overline', 'line-through'] as const)
              .filter((t) => deco.has(t))
              .join(' ')
          : 'none';
      }
      if (fontBase.fontSize) style.fontSize = fontBase.fontSize;
      if (fontBase.color) style.fill = normalizeColor(fontBase.color);
      if (fontBase.fontFamily) style.fontFamily = toFabricFontFamily(fontBase.fontFamily);
      if (fontBase.textAlign) style.textAlign = fontBase.textAlign;
      if (fontBase.lineHeight) style.lineHeight = fontBase.lineHeight;
      if (fontBase.letterSpacing != null) style.letterSpacing = fontBase.letterSpacing;
      if (fontBase.textDecoration) style.textDecoration = String(fontBase.textDecoration);
    } catch {
      /* ignore */
    }
  }

  style.fontFamily = toFabricFontFamily(style.fontFamily);
  const opacityRaw = attrs['fill-opacity'];
  if (opacityRaw != null && Number.isFinite(Number(opacityRaw))) {
    style.fillOpacity = Math.max(0, Math.min(100, Math.round(Number(opacityRaw))));
  }
  return style;
}

export function buildTextAttrs(text: string, style: Partial<TextStyle> = {}) {
  const merged: TextStyle = {
    ...DEFAULT_TEXT_STYLE,
    ...style,
    fontFamily: toFabricFontFamily(style.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily),
  };
  const chars = String(text || '')
    .split('')
    .map((char) => ({
      char,
      config: {
        SIZE: merged.fontSize,
        COLOR: merged.fill,
        WEIGHT: merged.fontWeight,
        FAMILY: merged.fontFamily,
        STYLE: merged.fontStyle,
        ALIGN: merged.textAlign,
        LINE_HEIGHT: merged.lineHeight,
        LETTER_SPACING: merged.letterSpacing,
        DECORATION: merged.textDecoration,
      },
    }));

  return {
    DATA: JSON.stringify([{ chars, config: {} }]),
    ORIGIN_DATA: JSON.stringify([
      {
        children: [
          {
            text,
            bold: merged.fontWeight === 'bold' || Number(merged.fontWeight) >= 600,
            italic: merged.fontStyle === 'italic',
            strike: String(merged.textDecoration || '').includes('line-through'),
            underline: String(merged.textDecoration || '').includes('underline'),
            overline: String(merged.textDecoration || '').includes('overline'),
            'font-base': {
              fontSize: merged.fontSize,
              color: merged.fill,
              fontFamily: merged.fontFamily,
              textAlign: merged.textAlign,
              lineHeight: merged.lineHeight,
              letterSpacing: merged.letterSpacing,
              textDecoration: merged.textDecoration,
            },
          },
        ],
      },
    ]),
  };
}

/**
 * Commit markdown source + base text style.
 * Canvas text = plain rendering of markdown; `markdown` attr keeps the source.
 */
export function buildMarkdownTextAttrs(markdown: string, style: Partial<TextStyle> = {}) {
  const md = String(markdown ?? '');
  // Allow truly empty text (placement caret) — do not force a space.
  const plain = markdownToPlain(md);
  return {
    ...buildTextAttrs(plain, style),
    markdown: md,
  };
}

/** Style-only update while preserving existing markdown source. */
export function buildTextAttrsPreservingMarkdown(
  attrs: Record<string, any> = {},
  style: Partial<TextStyle> = {}
) {
  const md = parseNodeMarkdown(attrs);
  const merged = { ...parseNodeTextStyle(attrs), ...style };
  return {
    ...buildMarkdownTextAttrs(md, merged),
    'fill-opacity': Math.max(0, Math.min(100, Math.round(Number(merged.fillOpacity) || 100))),
  };
}
