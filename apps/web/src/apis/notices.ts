/**
 * Notices API — account inbox (announcements / notifications).
 */

import { request } from '@/utils/request';

export type NoticeDto = {
  id: string;
  kind: 'announcement' | 'notification' | string;
  title: string;
  body: string;
  createdAt: number;
};

export const fetchNotices = (params?: { kind?: 'announcement' | 'notification' }) =>
  request<{ items: NoticeDto[] }>({
    url: '/api/v1/notices',
    method: 'get',
    params,
  });
