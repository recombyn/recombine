import { describe, expect, it } from 'vitest';
import {
  deflateSelectionBox,
  inflateSelectionBox,
  inflateBoxByVisualOutset,
  strokeChromeOutset,
  strokeVisualOutset,
  geometryPatchForStrokeVisibilityToggle,
} from '../../scene/document/sceneEffects';

/**
 * Control box = path geom. Stroke paint may extend outside; do not pad the
 * blue AABB to outer ink. Move/snap still uses strokeVisualOutset separately.
 */
describe('selection chrome vs stroke (AABB on path)', () => {
  const centerStroke = (sw: number) => ({
    key: 'shape',
    attrs: {
      shapeType: 'polygon',
      'border-width': sw,
      'border-color': '#333',
      strokeAlign: 'center',
      'stroke-enabled': 'true',
      'stroke-visible': 'true',
    },
  });

  it('1px center stroke: chrome = path (not visual ±0.5)', () => {
    const node = centerStroke(1);
    const path = { left: 10.5, top: 20.5, width: 4, height: 3 };
    const chrome = inflateSelectionBox(path, node);
    const visual = inflateBoxByVisualOutset(path, node);

    // eslint-disable-next-line no-console
    console.log('[test:chrome-stroke:1px]', {
      path,
      chrome,
      visual,
      chromeOutset: strokeChromeOutset(node),
      visualOutset: strokeVisualOutset(node),
    });

    expect(strokeChromeOutset(node)).toBe(0);
    expect(strokeVisualOutset(node)).toBe(0.5);
    expect(chrome).toEqual(path);
    expect(visual).toEqual({ left: 10, top: 20, width: 5, height: 4 });
    expect(deflateSelectionBox(chrome, node)).toEqual(path);
  });

  it('thick center stroke (sw=2): knobs stay on path, not outer ink', () => {
    const node = centerStroke(2);
    const path = { left: 10, top: 10, width: 4, height: 3 };
    const chrome = inflateSelectionBox(path, node);
    // eslint-disable-next-line no-console
    console.log('[test:chrome-stroke:2px]', { path, chrome, outset: strokeChromeOutset(node) });
    expect(strokeChromeOutset(node)).toBe(0);
    expect(chrome).toEqual(path);
    const rotateFrom = {
      nw: { x: chrome.left, y: chrome.top },
      se: { x: chrome.left + chrome.width, y: chrome.top + chrome.height },
    };
    expect(rotateFrom.nw.x).toBe(10);
    expect(rotateFrom.se.x).toBe(14);
  });

  it('outside stroke: chrome still on path (no full-sw pad)', () => {
    const node = {
      key: 'shape',
      attrs: {
        shapeType: 'rect',
        'border-width': 2,
        'border-color': '#333',
        strokeAlign: 'outside',
        'stroke-enabled': 'true',
        'stroke-visible': 'true',
        'fill-color': '#fff',
      },
    };
    const path = { left: 10, top: 10, width: 8, height: 6 };
    const chrome = inflateSelectionBox(path, node);
    const visual = inflateBoxByVisualOutset(path, node);
    // eslint-disable-next-line no-console
    console.log('[test:chrome-stroke:outside]', { path, chrome, visual });
    expect(strokeChromeOutset(node)).toBe(0);
    expect(chrome).toEqual(path);
    expect(visual).toEqual({ left: 8, top: 8, width: 12, height: 10 });
  });

  it('inside stroke: chrome stays on path', () => {
    const node = {
      key: 'shape',
      attrs: {
        shapeType: 'rect',
        'border-width': 4,
        'border-color': '#333',
        strokeAlign: 'inside',
        'stroke-enabled': 'true',
        'stroke-visible': 'true',
        'fill-color': '#fff',
      },
    };
    const path = { left: 10, top: 10, width: 8, height: 6 };
    const chrome = inflateSelectionBox(path, node);
    expect(strokeChromeOutset(node)).toBe(0);
    expect(chrome).toEqual(path);
  });

  it('polygon knobs + AABB both on path geom', () => {
    const node = centerStroke(1);
    const path = { left: 10.5, top: 20.5, width: 4, height: 3 };
    const chrome = inflateSelectionBox(path, node);
    const geomForPolygonKnobs = deflateSelectionBox(chrome, node);
    // eslint-disable-next-line no-console
    console.log('[test:chrome-stroke:polygon-knobs]', {
      chrome,
      geomForPolygonKnobs,
    });
    expect(geomForPolygonKnobs).toEqual(path);
    expect(chrome).toEqual(path);
  });
});

describe('geometryPatchForStrokeVisibilityToggle', () => {
  const rectCenter1 = {
    key: 'shape',
    x: 10.5,
    y: 8.5,
    width: 42,
    height: 31,
    attrs: {
      shapeType: 'rect',
      'border-width': 1,
      'border-color': '#333',
      strokeAlign: 'center',
      'stroke-enabled': 'true',
      'stroke-visible': 'true',
      'fill-color': '#fff',
    },
  };

  it('hide 1px center stroke expands fill to prior outer ink (on grid)', () => {
    const patch = geometryPatchForStrokeVisibilityToggle(rectCenter1, false);
    expect(patch).toEqual({ x: 10, y: 8, width: 43, height: 32 });
    const hidden = {
      ...rectCenter1,
      ...patch,
      attrs: { ...rectCenter1.attrs, 'stroke-enabled': 'false', 'stroke-visible': 'false' },
    };
    expect(strokeVisualOutset(hidden)).toBe(0);
    expect(hidden.x).toBe(10);
    expect(hidden.y).toBe(8);
  });

  it('show stroke again insets back to path *.5', () => {
    const expanded = {
      ...rectCenter1,
      x: 10,
      y: 8,
      width: 43,
      height: 32,
      attrs: { ...rectCenter1.attrs, 'stroke-enabled': 'false', 'stroke-visible': 'false' },
    };
    const patch = geometryPatchForStrokeVisibilityToggle(expanded, true);
    expect(patch).toEqual({ x: 10.5, y: 8.5, width: 42, height: 31 });
  });

  it('inside stroke: no geom change (outset 0)', () => {
    const node = {
      ...rectCenter1,
      attrs: { ...rectCenter1.attrs, strokeAlign: 'inside', 'stroke-align': 'inside' },
    };
    expect(geometryPatchForStrokeVisibilityToggle(node, false)).toBeNull();
  });

  it('custom path d: skip (AABB alone cannot offset the curve)', () => {
    const node = {
      ...rectCenter1,
      attrs: { ...rectCenter1.attrs, shapeType: 'path', path: 'M0 0 L10 0 L10 10 Z', closed: 'true' },
    };
    expect(geometryPatchForStrokeVisibilityToggle(node, false)).toBeNull();
  });
});
