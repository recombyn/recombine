/**
 * Collab room tokens — API mints HMAC tokens; Node WS server verifies them.
 */

import { request } from '@/utils/request';
import type { CollabRoomToken } from '@/components/editor/collab/collabTypes';

export type MintCollabRoomTokenBody = {
  projectId?: string;
  shareId?: string;
};

export const mintCollabRoomTokenApi = (data: MintCollabRoomTokenBody) =>
  request<CollabRoomToken>({
    url: '/api/v1/collab/room-token',
    method: 'post',
    data,
  });
