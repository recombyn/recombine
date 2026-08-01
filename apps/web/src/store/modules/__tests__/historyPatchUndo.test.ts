import { describe, expect, it } from 'vitest';
import reducer, {
  createTemplate,
  patchDocumentNode,
  undo,
  redo,
} from '@/store/modules/editor';
import {
  createEmptyDocument,
  createShapeNode,
  addNodeToDocument,
} from '@/components/rcb/scene/document/sceneDocument';

function seedWithPathNode() {
  let doc = createEmptyDocument({ emptyWorld: true });
  const heavyPath = `M 0 0 ${'L 1 1 '.repeat(2000)}Z`;
  const { id, node } = createShapeNode({
    x: 10,
    y: 20,
    width: 80,
    height: 60,
    shapeType: 'path',
    path: heavyPath,
    fill: '#ff0000',
  });
  doc = addNodeToDocument(doc, id, node);
  let state = reducer(undefined, { type: '@@INIT' } as any);
  state = reducer(
    state,
    createTemplate({ name: 't', document: doc, emptyWorld: true, source: 'scratch' })
  );
  return { state, id, heavyPath };
}

describe('patch undo history', () => {
  it('stores node patches (not full snaps) and restores attrs', () => {
    const { state: s0, id, heavyPath } = seedWithPathNode();
    const pathRef = s0.document.deltaSetLike[id].attrs.path;
    expect(pathRef).toBe(heavyPath);

    const s1 = reducer(
      s0,
      patchDocumentNode({
        nodeId: id,
        patch: { attrs: { 'fill-color': '#00ff00' } },
      })
    );
    expect(s1.document.deltaSetLike[id].attrs['fill-color']).toBe('#00ff00');
    expect(s1.historyPast).toHaveLength(1);
    expect(s1.historyPast[0].kind).toBe('nodes');
    expect(s1.historyPast[0].before[id].attrs.path).toBe(pathRef);

    const s2 = reducer(s1, undo());
    expect(s2.document.deltaSetLike[id].attrs['fill-color']).toBe('#ff0000');
    expect(s2.lastPatchedNodeIds).toEqual([id]);
    // Node-patch undo must not force a full scene remount.
    expect(s2.sceneReloadToken).toBe(s1.sceneReloadToken);

    const s3 = reducer(s2, redo());
    expect(s3.document.deltaSetLike[id].attrs['fill-color']).toBe('#00ff00');
  });
});
