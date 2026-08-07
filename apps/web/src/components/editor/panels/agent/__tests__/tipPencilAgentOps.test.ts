import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createShapeNode } from '@/components/rcb/scene/document/sceneDocument';
import { findPencilBrush } from '@/components/rcb/tools/pencilBrushes';

function loadPencilOps() {
  const p = resolve(process.cwd(), '../api/tmp/agent_pencil_tip_fixture.json');
  return JSON.parse(readFileSync(p, 'utf-8')) as Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}

describe('agent tip pencil ops → FE attrs', () => {
  it('maps tip brushStyle / hardness / pressure onto nodes', () => {
    const ops = loadPencilOps();
    expect(ops.length).toBeGreaterThanOrEqual(3);

    const created: any[] = [];
    for (const op of ops) {
      const a = op.args || {};
      const brushStyle = String(a.brushStyle || 'solid');
      const pathPressure = a.pathPressure != null ? String(a.pathPressure) : undefined;
      const brushHardness =
        a.brushHardness != null ? Number(a.brushHardness) : undefined;
      const pressureEnabled =
        a.pressureEnabled == null ? undefined : Boolean(a.pressureEnabled);
      const tip = findPencilBrush(brushStyle);
      const { node } = createShapeNode({
        x: Number(a.x) || 40,
        y: Number(a.y) || 40,
        width: Number(a.width) || 120,
        height: Number(a.height) || 80,
        shapeType: 'pencil',
        stroke: String(a.stroke || '#333'),
        borderWidth: Number(a.borderWidth) || 2,
        path: String(a.path || ''),
        closed: false,
        brushStyle,
        brushStampSrc: tip.stampSrc || undefined,
        brushHardness,
        pressureEnabled,
        pathPressure,
      });
      created.push(node);
      expect(node.attrs.shapeType).toBe('pencil');
      expect(node.attrs.brushStyle).toBe(brushStyle);
      expect(node.attrs.pathPressure).toBeTruthy();
      expect(Number(node.attrs.brushHardness)).toBe(brushHardness);
      expect(node.attrs.pressureEnabled).toBe(true);
      expect(String(node.attrs.brushStampSrc || '').length).toBeGreaterThan(0);
      expect(tip.kind).toBe('stamp');
      expect(Boolean(tip.stampSrc)).toBe(true);
    }

    const styles = created.map((n) => n.attrs.brushStyle);
    expect(styles).toEqual(expect.arrayContaining(['calligraphy', 'pencil-hb', 'soft']));
  });
});
