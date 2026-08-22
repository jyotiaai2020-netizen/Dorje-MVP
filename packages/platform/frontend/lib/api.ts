import { TOKEN_KEY, logout, setAuthSession } from '@/lib/auth';

const browserHostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
const defaultBackendPort = '8100';
const isLoopbackHost = ['localhost', '127.0.0.1', '::1'].includes(browserHostname);
const defaultApiBaseUrl = isLoopbackHost
  ? `http://${browserHostname}:${defaultBackendPort}`
  : '/api/backend';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  defaultApiBaseUrl;

let refreshPromise: Promise<string | null> | null = null;

function isPublicWorkspaceRoute(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/dorje-ai');
}

type AuthenticatedFetchInit = RequestInit & {
  skipAuthRedirect?: boolean;
};

export function authorizationHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('lotus_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) return null;

    const data = await response.json().catch(() => ({}));
    if (!data.access_token) return null;
    setAuthSession(data.access_token, data.user);
    return data.access_token as string;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: AuthenticatedFetchInit = {},
): Promise<Response> {
  const { skipAuthRedirect, ...fetchInit } = init;
  const initialHeaders = new Headers(init.headers);
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
  if (token) initialHeaders.set('Authorization', `Bearer ${token}`);

  const requestInit: RequestInit = {
    ...fetchInit,
    credentials: 'include',
    headers: initialHeaders,
  };
  const response = await fetch(input, requestInit);
  if (response.status !== 401 || skipAuthRedirect || typeof window === 'undefined') return response;

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    logout();
    if (!isPublicWorkspaceRoute() && !['/login', '/register'].includes(window.location.pathname)) {
      window.location.assign('/login');
    }
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
  return fetch(input, {
    ...fetchInit,
    credentials: 'include',
    headers: retryHeaders,
  });
}

export async function apiFetch<T>(
  path: string,
  options: AuthenticatedFetchInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await authenticatedFetch(
    path.startsWith('http') ? path : `${API_BASE_URL}${path}`,
    { ...options, headers },
  );
  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();
  if (!response.ok) {
    const message =
      typeof data === 'object' && data
        ? data.detail || data.message
        : data;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return data as T;
}
