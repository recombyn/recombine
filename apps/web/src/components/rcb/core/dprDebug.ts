/**
 * Temporary DPR / subpixel diagnostics.
 * Enable:  window.__RCB_DPR_DEBUG__ = true
 * Dump now: window.__rcbDumpDpr?.()
 *
 * Default OFF — enable explicitly when debugging browser-zoom seams.
 */

import { nearestDprMultiple, toDomPrecision } from './dpr';
import type { RcbCamera } from './types';

declare global {
  interface Window {
    __RCB_DPR_DEBUG__?: boolean;
    __rcbDumpDpr?: () => void;
    __rcbLastDprDump?: Record<string, unknown>;
  }
}

const TAG = '[rcb:dpr]';

function debugEnabled() {
  if (typeof window === 'undefined') return false;
  // Opt-in only — default OFF (was spamming + noise during 90% zoom tests).
  return window.__RCB_DPR_DEBUG__ === true;
}

function frac(n: number) {
  return Math.abs(n - Math.round(n));
}

function classify(devicePx: number) {
  const f = frac(devicePx);
  if (f < 0.02 || f > 0.98) return 'integer';
  if (f > 0.45 && f < 0.55) return 'half';
  return 'frac';
}

/** Scene → CSS px under camera (same as rcbSceneToScreen). */
export function sceneToCss(camera: RcbCamera, sceneX: number, sceneY: number) {
  const z = Math.max(0.05, camera.zoom || 1);
  return {
    x: sceneX * z + camera.x,
    y: sceneY * z + camera.y,
  };
}

export type DprEdgeSample = {
  id: string;
  scene: { left: number; top: number; right: number; bottom: number };
  css: { left: number; top: number; right: number; bottom: number };
  device: { left: number; top: number; right: number; bottom: number };
  edgeClass: {
    left: string;
    top: string;
    right: string;
    bottom: string;
  };
};

export function sampleBoxEdges(
  id: string,
  box: { left: number; top: number; width: number; height: number },
  camera: RcbCamera,
  dpr: number
): DprEdgeSample {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const tl = sceneToCss(camera, box.left, box.top);
  const br = sceneToCss(camera, right, bottom);
  const device = {
    left: tl.x * dpr,
    top: tl.y * dpr,
    right: br.x * dpr,
    bottom: br.y * dpr,
  };
  return {
    id,
    scene: { left: box.left, top: box.top, right, bottom },
    css: { left: tl.x, top: tl.y, right: br.x, bottom: br.y },
    device,
    edgeClass: {
      left: classify(device.left),
      top: classify(device.top),
      right: classify(device.right),
      bottom: classify(device.bottom),
    },
  };
}

/** Gap between A's right edge and B's left edge in device pixels. */
export function adjacentSeam(
  a: DprEdgeSample,
  b: DprEdgeSample
): { cssGap: number; deviceGap: number; aRightClass: string; bLeftClass: string } | null {
  // Prefer horizontal neighbors: A left of B
  const cssGap = b.css.left - a.css.right;
  if (Math.abs(cssGap) > 40) return null;
  return {
    cssGap,
    deviceGap: b.device.left - a.device.right,
    aRightClass: a.edgeClass.right,
    bLeftClass: b.edgeClass.left,
  };
}

export function logDprCameraState(opts: {
  reason: string;
  dpr: number;
  camera: RcbCamera;
  camCss?: { x: number; y: number; z: number };
}) {
  if (!debugEnabled()) return;
  const { reason, dpr, camera, camCss } = opts;
  const multiple = nearestDprMultiple(dpr);
  const payload = {
    reason,
    dpr,
    dprMultiple: multiple,
    dprTimesMultiple: dpr * multiple,
    dprIsFractional: Math.abs(dpr - Math.round(dpr)) > 0.02,
    camera: { ...camera },
    camCssWritten: camCss ?? {
      x: toDomPrecision(camera.x),
      y: toDomPrecision(camera.y),
      z: toDomPrecision(camera.zoom),
    },
    // After CSS scale(z) translate(x,y), a scene unit becomes zoom CSS px → zoom*dpr device px.
    sceneUnitDevicePx: camera.zoom * dpr,
    visualViewportScale:
      typeof window !== 'undefined' && window.visualViewport
        ? window.visualViewport.scale
        : undefined,
  };
  window.__rcbLastDprDump = payload;
  console.log(TAG, reason, payload);
}

export function logEdgeSamples(
  reason: string,
  samples: DprEdgeSample[],
  dpr: number,
  camera: RcbCamera
) {
  if (!debugEnabled() || !samples.length) return;
  console.groupCollapsed(`${TAG} edges · ${reason} · n=${samples.length}`);
  console.table(
    samples.map((s) => ({
      id: s.id.slice(0, 12),
      sceneL: s.scene.left,
      sceneR: s.scene.right,
      cssL: +s.css.left.toFixed(3),
      cssR: +s.css.right.toFixed(3),
      devL: +s.device.left.toFixed(3),
      devR: +s.device.right.toFixed(3),
      classL: s.edgeClass.left,
      classR: s.edgeClass.right,
      classT: s.edgeClass.top,
      classB: s.edgeClass.bottom,
    }))
  );

  // Check pairwise horizontal seams (likely adjacent rects).
  const seams: Array<Record<string, unknown>> = [];
  for (let i = 0; i < samples.length; i++) {
    for (let j = 0; j < samples.length; j++) {
      if (i === j) continue;
      const seam = adjacentSeam(samples[i], samples[j]);
      if (!seam) continue;
      if (Math.abs(seam.cssGap) > 8) continue;
      seams.push({
        a: samples[i].id.slice(0, 12),
        b: samples[j].id.slice(0, 12),
        cssGap: +seam.cssGap.toFixed(4),
        deviceGap: +seam.deviceGap.toFixed(4),
        aRight: seam.aRightClass,
        bLeft: seam.bLeftClass,
        suspect:
          Math.abs(seam.deviceGap) > 0.15 ||
          seam.aRightClass !== 'integer' ||
          seam.bLeftClass !== 'integer',
      });
    }
  }
  if (seams.length) {
    console.log(TAG, 'adjacent seams (cssGap≈0 = touching in scene*zoom)', {
      dpr,
      zoom: camera.zoom,
    });
    console.table(seams);
  } else {
    console.log(TAG, 'no near-horizontal adjacent pairs found in sample');
  }
  console.groupEnd();
}

export function installDprDebugHelpers(getState: () => {
  dpr: number;
  camera: RcbCamera;
  boxes?: Array<{ id: string; left: number; top: number; width: number; height: number }>;
}) {
  if (typeof window === 'undefined') return;
  window.__rcbDumpDpr = () => {
    const { dpr, camera, boxes = [] } = getState();
    logDprCameraState({ reason: 'manual-dump', dpr, camera });
    const samples = boxes.map((b) =>
      sampleBoxEdges(b.id, b, camera, dpr)
    );
    logEdgeSamples('manual-dump', samples, dpr, camera);
  };
}
