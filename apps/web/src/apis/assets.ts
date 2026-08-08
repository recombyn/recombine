/**
 * User AI assets — images / videos / audio persisted from generation.
 */

import { request } from '@/utils/request';

export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'lottie';

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

/** POST /api/v1/assets/register — canvas upload → Assets dock */
export const registerAsset = (data: {
  kind: Exclude<AssetKind, 'font'>;
  url: string;
  objectKey?: string | null;
  mime?: string | null;
  prompt?: string | null;
  width?: number | null;
  height?: number | null;
  source?: string | null;
}) =>
  request<UserAsset>({
    url: '/api/v1/assets/register',
    method: 'post',
    data: {
      kind: data.kind,
      url: data.url,
      ...(data.objectKey ? { objectKey: data.objectKey } : {}),
      ...(data.mime ? { mime: data.mime } : {}),
      ...(data.prompt ? { prompt: data.prompt } : {}),
      ...(data.width != null ? { width: data.width } : {}),
      ...(data.height != null ? { height: data.height } : {}),
      source: data.source || 'upload',
    },
  });

/** DELETE /api/v1/assets/{asset_id} */
export const deleteAsset = (assetId: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/assets/${encodeURIComponent(assetId)}`,
    method: 'delete',
  });
