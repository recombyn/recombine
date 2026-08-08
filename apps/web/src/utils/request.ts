import axios, { type AxiosRequestConfig, type AxiosInstance } from 'axios';
import { getApiBaseUrl } from '@/utils/apiBase';
import { getToken, setToken } from '@/utils/token';

export interface CustomAxiosRequestConfig extends AxiosRequestConfig {
  needGlobalLoading?: boolean;
  /** Skip in-flight GET dedupe (rare; default dedupes identical GETs). */
  skipInflightDedupe?: boolean;
}

/**
 * Shared axios client.
 * Call sites pass full `/api/v1/...` paths.
 * Browser / local-desktop-dev: relative (Vite proxy / nginx).
 * Desktop prod local / desktop cloud: absolute base from `getApiBaseUrl()`.
 */
const http: AxiosInstance = axios.create({
  timeout: 180000,
  baseURL: getApiBaseUrl() || undefined,
});

http.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // Stale / missing session — drop token so clients stop hammering auth errors.
    // Backend historically returned 403 for bad tokens; treat that as logout too.
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;
    const detailText =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => (typeof d === 'string' ? d : d?.msg)).join(' ')
          : '';
    const authDead =
      status === 401 ||
      (status === 403 &&
        /could not validate credentials|not authenticated/i.test(detailText));
    if (authDead) {
      setToken(null);
      try {
        window.dispatchEvent(new CustomEvent('recombine:auth-unauthorized'));
      } catch {
        /* ignore */
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Collapse identical GETs:
 * - in-flight share one network call
 * - brief success cache covers StrictMode remount (effect → cleanup → effect)
 */
const inflightGets = new Map<string, Promise<unknown>>();
const recentGets = new Map<string, { expires: number; value: unknown }>();
const RECENT_GET_TTL_MS = 1200;

function stableSerialize(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${k}:${stableSerialize(obj[k])}`)
    .join(',')}}`;
}

function getInflightKey(config: CustomAxiosRequestConfig): string | null {
  if (config.skipInflightDedupe) return null;
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') return null;
  const url = config.url || '';
  const params = stableSerialize(config.params);
  // Different sessions must not share a response.
  const auth = getToken() || '';
  return `${method}|${url}|${params}|${auth}`;
}

/** Typed request: interceptor already unwraps `response.data`. */
function request<T = unknown>(config: CustomAxiosRequestConfig): Promise<T> {
  const key = getInflightKey(config);
  if (key) {
    const cached = recentGets.get(key);
    if (cached && cached.expires > Date.now()) {
      return Promise.resolve(cached.value as T);
    }
    const existing = inflightGets.get(key);
    if (existing) return existing as Promise<T>;
    const pending = (async () => {
      try {
        const data = await http.request<any, T>(config);
        recentGets.set(key, { expires: Date.now() + RECENT_GET_TTL_MS, value: data });
        return data;
      } finally {
        if (inflightGets.get(key) === pending) inflightGets.delete(key);
      }
    })();
    inflightGets.set(key, pending);
    return pending;
  }
  return http.request<any, T>(config);
}

export { request, http };
