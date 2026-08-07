import { describe, expect, it } from 'vitest';
import {
  findPencilBrush,
  pencilSampleMinStep,
  samplePolyline,
  stampSpacing,
  stampSpacingForBrush,
  streamlinePencilPoints,
  type Pt,
} from '../pencilBrushes';

/**
 * Pencil smoothness regressions:
 * - stamp spacing must not floor at 2 scene-px (disconnected sausages at high zoom)
 * - sample step stays dense vs stroke size
 * - streamline reduces path jitter while keeping endpoints
 */
describe('pencil stroke smoothness', () => {
  it('stamp spacing tracks brush size (no Math.max(2) gap)', () => {
    const solid = findPencilBrush('solid');
    const stampLike = {
      ...solid,
      kind: 'stamp' as const,
      sizeFactor: 1,
      spacingFactor: 0.08,
      stampSrc: 'data:image/png;base64,xx',
    };
    const sw = 1;
    const spacing = stampSpacing(stampLike, sw);
    expect(spacing).toBeLessThan(2);
    expect(spacing).toBeCloseTo(0.08, 5);
    expect(stampSpacingForBrush(stampLike, sw)).toBe(spacing);
  });

  it('dense diagonal path keeps overlapping stamps (no sausage gaps)', () => {
    const brush = {
      ...findPencilBrush('solid'),
      kind: 'stamp' as const,
      sizeFactor: 1,
      spacingFactor: 0.15,
      stampSrc: 'data:image/png;base64,xx',
    };
    const size = 1 * brush.sizeFactor;
    const spacing = stampSpacing(brush, 1);
    // Simulate a short diagonal stroke across ~6 cells.
    const raw: Pt[] = [];
    for (let i = 0; i <= 20; i += 1) {
      raw.push({ x: 10 + i * 0.3, y: 10 + i * 0.25 });
    }
    const samples = samplePolyline(raw, spacing);
    expect(samples.length).toBeGreaterThan(8);
    // Consecutive stamps must overlap (spacing < size) so ink looks continuous.
    expect(spacing).toBeLessThan(size);
    for (let i = 1; i < samples.length; i += 1) {
      const d = Math.hypot(
        samples[i].x - samples[i - 1].x,
        samples[i].y - samples[i - 1].y
      );
      expect(d).toBeLessThanOrEqual(spacing * 1.2 + 1e-6);
    }
  });

  it('sample min step is dense at 1px stroke (not fixed 0.6)', () => {
    const brush = findPencilBrush('solid');
    const step = pencilSampleMinStep(1, brush);
    // eslint-disable-next-line no-console
    console.log('[test:pencil-min-step]', { step, legacy: 0.6 });
    expect(step).toBeLessThan(0.6);
    expect(step).toBeGreaterThanOrEqual(0.12);
  });

  it('streamline reduces mid-path jitter, keeps endpoints', () => {
    const jagged: Pt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0.8 },
      { x: 2, y: -0.6 },
      { x: 3, y: 0.7 },
      { x: 4, y: 0 },
    ];
    const smooth = streamlinePencilPoints(jagged, 0.55);
    // eslint-disable-next-line no-console
    console.log('[test:pencil-streamline]', { jagged, smooth });
    expect(smooth[0]).toEqual(jagged[0]);
    expect(smooth[smooth.length - 1]).toEqual(jagged[jagged.length - 1]);
    // Mid points should move toward a calmer path (smaller |y| swing).
    const jaggedAmp = Math.max(...jagged.map((p) => Math.abs(p.y)));
    const smoothAmp = Math.max(...smooth.slice(1, -1).map((p) => Math.abs(p.y)));
    expect(smoothAmp).toBeLessThan(jaggedAmp);
  });

  it('full flow: raw moves → dense samples → continuous stamp chain', () => {
    const brush = {
      ...findPencilBrush('solid'),
      kind: 'stamp' as const,
      sizeFactor: 1.2,
      spacingFactor: 0.15,
      stampSrc: 'data:image/png;base64,xx',
    };
    const strokeWidth = 1;
    const minStep = pencilSampleMinStep(strokeWidth, brush);
    const rawMoves: Pt[] = [];
    for (let i = 0; i < 40; i += 1) {
      rawMoves.push({
        x: 5 + i * 0.22 + (i % 3 === 0 ? 0.05 : 0),
        y: 8 + i * 0.18 + (i % 2 === 0 ? -0.04 : 0.04),
      });
    }
    // Mimic capture: min-step filter then streamline.
    const captured: Pt[] = [rawMoves[0]];
    for (let i = 1; i < rawMoves.length; i += 1) {
      const last = captured[captured.length - 1];
      const p = rawMoves[i];
      if (Math.hypot(p.x - last.x, p.y - last.y) < minStep) continue;
      captured.push(p);
    }
    const polished = streamlinePencilPoints(captured, 0.35);
    const spacing = stampSpacing(brush, strokeWidth);
    const stamps = samplePolyline(polished, spacing);
    expect(captured.length).toBeGreaterThan(15);
    expect(stamps.length).toBeGreaterThan(10);
    expect(spacing).toBeLessThan(brush.sizeFactor * strokeWidth);
  });

  it('clamps oversized spacingFactor so strokes stay continuous', () => {
    const brush = {
      ...findPencilBrush('solid'),
      kind: 'stamp' as const,
      sizeFactor: 1,
      spacingFactor: 0.45,
      stampSrc: 'data:image/png;base64,xx',
    };
    const spacing = stampSpacing(brush, 1);
    expect(spacing).toBeLessThanOrEqual(0.12);
  });

  it('default hardness spacing stays under 10% of tip size', () => {
    const brush = findPencilBrush('chalk');
    const sw = 10;
    const spacing = stampSpacing(brush, sw, 80);
    const size = sw * brush.sizeFactor;
    expect(spacing / size).toBeLessThanOrEqual(0.09);
  });
});
