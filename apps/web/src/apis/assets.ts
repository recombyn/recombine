/**
 * User AI assets — images / videos / audio persisted from generation.
 */

import { request } from '@/utils/request';

export type AssetKind = 'image' | 'video' | 'audio' | 'font';

export type UserAsset = {
  id: string;
  kind: AssetKind;
  url: string;
  objectKey?: string | null;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
  source?: string | null;
  prompt?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt?: number | null;
};

export type ListAssetsResult = {
  items: UserAsset[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

/** GET /api/v1/assets */
export const listAssets = (params?: {
  page?: number;
  pageSize?: number;
  kind?: AssetKind | null;
}) =>
  request<ListAssetsResult>({
    url: '/api/v1/assets',
    method: 'get',
    params: {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 24,
      ...(params?.kind ? { kind: params.kind } : {}),
    },
  });

/** DELETE /api/v1/assets/{asset_id} */
export const deleteAsset = (assetId: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/assets/${encodeURIComponent(assetId)}`,
    method: 'delete',
  });
