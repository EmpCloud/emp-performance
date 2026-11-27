import axios, { type InternalAxiosRequestConfig } from "axios";
import type { ApiResponse } from "@emp-performance/shared";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

interface RetriableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _sessionId?: number;
}

interface AuthSession {
  id: number;
  accessToken: string;
  user: string | null;
}

let sessionSequence = 0;
let currentSession: AuthSession | null = null;

function readSession(): AuthSession | null {
  const accessToken = localStorage.getItem("access_token");
  const user = localStorage.getItem("user");
  if (!accessToken) {
    currentSession = null;
    return null;
  }
  // Only a verified refresh may rotate a token inside an existing generation.
  // A token/user written by another login starts a different session.
  if (currentSession?.accessToken !== accessToken || currentSession.user !== user) {
    currentSession = { id: ++sessionSequence, accessToken, user };
  }
  return currentSession;
}

// Capture the session on the first dispatch, then guard it again at replay.
api.interceptors.request.use((config: RetriableRequest) => {
  const session = readSession();
  if (config._retry && (!session || config._sessionId !== session.id)) {
    throw new axios.CanceledError("Authentication session changed before retry");
  }
  if (!config._retry) config._sessionId = session?.id;
  if (session) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

// ---------------------------------------------------------------------------
// Token refresh logic
// ---------------------------------------------------------------------------
let pendingRefresh: { sessionId: number; promise: Promise<string> } | null = null;

async function requestRefreshToken(session: AuthSession): Promise<string> {
  try {
    const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
      `${API_BASE}/auth/refresh-token`,
      {},
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
        timeout: 30_000,
      },
    );
    // Logout or a new login may have happened while the request was in flight.
    if (readSession()?.id !== session.id) {
      throw new axios.CanceledError("Authentication session changed during refresh");
    }
    const accessToken = data.data?.accessToken;
    if (!data.success || typeof accessToken !== "string" || !accessToken) {
      throw new Error("Invalid token refresh response");
    }
    localStorage.setItem("access_token", accessToken);
    session.accessToken = accessToken;
    return accessToken;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (
      (status === 401 || status === 403) &&
      readSession()?.id === session.id
    ) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    // Network errors and service outages are retryable without destroying a
    // valid session. Every caller awaiting the shared request receives failure.
    throw error;
  }
}

function refreshToken(session: AuthSession): Promise<string> {
  if (pendingRefresh?.sessionId === session.id) return pendingRefresh.promise;

  const refresh = {
    sessionId: session.id,
    promise: requestRefreshToken(session).finally(() => {
      if (pendingRefresh === refresh) pendingRefresh = null;
    }),
  };
  pendingRefresh = refresh;
  return refresh.promise;
}

// Retry each request once; concurrent 401s share the same refresh outcome.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriableRequest | undefined;
    const requestUrl = originalRequest?.url || "";

    // Skip refresh for auth endpoints
    if (requestUrl.includes("/auth/sso") || requestUrl.includes("/auth/refresh-token") || requestUrl.includes("/auth/login")) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const session = readSession();
      if (!session) return Promise.reject(error);
      if (originalRequest._sessionId !== session.id) {
        throw new axios.CanceledError("Authentication session changed after the request");
      }

      // A late 401 from the old access token can reuse a refresh that already
      // completed instead of rotating the cookie-backed session a second time.
      const newToken = originalRequest.headers.get("Authorization") !== `Bearer ${session.accessToken}`
        ? session.accessToken
        : await refreshToken(session);
      if (readSession()?.id !== session.id) {
        throw new axios.CanceledError("Authentication session changed before retry");
      }
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Typed API helpers
// ---------------------------------------------------------------------------

export async function apiGet<T>(url: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
  const { data } = await api.get<ApiResponse<T>>(url, { params });
  return data;
}

export async function apiPost<T>(url: string, body?: any): Promise<ApiResponse<T>> {
  const { data } = await api.post<ApiResponse<T>>(url, body);
  return data;
}

export async function apiPut<T>(url: string, body?: any): Promise<ApiResponse<T>> {
  const { data } = await api.put<ApiResponse<T>>(url, body);
  return data;
}

export async function apiPatch<T>(url: string, body?: any): Promise<ApiResponse<T>> {
  const { data } = await api.patch<ApiResponse<T>>(url, body);
  return data;
}

export async function apiDelete<T>(url: string): Promise<ApiResponse<T>> {
  const { data } = await api.delete<ApiResponse<T>>(url);
  return data;
}
