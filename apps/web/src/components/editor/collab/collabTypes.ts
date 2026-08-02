export type CollabRole = 'edit' | 'view';

export type CollabStatus = 'idle' | 'connecting' | 'synced' | 'error';

export type CollabPeer = {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  selectedNodeIds: string[];
  /** Artboard / frame selection (data-frame-id). */
  selectedFrameIds: string[];
  cursor: { x: number; y: number } | null;
};

export type CollabRoomToken = {
  token: string;
  roomId: string;
  wsUrl: string;
  role: CollabRole;
  expiresAt: number;
};
