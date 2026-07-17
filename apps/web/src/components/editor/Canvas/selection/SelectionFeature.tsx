import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setDevHoverNodeId } from '@/store/modules/editor';
import { nodeLeftTop } from '@/store/scene/sceneToSvg';
import ImageReplaceCornerButton from '@/components/editor/nodes/ImageNode/ImageReplaceCornerButton';
import { useCameraOverlayRoot } from '@/components/editor/Canvas/stage/CameraContext';
import AlignGuidesOverlay, { type AlignGuide } from './AlignGuidesOverlay';
import {
  frameGuideBoxes,
  snapBoxToGuides,
  snapResizeToGuides,
  type SceneBox,
} from './alignGuides';
import SelectionChrome from './SelectionChrome';
import SelectionContextToolbar from './SelectionContextToolbar';
import MultiSelectionToolbar from './MultiSelectionToolbar';
import { radiiFromAttrs } from '@/store/scene/sceneRadii';
import { supportsCornerRadius } from '@/store/scene/sceneDocument';
import SpacingInspectOverlay, {
  computeMoveMarginMeasures,
  type SpacingMeasure,
} from './SpacingInspectOverlay';
import { resizeFromHandle, rotateBoxesAround, scaleBoxesToUnion, unionOfBoxes, type ResizeHandle } from './resizeGeometry';
import { resizeStrokeByEndpoint } from '@/store/scene/sceneShapes';

/** Segment guide: thin red line + × marks (fig.1). */
export type { AlignGuide };

function clientToScene(
  paperEl: HTMLElement | null,
  artboard: { width: number; height: number },
  clientX: number,
  clientY: number
) {
  if (!paperEl) return { x: 0, y: 0 };
  const rect = paperEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const w = Math.max(1, artboard.width);
  const h = Math.max(1, artboard.height);
  return {
    x: ((clientX - rect.left) / rect.width) * w,
    y: ((clientY - rect.top) / rect.height) * h,
  };
}

function normalizeBox(x0: number, y0: number, x1: number, y1: number) {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    left,
    top,
    width: Math.max(1, Math.abs(x1 - x0)),
    height: Math.max(1, Math.abs(y1 - y0)),
  };
}

function boxesIntersect(a: SceneBox, b: SceneBox) {
  return !(
    a.left + a.width < b.left ||
    b.left + b.width < a.left ||
    a.top + a.height < b.top ||
    b.top + b.height < a.top
  );
}

