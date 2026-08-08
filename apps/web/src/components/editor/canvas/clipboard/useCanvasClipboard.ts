import { useCallback, useEffect, type RefObject } from 'react';
import { useDispatch } from 'react-redux';
import {
  addNodeToDocument,
  createSvgNode,
  createTextNode,
  nodeIdsInsideFrames,
  pasteClipboardIntoDocument,
  snapshotFramesForClipboard,
  snapshotNodesForClipboard,
  clipboardNodesBounds,
  type SceneClipboardPayload,
} from '@/components/rcb/scene/document/sceneDocument';
import {
  DEFAULT_TEXT_BOX_WIDTH,
  measurePlainTextSize,
  measureWrappedTextSize,
} from '@/components/rcb/scene/document/sceneText';
import { getDocumentGridSize, snapCoordToGrid } from '@/components/rcb/selection/alignGuides';
import {
  setDocument,
  setMixedSelection,
  setSelectedNodeId,
  setSelectedNodeIds,
} from '@/store/modules/editor';
import {
  decodeClipboardSvgText,
  fileLooksLikeSvg,
  fingerprintSystemPaste,
  looksLikeSvgMarkup,
  measureSvgMarkupSize,
  readSystemPasteFromNavigator,
  readSystemPastePayload,
  type SystemPastePayload,
} from '../systemPaste';

export type CanvasClipboardApi = {
  copySelected: (nodeIds?: string[], frameIds?: string[]) => boolean;
  cutSelected: (nodeIds?: string[], frameIds?: string[]) => void;
  pasteClipboard: (opts?: { anchor?: { x: number; y: number } }) => void;
  duplicateSelected: (nodeIds?: string[], frameIds?: string[]) => void;
  pasteFromOsOrInternal: (opts?: {
    anchor?: { x: number; y: number } | null;
    data?: DataTransfer | null;
  }) => Promise<void>;
};

type UseCanvasClipboardArgs = {
  readOnly: boolean;
  artboardWidth?: number;
  documentRef: RefObject<any>;
  selectedIdsRef: RefObject<string[]>;
  selectedFrameIdsRef: RefObject<string[]>;
  activeFrameIdRef: RefObject<string | null>;
  clipboardRef: RefObject<SceneClipboardPayload | null>;
  internalClipboardAtRef: RefObject<number>;
  osClipboardMetaRef: RefObject<{ fingerprint: string; at: number }>;
  imagePlaceAtRef: RefObject<{ x: number; y: number } | null>;
  deleteCanvasSelection: (opts?: { nodeIds?: string[]; frameIds?: string[] }) => boolean;
  placeOriginForSize: (
    size: { width: number; height: number },
    anchor?: { x: number; y: number } | null
  ) => { x: number; y: number } | null;
  finishToSelect: () => void;
  onImageFile: (file: File | null) => void | Promise<void>;
  onVideoFile: (file: File | null) => void | Promise<void>;
  onAudioFile: (file: File | null) => void | Promise<void>;
  onLottiePaste: (payload: {
    animationData: Record<string, unknown>;
    name?: string;
    anchor?: { x: number; y: number } | null;
  }) => void | Promise<void>;
};

