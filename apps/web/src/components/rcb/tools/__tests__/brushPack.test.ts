import { describe, expect, it } from 'vitest';
import {
  BRUSH_PACK_FORMAT,
  parseBrushPackJson,
  serializeBrushPack,
  makeCustomStampBrush,
  TIP_STAMP_BRUSHES,
  PENCIL_BRUSHES,
  findPencilBrush,
  listPencilBrushes,
  setCustomPencilBrushes,
  setOfficialPencilBrushes,
  stampSpacingForBrush,
  STAMP_MAX_DABS,
} from '../pencilBrushes';

describe('recombyn brush pack', () => {
  it('round-trips stamp tip brushes', () => {
    const tip = makeCustomStampBrush({
      id: 'pack-soft',
      label: 'Soft tip',
      stampSrc: 'data:image/png;base64,xxx',
      sizeFactor: 1.2,
      spacingFactor: 0.3,
    });
    const json = serializeBrushPack([tip], 'Test pack');
    const parsed = parseBrushPackJson(json);
    expect(parsed.name).toBe('Test pack');
    expect(parsed.brushes).toHaveLength(1);
    expect(parsed.brushes[0].id).toBe('pack-soft');
    expect(parsed.brushes[0].kind).toBe('stamp');
    expect(parsed.brushes[0].stampSrc).toMatch(/^data:image\//);
    expect(JSON.parse(json).format).toBe(BRUSH_PACK_FORMAT);
  });

  it('builtin wheel starts with vector brushes then tip stamps', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const list = listPencilBrushes();
    expect(list.slice(0, 3).map((b) => b.id)).toEqual([
      'vector-ink',
      'vector-even',
      'vector-calligraphy',
    ]);
    expect(list.slice(0, 3).every((b) => b.kind === 'freehand')).toBe(true);
    expect(list.map((b) => b.id)).toEqual(PENCIL_BRUSHES.map((b) => b.id));
    expect(findPencilBrush('pencil-hb').stampSrc).toMatch(/\/brushes\/tips\/pencil\.png$/);
    expect(findPencilBrush('solid').kind).toBe('stamp');
    expect(findPencilBrush('vector-even').kind).toBe('freehand');
    expect(findPencilBrush('vector-calligraphy').options.thinning).toBeGreaterThan(0.5);
    expect(TIP_STAMP_BRUSHES.every((b) => b.kind === 'stamp')).toBe(true);
  });

  it('keeps fixed tip spacing (does not sparsify into dots)', () => {
    setOfficialPencilBrushes(null);
    setCustomPencilBrushes([]);
    const brush = findPencilBrush('solid');
    const pts = [];
    for (let i = 0; i <= 200; i += 1) pts.push({ x: i * 2, y: 10 });
    const spacing = stampSpacingForBrush(brush, 8, 80, pts, STAMP_MAX_DABS);
    const expected = stampSpacingForBrush(brush, 8, 80);
    expect(spacing).toBe(expected);
    expect(spacing).toBeLessThanOrEqual(8 * 0.2);
  });
});