function unionBoxes(boxes: SceneBox[]): SceneBox | null {
  if (!boxes.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  boxes.forEach((b) => {
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
  });
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

type GeometryPatch = {
  nodeId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type SelectionFeatureProps = {
  enabled: boolean;
  /** Share/preview: select + Dev annotations only — no move/resize/edit. */
  readOnly?: boolean;
  document: any;
  selectedNodeIds: string[];
  paperEl: HTMLElement | null;
  artboard: { width: number; height: number };
  onSelect: (ids: string[], opts?: { additive?: boolean }) => void;
  onGeometryCommit: (patches: GeometryPatch[]) => void;
  /** Live DOM preview while dragging (does not write document). */
  onGeometryPreview?: (patches: GeometryPatch[]) => void;
  onAngleCommit?: (nodeId: string, angleDeg: number) => void;
  onAnglePreview?: (nodeId: string, angleDeg: number) => void;
  hitTest: (x: number, y: number) => string | null;
  getNodeBox: (nodeId: string) => SceneBox | null;
  listNodeIds: () => string[];
  onDeleteSelected?: () => void;
  onOpenAgent?: (opts?: { prompt?: string }) => void;
  /** Double-click a text node to edit inline. */
  onEditText?: (nodeId: string) => void;
  /** Hide selection chrome / toolbars (e.g. while inline text editing). */
  suppressChrome?: boolean;
  /** Fires when move / resize / rotate starts or ends (for hiding node titles). */
  onTransformingChange?: (transforming: boolean) => void;
};

type DragState = {
  mode: 'move' | 'resize' | 'rotate' | 'marquee' | 'blank';
  startX: number;
  startY: number;
  sceneX0: number;
  sceneY0: number;
  origins: Array<{ nodeId: string; box: SceneBox; angle0?: number }>;
  union: SceneBox;
  handle?: ResizeHandle;
  angle0?: number;
  aspectRatio?: number;
  center?: { x: number; y: number };
  pointerAngle0?: number;
};

function readNodeAngle(document: any, nodeId: string) {
  const node = document?.deltaSetLike?.[nodeId];
  const n = Number(node?.attrs?.angle);
  return Number.isFinite(n) ? n : 0;
}

function readNodeShapeType(document: any, nodeId: string) {
  return String(document?.deltaSetLike?.[nodeId]?.attrs?.shapeType || '');
}

function isStrokeShapeType(t: string) {
  return t === 'line' || t === 'arrow';
}

/**
 * Selection: marquee / move / 8-way resize / rotate ( chrome).
 */
export default function SelectionFeature({
  enabled,
  readOnly = false,
  document,
  selectedNodeIds,
  paperEl,
  artboard,
  onSelect,
  onGeometryCommit,
  onGeometryPreview,
  onAngleCommit,
  onAnglePreview,
  hitTest,
  getNodeBox,
  listNodeIds,
  onDeleteSelected,
  onOpenAgent,
  onEditText,
  suppressChrome = false,
  onTransformingChange,
}: SelectionFeatureProps) {
  const overlayRoot = useCameraOverlayRoot();
  const dispatch = useDispatch();
  const workspaceMode = useSelector((s: any) => s.editor.workspaceMode) as 'design' | 'dev';
  const shapeStylePanel = useSelector(
    (s: any) => s.editor.shapeStylePanel as null | { kind: string }
  );
  /** Radius panel keeps chrome (rounded outline) but hides floating toolbars. */
  const suppressToolbars = suppressChrome || shapeStylePanel?.kind === 'radius';
  const dragRef = useRef<DragState | null>(null);
  const liveUnionRef = useRef<SceneBox | null>(null);
  const liveOriginsRef = useRef<Array<{ nodeId: string; box: SceneBox }> | null>(null);
  const liveAngleRef = useRef(0);
  /** Soft-click double-tap on text (native dblclick breaks when chrome mounts between clicks). */
  const lastTextClickRef = useRef<{ id: string; at: number } | null>(null);
  const onTransformingChangeRef = useRef(onTransformingChange);
  onTransformingChangeRef.current = onTransformingChange;

  const [liveUnion, setLiveUnion] = useState<SceneBox | null>(null);
  const [liveOrigins, setLiveOrigins] = useState<Array<{ nodeId: string; box: SceneBox }> | null>(
    null
  );
  const [liveAngle, setLiveAngle] = useState(0);
  const [marquee, setMarquee] = useState<SceneBox | null>(null);
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  /** Margin labels while moving / arrow-nudging (fig.1 pink). */
  const [moveMargins, setMoveMargins] = useState<SpacingMeasure[] | null>(null);
  /** Hide chrome/toolbars while move / resize / rotate is in progress. */
  const [transforming, setTransforming] = useState(false);
  /** Dev inspect: node under pointer (annotations follow mouse). */
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const hoverNodeIdRef = useRef<string | null>(null);

  const setTransformingNotify = (next: boolean) => {
    setTransforming(next);
    onTransformingChangeRef.current?.(next);
  };

  liveUnionRef.current = liveUnion;
  liveOriginsRef.current = liveOrigins;
  liveAngleRef.current = liveAngle;

  const idsKey = selectedNodeIds.join('|');

  const baseOrigins = useMemo(() => {
    // Derive ids from idsKey so a new `selectedNodeIds` array reference does not
    // recreate origins every render (that caused Maximum update depth loops).
    const ids = idsKey ? idsKey.split('|').filter(Boolean) : [];
    return ids
      .map((id) => {
        const box = getNodeBox(id);
        if (!box) {
          const node = document?.deltaSetLike?.[id];
          if (!node) return null;
          const { left, top } = nodeLeftTop(document, node);
          return {
            nodeId: id,
            box: {
              left,
              top,
              width: Math.max(1, Number(node.width) || 1),
              height: Math.max(1, Number(node.height) || 1),
            },
          };
        }
        return { nodeId: id, box };
      })
      .filter(Boolean) as Array<{ nodeId: string; box: SceneBox }>;
  }, [document, idsKey, getNodeBox]);

  useEffect(() => {
    if (dragRef.current) return;
    const u = unionBoxes(baseOrigins.map((o) => o.box));
    setLiveUnion(u);
    setLiveOrigins(baseOrigins);
    setGuides([]);
    const onlyId = idsKey.includes('|') ? null : idsKey || null;
    if (onlyId) {
      setLiveAngle(readNodeAngle(document, onlyId));
    } else {
      setLiveAngle(0);
    }
  }, [baseOrigins, document, idsKey]);

  useEffect(() => {
    setMoveMargins(null);
  }, [idsKey]);

  useEffect(() => {
    if (workspaceMode !== 'dev') {
      hoverNodeIdRef.current = null;
      setHoverNodeId(null);
      dispatch(setDevHoverNodeId(null));
    }
  }, [workspaceMode, dispatch]);

  useEffect(() => {
    if (!enabled || !paperEl || workspaceMode !== 'dev') return undefined;

    const applyHover = (id: string | null) => {
      if (hoverNodeIdRef.current === id) return;
      hoverNodeIdRef.current = id;
      setHoverNodeId(id);
      dispatch(setDevHoverNodeId(id));
    };

    const onHoverMove = (e: PointerEvent) => {
      if (dragRef.current) {
        applyHover(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.closest?.(
          '[data-ctx-menu],[data-sel-toolbar],[data-export-panel],[data-frame-toolbar],[data-image-tool-panel],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-dev-props]'
        )
      ) {
        applyHover(null);
        return;
      }
      // Only hit-test when the pointer is over the paper / selection chrome.
      if (
        target &&
        !paperEl.contains(target) &&
        !overlayRoot?.contains(target) &&
        !target.closest?.('[data-sel-box],[data-sel-handle]')
      ) {
        applyHover(null);
        return;
      }
      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      applyHover(hitTest(p.x, p.y));
    };

    window.addEventListener('pointermove', onHoverMove, { passive: true });
    return () => window.removeEventListener('pointermove', onHoverMove);
  }, [enabled, paperEl, overlayRoot, artboard, hitTest, workspaceMode, dispatch]);

  useEffect(() => {
    if (!enabled || !paperEl) return undefined;

    const TEXT_DBLCLICK_MS = 450;

    /** Second soft-click on the same text node opens inline edit. */
    const tryOpenTextEdit = (id: string) => {
      if (readOnly) return false;
      const node = document?.deltaSetLike?.[id];
      if (node?.key !== 'text' || !onEditText) {
        lastTextClickRef.current = null;
        return false;
      }
      const now = performance.now();
      const prev = lastTextClickRef.current;
      if (prev && prev.id === id && now - prev.at < TEXT_DBLCLICK_MS) {
        lastTextClickRef.current = null;
        onSelect([id]);
        onEditText(id);
        return true;
      }
      lastTextClickRef.current = { id, at: now };
      return false;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          '[data-ctx-menu],[data-sel-toolbar],[data-frame-toolbar],[data-export-panel],[data-image-label],[data-frame-label],[data-crop-expand-overlay],[data-crop-expand-toolbar],[data-image-tool-panel],[data-shape-style-panel],[data-gradient-handles],[data-mesh-handles],[data-color-panel],[data-text-inline-editor],[data-frame-handle]'
        )
      )
        return;

      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      const liveUnionNow = liveUnionRef.current;
      const liveOriginsNow = liveOriginsRef.current;
      const liveAngleNow = liveAngleRef.current;

      const rotateEl = target.closest('[data-sel-handle="rotate"]') as HTMLElement | null;
      if (rotateEl && liveUnionNow && liveOriginsNow?.length) {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const center = {
          x: liveUnionNow.left + liveUnionNow.width / 2,
          y: liveUnionNow.top + liveUnionNow.height / 2,
        };
        const angle0 = liveAngleNow;
        const pointerAngle0 = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
        dragRef.current = {
          mode: 'rotate',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins: liveOriginsNow.map((o) => ({
            nodeId: o.nodeId,
            box: { ...o.box },
            angle0: readNodeAngle(document, o.nodeId),
          })),
          union: { ...liveUnionNow },
          angle0,
          center,
          pointerAngle0,
        };
        setTransformingNotify(true);
        paperEl.setPointerCapture?.(e.pointerId);
        return;
      }

      const resizeEl = target.closest('[data-sel-handle="resize"]') as HTMLElement | null;
      if (resizeEl && liveUnionNow && liveOriginsNow?.length) {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const handle = (resizeEl.getAttribute('data-resize') || 'se') as ResizeHandle;
        dragRef.current = {
          mode: 'resize',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins: liveOriginsNow.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })),
          union: { ...liveUnionNow },
          handle,
          // Multi-select union is axis-aligned; single keeps node angle for local resize.
          angle0: liveOriginsNow.length === 1 ? liveAngleNow : 0,
          aspectRatio: liveUnionNow.width / Math.max(1, liveUnionNow.height),
        };
        setTransformingNotify(true);
        paperEl.setPointerCapture?.(e.pointerId);
        return;
      }

      // Hit-test scene nodes (selection chrome is non-blocking so empty clicks pass through).
      const hitId = hitTest(p.x, p.y);
      const selectedIds = liveOriginsNow?.map((o) => o.nodeId) ?? [];

      // Drag to move only when pressing an already-selected node — not the empty AABB gap.
      if (
        hitId &&
        selectedIds.includes(hitId) &&
        liveUnionNow &&
        liveOriginsNow?.length
      ) {
        if (readOnly) {
          e.preventDefault();
          dragRef.current = {
            mode: 'blank',
            startX: e.clientX,
            startY: e.clientY,
            sceneX0: p.x,
            sceneY0: p.y,
            origins: [],
            union: { left: p.x, top: p.y, width: 1, height: 1 },
          };
          paperEl.setPointerCapture?.(e.pointerId);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
          mode: 'move',
          startX: e.clientX,
          startY: e.clientY,
          sceneX0: p.x,
          sceneY0: p.y,
          origins: liveOriginsNow.map((o) => ({ nodeId: o.nodeId, box: { ...o.box } })),
          union: { ...liveUnionNow },
        };
        setTransformingNotify(true);
        paperEl.setPointerCapture?.(e.pointerId);
        return;
      }

      // Empty canvas / unselected node → marquee (soft-click clears or selects).
      // Pan with Space / Hand tool / middle-mouse (not empty left-drag).
      e.preventDefault();
      dragRef.current = {
        mode: 'marquee',
        startX: e.clientX,
        startY: e.clientY,
        sceneX0: p.x,
        sceneY0: p.y,
        origins: [],
        union: { left: p.x, top: p.y, width: 1, height: 1 },
      };
      if (!readOnly) {
        setMarquee({ left: p.x, top: p.y, width: 1, height: 1 });
      }
      paperEl.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === 'blank') {
        // Stage owns empty-drag pan; abandon soft click once the pointer moves.
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
          dragRef.current = null;
        }
        return;
      }
      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      const dx = p.x - drag.sceneX0;
      const dy = p.y - drag.sceneY0;

      if (drag.mode === 'marquee') {
        setMarquee(normalizeBox(drag.sceneX0, drag.sceneY0, p.x, p.y));
        return;
      }

      if (drag.mode === 'rotate' && drag.center && drag.pointerAngle0 != null) {
        const now = (Math.atan2(p.y - drag.center.y, p.x - drag.center.x) * 180) / Math.PI;
        let next = (drag.angle0 || 0) + (now - drag.pointerAngle0);
        if (e.shiftKey) next = Math.round(next / 15) * 15;
        const delta = next - (drag.angle0 || 0);
        setLiveAngle(next);
        if (drag.origins.length === 1) {
          onAnglePreview?.(drag.origins[0].nodeId, next);
          return;
        }
        const moved = rotateBoxesAround(
          drag.origins.map((o) => o.box),
          drag.center,
          delta
        );
        const nextOrigins = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          box: moved[i],
          angle0: o.angle0,
        }));
        const nextUnion = unionOfBoxes(moved) || drag.union;
        setLiveOrigins(nextOrigins.map((o) => ({ nodeId: o.nodeId, box: o.box })));
        setLiveUnion(nextUnion);
        onGeometryPreview?.(
          nextOrigins.map((o) => ({
            nodeId: o.nodeId,
            left: o.box.left,
            top: o.box.top,
            width: o.box.width,
            height: o.box.height,
          }))
        );
        nextOrigins.forEach((o) => {
          onAnglePreview?.(o.nodeId, Number(o.angle0 || 0) + delta);
        });
        return;
      }

      if (drag.mode === 'move') {
        let nextUnion = {
          ...drag.union,
          left: drag.union.left + dx,
          top: drag.union.top + dy,
        };
        const others = listNodeIds()
          .filter((id) => !drag.origins.some((o) => o.nodeId === id))
          .map((id) => getNodeBox(id))
          .filter(Boolean) as SceneBox[];
        const frames = frameGuideBoxes(document);
        const snapped = snapBoxToGuides(nextUnion, others, frames);
        nextUnion = {
          ...snapped.box,
          left: Math.round(snapped.box.left),
          top: Math.round(snapped.box.top),
        };
        setGuides(snapped.guides);
        setMoveMargins(computeMoveMarginMeasures(nextUnion, others, frames));
        const sdx = nextUnion.left - drag.union.left;
        const sdy = nextUnion.top - drag.union.top;
        const nextOrigins = drag.origins.map((o) => ({
          nodeId: o.nodeId,
          box: {
            ...o.box,
            left: Math.round(o.box.left + sdx),
            top: Math.round(o.box.top + sdy),
          },
        }));
        setLiveUnion(nextUnion);
        setLiveOrigins(nextOrigins);
        onGeometryPreview?.(
          nextOrigins.map((o) => ({
            nodeId: o.nodeId,
            left: o.box.left,
            top: o.box.top,
            width: o.box.width,
            height: o.box.height,
          }))
        );
        return;
      }

      if (drag.mode === 'resize' && drag.handle) {
        const strokeId = drag.origins.length === 1 ? drag.origins[0].nodeId : '';
        const strokeType = strokeId ? readNodeShapeType(document, strokeId) : '';
        if (
          strokeId &&
          isStrokeShapeType(strokeType) &&
          (drag.handle === 'e' || drag.handle === 'w')
        ) {
          // Free endpoint: opposite end fixed → length + angle together.
          const placed = resizeStrokeByEndpoint(
            drag.union,
            drag.angle0 || 0,
            drag.handle,
            p.x,
            p.y
          );
          const next = {
            left: placed.x,
            top: placed.y,
            width: placed.width,
            height: placed.height,
          };
          setGuides([]);
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: strokeId, box: next }]);
          setLiveAngle(placed.angle);
          onGeometryPreview?.([
            {
              nodeId: strokeId,
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height,
            },
          ]);
          onAnglePreview?.(strokeId, placed.angle);
          return;
        }
        const lockAspect = e.shiftKey;
        let next = resizeFromHandle(drag.union, drag.handle, dx, dy, drag.angle0 || 0, {
          lockAspect,
          aspectRatio: drag.aspectRatio,
        });
        const others = listNodeIds()
          .filter((id) => !drag.origins.some((o) => o.nodeId === id))
          .map((id) => getNodeBox(id))
          .filter(Boolean) as SceneBox[];
        const frames = frameGuideBoxes(document);
        // Axis-aligned snap only (skip when the single node is rotated).
        const canSnap = !(drag.origins.length === 1 && Math.abs(drag.angle0 || 0) > 0.5);
        if (canSnap) {
          const snapped = snapResizeToGuides(next, drag.handle, others, frames);
          next = {
            ...snapped.box,
            left: Math.round(snapped.box.left),
            top: Math.round(snapped.box.top),
            width: Math.max(1, Math.round(snapped.box.width)),
            height: Math.max(1, Math.round(snapped.box.height)),
          };
          setGuides(snapped.guides);
        } else {
          setGuides([]);
        }
        if (drag.origins.length === 1) {
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: drag.origins[0].nodeId, box: next }]);
          onGeometryPreview?.([
            {
              nodeId: drag.origins[0].nodeId,
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height,
            },
          ]);
          return;
        }
        const scaled = scaleBoxesToUnion(
          drag.origins.map((o) => o.box),
          drag.union,
          next
        );
        const nextOrigins = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          box: scaled[i],
        }));
        setLiveUnion(next);
        setLiveOrigins(nextOrigins);
        onGeometryPreview?.(
          nextOrigins.map((o) => ({
            nodeId: o.nodeId,
            left: o.box.left,
            top: o.box.top,
            width: o.box.width,
            height: o.box.height,
          }))
        );
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setTransformingNotify(false);
      setMoveMargins(null);
      setGuides([]);
      try {
        paperEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      const dx = p.x - drag.sceneX0;
      const dy = p.y - drag.sceneY0;
      const clientMoved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);

      if (drag.mode === 'marquee') {
        const box = normalizeBox(drag.sceneX0, drag.sceneY0, p.x, p.y);
        setMarquee(null);
        const movedFar = clientMoved > 3;
        if (!movedFar) {
          const id = hitTest(p.x, p.y);
          if (!id) lastTextClickRef.current = null;
          else if (tryOpenTextEdit(id)) return;
          onSelect(id ? [id] : [], { additive: e.shiftKey });
          return;
        }
        lastTextClickRef.current = null;
        const hits = listNodeIds().filter((id) => {
          const b = getNodeBox(id);
          return b && boxesIntersect(box, b);
        });
        onSelect(hits, { additive: e.shiftKey });
        return;
      }

      if (drag.mode === 'blank') {
        if (clientMoved <= 4) {
          const id = hitTest(p.x, p.y);
          if (id && tryOpenTextEdit(id)) return;
          onSelect(id ? [id] : [], { additive: e.shiftKey });
        }
        return;
      }

      if (drag.mode === 'rotate' && drag.center && drag.pointerAngle0 != null) {
        const now = (Math.atan2(p.y - drag.center.y, p.x - drag.center.x) * 180) / Math.PI;
        let next = (drag.angle0 || 0) + (now - drag.pointerAngle0);
        if (e.shiftKey) next = Math.round(next / 15) * 15;
        const delta = next - (drag.angle0 || 0);
        setLiveAngle(next);
        if (drag.origins.length === 1) {
          onAngleCommit?.(drag.origins[0].nodeId, next);
          return;
        }
        const moved = rotateBoxesAround(
          drag.origins.map((o) => o.box),
          drag.center,
          delta
        );
        const patches = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          left: moved[i].left,
          top: moved[i].top,
          width: moved[i].width,
          height: moved[i].height,
        }));
        const nextUnion = unionOfBoxes(moved) || drag.union;
        setLiveUnion(nextUnion);
        setLiveOrigins(patches.map((pt) => ({ nodeId: pt.nodeId, box: pt })));
        if (Math.abs(delta) > 0.01) {
          onGeometryCommit(patches);
          drag.origins.forEach((o) => {
            onAngleCommit?.(o.nodeId, Number(o.angle0 || 0) + delta);
          });
        }
        // Multi chrome is axis-aligned; reset visual group angle after commit.
        setLiveAngle(0);
        return;
      }

      if (drag.mode === 'move') {
        let nextUnion = {
          ...drag.union,
          left: drag.union.left + dx,
          top: drag.union.top + dy,
        };
        const others = listNodeIds()
          .filter((id) => !drag.origins.some((o) => o.nodeId === id))
          .map((id) => getNodeBox(id))
          .filter(Boolean) as SceneBox[];
        const snapped = snapBoxToGuides(nextUnion, others, frameGuideBoxes(document));
        nextUnion = {
          ...snapped.box,
          left: Math.round(snapped.box.left),
          top: Math.round(snapped.box.top),
        };
        const sdx = nextUnion.left - drag.union.left;
        const sdy = nextUnion.top - drag.union.top;
        const patches = drag.origins.map((o) => ({
          nodeId: o.nodeId,
          left: Math.round(o.box.left + sdx),
          top: Math.round(o.box.top + sdy),
          width: o.box.width,
          height: o.box.height,
        }));
        setGuides([]);
        setMoveMargins(null);
        setLiveUnion(nextUnion);
        setLiveOrigins(patches.map((pt) => ({ nodeId: pt.nodeId, box: pt })));
        if (Math.hypot(sdx, sdy) > 0.01) {
          lastTextClickRef.current = null;
          onGeometryCommit(patches);
        } else if (clientMoved <= 4) {
          // Soft-click on selected node (no drag): keep selection / open text edit.
          if (drag.origins.length === 1 && tryOpenTextEdit(drag.origins[0].nodeId)) return;
        }
        return;
      }

      if (drag.mode === 'resize' && drag.handle) {
        const strokeId = drag.origins.length === 1 ? drag.origins[0].nodeId : '';
        const strokeType = strokeId ? readNodeShapeType(document, strokeId) : '';
        if (
          strokeId &&
          isStrokeShapeType(strokeType) &&
          (drag.handle === 'e' || drag.handle === 'w')
        ) {
          const placed = resizeStrokeByEndpoint(
            drag.union,
            drag.angle0 || 0,
            drag.handle,
            p.x,
            p.y
          );
          const next = {
            left: placed.x,
            top: placed.y,
            width: placed.width,
            height: placed.height,
          };
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: strokeId, box: next }]);
          setLiveAngle(placed.angle);
          lastTextClickRef.current = null;
          // Angle first so geometry rebuild reads the updated attrs.angle.
          onAngleCommit?.(strokeId, placed.angle);
          onGeometryCommit([
            {
              nodeId: strokeId,
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height,
            },
          ]);
          return;
        }
        const lockAspect = e.shiftKey;
        let next = resizeFromHandle(drag.union, drag.handle, dx, dy, drag.angle0 || 0, {
          lockAspect,
          aspectRatio: drag.aspectRatio,
        });
        const others = listNodeIds()
          .filter((id) => !drag.origins.some((o) => o.nodeId === id))
          .map((id) => getNodeBox(id))
          .filter(Boolean) as SceneBox[];
        const frames = frameGuideBoxes(document);
        const canSnap = !(drag.origins.length === 1 && Math.abs(drag.angle0 || 0) > 0.5);
        if (canSnap) {
          const snapped = snapResizeToGuides(next, drag.handle, others, frames);
          next = {
            ...snapped.box,
            left: Math.round(snapped.box.left),
            top: Math.round(snapped.box.top),
            width: Math.max(1, Math.round(snapped.box.width)),
            height: Math.max(1, Math.round(snapped.box.height)),
          };
        }
        if (drag.origins.length === 1) {
          setLiveUnion(next);
          setLiveOrigins([{ nodeId: drag.origins[0].nodeId, box: next }]);
          onGeometryCommit([
            {
              nodeId: drag.origins[0].nodeId,
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height,
            },
          ]);
          return;
        }
        const scaled = scaleBoxesToUnion(
          drag.origins.map((o) => o.box),
          drag.union,
          next
        );
        const patches = drag.origins.map((o, i) => ({
          nodeId: o.nodeId,
          left: scaled[i].left,
          top: scaled[i].top,
          width: scaled[i].width,
          height: scaled[i].height,
        }));
        setLiveUnion(next);
        setLiveOrigins(patches.map((pt) => ({ nodeId: pt.nodeId, box: pt })));
        onGeometryCommit(patches);
      }
    };

    const onDblClick = (e: MouseEvent) => {
      if (readOnly) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-sel-toolbar],[data-frame-toolbar],[data-text-inline-editor]')) {
        return;
      }
      const p = clientToScene(paperEl, artboard, e.clientX, e.clientY);
      let hit = hitTest(p.x, p.y);
      // Selection chrome covers the glyph — fall back to the single selected text node.
      if (!hit && target?.closest?.('[data-sel-box]')) {
        const ids = liveOriginsRef.current?.map((o) => o.nodeId) || [];
        if (ids.length === 1 && document?.deltaSetLike?.[ids[0]]?.key === 'text') {
          hit = ids[0];
        }
      }
      if (!hit) return;
      const node = document?.deltaSetLike?.[hit];
      if (node?.key === 'text') {
        e.preventDefault();
        e.stopPropagation();
        lastTextClickRef.current = null;
        onSelect([hit]);
        onEditText?.(hit);
      }
    };

    // Chrome lives in the unscaled overlay — also listen there for resize/rotate / dblclick.
    paperEl.addEventListener('pointerdown', onDown);
    overlayRoot?.addEventListener('pointerdown', onDown);
    paperEl.addEventListener('dblclick', onDblClick);
    overlayRoot?.addEventListener('dblclick', onDblClick);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      paperEl.removeEventListener('pointerdown', onDown);
      overlayRoot?.removeEventListener('pointerdown', onDown);
      paperEl.removeEventListener('dblclick', onDblClick);
      overlayRoot?.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [
    enabled,
    readOnly,
    paperEl,
    overlayRoot,
    artboard,
    document,
    onSelect,
    onGeometryCommit,
    onGeometryPreview,
    onAngleCommit,
    onAnglePreview,
    onEditText,
    hitTest,
    getNodeBox,
    listNodeIds,
    document,
  ]);

  /** Arrow keys nudge selection 1px (Shift = 10px) and show margin labels. */
  useEffect(() => {
    if (!enabled || suppressChrome || readOnly) return undefined;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (dragRef.current) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          t.closest?.(
            '[data-fill-panel],[data-color-panel],[data-stroke-panel],[data-shape-style-panel],[data-sel-toolbar],[data-frame-toolbar],[data-text-inline-editor]'
          ))
      ) {
        return;
      }
      const origins = liveOriginsRef.current;
      const union = liveUnionRef.current;
      if (!origins?.length || !union) return;

      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const nextUnion = { ...union, left: union.left + dx, top: union.top + dy };
      const nextOrigins = origins.map((o) => ({
        nodeId: o.nodeId,
        box: { ...o.box, left: o.box.left + dx, top: o.box.top + dy },
      }));
      const others = listNodeIds()
        .filter((id) => !origins.some((o) => o.nodeId === id))
        .map((id) => getNodeBox(id))
        .filter(Boolean) as SceneBox[];
      const frames = frameGuideBoxes(document);
      setLiveUnion(nextUnion);
      setLiveOrigins(nextOrigins);
      setMoveMargins(computeMoveMarginMeasures(nextUnion, others, frames));
      onGeometryCommit(
        nextOrigins.map((o) => ({
          nodeId: o.nodeId,
          left: o.box.left,
          top: o.box.top,
          width: o.box.width,
          height: o.box.height,
        }))
      );
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setMoveMargins(null), 600);
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [
    enabled,
    readOnly,
    suppressChrome,
    document,
    listNodeIds,
    getNodeBox,
    onGeometryCommit,
  ]);

  if (!enabled) return null;

  const single = selectedNodeIds.length === 1;
  const singleShapeType = single
    ? String(document?.deltaSetLike?.[selectedNodeIds[0]]?.attrs?.shapeType || '')
    : '';
  const lineChrome =
    single && (singleShapeType === 'line' || singleShapeType === 'arrow');
  const inspectDev = workspaceMode === 'dev';

  const selectedSingleId =
    inspectDev && selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;

  const selectedBox = (() => {
    if (!selectedSingleId) return null;
    if (liveUnion && selectedSingleId === selectedNodeIds[0] && !transforming) {
      return liveUnion;
    }
    return getNodeBox(selectedSingleId);
  })();

  const hoverBox =
    inspectDev && hoverNodeId && hoverNodeId !== selectedSingleId
      ? getNodeBox(hoverNodeId)
      : null;

  const spacingOthers =
    selectedBox && !hoverBox
      ? (listNodeIds()
          .filter((id) => id !== selectedSingleId)
          .map((id) => getNodeBox(id))
          .filter(Boolean) as SceneBox[])
      : [];

  const spacingAngle =
    selectedSingleId && selectedNodeIds.length === 1 && selectedNodeIds[0] === selectedSingleId
      ? liveAngle
      : selectedSingleId
        ? Number(document?.deltaSetLike?.[selectedSingleId]?.attrs?.angle || 0)
        : 0;

  const hoverOutline =
    inspectDev &&
    hoverBox &&
    hoverNodeId &&
    !selectedNodeIds.includes(hoverNodeId) &&
    !transforming
      ? hoverBox
      : null;

  return (
    <>
      <AlignGuidesOverlay guides={guides} artboard={artboard} />

      {moveMargins && liveUnion ? (
        <SpacingInspectOverlay
          box={liveUnion}
          others={[]}
          measures={moveMargins}
          showSizeBadge={false}
          color="#E11D8F"
        />
      ) : null}

      {hoverOutline ? (
        <div
          className="pointer-events-none absolute z-[25] border border-dashed border-[#3388ff]"
          style={{
            left: hoverOutline.left,
            top: hoverOutline.top,
            width: hoverOutline.width,
            height: hoverOutline.height,
          }}
        />
      ) : null}

      {inspectDev && selectedBox && selectedSingleId && !suppressChrome && !transforming ? (
        <SpacingInspectOverlay
          box={selectedBox}
          others={spacingOthers}
          pairBox={hoverBox}
          showGaps={Math.abs(spacingAngle) <= 0.5}
        />
      ) : null}

      {marquee ? (
        <div
          className="pointer-events-none absolute z-20 border border-[#3388ff] bg-[rgba(51,136,255,0.08)]"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      ) : null}

      {liveOrigins && liveOrigins.length > 1 && !transforming
        ? liveOrigins.map((o) => (
            <div
              key={o.nodeId}
              className="pointer-events-none absolute z-[9] border border-dashed border-[#3388ff]/55"
              style={{
                left: o.box.left,
                top: o.box.top,
                width: o.box.width,
                height: o.box.height,
              }}
            />
          ))
        : null}

      {liveUnion && !suppressChrome ? (
        <SelectionChrome
          box={liveUnion}
          angle={liveAngle}
          showHandles={!readOnly}
          cornerHandlesOnly={!single}
          variant={lineChrome ? 'line' : 'box'}
          showRotate={!readOnly && !lineChrome}
          // Let empty clicks pass through the AABB; move starts via hit-test on nodes.
          interactiveBox={false}
          cornerRadii={
            single && selectedNodeIds[0]
              ? (() => {
                  const n = document?.deltaSetLike?.[selectedNodeIds[0]];
                  if (!supportsCornerRadius(n)) return null;
                  return radiiFromAttrs(n?.attrs);
                })()
              : null
          }
        />
      ) : null}

      {!inspectDev && liveUnion && single && !transforming && !suppressToolbars ? (
        <SelectionContextToolbar
          document={document}
          nodeId={selectedNodeIds[0]}
          box={liveUnion}
          onOpenAgent={onOpenAgent}
        />
      ) : null}

      {!inspectDev &&
      liveUnion &&
      single &&
      !transforming &&
      !suppressToolbars &&
      document?.deltaSetLike?.[selectedNodeIds[0]]?.key === 'image' &&
      String(document?.deltaSetLike?.[selectedNodeIds[0]]?.attrs?.processStatus || '') !==
        'running' ? (
        <ImageReplaceCornerButton
          nodeId={selectedNodeIds[0]}
          box={liveUnion}
          angle={liveAngle}
        />
      ) : null}

      {!inspectDev &&
      liveUnion &&
      !single &&
      selectedNodeIds.length > 1 &&
      !transforming &&
      !suppressToolbars ? (
        <MultiSelectionToolbar
          document={document}
          nodeIds={selectedNodeIds}
          box={liveUnion}
        />
      ) : null}
    </>
  );
}
