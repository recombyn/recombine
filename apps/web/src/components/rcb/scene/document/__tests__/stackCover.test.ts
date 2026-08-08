import { describe, expect, it } from 'vitest';
import {
  addNodeToDocument,
  createBareDocument,
  createImageGeneratorNode,
  stackZIndex,
} from '../sceneDocument';
import {
  findHtmlMediaMount,
  HTML_MEDIA_MOUNT_ATTR,
  nodeToSvgElement,
} from '../../paint/sceneToSvg';

function svgRoot(attrs: Record<string, string> = {}) {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.setAttribute('data-rcb-infinite', '1');
  root.setAttribute('data-rcb-world-surface', '1');
  for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  root.appendChild(layer);
  document.body.appendChild(root);
  return { root, layer };
}

describe('unified HTML media stack (foreignObject)', () => {
  it('addNodeToDocument appends new nodes on top of stackOrder', () => {
    let doc = createBareDocument();
    doc = addNodeToDocument(doc, 'lot1', {
      id: 'lot1',
      key: 'lottie',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      attrs: { animationData: '{}' },
      children: [],
    });
    const { id, node } = createImageGeneratorNode({ x: 50, y: 50, width: 80, height: 80 });
    doc = addNodeToDocument(doc, id, node);
    expect(stackZIndex(doc, 'node', id)).toBeGreaterThan(stackZIndex(doc, 'node', 'lot1'));
    expect(doc.stackOrder[doc.stackOrder.length - 1]).toBe(`node:${id}`);
  });

  it('lottie with animationData paints a foreignObject HTML mount in the SVG layer', async () => {
    const { root, layer } = svgRoot();
    const anim = JSON.stringify({ v: '5.7.0', fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [] });
    const el = await nodeToSvgElement(
      root,
      layer,
      { x: 0, y: 0, deltaSetLike: {} },
      {
        key: 'lottie',
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        attrs: { animationData: anim, fill: '#FFFFFF' },
      },
      'lot1'
    );
    expect(el).toBeTruthy();
    const fo = el!.querySelector('foreignObject[data-rcb-html-media-fo="lottie"]');
    expect(fo).toBeTruthy();
    const mount = el!.querySelector(`[${HTML_MEDIA_MOUNT_ATTR}="lot1"]`);
    expect(mount).toBeTruthy();
    expect(findHtmlMediaMount('lot1')).toBe(mount);
    root.remove();
  });

  it('export surface does not mount HTML foreignObject for lottie', async () => {
    const { root, layer } = svgRoot({ 'data-rcb-export-surface': '1' });
    const anim = JSON.stringify({ v: '5.7.0', fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [] });
    const el = await nodeToSvgElement(
      root,
      layer,
      { x: 0, y: 0, deltaSetLike: {} },
      {
        key: 'lottie',
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        attrs: { animationData: anim },
      },
      'lot2'
    );
    expect(el!.querySelector('foreignObject[data-rcb-html-media-fo]')).toBeNull();
    root.remove();
  });

  it('video with src mounts foreignObject on world surface', async () => {
    const { root, layer } = svgRoot();
    const el = await nodeToSvgElement(
      root,
      layer,
      { x: 0, y: 0, deltaSetLike: {} },
      {
        key: 'video',
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        attrs: { src: 'https://example.com/a.mp4', poster: 'https://example.com/p.jpg' },
      },
      'vid1'
    );
    expect(el!.querySelector('foreignObject[data-rcb-html-media-fo="video"]')).toBeTruthy();
    root.remove();
  });
});
