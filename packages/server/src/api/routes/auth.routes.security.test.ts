import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  ssoLogin: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../../services/auth/auth.service", () => mocks);
vi.mock("../../services/email/email.service", () => ({ sendEmail: vi.fn() }));

import { authRoutes, REFRESH_COOKIE_NAME } from "./auth.routes";
import { sanitizeEmpCloudReturnUrl } from "../../../../client/src/lib/sso-return-url";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode || 500).json({ error: { code: err.code, message: err.message } });
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({
    user: { id: 1, empcloudUserId: 1, email: "user@example.com" },
    tokens: { accessToken: "access-1", refreshToken: "refresh-1" },
  });
  mocks.refreshToken.mockResolvedValue({
    accessToken: "access-2",
    refreshToken: "refresh-2",
  });
  mocks.logout.mockResolvedValue(undefined);
});

describe("browser refresh-cookie boundary", () => {
  it("sets an HttpOnly cookie and never exposes the refresh token at login", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
    });
    const body = await response.json() as any;
    const cookie = response.headers.get("set-cookie") || "";

    expect(response.status).toBe(200);
    expect(body.data.tokens).toEqual({ accessToken: "access-1" });
    expect(JSON.stringify(body)).not.toContain("refresh-1");
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=refresh-1`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/v1/auth");
  });

  it("rotates from the cookie and returns only the access token", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh-token`, {
      method: "POST",
      headers: { Origin: baseUrl, Cookie: `${REFRESH_COOKIE_NAME}=refresh-1` },
    });
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(mocks.refreshToken).toHaveBeenCalledWith("refresh-1", expect.any(Object));
    expect(body.data).toEqual({ accessToken: "access-2" });
    expect(JSON.stringify(body)).not.toContain("refresh-2");
    expect(response.headers.get("set-cookie")).toContain(`${REFRESH_COOKIE_NAME}=refresh-2`);
  });

  it("revokes and clears the cookie without an access token", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Origin: baseUrl, Cookie: `${REFRESH_COOKIE_NAME}=refresh-1` },
    });
    const cookie = response.headers.get("set-cookie") || "";

    expect(response.status).toBe(200);
    expect(mocks.logout).toHaveBeenCalledWith("refresh-1");
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=`);
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("rejects a cross-site origin before touching the refresh session", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh-token`, {
      method: "POST",
      headers: {
        Origin: "https://attacker.invalid",
        Cookie: `${REFRESH_COOKIE_NAME}=refresh-1`,
      },
    });

    expect(response.status).toBe(403);
    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });
});

describe("SSO return URL allowlist", () => {
  const allowed = ["https://empcloud.example.com"];

  it("allows a relative path and an exact configured HTTPS origin", () => {
    expect(sanitizeEmpCloudReturnUrl("/people?tab=active", allowed)).toBe(
      "/people?tab=active",
    );
    expect(
      sanitizeEmpCloudReturnUrl("https://empcloud.example.com/dashboard", allowed),
    ).toBe("https://empcloud.example.com/dashboard");
  });

  it("fails closed for attacker origins, protocol-relative URLs, and HTTP", () => {
    const fallback = "https://empcloud.example.com/dashboard";
    expect(sanitizeEmpCloudReturnUrl("https://attacker.invalid/steal", allowed)).toBe(fallback);
    expect(sanitizeEmpCloudReturnUrl("//attacker.invalid/steal", allowed)).toBe(fallback);
    expect(sanitizeEmpCloudReturnUrl("http://empcloud.example.com/dashboard", allowed)).toBe(
      fallback,
    );
  });
});
