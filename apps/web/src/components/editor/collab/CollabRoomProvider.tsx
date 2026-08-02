/**
 * Yjs room lifecycle: mint token → WebsocketProvider → bridge scene ↔ Redux.
 * Presence (selection / cursors) via Awareness. Persist via debounced cloud PUT.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import { mintCollabRoomTokenApi } from '@/apis/collab';
import { upsertProjectApi } from '@/apis/projects';
import { updateShareDocumentApi } from '@/apis/shares';
import { rcbSceneToScreen, rcbScreenToScene } from '@/components/rcb/core/math';
import type { RcbCamera } from '@/components/rcb/core/types';
import {
  getProjectDraft,
  hashDocument,
  markProjectDraftSynced,
} from '@/components/editor/projectDraftStore';
import store from '@/store';
import { applyCollabDocument, applyCollabScenePatch } from '@/store/modules/editor';
import { getToken } from '@/utils/token';
import {
  bindCollabUndoManager,
  clearCollabUndoStack,
  setCollabActive,
  setCollabViewOnly,
} from './collabRuntime';
import type { CollabPeer, CollabRole, CollabStatus } from './collabTypes';
import {
  applyLocalSceneToY,
  diffScenesForCollab,
  isYDocEmpty,
  sceneFromYDoc,
  seedYDocFromScene,
  tryClaimRoomSeed,
  yFramesMap,
  yMetaMap,
  yNodesMap,
  yPageChildren,
  yStackOrder,
  Y_ORIGIN_LOCAL,
  Y_ORIGIN_SEED,
  Y_ORIGIN_SEED_CLAIM,
} from './sceneYBridge';

const CURSOR_AWARENESS_MS = 48;
/** Wait for peer seed / claim to land before electing an empty-room seeder. */
const SEED_RACE_WAIT_MS = 120;
const SEED_FOLLOWER_WAIT_MS = 450;

function dispatchRemoteScene(
  dispatch: (action: unknown) => void,
  prev: unknown,
  next: unknown
) {
  const diff = diffScenesForCollab(prev, next);
  if (diff.mode === 'full') {
    dispatch(applyCollabDocument(diff.scene ?? next));
    return;
  }
  const noop =
    !diff.meta &&
    !Object.keys(diff.upsertNodes).length &&
    !diff.removeNodeIds.length &&
    !Object.keys(diff.upsertFrames).length &&
    !diff.removeFrameIds.length &&
    diff.pageChildren == null &&
    diff.stackOrder == null;
  if (noop) return;
  dispatch(applyCollabScenePatch(diff));
}

const PERSIST_DEBOUNCE_MS = 2000;
const PEER_COLORS = ['#E4572E', '#29335C', '#F3A712', '#A8C256', '#669BBC', '#6A4C93'];

type CollabContextValue = {
  status: CollabStatus;
  role: CollabRole | null;
  peers: CollabPeer[];
  enabled: boolean;
  error: string | null;
};

const CollabContext = createContext<CollabContextValue>({
  status: 'idle',
  role: null,
  peers: [],
  enabled: false,
  error: null,
});

export function useCollabRoom() {
  return useContext(CollabContext);
}

function peerColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

function sceneHash(doc: unknown): string {
  try {
    return JSON.stringify(doc);
  } catch {
    return '';
  }
}

function shouldEnableCollab(searchParams: URLSearchParams): boolean {
  if (searchParams.get('collab') === '0') return false;
  if (searchParams.get('collab') === '1') return true;
  const env = String(import.meta.env.VITE_COLLAB_ENABLED || '').toLowerCase();
  if (env === '0' || env === 'false' || env === 'no') return false;
  if (env === '1' || env === 'true' || env === 'yes') return true;
  // Local Vite: on by default so two tabs on the same project sync without a query flag.
  return Boolean(import.meta.env.DEV);
}

function collabStatusLabel(status: CollabStatus, role: CollabRole | null): string {
  if (role === 'view' && (status === 'synced' || status === 'connecting')) {
    return status === 'synced' ? 'Viewing' : 'Connecting…';
  }
  switch (status) {
    case 'synced':
      return 'Live';
    case 'connecting':
      return 'Connecting…';
    case 'error':
      return 'Collab error';
    default:
      return 'Collab';
  }
}

