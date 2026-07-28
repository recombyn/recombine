/**
 * Fonts catalog (loaded into the editor font picker).
 */

import { request } from '@/utils/request';

export type FontFaceDto = {
  family: string;
  displayName: string;
  weight?: number;
  url?: string;
  format?: string;
};

export type FontFamilyDto = {
  family: string;
  displayName: string;
  children?: FontFaceDto[];
};

export type PaginatedFonts = {
  items: FontFamilyDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export const fetchFonts = (params: { page: number; pageSize: number }) =>
  request<PaginatedFonts>({
    url: '/api/v1/fonts',
    method: 'get',
    params,
  });
