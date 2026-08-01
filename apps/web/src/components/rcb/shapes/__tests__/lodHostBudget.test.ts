import { describe, expect, it } from 'vitest';
import { pickFullAndProxyIds } from '../RcbShapesLayer';
import { HEAVY_PATH_D_CHARS } from '@/components/rcb/scene/document/sceneShapes';

function makeDoc(nodes: Record<string, any>) {
  const children = Object.keys(nodes);
  return {
    deltaSetLike: {
      ROOT: { children },
      ...nodes,
    },
  };
}

function rect(id: string, w = 40, h = 40) {
  return {
    id,
    x: 0,
    y: 0,
    width: w,
    height: h,
    attrs: { shapeType: 'rect', 'fill-color': '#abc' },
  };
}

function heavy(id: string) {
  return {
    id,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    attrs: {
      shapeType: 'path',
      path: 'M0 0 ' + 'L1 1 '.repeat(HEAVY_PATH_D_CHARS),
    },
  };
}

describe('pickFullAndProxyIds', () => {
  it('keeps all hosts when few and zoomed in', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 20; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(),
      zoom: 1,
      moving: false,
    });
    expect(fullIds).toHaveLength(20);
    expect(proxyIds).toHaveLength(0);
  });

  it('caps full hosts and proxies the rest when far', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 120; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(['n0']),
      zoom: 0.2,
      moving: true,
    });
    expect(fullIds).toContain('n0');
    expect(fullIds.length).toBeLessThanOrEqual(40);
    expect(proxyIds.length).toBeGreaterThan(0);
    expect(fullIds.length + proxyIds.length).toBe(120);
  });

  it('demotes heavy paths when force-lod', () => {
    const nodes: Record<string, any> = {
      big: rect('big', 400, 400),
      heavy: heavy('heavy'),
    };
    for (let i = 0; i < 50; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(),
      zoom: 0.2,
      moving: true,
    });
    expect(fullIds).toContain('big');
    expect(proxyIds).toContain('heavy');
  });
});
