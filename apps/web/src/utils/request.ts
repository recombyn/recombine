import axios, { type AxiosRequestConfig, type AxiosInstance } from 'axios';
import { getToken } from '@/utils/token';

export interface CustomAxiosRequestConfig extends AxiosRequestConfig {
  needGlobalLoading?: boolean;
}

/**
 * Shared axios client — same pattern web.
 * Call sites pass full `/api/v1/...` paths; Vite proxy / nginx handles host.
 */
const http: AxiosInstance = axios.create({
  timeout: 180000,
});

http.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

http.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
);

/** Typed request: interceptor already unwraps `response.data`. */
function request<T = unknown>(config: CustomAxiosRequestConfig): Promise<T> {
  return http.request<any, T>(config);
}

export { request, http };
