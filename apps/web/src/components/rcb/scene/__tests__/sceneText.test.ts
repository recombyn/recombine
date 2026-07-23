import { describe, expect, it, vi } from 'vitest';
import {
  measurePlainTextSize,
  wrapPlainTextLines,
} from '@/components/rcb/scene/sceneText';

/**
 * jsdom often has no Canvas 2D — measureLineWidth falls back to CJK ≈ fontSize.
 * That keeps wrap math deterministic for regression checks.
 */
describe('wrapPlainTextLines', () => {
  it('keeps one CJK line when width equals ink width (no phantom 8px pad)', () => {
    const text = '你好世界';
    const fontSize = 14;
    // Fallback: each CJK char ≈ fontSize → 56px ink
    const inkW = text.length * fontSize;
    const lines = wrapPlainTextLines(text, { fontSize }, inkW);
    expect(lines).toEqual([text]);
  });

  it('soft-wraps when maxWidth is narrower than ink', () => {
    const text = '你好世界';
    const fontSize = 14;
    const lines = wrapPlainTextLines(text, { fontSize }, fontSize * 2);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(text);
  });

  it('respects hard newlines', () => {
    const lines = wrapPlainTextLines('一行\n二行', { fontSize: 14 }, 999);
    expect(lines).toEqual(['一行', '二行']);
  });
});

describe('measurePlainTextSize', () => {
  it('returns tight width for single-line CJK (no pad inflation)', () => {
    const text = '移动任务页';
    const fontSize = 14;
    const size = measurePlainTextSize(text, { fontSize, lineHeight: 1.4 });
    expect(size.width).toBe(Math.max(24, text.length * fontSize));
    expect(size.height).toBe(Math.ceil(fontSize * 1.4));
  });
});

describe('toFabricFontFamily (via wrap side-effects)', () => {
  it('does not throw when canvas getContext is stubbed null', () => {
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    try {
      expect(wrapPlainTextLines('测', { fontSize: 14 }, 100)).toEqual(['测']);
    } finally {
      spy.mockRestore();
    }
  });
});
