import { replaceSvgNode, dedupeSceneNode } from '@/components/rcb/scene/sceneToSvg';

/** One native SVG mini-board per scene node. */
export type ShapeHostHandle = {
  nodeId: string;
  root: SVGSVGElement;
  layer: SVGGElement;
  el: SVGElement | null;
};

const hosts = new Map<string, ShapeHostHandle>();

/** Shared nodeId → element map used by preview/replace. */
let sharedNodeEls: Map<string, SVGElement> | null = null;

export function setSharedNodeEls(map: Map<string, SVGElement> | null) {
  sharedNodeEls = map;
}

export function getSharedNodeEls() {
  return sharedNodeEls;
}

export function registerShapeHost(handle: ShapeHostHandle) {
  hosts.set(handle.nodeId, handle);
  if (sharedNodeEls && handle.el) {
    sharedNodeEls.set(handle.nodeId, handle.el);
  }
}

export function updateShapeHostElement(nodeId: string, el: SVGElement | null) {
  const h = hosts.get(nodeId);
  if (h) h.el = el;
  if (!sharedNodeEls) return;
  if (el) sharedNodeEls.set(nodeId, el);
  else sharedNodeEls.delete(nodeId);
}

export function unregisterShapeHost(nodeId: string) {
  hosts.delete(nodeId);
  sharedNodeEls?.delete(nodeId);
}

export function getShapeHost(nodeId: string) {
  return hosts.get(nodeId) ?? null;
}

export function listShapeHosts() {
  return [...hosts.values()];
}

export function clearShapeHosts() {
  hosts.clear();
}

/**
 * Recover a host after HMR / race cleared the module Map but the DOM mini-board remains.
 * Without this, infinite-canvas style patches no-op (mono board is disabled) and the
 * SVG keeps the previous stroke align (e.g. outside while the panel shows inside).
 */
function recoverShapeHost(nodeId: string): ShapeHostHandle | null {
  if (typeof document === 'undefined') return null;
  const hostEl = document.querySelector(`[data-rcb-shape-host="${CSS.escape(nodeId)}"]`);
  if (!(hostEl instanceof HTMLElement)) return null;
  const root = hostEl.querySelector('svg');
  const layer = root?.querySelector('#scene-layer');
  if (!(root instanceof SVGSVGElement) || !(layer instanceof SVGGElement)) return null;
  const handle: ShapeHostHandle = {
    nodeId,
    root,
    layer,
    el: (layer.querySelector(`[data-scene-node-id="${CSS.escape(nodeId)}"]`) as SVGElement | null) || null,
  };
  registerShapeHost(handle);
  return handle;
}

/**
 * Rebuild one node's paint. Prefers per-shape host; falls back to mono board root/layer.
 */
export async function replaceShapePaint(
  document: any,
  nodeEls: Map<string, SVGElement>,
  nodeId: string,
  mono?: { root: SVGSVGElement; layer: SVGElement } | null
) {
  const host = hosts.get(nodeId) || recoverShapeHost(nodeId);
  if (host) {
    await replaceSvgNode(host.root, host.layer, document, nodeEls, nodeId);
    const el = nodeEls.get(nodeId) ?? null;
    // Host HTML wrapper owns mix-blend-mode + layer opacity (see RcbShapeHost).
    if (el) {
      el.style.removeProperty('mix-blend-mode');
      el.style.opacity = '1';
      el.setAttribute('opacity', '1');
    }
    updateShapeHostElement(nodeId, el);
    dedupeSceneNode(host.layer, nodeId, el);
    return;
  }
  if (mono?.root && mono?.layer) {
    await replaceSvgNode(mono.root, mono.layer, document, nodeEls, nodeId);
  }
}