export function useCanvasClipboard(args: UseCanvasClipboardArgs): CanvasClipboardApi {
  const {
    readOnly,
    artboardWidth,
    documentRef,
    selectedIdsRef,
    selectedFrameIdsRef,
    activeFrameIdRef,
    clipboardRef,
    internalClipboardAtRef,
    osClipboardMetaRef,
    imagePlaceAtRef,
    deleteCanvasSelection,
    placeOriginForSize,
    finishToSelect,
    onImageFile,
    onVideoFile,
    onAudioFile,
    onLottiePaste,
  } = args;
  const dispatch = useDispatch();

  const copySelected = useCallback(
    (nodeIds?: string[], frameIds?: string[]) => {
      const doc = documentRef.current;
      if (!doc) return false;
      let nodes = nodeIds ? [...nodeIds] : [...selectedIdsRef.current];
      let frames = frameIds ? [...frameIds] : [...selectedFrameIdsRef.current];
      if (!frames.length && !nodes.length && activeFrameIdRef.current) {
        frames = [activeFrameIdRef.current];
      }
      if (frames.length) {
        nodes = [...new Set([...nodes, ...nodeIdsInsideFrames(doc, frames)])];
      }
      const nodeSnap = nodes.length ? snapshotNodesForClipboard(doc, nodes) : null;
      const frameSnap = snapshotFramesForClipboard(doc, frames);
      if (!nodeSnap?.nodes?.length && !frameSnap.length) return false;
      clipboardRef.current = {
        nodes: nodeSnap?.nodes || [],
        ...(frameSnap.length ? { frames: frameSnap } : {}),
      };
      internalClipboardAtRef.current = performance.now();
      return true;
    },
    [
      activeFrameIdRef,
      clipboardRef,
      documentRef,
      internalClipboardAtRef,
      selectedFrameIdsRef,
      selectedIdsRef,
    ]
  );

  const cutSelected = useCallback(
    (nodeIds?: string[], frameIds?: string[]) => {
      const nodes = nodeIds ? [...nodeIds] : [...selectedIdsRef.current];
      let frames = frameIds ? [...frameIds] : [...selectedFrameIdsRef.current];
      if (!frames.length && !nodes.length && activeFrameIdRef.current) {
        frames = [activeFrameIdRef.current];
      }
      if (!copySelected(nodes, frames)) return;
      deleteCanvasSelection({ nodeIds: nodes, frameIds: frames });
    },
    [
      activeFrameIdRef,
      copySelected,
      deleteCanvasSelection,
      selectedFrameIdsRef,
      selectedIdsRef,
    ]
  );

  const pasteClipboard = useCallback(
    (opts?: { anchor?: { x: number; y: number } }) => {
      const doc = documentRef.current;
      const payload = clipboardRef.current;
      if (!doc || readOnly) return;
      if (!payload?.nodes?.length && !payload?.frames?.length) return;
      // Paste nudge on the snap lattice (default 1px).
      const g = getDocumentGridSize(doc);
      const nudge = Math.max(10, snapCoordToGrid(10, g));
      const { document: next, ids: newIds, frameIds: newFrameIds } = pasteClipboardIntoDocument(
        doc,
        payload,
        {
          offsetX: nudge,
          offsetY: nudge,
          anchor: opts?.anchor,
        }
      );
      if (!newIds.length && !newFrameIds.length) return;
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setMixedSelection({ nodeIds: newIds, frameIds: newFrameIds }));
    },
    [clipboardRef, dispatch, documentRef, readOnly]
  );

  const duplicateSelected = useCallback(
    (nodeIds?: string[], frameIds?: string[]) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return;
      let nodes = nodeIds ? [...nodeIds] : [...selectedIdsRef.current];
      let frames = frameIds ? [...frameIds] : [...selectedFrameIdsRef.current];
      if (!frames.length && !nodes.length && activeFrameIdRef.current) {
        frames = [activeFrameIdRef.current];
      }
      if (frames.length) {
        nodes = [...new Set([...nodes, ...nodeIdsInsideFrames(doc, frames)])];
      }
      const nodeSnap = nodes.length ? snapshotNodesForClipboard(doc, nodes) : null;
      const frameSnap = snapshotFramesForClipboard(doc, frames);
      if (!nodeSnap?.nodes?.length && !frameSnap.length) return;
      const snap: SceneClipboardPayload = {
        nodes: nodeSnap?.nodes || [],
        ...(frameSnap.length ? { frames: frameSnap } : {}),
      };
      const bounds = clipboardNodesBounds(snap);
      // Place to the right with a 10px gutter on the snap lattice (default 1px).
      const g = getDocumentGridSize(doc);
      const gap = Math.max(10, g);
      const offsetX = snapCoordToGrid((bounds?.width ?? 0) + gap, g);
      const { document: next, ids: newIds, frameIds: newFrameIds } = pasteClipboardIntoDocument(
        doc,
        snap,
        {
          offsetX,
          offsetY: 0,
        }
      );
      if (!newIds.length && !newFrameIds.length) return;
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setMixedSelection({ nodeIds: newIds, frameIds: newFrameIds }));
    },
    [
      activeFrameIdRef,
      dispatch,
      documentRef,
      readOnly,
      selectedFrameIdsRef,
      selectedIdsRef,
    ]
  );

  const insertPastedText = useCallback(
    (text: string, anchor?: { x: number; y: number } | null) => {
      const doc = documentRef.current;
      const content = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (!doc || readOnly || !content.trim()) return false;
      const boardW = Math.max(0, Number(artboardWidth) || 0);
      const maxW = Math.max(
        DEFAULT_TEXT_BOX_WIDTH,
        Math.min(480, boardW > 0 ? Math.round(boardW * 0.5) : 420)
      );
      const natural = measurePlainTextSize(content);
      const wrap = natural.width > maxW;
      const box = wrap
        ? measureWrappedTextSize(content, {}, maxW)
        : { width: natural.width, height: natural.height };
      const origin =
        placeOriginForSize({ width: box.width, height: box.height }, anchor) || {
          x: 40,
          y: 40,
        };
      const { id, node } = createTextNode({
        x: origin.x,
        y: origin.y,
        text: content,
        width: box.width,
        height: box.height,
        autoSize: !wrap,
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([id]));
      dispatch(setSelectedNodeId(id));
      finishToSelect();
      return true;
    },
    [artboardWidth, dispatch, documentRef, finishToSelect, placeOriginForSize, readOnly]
  );

  const insertPastedSvg = useCallback(
    (markup: string, anchor?: { x: number; y: number } | null) => {
      const doc = documentRef.current;
      if (!doc || readOnly) return false;
      const decoded = decodeClipboardSvgText(markup);
      if (!looksLikeSvgMarkup(decoded)) return false;
      const { width, height, svg } = measureSvgMarkupSize(decoded);
      const origin = placeOriginForSize({ width, height }, anchor) || { x: 40, y: 40 };
      const { id, node } = createSvgNode({
        x: origin.x,
        y: origin.y,
        width,
        height,
        svg,
        name: 'SVG',
      });
      const next = addNodeToDocument(doc, id, node);
      documentRef.current = next;
      dispatch(setDocument(next));
      dispatch(setSelectedNodeIds([id]));
      dispatch(setSelectedNodeId(id));
      finishToSelect();
      return true;
    },
    [dispatch, documentRef, finishToSelect, placeOriginForSize, readOnly]
  );

  const pasteSystemPayload = useCallback(
    async (
      payload: SystemPastePayload,
      opts?: { anchor?: { x: number; y: number } | null }
    ): Promise<boolean> => {
      if (readOnly) return false;
      const anchor = opts?.anchor ?? null;
      if (payload.kind === 'text') return insertPastedText(payload.text, anchor);
      if (payload.kind === 'svg') return insertPastedSvg(payload.markup, anchor);
      if (payload.kind === 'image') {
        if (fileLooksLikeSvg(payload.file)) {
          try {
            const markup = decodeClipboardSvgText(await payload.file.text());
            if (looksLikeSvgMarkup(markup)) return insertPastedSvg(markup, anchor);
          } catch {
            /* fall through to raster upload */
          }
        }
        imagePlaceAtRef.current = anchor;
        onImageFile(payload.file);
        return true;
      }
      if (payload.kind === 'video') {
        imagePlaceAtRef.current = anchor;
        onVideoFile(payload.file);
        return true;
      }
      if (payload.kind === 'audio') {
        imagePlaceAtRef.current = anchor;
        onAudioFile(payload.file);
        return true;
      }
      if (payload.kind === 'lottie') {
        void onLottiePaste({
          animationData: payload.animationData,
          name: payload.name,
          anchor,
        });
        return true;
      }
      return false;
    },
    [
      imagePlaceAtRef,
      insertPastedSvg,
      insertPastedText,
      onAudioFile,
      onImageFile,
      onLottiePaste,
      onVideoFile,
      readOnly,
    ]
  );

  const pasteFromOsOrInternal = useCallback(
    async (opts?: {
      anchor?: { x: number; y: number } | null;
      data?: DataTransfer | null;
    }) => {
      if (readOnly) return;
      const hasInternal = Boolean(
        clipboardRef.current?.nodes?.length || clipboardRef.current?.frames?.length
      );
      const fromEvent = await readSystemPastePayload(opts?.data ?? null);
      const fromNav =
        !fromEvent && !opts?.data ? await readSystemPasteFromNavigator() : null;
      const system = fromEvent || fromNav;

      if (system) {
        const fp = fingerprintSystemPaste(system);
        if (fp && fp !== osClipboardMetaRef.current.fingerprint) {
          osClipboardMetaRef.current = { fingerprint: fp, at: performance.now() };
        } else if (fp && !osClipboardMetaRef.current.at) {
          osClipboardMetaRef.current = { fingerprint: fp, at: performance.now() };
        }
      }

      const preferInternal =
        hasInternal &&
        (!system || internalClipboardAtRef.current >= osClipboardMetaRef.current.at);

      if (preferInternal) {
        pasteClipboard(opts?.anchor ? { anchor: opts.anchor } : undefined);
        return;
      }

      if (system) {
        const ok = await pasteSystemPayload(system, { anchor: opts?.anchor });
        if (ok) return;
      }

      if (hasInternal) {
        pasteClipboard(opts?.anchor ? { anchor: opts.anchor } : undefined);
      }
    },
    [
      clipboardRef,
      internalClipboardAtRef,
      osClipboardMetaRef,
      pasteClipboard,
      pasteSystemPayload,
      readOnly,
    ]
  );

  useEffect(() => {
    if (readOnly) return undefined;

    const isTypingTarget = (t: HTMLElement | null) => {
      if (!t) return false;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) {
        return true;
      }
      return Boolean(
        t.closest?.(
          '[data-fill-panel], [data-color-panel], [data-select-dropdown], [data-frame-label], [data-text-inline-editor], [data-agent-composer]'
        )
      );
    };

    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target)) return;

      const hasInternal = Boolean(
        clipboardRef.current?.nodes?.length || clipboardRef.current?.frames?.length
      );
      const data = e.clipboardData;
      let likelyOs = false;
      if (data) {
        if (data.files?.length) likelyOs = true;
        else {
          try {
            for (const item of Array.from(data.items || [])) {
              if (
                item.kind === 'file' ||
                item.type.startsWith('image/') ||
                item.type.startsWith('video/') ||
                item.type.startsWith('audio/') ||
                item.type === 'application/json' ||
                item.type === 'text/json'
              ) {
                likelyOs = true;
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (!likelyOs) {
          const plain = String(data.getData('text/plain') || '').trim();
          if (plain) likelyOs = true;
        }
      }

      if (!likelyOs && !hasInternal) return;

      e.preventDefault();
      e.stopPropagation();
      void pasteFromOsOrInternal({ data });
    };

    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [clipboardRef, pasteFromOsOrInternal, readOnly]);

  return {
    copySelected,
    cutSelected,
    pasteClipboard,
    duplicateSelected,
    pasteFromOsOrInternal,
  };
}
