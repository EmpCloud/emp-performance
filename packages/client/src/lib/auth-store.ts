import { create } from "zustand";
import type { CanonicalRole } from "@emp-performance/shared";

export interface AuthUser {
  id: number;
  empcloudUserId: number;
  empcloudOrgId: number;
  orgId: number;
  performanceProfileId: string | null;
  role: CanonicalRole;
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  login: (user, tokens) => {
    localStorage.setItem("access_token", tokens.accessToken);
    localStorage.setItem("refresh_token", tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
    set({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isAuthenticated: true,
    });
  },

  logout: () => {
    // Best-effort server-side revocation of the refresh token (PL3). We use a
    // keepalive fetch so it completes even as we navigate away, and never block
    // the client-side teardown on it.
    const refreshToken = localStorage.getItem("refresh_token");
    const accessToken = localStorage.getItem("access_token");
    if (refreshToken) {
      const base = (import.meta as any).env?.VITE_API_URL || "/api/v1";
      try {
        void fetch(`${base}/auth/logout`, {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // ignore — local teardown proceeds regardless
      }
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
    window.location.href = "/login";
  },

  loadFromStorage: () => {
    const token = localStorage.getItem("access_token");
    const userStr = localStorage.getItem("user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({
          user,
          accessToken: token,
          refreshToken: localStorage.getItem("refresh_token"),
          isAuthenticated: true,
        });
      } catch {
        // corrupted — clear
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
      }
    }
  },
}));

/**
 * Extract the SSO token from the URL query string (if present).
 * Returns the raw token string, or null if not found.
 * The token will be exchanged server-side by SSOGate — we no longer
 * store the EMP Cloud RS256 JWT directly.
 */
export function extractSSOToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ssoToken = params.get("sso_token");
  if (!ssoToken) return null;

  // Mark that this session came from EMP Cloud SSO
  localStorage.setItem('sso_source', 'empcloud');
  const returnUrl = params.get('return_url') || 'https://test-empcloud.empcloud.com/dashboard';
  localStorage.setItem('empcloud_return_url', returnUrl);

  // Clean the URL immediately so the token doesn't linger
  const url = new URL(window.location.href);
  url.searchParams.delete("sso_token");
  url.searchParams.delete("return_url");
  window.history.replaceState({}, "", url.pathname + url.hash);

  return ssoToken;
}

/**
 * Handle SSO token from EmpCloud redirect.
 * Called by SSOGate in App.tsx.
 */
export function handleSSOToken(token: string): string {
  return token;
}

// Convenience helpers (non-hook)
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
