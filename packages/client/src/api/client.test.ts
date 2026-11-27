import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

let axios: typeof import("axios")["default"];
let api: typeof import("./client")["api"];
let previousAdapter: typeof axios.defaults.adapter;
let storage: Map<string, string>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: String(status), headers: {} };
}

function httpError(config: InternalAxiosRequestConfig, status: number) {
  return new axios.AxiosError(`HTTP ${status}`, "ERR_BAD_RESPONSE", config, undefined, response(config, {}, status));
}

function useAdapter(adapter: AxiosAdapter) {
  axios.defaults.adapter = adapter;
  api.defaults.adapter = adapter;
}

beforeEach(async () => {
  vi.resetModules();
  storage = new Map([["access_token", "expired-access"], ["user", "original-user"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  vi.stubGlobal("window", { location: { href: "/dashboard" } });
  axios = (await import("axios")).default;
  previousAdapter = axios.defaults.adapter;
  api = (await import("./client")).api;
});

afterEach(() => {
  axios.defaults.adapter = previousAdapter;
});

describe("access token refresh", () => {
  it("shares one refresh and replays every concurrent request after success", async () => {
    const gate = deferred();
    let refreshes = 0;
    let initialRequests = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        expect(config.timeout).toBe(30_000);
        await gate.promise;
        return response(config, { success: true, data: { accessToken: "new-access" } });
      }
      if (config.headers.get("Authorization") === "Bearer expired-access") {
        initialRequests++;
        throw httpError(config, 401);
      }
      expect(config.headers.get("Authorization")).toBe("Bearer new-access");
      return response(config, { url: config.url });
    });

    const requests = Promise.all([api.get("/overview"), api.get("/goals"), api.get("/notifications")]);
    await vi.waitFor(() => expect(initialRequests).toBe(3));
    expect(refreshes).toBe(1);
    gate.resolve();
    expect((await requests).map((result) => result.data.url)).toEqual(["/overview", "/goals", "/notifications"]);
    expect(storage.get("access_token")).toBe("new-access");
    expect(window.location.href).toBe("/dashboard");
  });

  it.each([401, 403])("settles every waiter and clears the rejected refresh session on HTTP %s", async (status) => {
    const gate = deferred();
    let refreshes = 0;
    let initialRequests = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        await gate.promise;
        throw httpError(config, status);
      }
      initialRequests++;
      throw httpError(config, 401);
    });

    const requests = Promise.allSettled([api.get("/overview"), api.get("/goals")]);
    await vi.waitFor(() => expect(initialRequests).toBe(2));
    gate.resolve();
    expect((await requests).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(refreshes).toBe(1);
    expect(storage.has("access_token")).toBe(false);
    expect(storage.has("user")).toBe(false);
    expect(window.location.href).toBe("/login");
  });

  it("does not start another refresh when any replay still returns 401", async () => {
    const gate = deferred();
    let refreshes = 0;
    let resourceRequests = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        await gate.promise;
        return response(config, { success: true, data: { accessToken: "new-access" } });
      }
      resourceRequests++;
      throw httpError(config, 401);
    });

    const requests = Promise.allSettled([api.get("/overview"), api.get("/goals")]);
    await vi.waitFor(() => expect(resourceRequests).toBe(2));
    gate.resolve();
    expect((await requests).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(refreshes).toBe(1);
    expect(resourceRequests).toBe(4);
  });

  it.each(["network", "timeout", "service unavailable"])("preserves the session on %s failure and allows a later retry", async (failure) => {
    const gate = deferred();
    let refreshes = 0;
    let initialRequests = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        if (refreshes === 1) {
          await gate.promise;
          throw failure === "network"
            ? new axios.AxiosError("Network error", "ERR_NETWORK", config)
            : failure === "timeout"
              ? new axios.AxiosError("Request timed out", "ECONNABORTED", config)
              : httpError(config, 503);
        }
        return response(config, { success: true, data: { accessToken: "recovered-access" } });
      }
      if (config.headers.get("Authorization") === "Bearer expired-access") {
        initialRequests++;
        throw httpError(config, 401);
      }
      return response(config, { recovered: true });
    });

    const requests = Promise.allSettled([api.get("/overview"), api.get("/goals")]);
    await vi.waitFor(() => expect(initialRequests).toBe(2));
    gate.resolve();
    expect((await requests).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(storage.get("access_token")).toBe("expired-access");
    expect(storage.get("user")).toBe("original-user");
    expect(window.location.href).toBe("/dashboard");
    expect((await api.get("/overview")).data).toEqual({ recovered: true });
    expect(refreshes).toBe(2);
    expect(storage.get("access_token")).toBe("recovered-access");
  });

  it("reuses the new token when an old request's 401 arrives after refresh completed", async () => {
    const lateResponse = deferred();
    let refreshes = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        return response(config, { success: true, data: { accessToken: "new-access" } });
      }
      if (config.headers.get("Authorization") === "Bearer expired-access") {
        if (config.url === "/late") await lateResponse.promise;
        throw httpError(config, 401);
      }
      return response(config, { url: config.url });
    });

    const lateRequest = api.get("/late");
    await api.get("/overview");
    lateResponse.resolve();
    expect((await lateRequest).data).toEqual({ url: "/late" });
    expect(refreshes).toBe(1);
  });

  it("does not replay an old mutation under a different login when its 401 arrives late", async () => {
    const lateResponse = deferred();
    let refreshes = 0;
    let resourceRequests = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        return response(config, { success: true, data: { accessToken: "unexpected-refresh" } });
      }
      resourceRequests++;
      await lateResponse.promise;
      throw httpError(config, 401);
    });

    const result = Promise.allSettled([api.patch("/goals/first-user-goal", { status: "completed" })]);
    await vi.waitFor(() => expect(resourceRequests).toBe(1));
    storage.set("access_token", "different-session");
    storage.set("user", "different-user");
    lateResponse.resolve();
    const [settled] = await result;
    expect(settled.status).toBe("rejected");
    if (settled.status === "rejected") expect(axios.isCancel(settled.reason)).toBe(true);
    expect(resourceRequests).toBe(1);
    expect(refreshes).toBe(0);
    expect(storage.get("access_token")).toBe("different-session");
  });

  it("rechecks the session before the retry's request interceptor attaches credentials", async () => {
    const beforeReplay = deferred();
    let replayWaiting = false;
    let resourceRequests = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        return response(config, { success: true, data: { accessToken: "new-access" } });
      }
      resourceRequests++;
      throw httpError(config, 401);
    });
    // Axios runs request interceptors in reverse registration order. Pause the
    // replay just before the client's credential interceptor runs again.
    const interceptor = api.interceptors.request.use(async (config) => {
      if ((config as InternalAxiosRequestConfig & { _retry?: boolean })._retry) {
        replayWaiting = true;
        await beforeReplay.promise;
      }
      return config;
    });
    try {
      const result = Promise.allSettled([api.post("/goals", { title: "First user's goal" })]);
      await vi.waitFor(() => expect(replayWaiting).toBe(true));
      storage.set("access_token", "different-session");
      storage.set("user", "different-user");
      beforeReplay.resolve();
      const [settled] = await result;
      expect(settled.status).toBe("rejected");
      if (settled.status === "rejected") expect(axios.isCancel(settled.reason)).toBe(true);
      expect(resourceRequests).toBe(1);
      expect(storage.get("access_token")).toBe("different-session");
    } finally {
      api.interceptors.request.eject(interceptor);
    }
  });

  it("does not restore a session cleared while refresh was in flight", async () => {
    const gate = deferred();
    let refreshes = 0;
    let resourceRequests = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        await gate.promise;
        return response(config, { success: true, data: { accessToken: "new-access" } });
      }
      resourceRequests++;
      throw httpError(config, 401);
    });

    const result = Promise.allSettled([api.get("/overview")]);
    await vi.waitFor(() => expect(refreshes).toBe(1));
    storage.clear();
    gate.resolve();
    const [settled] = await result;
    expect(settled.status).toBe("rejected");
    if (settled.status === "rejected") expect(axios.isCancel(settled.reason)).toBe(true);
    expect(storage.has("access_token")).toBe(false);
    expect(resourceRequests).toBe(1);
  });

  it.each(["success", "rejected"])("ignores an old session's refresh %s after a different login", async (outcome) => {
    const gate = deferred();
    let refreshes = 0;
    useAdapter(async (config) => {
      if (config.url?.endsWith("/auth/refresh-token")) {
        refreshes++;
        await gate.promise;
        if (outcome === "rejected") throw httpError(config, 401);
        return response(config, { success: true, data: { accessToken: "old-session-refresh" } });
      }
      throw httpError(config, 401);
    });

    const result = Promise.allSettled([api.get("/overview")]);
    await vi.waitFor(() => expect(refreshes).toBe(1));
    storage.set("access_token", "different-session");
    storage.set("user", "different-user");
    gate.resolve();
    expect((await result)[0].status).toBe("rejected");
    expect(storage.get("access_token")).toBe("different-session");
    expect(storage.get("user")).toBe("different-user");
    expect(window.location.href).toBe("/dashboard");
  });

  it("does not refresh unauthenticated requests or failed login requests", async () => {
    const requested: string[] = [];
    useAdapter(async (config) => {
      requested.push(config.url!);
      throw httpError(config, 401);
    });
    await expect(api.post("/auth/login", {})).rejects.toMatchObject({ response: { status: 401 } });
    storage.clear();
    await expect(api.get("/overview")).rejects.toMatchObject({ response: { status: 401 } });
    expect(requested).toEqual(["/auth/login", "/overview"]);
  });
});
