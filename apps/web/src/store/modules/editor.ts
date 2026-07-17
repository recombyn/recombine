import { createSlice, nanoid } from '@reduxjs/toolkit';
import {
  createEmptyDocument,
  normalizeDocument,
  setDocumentCanvasMeta,
  setDocumentSize,
  updateNodeInDocument,
  alignImportedDocumentOrigin,
  mergeImportedIntoDocument,
  ensureDocumentContentOnCanvas,
  clearImageProcessAttrs,
  spawnImageProcessNode,
  spawnImportPlaceholderNode,
  removeNodesFromDocument,
} from '@/store/scene/sceneDocument';
import { loadTemplates, saveTemplates, isSessionTemplate } from '@/store/templatesStorage';
import type { TemplateSource } from '@/store/templatesStorage';

/** Side panel / toolbar kinds for image tools. */
export type ImageToolPanelKind =
  | 'eraser'
  | 'multiAngle'
  | 'expand'
  | 'crop'
  | 'adjust'
  | 'flipRotate';

/** Editor artboard frame (Redux document.frames). */
export type ArtboardFrame = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  layoutMode?: 'auto' | 'manual';
  /** When true, frame cannot be moved or resized. */
  locked?: boolean;
  /** Size before first ratio preset — restored by 「原始」. */
  aspectOriginalWidth?: number;
  aspectOriginalHeight?: number;
};

function createFrame(partial?: Partial<ArtboardFrame>): ArtboardFrame {
  const width = Math.max(40, Math.round(partial?.width || 794));
  const height = Math.max(40, Math.round(partial?.height || 1123));
  return {
    id: partial?.id || nanoid(8),
    name: partial?.name || 'Frame',
    x: Math.round(partial?.x ?? 0),
    y: Math.round(partial?.y ?? 0),
    width,
    height,
    backgroundColor: partial?.backgroundColor || '#FFFFFF',
  };
}

/** Claim session (`case`/`scratch`) as owned on first real edit; persist snapshot then. */
function syncLibraryOnEdit(state: any, claim = true) {
  if (!state.currentId || !state.document) return;
  const item = state.templates.find((t: any) => t.id === state.currentId);
  if (!item) return;
  if (!(claim && isSessionTemplate(item))) return;
  item.source = 'user' as TemplateSource;
  item.document = JSON.parse(JSON.stringify(state.document));
  item.updatedAt = Date.now();
  saveTemplates(state.templates);
}

function touchOpened(item: any) {
  if (!item) return;
  item.openedAt = Date.now();
}

const templates = loadTemplates();

const initialState = {
  templates,
  currentId: null as string | null,
  document: null as any,
  selectedNodeId: null as string | null,
  selectedNodeIds: [] as string[],
  dirty: false,
  sceneReloadToken: 0,
  documentPatchToken: 0,
  /** Node ids last touched by `patchDocumentNode` — SvgCanvas refreshes these even with no selection. */
  lastPatchedNodeIds: [] as string[],
  historyPast: [] as any[],
  historyFuture: [] as any[],
  activeTool: 'select' as string,
  shapeKind: 'rect' as string,
  pendingImageSrc: null as string | null,
  pendingImageProcessId: null as string | null,
  /** Blank loading node while PDF/DOCX import runs. */
  pendingImportPlaceholderId: null as string | null,
  /** Interactive image tool panel docked to the right of the source image (figs 2-5). */
  imageToolPanel: null as null | { nodeId: string; kind: ImageToolPanelKind },
  /** Fill / stroke panel docked to the right of the selection (hides top chrome while open). */
  shapeStylePanel: null as null | { kind: 'fill' | 'stroke' | 'radius'; nodeIds: string[] },
  /** Shared stroke settings for pen / pencil tools. */
  penStrokeColor: '#333333' as string,
  penStrokeWidth: 1 as number,
  /** Decorative stamp brush for pencil (solid = ink path). */
  pencilBrushId: 'solid' as string,
  /** When true, pencil tool erases existing pencil strokes instead of drawing. */
  pencilEraseMode: false,
  /** Design = edit; Dev = inspect spacing / margins (Figma-like). */
  workspaceMode: 'design' as 'design' | 'dev',
  /** Dev-mode node under pointer (inspect panel + spacing overlay). */
  devHoverNodeId: null as string | null,
  /** True while the design agent is mutating the canvas (hides selection chrome). */
  agentBusy: false,
};

