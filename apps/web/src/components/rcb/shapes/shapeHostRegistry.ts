import { replaceSvgNode, dedupeSceneNode } from '@/components/rcb/scene/paint/sceneToSvg';
import { invalidateNodePath2D } from '@/components/rcb/scene/document/sceneShapes';

/** Paint element for one scene node (SVG under the camera layer). */
export type SceneHostEl = SVGElement;

/** One paint host per scene node (SVG mini-board under the camera layer). */
export type ShapeHostHandle = {
  nodeId: string;
  root: SVGSVGElement | null;
  layer: SVGGElement | null;
  el: SceneHostEl | null;
  kind: 'svg';
};

const hosts = new Map<string, ShapeHostHandle>();
const hostListeners = new Set<() => void>();
let hostEpoch = 0;

/** Shared nodeId → paint element map used by preview/replace. */
let sharedNodeEls: Map<string, SceneHostEl> | null = null;

function bumpHostEpoch() {
  hostEpoch += 1;
  for (const fn of hostListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Notify when a shape host registers / remounts / unregisters (paintToken remount). */
export function subscribeShapeHosts(fn: () => void) {
  hostListeners.add(fn);
  return () => {
    hostListeners.delete(fn);
  };
}

/**
 * Live DOM geometry preview (corner radius / star tip) changed `d` without remount.
 * Bump listeners so HostPathChrome re-reads the baseline path.
 */
export function notifyShapeHostGeometry(nodeId?: string) {
  if (nodeId) invalidateNodePath2D(nodeId);
  bumpHostEpoch();
}

export function getShapeHostEpoch() {
  return hostEpoch;
}

export function setSharedNodeEls(map: Map<string, SceneHostEl> | null) {
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
  // createSvgBoard appends at mount end — re-sort immediately so a remounted
  // frame plate cannot paint over existing shape layers (click-through still works
  // because the world SVG is pointer-events: none).
  if (handle.layer && sceneShapesMount && handle.layer.parentNode === sceneShapesMount) {
    syncSharedMountPaintOrder(sceneShapesMount);
  }
  bumpHostEpoch();
}

export function updateShapeHostElement(nodeId: string, el: SceneHostEl | null) {
  const h = hosts.get(nodeId);
  if (h) h.el = el;
  if (sharedNodeEls) {
    if (el) sharedNodeEls.set(nodeId, el);
    else sharedNodeEls.delete(nodeId);
  }
  // Paint remount → drop Path2D binding so the next hit rebuilds from current `d`.
  invalidateNodePath2D(nodeId);
  bumpHostEpoch();
}

export function unregisterShapeHost(nodeId: string) {
  hosts.delete(nodeId);
  sharedNodeEls?.delete(nodeId);
  invalidateNodePath2D(nodeId);
  bumpHostEpoch();
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

/** One SVG under `[data-rcb-world]` — grid + all shape layers share this lattice. */
let sceneWorldRoot: SVGSVGElement | null = null;
let sceneShapesMount: SVGGElement | null = null;
let sceneDrawPreviewMount: SVGGElement | null = null;
let sceneSmartGuidesMount: SVGGElement | null = null;
let sceneWorldEpoch = 0;

export function setSceneWorldRoot(
  root: SVGSVGElement | null,
  shapesMount: SVGGElement | null,
  drawPreviewMount: SVGGElement | null = null,
  smartGuidesMount: SVGGElement | null = null
) {
  sceneWorldRoot = root;
  sceneShapesMount = shapesMount;
  sceneDrawPreviewMount = drawPreviewMount;
  sceneSmartGuidesMount = smartGuidesMount;
  sceneWorldEpoch += 1;
  bumpHostEpoch();
}

export function getSceneWorldRoot() {
  return sceneWorldRoot;
}

export function getSceneShapesMount() {
  return sceneShapesMount;
}

const SHARED_MOUNT_LAYER_SEL =
  ':scope > g[data-rcb-shape-layer], :scope > g[data-rcb-frame-layer]';

/** SVG paint order must follow data-z (stackOrder). New layers append at mount end. */
export function syncSharedMountPaintOrder(mount?: SVGGElement | null) {
  const root = mount ?? sceneShapesMount;
  if (!root) return;
  const siblings = [...root.querySelectorAll(SHARED_MOUNT_LAYER_SEL)];
  if (siblings.length < 2) return;
  siblings.sort((a, b) => {
    const aHas = a.hasAttribute('data-z');
    const bHas = b.hasAttribute('data-z');
    const za = aHas ? Number(a.getAttribute('data-z')) || 0 : null;
    const zb = bHas ? Number(b.getAttribute('data-z')) || 0 : null;
    // Missing data-z used to sort as 0, which put frame plates (z≥1) above all
    // shapes and looked like "artboard covers content" while clicks still worked.
    if (za == null || zb == null) {
      const aFrame = a.hasAttribute('data-rcb-frame-layer');
      const bFrame = b.hasAttribute('data-rcb-frame-layer');
      if (aFrame !== bFrame) return aFrame ? -1 : 1;
      if (za == null && zb == null) return 0;
      if (za == null) return aFrame ? -1 : 1;
      return bFrame ? 1 : -1;
    }
    return za - zb;
  });
  for (const g of siblings) root.appendChild(g);
}

export function getSceneDrawPreviewMount() {
  return sceneDrawPreviewMount;
}

/** Align/gap guides — must share world SVG lattice (not a sibling surface). */
export function getSceneSmartGuidesMount() {
  return sceneSmartGuidesMount;
}

export function getSceneWorldEpoch() {
  return sceneWorldEpoch;
}

/**
 * Recover a host after HMR / race cleared the module Map but the DOM mini-board remains.
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
    el:
      (layer.querySelector(`[data-scene-node-id="${CSS.escape(nodeId)}"]`) as SVGElement | null) ||
      null,
    kind: 'svg',
  };
  registerShapeHost(handle);
  return handle;
}

/**
 * Rebuild one node's paint. Prefers per-shape SVG host; falls back to mono board.
 */
export async function replaceShapePaint(
  document: any,
  nodeEls: Map<string, SceneHostEl>,
  nodeId: string,
  mono?: { root: SVGSVGElement; layer: SVGElement } | null
) {
  const host = hosts.get(nodeId) || recoverShapeHost(nodeId);

  if (host?.root && host.layer) {
    await replaceSvgNode(
      host.root,
      host.layer,
      document,
      nodeEls as Map<string, SVGElement>,
      nodeId
    );
    const el = (nodeEls.get(nodeId) as SVGElement | undefined) ?? null;
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
    await replaceSvgNode(
      mono.root,
      mono.layer,
      document,
      nodeEls as Map<string, SVGElement>,
      nodeId
    );
  }
}