function collabStatusDotClass(status: CollabStatus): string {
  const base = 'inline-block h-1.5 w-1.5 rounded-full';
  switch (status) {
    case 'synced':
      return `${base} bg-emerald-500`;
    case 'error':
      return `${base} bg-red-500`;
    default:
      return `${base} animate-pulse bg-amber-400`;
  }
}

function readPeers(awareness: Awareness, selfId: number): CollabPeer[] {
  const out: CollabPeer[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === selfId) return;
    const user = (state as any)?.user;
    if (!user?.userId) return;
    const cursor = (state as any)?.cursor;
    const selected = (state as any)?.selectedNodeIds;
    const frames = (state as any)?.selectedFrameIds;
    out.push({
      clientId,
      userId: String(user.userId),
      name: String(user.name || 'Peer'),
      color: String(user.color || peerColor(String(user.userId))),
      selectedNodeIds: Array.isArray(selected) ? selected.map(String) : [],
      selectedFrameIds: Array.isArray(frames) ? frames.map(String) : [],
      cursor:
        cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)
          ? { x: Number(cursor.x), y: Number(cursor.y) }
          : null,
    });
  });
  return out;
}

function measurePeerTarget(
  stageEl: HTMLElement,
  stageRect: DOMRect,
  peer: CollabPeer,
  id: string,
  kind: 'node' | 'frame'
): {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  name: string;
} | null {
  const selector =
    kind === 'frame'
      ? `[data-frame-id="${CSS.escape(id)}"]`
      : `[data-scene-node-id="${CSS.escape(id)}"]`;
  const el = stageEl.querySelector(selector) as Element | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return {
    key: `${peer.clientId}:${kind}:${id}`,
    left: r.left - stageRect.left,
    top: r.top - stageRect.top,
    width: r.width,
    height: r.height,
    color: peer.color,
    name: peer.name,
  };
}

