/**
 * API client for the Flacron Lead Agent backend (NestJS).
 * Automatically attaches Bearer token from Zustand auth store.
 */

import { useAuthStore } from '@/store/authStore';
import { useAlertsStore } from '@/store/alertsStore';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  token?: string | null;
  workspaceId?: string | null;
};

function notifyApiError(status: number, message: string, path: string) {
  if (path.includes('/alerts') || path.includes('/auth/')) return;
  useAlertsStore.getState().pushApiError(status, message);
}

async function request<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, token, workspaceId, headers: customHeaders, ...rest } = options;

  const storeToken = useAuthStore.getState().accessToken;
  const storeWorkspaceId = useAuthStore.getState().workspaceId;
  const authToken = token ?? storeToken;
  const tenantId = workspaceId ?? storeWorkspaceId;

  const headers = new Headers(customHeaders);
  if (!headers.has('Content-Type') && body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  if (tenantId) {
    headers.set('x-tenant-id', tenantId);
  }

  const apiPath = path.startsWith('/api') ? path : `/api${path}`;
  const url = `${API_BASE_URL}${apiPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Network request failed';
    const message = `Cannot reach API at ${API_BASE_URL}. Is the backend running on port 3001? (${detail})`;
    notifyApiError(0, message, apiPath);
    throw new ApiError(0, message, { cause: detail, url });
  }

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text().catch(() => undefined);
    }
    const message = `API request failed: ${response.status} ${response.statusText}`;
    notifyApiError(response.status, message, apiPath);
    throw new ApiError(response.status, message, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  baseUrl: API_BASE_URL,

  get: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),

  /** Multipart upload — do not set Content-Type (browser sets boundary). */
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const storeToken = useAuthStore.getState().accessToken;
    const storeWorkspaceId = useAuthStore.getState().workspaceId;
    const headers = new Headers();
    if (storeToken) {
      headers.set('Authorization', `Bearer ${storeToken}`);
    }
    if (storeWorkspaceId) {
      headers.set('x-tenant-id', storeWorkspaceId);
    }

    const apiPath = path.startsWith('/api') ? path : `/api${path}`;
    const url = `${API_BASE_URL}${apiPath}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Network request failed';
      const message = `Cannot reach API at ${API_BASE_URL}. Is the backend running on port 3001? (${detail})`;
      notifyApiError(0, message, apiPath);
      throw new ApiError(0, message, { cause: detail, url });
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text().catch(() => undefined);
      }
      const message = `API request failed: ${response.status} ${response.statusText}`;
      notifyApiError(response.status, message, apiPath);
      throw new ApiError(response.status, message, errorBody);
    }

    return (await response.json()) as T;
  },

  /** Binary download (CSV/PDF exports). */
  download: async (
    path: string,
    options?: ApiRequestOptions,
  ): Promise<{ blob: Blob; filename: string | null }> => {
    const { body, token, workspaceId, headers: customHeaders, ...rest } =
      options ?? {};

    const storeToken = useAuthStore.getState().accessToken;
    const storeWorkspaceId = useAuthStore.getState().workspaceId;
    const authToken = token ?? storeToken;
    const tenantId = workspaceId ?? storeWorkspaceId;

    const headers = new Headers(customHeaders);
    if (!headers.has('Content-Type') && body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    if (tenantId) {
      headers.set('x-tenant-id', tenantId);
    }

    const apiPath = path.startsWith('/api') ? path : `/api${path}`;
    const url = `${API_BASE_URL}${apiPath}`;

    const response = await fetch(url, {
      ...rest,
      method: rest.method ?? 'GET',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text().catch(() => undefined);
      }
      throw new ApiError(
        response.status,
        `API request failed: ${response.status} ${response.statusText}`,
        errorBody,
      );
    }

    const disposition = response.headers.get('Content-Disposition');
    const match = disposition?.match(/filename="?([^"]+)"?/i);
    return {
      blob: await response.blob(),
      filename: match?.[1] ?? null,
    };
  },
};

export type BackendAuthUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  workspaceId: string;
  workspaceName?: string;
};

export type LoginResponse = {
  access_token: string;
  user: BackendAuthUser;
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  register: (payload: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    workspaceName: string;
  }) => api.post<LoginResponse>('/auth/register', payload),
};

export function mapAuthUser(user: BackendAuthUser) {
  return {
    id: user.id,
    email: user.email,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    workspaceId: user.workspaceId,
    avatarUrl: null as string | null,
  };
}
