import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findValidApiKey: vi.fn(),
  findUserById: vi.fn(),
  findOrgById: vi.fn(),
}));

vi.mock("../../db/empcloud", () => ({
  API_KEY_PREFIX: "empc_",
  findValidApiKey: mocks.findValidApiKey,
  findUserById: mocks.findUserById,
  findOrgById: mocks.findOrgById,
}));

import { authenticate } from "./auth.middleware";

const USER_ID = 101;
const ORG_ID = 7;

async function authenticateApiKey() {
  const req = {
    method: "GET",
    originalUrl: "/api/v1/goals",
    url: "/api/v1/goals",
    headers: { authorization: "Bearer empc_live_test" },
  } as unknown as Request;
  let error: unknown;

  await new Promise<void>((resolve) => {
    const next = ((err?: unknown) => {
      error = err;
      resolve();
    }) as NextFunction;
    authenticate(req, {} as Response, next);
  });

  return { req, error };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findValidApiKey.mockResolvedValue({
    id: 1,
    user_id: USER_ID,
    organization_id: ORG_ID,
    expires_at: null,
    revoked_at: null,
  });
  mocks.findUserById.mockResolvedValue({
    id: USER_ID,
    organization_id: ORG_ID,
    status: 1,
    role: "hr_admin",
    email: "admin@example.com",
    first_name: "Example",
    last_name: "Admin",
  });
  mocks.findOrgById.mockResolvedValue({
    id: ORG_ID,
    name: "Example",
    is_active: true,
  });
});

describe("API-key tenant boundary", () => {
  it("rejects a key whose tenant does not match its owner", async () => {
    mocks.findValidApiKey.mockResolvedValue({
      id: 1,
      user_id: USER_ID,
      organization_id: ORG_ID + 1,
      expires_at: null,
      revoked_at: null,
    });

    const { req, error } = await authenticateApiKey();

    expect(error).toMatchObject({ statusCode: 401, code: "INVALID_API_KEY" });
    expect(req.user).toBeUndefined();
    expect(mocks.findOrgById).not.toHaveBeenCalled();
  });

  it("rejects a key for an inactive organization", async () => {
    mocks.findOrgById.mockResolvedValue({
      id: ORG_ID,
      name: "Example",
      is_active: false,
    });

    const { req, error } = await authenticateApiKey();

    expect(error).toMatchObject({ statusCode: 401, code: "INVALID_API_KEY" });
    expect(req.user).toBeUndefined();
  });

  it("builds an authenticated actor only for a live, tenant-bound key", async () => {
    const { req, error } = await authenticateApiKey();

    expect(error).toBeUndefined();
    expect(req.user).toMatchObject({
      empcloudUserId: USER_ID,
      empcloudOrgId: ORG_ID,
      role: "hr_admin",
      orgName: "Example",
    });
    expect(req.actor).toMatchObject({ organizationId: ORG_ID, userId: USER_ID });
  });
});