/** Remote selection outlines + cursors on the stage (pointer-events none). */
function CollabPeerPresenceOverlay({
  stageEl,
  camera,
  peers,
}: {
  stageEl: HTMLElement | null;
  camera: RcbCamera;
  peers: CollabPeer[];
}) {
  const [boxes, setBoxes] = useState<
    Array<{ key: string; left: number; top: number; width: number; height: number; color: string; name: string }>
  >([]);
  const [cursors, setCursors] = useState<
    Array<{ key: string; left: number; top: number; color: string; name: string }>
  >([]);

  useEffect(() => {
    if (!stageEl) {
      setBoxes([]);
      setCursors([]);
      return undefined;
    }
    let raf = 0;
    const measure = () => {
      const stageRect = stageEl.getBoundingClientRect();
      const nextBoxes: typeof boxes = [];
      const nextCursors: typeof cursors = [];
      for (const peer of peers) {
        for (const nodeId of peer.selectedNodeIds) {
          if (!nodeId) continue;
          const box = measurePeerTarget(stageEl, stageRect, peer, nodeId, 'node');
          if (box) nextBoxes.push(box);
        }
        for (const frameId of peer.selectedFrameIds) {
          if (!frameId) continue;
          const box = measurePeerTarget(stageEl, stageRect, peer, frameId, 'frame');
          if (box) nextBoxes.push(box);
        }
        if (peer.cursor) {
          const screen = rcbSceneToScreen(camera, peer.cursor.x, peer.cursor.y);
          nextCursors.push({
            key: `cursor:${peer.clientId}`,
            left: screen.x,
            top: screen.y,
            color: peer.color,
            name: peer.name,
          });
        }
      }
      setBoxes(nextBoxes);
      setCursors(nextCursors);
      raf = window.requestAnimationFrame(measure);
    };
    raf = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(raf);
  }, [stageEl, peers, camera]);

  if (!stageEl || (!boxes.length && !cursors.length)) return null;
  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-[25] overflow-hidden">
      {boxes.map((b) => (
        <div
          key={b.key}
          className="absolute box-border"
          style={{
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            border: `2px solid ${b.color}`,
            boxShadow: `0 0 0 1px ${b.color}55`,
          }}
        >
          <span
            className="absolute -top-5 left-0 max-w-[120px] truncate rounded px-1 text-[10px] font-medium text-white"
            style={{ background: b.color }}
          >
            {b.name}
          </span>
        </div>
      ))}
      {cursors.map((c) => (
        <div
          key={c.key}
          className="absolute"
          style={{ left: c.left, top: c.top, transform: 'translate(-2px, -2px)' }}
        >
          <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden>
            <path
              d="M1 1L1 17L5.2 13.2L8.5 19L10.5 18L7.2 12.2L13 12.2L1 1Z"
              fill={c.color}
              stroke="#fff"
              strokeWidth="1"
            />
          </svg>
          <span
            className="absolute left-3 top-3 max-w-[100px] truncate rounded px-1 text-[10px] font-medium text-white"
            style={{ background: c.color }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>,
    stageEl
  );
}

/** Compact status + peer chips — place inline next to Share in the top toolbar. */
export function CollabPresenceBar() {
  const { enabled, status, role, peers, error } = useCollabRoom();
  if (!enabled) return null;
  return (
    <div
      className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[var(--surface)] px-2.5 text-[12px] font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--line)]"
      title={error || undefined}
    >
      <span className={collabStatusDotClass(status)} />
      <span>{collabStatusLabel(status, role)}</span>
      {peers.length ? <span className="text-[var(--muted)]">+{peers.length}</span> : null}
      {peers.slice(0, 4).map((p) => (
        <span
          key={p.clientId}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ background: p.color }}
          title={p.name}
        >
          {(p.name || '?').slice(0, 1).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

export function CollabRoomProvider({
  children,
  stageEl,
  camera,
}: {
  children: ReactNode;
  stageEl: HTMLElement | null;
  camera: RcbCamera;
}) {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const enabled = shouldEnableCollab(searchParams);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const document = useSelector((s: any) => s.editor.document);
  const currentId = useSelector((s: any) => s.editor.currentId as string | null);
  const selectedNodeIds = useSelector(
    (s: any) => (s.editor.selectedNodeIds as string[]) || []
  );
  const selectedFrameIds = useSelector(
    (s: any) => (s.editor.selectedFrameIds as string[]) || []
  );
  const activeFrameId = useSelector(
    (s: any) => (s.editor.document?.activeFrameId as string | null) || null
  );
  const user = useSelector(
    (s: any) =>
      s.auth?.user as { id?: string; name?: string; email?: string } | null
  );

  const [status, setStatus] = useState<CollabStatus>('idle');
  const [role, setRole] = useState<CollabRole | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastPushedHashRef = useRef('');
  const seededRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;

  const ctx = useMemo<CollabContextValue>(
    () => ({ status, role, peers, enabled, error }),
    [status, role, peers, enabled, error]
  );

  // Connect / disconnect room.
  useEffect(() => {
    if (!enabled || !currentId || !user?.id || !getToken()) {
      setCollabActive(false);
      setStatus('idle');
      setRole(null);
      setPeers([]);
      return undefined;
    }

    let cancelled = false;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    seededRef.current = false;
    lastPushedHashRef.current = '';
    setStatus('connecting');
    setError(null);
    setCollabActive(true);

    // Track only local scene writes — seed / remote / undo replay stay out of the stack.
    const undoManager = new Y.UndoManager(
      [yMetaMap(ydoc), yFramesMap(ydoc), yNodesMap(ydoc), yPageChildren(ydoc), yStackOrder(ydoc)],
      {
        trackedOrigins: new Set([Y_ORIGIN_LOCAL]),
        captureTimeout: 500,
      }
    );
    bindCollabUndoManager(undoManager);

    const roleRef = { current: null as CollabRole | null };

    const schedulePersist = () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        // Viewers must not write cloud snapshots.
        if (roleRef.current === 'view') return;
        const id = currentId;
        const scene = sceneFromYDoc(ydoc);
        if (!id || !scene) return;
        if (id.startsWith('share_')) {
          void updateShareDocumentApi(id, scene).catch(() => undefined);
          return;
        }
        const ed = store.getState().editor as {
          templates?: Array<{ id?: string; name?: string }>;
        };
        const tpl = ed.templates?.find((t) => t.id === id);
        const name = String(tpl?.name || 'Untitled');
        void (async () => {
          const draft = await getProjectDraft(id).catch(() => null);
          const baseRevision =
            draft?.cloudRevision != null && Number(draft.cloudRevision) >= 1
              ? Number(draft.cloudRevision)
              : null;
          const contentHash = hashDocument(scene);
          try {
            const res = await upsertProjectApi({
              id,
              name,
              document: scene,
              ...(baseRevision != null ? { baseRevision } : {}),
            });
            const revision = Number(res?.project?.revision);
            await markProjectDraftSynced(
              id,
              contentHash,
              Number.isFinite(revision) && revision >= 1 ? revision : null
            );
          } catch {
            // Revision conflict / flake — last-writer full PUT without If-Match.
            try {
              const res = await upsertProjectApi({ id, name, document: scene });
              const revision = Number(res?.project?.revision);
              await markProjectDraftSynced(
                id,
                contentHash,
                Number.isFinite(revision) && revision >= 1 ? revision : null
              );
            } catch {
              /* keep local Y truth; retry on next edit */
            }
          }
        })();
      }, PERSIST_DEBOUNCE_MS);
    };

    const hydrateFromY = () => {
      applyingRemoteRef.current = true;
      try {
        const scene = sceneFromYDoc(ydoc);
        lastPushedHashRef.current = sceneHash(scene);
        dispatch(applyCollabDocument(scene));
        clearCollabUndoStack();
      } finally {
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
      }
    };

    const seedFromLocal = (localDoc: unknown) => {
      seedYDocFromScene(ydoc, localDoc);
      lastPushedHashRef.current = sceneHash(localDoc);
      clearCollabUndoStack();
    };

    /**
     * Empty-room bootstrap: wait briefly, elect one seeder (claim + lowest clientId),
     * followers wait for content before falling back to a local seed.
     */
    const resolveInitialRoomContent = (awareness: Awareness) => {
      const localDoc = documentRef.current;
      if (!isYDocEmpty(ydoc)) {
        hydrateFromY();
        return;
      }

      // Viewers never seed — wait for an editor to populate the room.
      if (roleRef.current === 'view') {
        window.setTimeout(() => {
          if (cancelled) return;
          if (!isYDocEmpty(ydoc)) hydrateFromY();
        }, SEED_FOLLOWER_WAIT_MS);
        return;
      }

      if (!localDoc) return;

      window.setTimeout(() => {
        if (cancelled) return;
        if (!isYDocEmpty(ydoc)) {
          hydrateFromY();
          return;
        }

        const peerIds = [ydoc.clientID];
        awareness.getStates().forEach((_state, clientId) => {
          peerIds.push(clientId);
        });
        const isLeader = Math.min(...peerIds) === ydoc.clientID;

        if (isLeader && tryClaimRoomSeed(ydoc, ydoc.clientID)) {
          if (!isYDocEmpty(ydoc)) {
            hydrateFromY();
            return;
          }
          seedFromLocal(localDoc);
          return;
        }

        window.setTimeout(() => {
          if (cancelled) return;
          if (!isYDocEmpty(ydoc)) {
            hydrateFromY();
            return;
          }
          // Leader never seeded (left / failed) — claim and seed as fallback.
          if (tryClaimRoomSeed(ydoc, ydoc.clientID)) {
            seedFromLocal(localDoc);
          }
        }, SEED_FOLLOWER_WAIT_MS);
      }, SEED_RACE_WAIT_MS);
    };

    const onYUpdate = (_update: Uint8Array, origin: unknown) => {
      if (cancelled) return;
      if (
        origin === Y_ORIGIN_LOCAL ||
        origin === Y_ORIGIN_SEED ||
        origin === Y_ORIGIN_SEED_CLAIM
      ) {
        if (origin === Y_ORIGIN_LOCAL || origin === Y_ORIGIN_SEED) schedulePersist();
        return;
      }
      applyingRemoteRef.current = true;
      try {
        const prev = store.getState().editor.document;
        const scene = sceneFromYDoc(ydoc);
        lastPushedHashRef.current = sceneHash(scene);
        dispatchRemoteScene(dispatch, prev, scene);
      } finally {
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
      }
      schedulePersist();
    };
    ydoc.on('update', onYUpdate);

    const boot = async () => {
      try {
        const body = currentId.startsWith('share_')
          ? { shareId: currentId }
          : { projectId: currentId };
        const tokenRes = await mintCollabRoomTokenApi(body);
        if (cancelled) return;
        setRole(tokenRes.role);
        roleRef.current = tokenRes.role;
        setCollabViewOnly(tokenRes.role === 'view');

        const awareness = new Awareness(ydoc);
        awarenessRef.current = awareness;
        awareness.setLocalStateField('user', {
          userId: user.id,
          name: user.name || user.email || 'You',
          color: peerColor(user.id),
        });

        const provider = new WebsocketProvider(tokenRes.wsUrl, tokenRes.roomId, ydoc, {
          connect: true,
          params: { token: tokenRes.token },
          awareness,
        });
        providerRef.current = provider;

        const refreshPeers = () => {
          if (cancelled) return;
          setPeers(readPeers(awareness, ydoc.clientID));
        };
        awareness.on('change', refreshPeers);
        refreshPeers();

        provider.on('status', (ev: { status: string }) => {
          if (cancelled) return;
          if (ev.status === 'connected') setStatus((s) => (s === 'synced' ? s : 'connecting'));
          if (ev.status === 'disconnected') setStatus('connecting');
        });

        provider.on('sync', (isSynced: boolean) => {
          if (cancelled || !isSynced) return;
          setStatus('synced');
          if (seededRef.current) return;
          seededRef.current = true;
          resolveInitialRoomContent(awareness);
        });
      } catch (err) {
        if (cancelled) return;
        console.warn('[collab] connect failed', err);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'collab_connect_failed');
        setCollabActive(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      bindCollabUndoManager(null);
      try {
        undoManager.destroy();
      } catch {
        /* ignore */
      }
      setCollabActive(false);
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      ydoc.off('update', onYUpdate);
      try {
        providerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      providerRef.current = null;
      try {
        awarenessRef.current?.destroy();
      } catch {
        /* ignore */
      }
      awarenessRef.current = null;
      ydoc.destroy();
      ydocRef.current = null;
      setStatus('idle');
      setPeers([]);
      setRole(null);
      roleRef.current = null;
      setCollabViewOnly(false);
    };
  }, [enabled, currentId, user?.id, user?.name, user?.email, dispatch]);

  // Local Redux → Y (editors only).
  useEffect(() => {
    if (!enabled || role !== 'edit') return;
    const ydoc = ydocRef.current;
    if (!ydoc || !document || !seededRef.current) return;
    if (applyingRemoteRef.current) return;
    const hash = sceneHash(document);
    if (hash === lastPushedHashRef.current) return;
    lastPushedHashRef.current = hash;
    applyLocalSceneToY(ydoc, document);
  }, [enabled, role, document]);

  // Awareness: local node + artboard selection (republish when room syncs).
  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness || !enabled || status === 'idle') return;
    const frameIds = Array.isArray(selectedFrameIds) ? selectedFrameIds.map(String) : [];
    // Single activeFrameId counts as a selection when multi-select is empty.
    if (!frameIds.length && activeFrameId) frameIds.push(String(activeFrameId));
    awareness.setLocalStateField(
      'selectedNodeIds',
      Array.isArray(selectedNodeIds) ? selectedNodeIds.map(String) : []
    );
    awareness.setLocalStateField('selectedFrameIds', frameIds);
  }, [enabled, status, selectedNodeIds, selectedFrameIds, activeFrameId]);

  // Awareness: local pointer → scene coords (so peers with different cameras still align).
  useEffect(() => {
    if (!enabled || !stageEl || status === 'idle') return undefined;
    let lastSent = 0;
    let pending: { x: number; y: number } | null = null;
    let flushTimer: number | null = null;

    const publish = (cursor: { x: number; y: number } | null) => {
      const awareness = awarenessRef.current;
      if (!awareness) return;
      awareness.setLocalStateField('cursor', cursor);
    };

    const flushPending = () => {
      flushTimer = null;
      if (!pending) return;
      publish(pending);
      pending = null;
      lastSent = Date.now();
    };

    const onMove = (e: PointerEvent) => {
      const scene = rcbScreenToScene(cameraRef.current, stageEl, e.clientX, e.clientY);
      pending = { x: scene.x, y: scene.y };
      const now = Date.now();
      if (now - lastSent >= CURSOR_AWARENESS_MS) {
        if (flushTimer != null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
        publish(pending);
        pending = null;
        lastSent = now;
        return;
      }
      if (flushTimer == null) {
        flushTimer = window.setTimeout(flushPending, CURSOR_AWARENESS_MS - (now - lastSent));
      }
    };

    const onLeave = () => {
      pending = null;
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      publish(null);
    };

    stageEl.addEventListener('pointermove', onMove);
    stageEl.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      stageEl.removeEventListener('pointermove', onMove);
      stageEl.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (flushTimer != null) window.clearTimeout(flushTimer);
      publish(null);
    };
  }, [enabled, stageEl, status]);

  return (
    <CollabContext.Provider value={ctx}>
      {children}
      <CollabPeerPresenceOverlay stageEl={stageEl} camera={camera} peers={peers} />
    </CollabContext.Provider>
  );
}
