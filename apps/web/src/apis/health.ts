/**
 * Health check API.
 */

import { request } from '@/utils/request';

export type HealthResponse = {
  status: 'ok' | 'degraded' | string;
  checks?: {
    api?: boolean;
    redis?: boolean;
    worker?: boolean;
    ocr?: boolean;
    use_vision?: boolean;
    s3?: boolean;
  };
};

export const healthCheck = () =>
  request<HealthResponse>({
    url: '/api/v1/health',
    method: 'get',
  });