function cloneDocument(doc: any) {
  return doc ? normalizeDocument(JSON.parse(JSON.stringify(doc))) : null;
}

function pushHistory(state: typeof initialState) {
  if (!state.document) return;
  state.historyPast.push(cloneDocument(state.document));
  if (state.historyPast.length > 50) state.historyPast.shift();
  state.historyFuture = [];
}

function clearSelection(state: typeof initialState) {
  state.selectedNodeId = null;
  state.selectedNodeIds = [];
  state.imageToolPanel = null;
  state.shapeStylePanel = null;
}

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    createTemplate(state, action) {
      const id = nanoid();
      const now = Date.now();
      const doc = normalizeDocument(
        action.payload?.document ||
          createEmptyDocument({
            width: action.payload?.width,
            height: action.payload?.height,
            emptyWorld: action.payload?.emptyWorld,
          })
      );
      const source: TemplateSource =
        action.payload?.source === 'user' ||
        action.payload?.source === 'import' ||
        action.payload?.source === 'case' ||
        action.payload?.source === 'scratch'
          ? action.payload.source
          : 'scratch';
      const item = {
        id,
        name: action.payload?.name || '未命名作品',
        updatedAt: now,
        openedAt: now,
        source,
        document: doc,
      };
      state.templates.unshift(item);
      state.currentId = id;
      state.document = doc;
      clearSelection(state);
      state.dirty = false;
      state.historyPast = [];
      state.historyFuture = [];
      state.sceneReloadToken += 1;
      saveTemplates(state.templates);
    },
    openTemplate(state, action) {
      const item = state.templates.find((t) => t.id === action.payload);
      if (!item) return;
      state.currentId = item.id;
      const doc = ensureDocumentContentOnCanvas(item.document);
      // Enter editor with nothing selected (cases often ship activeFrameId).
      doc.activeFrameId = null;
      state.document = doc;
      clearSelection(state);
      state.dirty = false;
      state.historyPast = [];
      state.historyFuture = [];
      state.sceneReloadToken += 1;
      touchOpened(item);
      saveTemplates(state.templates);
    },
    setDocument(state, action) {
      pushHistory(state);
      state.document = normalizeDocument(action.payload);
      state.dirty = true;
      state.sceneReloadToken += 1;
      syncLibraryOnEdit(state);
    },
    setDocumentFromCanvas(state, action) {
      state.document = normalizeDocument(action.payload);
      state.dirty = true;
      syncLibraryOnEdit(state);
    },
    patchDocumentNode(state, action) {
      const { nodeId, patch, skipHistory } = action.payload || {};
      if (!state.document || !nodeId) return;
      if (!skipHistory) pushHistory(state);
      state.document = normalizeDocument(updateNodeInDocument(state.document, nodeId, patch));
      state.dirty = true;
      state.documentPatchToken += 1;
      state.lastPatchedNodeIds = [String(nodeId)];
      syncLibraryOnEdit(state);
    },
    setSelectedNodeId(state, action) {
      state.selectedNodeId = action.payload;
      state.selectedNodeIds = action.payload ? [action.payload] : [];
      if (!action.payload || state.imageToolPanel?.nodeId !== action.payload) {
        state.imageToolPanel = null;
      }
      if (
        !action.payload ||
        !state.shapeStylePanel?.nodeIds?.length ||
        state.shapeStylePanel.nodeIds.length !== 1 ||
        state.shapeStylePanel.nodeIds[0] !== action.payload
      ) {
        state.shapeStylePanel = null;
      }
    },
    setSelectedNodeIds(state, action) {
      const ids = Array.isArray(action.payload) ? action.payload.filter(Boolean) : [];
      state.selectedNodeIds = ids;
      state.selectedNodeId = ids[0] || null;
      if (!ids[0] || state.imageToolPanel?.nodeId !== ids[0]) {
        state.imageToolPanel = null;
      }
      const panelIds = state.shapeStylePanel?.nodeIds || [];
      const same =
        panelIds.length === ids.length &&
        panelIds.every((id) => ids.includes(id)) &&
        ids.every((id) => panelIds.includes(id));
      if (!same) state.shapeStylePanel = null;
    },
    addArtboardFrame(state, action) {
      if (!state.document) return;
      pushHistory(state);
      const next = normalizeDocument(state.document);
      const frames = Array.isArray(next.frames) ? [...next.frames] : [];
      const frame = createFrame(action.payload || {});
      frames.push(frame);
      next.frames = frames;
      next.activeFrameId = frame.id;
      state.document = next;
      state.dirty = true;
      state.sceneReloadToken += 1;
      syncLibraryOnEdit(state);
    },
    setActiveFrameId(state, action) {
      if (!state.document) return;
      const next = normalizeDocument(state.document);
      next.activeFrameId = action.payload;
      state.document = next;
      state.dirty = true;
    },
    /** Remove one or more artboard frames (scene nodes are left as-is). */
    removeArtboardFrames(state, action) {
      if (!state.document) return;
      const ids: string[] = Array.isArray(action.payload)
        ? action.payload.filter(Boolean)
        : action.payload
          ? [action.payload]
          : [];
      if (!ids.length) return;
      pushHistory(state);
      const next = normalizeDocument(state.document);
      const idSet = new Set(ids);
      const frames = (Array.isArray(next.frames) ? next.frames : []).filter(
        (f: any) => f && !idSet.has(f.id)
      );
      next.frames = frames;
      if (next.activeFrameId && idSet.has(next.activeFrameId)) {
        next.activeFrameId = frames[0]?.id ?? null;
      }
      state.document = next;
      state.dirty = true;
      state.sceneReloadToken += 1;
      syncLibraryOnEdit(state);
    },
    renameArtboardFrame(state, action) {
      if (!state.document) return;
      const { id, name } = action.payload || {};
      if (!id) return;
      pushHistory(state);
      const next = normalizeDocument(state.document);
      const frames = Array.isArray(next.frames) ? next.frames : [];
      const frame = frames.find((f: any) => f.id === id);
      if (frame) frame.name = String(name || frame.name || 'Frame');
      next.frames = frames;
      state.document = next;
      state.dirty = true;
      syncLibraryOnEdit(state);
    },
    updateArtboardFrame(state, action) {
      if (!state.document) return;
      const { id, patch, skipHistory } = action.payload || {};
      if (!id || !patch) return;
      if (!skipHistory) pushHistory(state);
      const next = normalizeDocument(state.document);
      const frames = Array.isArray(next.frames) ? next.frames : [];
      const frame = frames.find((f: any) => f.id === id);
      if (frame) Object.assign(frame, patch);
      next.frames = frames;
      state.document = next;
      state.dirty = true;
      // Position / lock-only updates refresh HTML chrome without SVG reload.
      const keys = Object.keys(patch);
      const onlyChrome =
        keys.length > 0 && keys.every((k) => k === 'x' || k === 'y' || k === 'locked');
      if (!onlyChrome) state.sceneReloadToken += 1;
      syncLibraryOnEdit(state);
    },
    /** Snapshot history without changing the document (e.g. before a live frame drag). */
    pushEditorHistory(state) {
      if (!state.document) return;
      pushHistory(state);
    },
    renameTemplate(state, action) {
      const item = state.templates.find((t) => t.id === state.currentId);
      if (item) {
        item.name = action.payload;
        item.updatedAt = Date.now();
        // Renaming is an explicit claim → show in Projects.
        if (isSessionTemplate(item)) item.source = 'user';
        saveTemplates(state.templates);
      }
    },
    persistCurrent(state) {
      if (!state.currentId || !state.document) return;
      const item = state.templates.find((t) => t.id === state.currentId);
      if (!item) return;
      item.document = JSON.parse(JSON.stringify(state.document));
      item.updatedAt = Date.now();
      if (isSessionTemplate(item)) item.source = 'user';
      state.dirty = false;
      saveTemplates(state.templates);
    },
    importDocument(state, action) {
      const payload = action.payload || {};
      const source: TemplateSource =
        payload.source === 'case' ||
        payload.source === 'import' ||
        payload.source === 'user' ||
        payload.source === 'scratch'
          ? payload.source
          : 'import';
      const originCaseId = payload.originCaseId
        ? String(payload.originCaseId)
        : undefined;
      const now = Date.now();

      // Reuse an unclaimed case session instead of duplicating Projects noise.
      if (source === 'case' && originCaseId) {
        const existing = state.templates.find(
          (t: any) => t.originCaseId === originCaseId && t.source === 'case'
        );
        if (existing) {
          const doc = alignImportedDocumentOrigin(payload.document);
          doc.activeFrameId = null;
          existing.document = doc;
          existing.name = payload.name || existing.name || '导入作品';
          existing.updatedAt = now;
          touchOpened(existing);
          state.currentId = existing.id;
          state.document = doc;
          clearSelection(state);
          state.dirty = false;
          state.historyPast = [];
          state.historyFuture = [];
          state.sceneReloadToken += 1;
          saveTemplates(state.templates);
          return;
        }
      }

      const id = nanoid();
      const doc = alignImportedDocumentOrigin(payload.document);
      // Inspiration / import → editor: do not pre-select an artboard.
      doc.activeFrameId = null;
      const item: any = {
        id,
        name: payload.name || '导入作品',
        updatedAt: now,
        openedAt: now,
        source,
        document: doc,
      };
      if (originCaseId) item.originCaseId = originCaseId;
      state.templates.unshift(item);
      state.currentId = id;
      state.document = doc;
      clearSelection(state);
      state.dirty = false;
      state.historyPast = [];
      state.historyFuture = [];
      state.sceneReloadToken += 1;
      saveTemplates(state.templates);
    },
    /** Spawn blank loading plate for file import (PDF). */
    startImportPlaceholder(state, action) {
      if (!state.document) return;
      pushHistory(state);
      const { document: next, id } = spawnImportPlaceholderNode(state.document, {
        label: action.payload?.label || '解析 PDF 中',
        width: action.payload?.width,
        height: action.payload?.height,
      });
      if (!id) return;
      state.document = next;
      state.dirty = true;
      state.sceneReloadToken += 1;
      state.pendingImportPlaceholderId = id;
      state.selectedNodeId = id;
      state.selectedNodeIds = [id];
      state.activeTool = 'select';
    },
    /** Drop placeholder and merge parsed document at its position. */
    finishImportPlaceholder(state, action) {
      const incoming = action.payload?.document;
      const id = state.pendingImportPlaceholderId;
      let offsetX = Number(action.payload?.offsetX);
      let offsetY = Number(action.payload?.offsetY);
      if (!Number.isFinite(offsetX)) offsetX = 40;
      if (!Number.isFinite(offsetY)) offsetY = 40;

      if (state.document && id) {
        const ph = state.document.deltaSetLike?.[id];
        if (ph) {
          offsetX = Number(ph.x) || offsetX;
          offsetY = Number(ph.y) || offsetY;
        }
        pushHistory(state);
        state.document = removeNodesFromDocument(state.document, [id]);
      } else if (incoming) {
        pushHistory(state);
      }

      state.pendingImportPlaceholderId = null;

      if (!incoming) {
        state.dirty = true;
        state.sceneReloadToken += 1;
        clearSelection(state);
        return;
      }

      if (!state.document) {
        state.document = alignImportedDocumentOrigin(incoming);
      } else {
        state.document = mergeImportedIntoDocument(state.document, incoming, {
          offsetX,
          offsetY,
        });
      }
      state.dirty = true;
      clearSelection(state);
      state.sceneReloadToken += 1;
    },
    /** Remove failed/cancelled import placeholder. */
    cancelImportPlaceholder(state) {
      const id = state.pendingImportPlaceholderId;
      if (!state.document || !id) {
        state.pendingImportPlaceholderId = null;
        return;
      }
      state.document = removeNodesFromDocument(state.document, [id]);
      state.pendingImportPlaceholderId = null;
      state.dirty = true;
      state.sceneReloadToken += 1;
      if (state.selectedNodeId === id) clearSelection(state);
    },
    /** Merge PDF/image parse result into the open canvas. */
    mergeImportedDocument(state, action) {
      const incoming = action.payload?.document;
      if (!incoming) return;
      pushHistory(state);
      if (!state.document) {
        state.document = alignImportedDocumentOrigin(incoming);
      } else {
        state.document = mergeImportedIntoDocument(state.document, incoming, {
          offsetX: Number(action.payload?.offsetX) || 40,
          offsetY: Number(action.payload?.offsetY) || 40,
        });
      }
      state.dirty = true;
      clearSelection(state);
      state.sceneReloadToken += 1;
    },
    deleteTemplate(state, action) {
      state.templates = state.templates.filter((t) => t.id !== action.payload);
      saveTemplates(state.templates);
      if (state.currentId === action.payload) {
        state.currentId = null;
        state.document = null;
        clearSelection(state);
        state.dirty = false;
      }
    },
    deleteTemplates(state, action) {
      const ids = new Set(Array.isArray(action.payload) ? action.payload : []);
      if (!ids.size) return;
      state.templates = state.templates.filter((t) => !ids.has(t.id));
      saveTemplates(state.templates);
      if (state.currentId && ids.has(state.currentId)) {
        state.currentId = null;
        state.document = null;
        clearSelection(state);
        state.dirty = false;
      }
    },
    renameTemplateById(state, action) {
      const { id, name } = action.payload || {};
      if (!id) return;
      const item = state.templates.find((t) => t.id === id);
      if (!item) return;
      item.name = String(name || item.name || '未命名作品');
      item.updatedAt = Date.now();
      if (isSessionTemplate(item)) item.source = 'user';
      saveTemplates(state.templates);
    },
    undo(state) {
      if (!state.historyPast.length || !state.document) return;
      state.historyFuture.unshift(cloneDocument(state.document));
      state.document = state.historyPast.pop();
      state.sceneReloadToken += 1;
      state.dirty = true;
      syncLibraryOnEdit(state);
    },
    redo(state) {
      if (!state.historyFuture.length || !state.document) return;
      state.historyPast.push(cloneDocument(state.document));
      state.document = state.historyFuture.shift();
      state.sceneReloadToken += 1;
      state.dirty = true;
      syncLibraryOnEdit(state);
    },
    setActiveTool(state, action) {
      state.activeTool = action.payload;
      if (action.payload !== 'image') state.pendingImageSrc = null;
      if (action.payload !== 'pencil') state.pencilEraseMode = false;
    },
    setShapeKind(state, action) {
      state.shapeKind = action.payload;
      state.activeTool = action.payload === 'image' ? 'image' : 'shape';
    },
    setPendingImageSrc(state, action) {
      state.pendingImageSrc = action.payload;
      if (action.payload) state.activeTool = 'image';
    },
    setCanvasSize(state, action) {
      if (!state.document) return;
      const { width, height } = action.payload || {};
      pushHistory(state);
      state.document = setDocumentSize(
        state.document,
        width ?? state.document.width,
        height ?? state.document.height
      );
      state.dirty = true;
      state.sceneReloadToken += 1;
    },
    setCanvasMeta(state, action) {
      if (!state.document) return;
      pushHistory(state);
      state.document = setDocumentCanvasMeta(state.document, action.payload || {});
      state.dirty = true;
      state.sceneReloadToken += 1;
    },
    /** Spawn a right-side image processing node (original untouched). */
    startImageProcess(state, action) {
      if (!state.document) return;
      const { sourceId, kind, label, targetWidth, targetHeight, meta } = action.payload || {};
      if (!sourceId || !kind) return;
      pushHistory(state);
      const { document: next, id } = spawnImageProcessNode(state.document, sourceId, {
        kind,
        label: label || '处理中',
        targetWidth,
        targetHeight,
        meta,
      });
      if (!id) return;
      state.document = next;
      state.dirty = true;
      state.sceneReloadToken += 1;
      // Select the loading clone so it can be moved / scaled like any other object.
      state.selectedNodeId = id;
      state.selectedNodeIds = [id];
      state.pendingImageProcessId = id;
    },
    /** Finish processing overlay on a spawned node. Optional `src` replaces image pixels (e.g. upscale). */
    finishImageProcess(state, action) {
      const nodeId = action.payload?.nodeId || state.pendingImageProcessId;
      const nextSrc = action.payload?.src as string | undefined;
      if (!state.document || !nodeId) return;
      let next = clearImageProcessAttrs(state.document, nodeId);
      if (nextSrc) {
        next = updateNodeInDocument(next, nodeId, { attrs: { src: nextSrc } });
      }
      state.document = next;
      state.dirty = true;
      state.sceneReloadToken += 1;
      if (state.pendingImageProcessId === nodeId) state.pendingImageProcessId = null;
    },
    /** Drop a failed process clone and clear pending id. */
    failImageProcess(state, action) {
      const nodeId = action.payload?.nodeId || state.pendingImageProcessId;
      if (!state.document || !nodeId) return;
      state.document = removeNodesFromDocument(state.document, [nodeId]);
      state.dirty = true;
      state.sceneReloadToken += 1;
      if (state.pendingImageProcessId === nodeId) state.pendingImageProcessId = null;
      if (state.selectedNodeId === nodeId) {
        state.selectedNodeId = null;
        state.selectedNodeIds = [];
      } else if (state.selectedNodeIds?.includes(nodeId)) {
        state.selectedNodeIds = state.selectedNodeIds.filter((id: string) => id !== nodeId);
        state.selectedNodeId = state.selectedNodeIds[0] || null;
      }
    },
    openImageToolPanel(state, action) {
      const { nodeId, kind } = action.payload || {};
      if (!nodeId || !kind) return;
      state.imageToolPanel = { nodeId, kind };
      state.shapeStylePanel = null;
    },
    closeImageToolPanel(state) {
      state.imageToolPanel = null;
    },
    openShapeStylePanel(state, action) {
      const kind = action.payload?.kind;
      const nodeIds = Array.isArray(action.payload?.nodeIds)
        ? action.payload.nodeIds.filter(Boolean)
        : [];
      if ((kind !== 'fill' && kind !== 'stroke' && kind !== 'radius') || !nodeIds.length) return;
      state.shapeStylePanel = { kind, nodeIds };
      state.imageToolPanel = null;
    },
    closeShapeStylePanel(state) {
      state.shapeStylePanel = null;
    },
    setPenStrokeColor(state, action) {
      const hex = String(action.payload || '').trim();
      if (hex) state.penStrokeColor = hex;
    },
    setPenStrokeWidth(state, action) {
      const n = Number(action.payload);
      if (!Number.isFinite(n)) return;
      state.penStrokeWidth = Math.max(1, Math.min(40, Math.round(n)));
    },
    setPencilBrushId(state, action) {
      const id = String(action.payload || '').trim();
      if (id) state.pencilBrushId = id;
    },
    setPencilEraseMode(state, action) {
      state.pencilEraseMode = Boolean(action.payload);
    },
    setWorkspaceMode(state, action) {
      const mode = action.payload;
      if (mode === 'design' || mode === 'dev') {
        state.workspaceMode = mode;
        if (mode !== 'dev') state.devHoverNodeId = null;
      }
    },
    setDevHoverNodeId(state, action) {
      state.devHoverNodeId = action.payload || null;
    },
    setAgentBusy(state, action) {
      state.agentBusy = Boolean(action.payload);
      if (state.agentBusy) clearSelection(state);
    },
  },
});

export const {
  createTemplate,
  openTemplate,
  setDocument,
  setDocumentFromCanvas,
  patchDocumentNode,
  setSelectedNodeId,
  setSelectedNodeIds,
  addArtboardFrame,
  setActiveFrameId,
  removeArtboardFrames,
  renameArtboardFrame,
  updateArtboardFrame,
  pushEditorHistory,
  renameTemplate,
  persistCurrent,
  importDocument,
  mergeImportedDocument,
  startImportPlaceholder,
  finishImportPlaceholder,
  cancelImportPlaceholder,
  deleteTemplate,
  deleteTemplates,
  renameTemplateById,
  undo,
  redo,
  setActiveTool,
  setShapeKind,
  setPendingImageSrc,
  setCanvasSize,
  setCanvasMeta,
  startImageProcess,
  finishImageProcess,
  failImageProcess,
  openImageToolPanel,
  closeImageToolPanel,
  openShapeStylePanel,
  closeShapeStylePanel,
  setPenStrokeColor,
  setPenStrokeWidth,
  setPencilBrushId,
  setPencilEraseMode,
  setWorkspaceMode,
  setDevHoverNodeId,
  setAgentBusy,
} = editorSlice.actions;

export default editorSlice.reducer;
