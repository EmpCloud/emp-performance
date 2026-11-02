import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../config";

const mocks = vi.hoisted(() => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findOrgById: vi.fn(),
  createOrganization: vi.fn(),
  createUser: vi.fn(),
  updateUserPassword: vi.fn(),
  getDB: vi.fn(),
  rootCreate: vi.fn(),
  rootUpdateMany: vi.fn(),
  transaction: vi.fn(),
  trxFindOne: vi.fn(),
  trxUpdateMany: vi.fn(),
  trxCreate: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: mocks.comparePassword,
    hash: mocks.hashPassword,
  },
}));

vi.mock("../../db/empcloud", () => ({
  findUserByEmail: mocks.findUserByEmail,
  findUserById: mocks.findUserById,
  findOrgById: mocks.findOrgById,
  createOrganization: mocks.createOrganization,
  createUser: mocks.createUser,
  updateUserPassword: mocks.updateUserPassword,
  getEmpCloudDB: vi.fn(),
}));

vi.mock("../../db/adapters", () => ({
  getDB: mocks.getDB,
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { changePassword, login, logout, refreshToken, resetPassword } from "./auth.service";

const USER_ID = 101;
const ORG_ID = 7;
const JTI = "c7c2cc57-5a38-4274-b394-b98fb8a32f60";

function signRefreshToken(overrides: Record<string, unknown> = {}, algorithm: "HS256" | "HS384" = "HS256") {
  return jwt.sign(
    { userId: USER_ID, type: "refresh", jti: JTI, ...overrides },
    config.jwt.secret,
    { algorithm, expiresIn: "5m" },
  );
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function liveSession(token: string) {
  return {
    id: JTI,
    user_id: USER_ID,
    organization_id: ORG_ID,
    token_hash: tokenHash(token),
    expires_at: new Date(Date.now() + 60_000),
    revoked_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const trx = {
    findOne: mocks.trxFindOne,
    updateMany: mocks.trxUpdateMany,
    create: mocks.trxCreate,
  };
  const db = {
    create: mocks.rootCreate,
    updateMany: mocks.rootUpdateMany,
    transaction: mocks.transaction,
  };
  mocks.getDB.mockReturnValue(db);
  mocks.transaction.mockImplementation(async (fn: (context: typeof trx) => Promise<unknown>) => fn(trx));
  mocks.rootCreate.mockResolvedValue({});
  mocks.rootUpdateMany.mockResolvedValue(1);
  mocks.trxCreate.mockResolvedValue({});
  mocks.trxUpdateMany.mockResolvedValue(1);
  mocks.comparePassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.findUserByEmail.mockResolvedValue({
    id: USER_ID,
    organization_id: ORG_ID,
    status: 1,
    password: "stored-hash",
    role: "employee",
    email: "employee@example.com",
    first_name: "Example",
    last_name: "Employee",
  });
  mocks.findUserById.mockResolvedValue({
    id: USER_ID,
    organization_id: ORG_ID,
    status: 1,
    password: "stored-hash",
    role: "employee",
    email: "employee@example.com",
    first_name: "Example",
    last_name: "Employee",
  });
  mocks.findOrgById.mockResolvedValue({ id: ORG_ID, name: "Example", is_active: true });
});

describe("refresh-token session boundary", () => {
  it("fails login when the refresh session cannot be persisted", async () => {
    mocks.rootCreate.mockRejectedValueOnce(new Error("session store unavailable"));

    await expect(login("employee@example.com", "password")).rejects.toThrow(
      "session store unavailable",
    );
  });

  it("rejects legacy refresh tokens without a jti", async () => {
    const token = jwt.sign(
      { userId: USER_ID, type: "refresh" },
      config.jwt.secret,
      { algorithm: "HS256", expiresIn: "5m" },
    );

    await expect(refreshToken(token)).rejects.toThrow("Invalid or expired refresh token");
    expect(mocks.findUserById).not.toHaveBeenCalled();
  });

  it("rejects refresh tokens signed with a non-approved algorithm", async () => {
    await expect(refreshToken(signRefreshToken({}, "HS384"))).rejects.toThrow(
      "Invalid or expired refresh token",
    );
    expect(mocks.findUserById).not.toHaveBeenCalled();
  });

  it("rejects a token whose persisted hash does not match", async () => {
    const token = signRefreshToken();
    mocks.trxFindOne.mockResolvedValue({ ...liveSession(token), token_hash: "0".repeat(64) });

    await expect(refreshToken(token)).rejects.toThrow("Invalid or expired refresh token");
    expect(mocks.trxUpdateMany).not.toHaveBeenCalled();
    expect(mocks.trxCreate).not.toHaveBeenCalled();
  });

  it("rejects a replay when the one-time compare-and-swap loses", async () => {
    const token = signRefreshToken();
    mocks.trxFindOne.mockResolvedValue(liveSession(token));
    mocks.trxUpdateMany.mockResolvedValueOnce(0);

    await expect(refreshToken(token)).rejects.toThrow("already been used");
    expect(mocks.trxCreate).not.toHaveBeenCalled();
  });

  it("revokes the old session and creates its successor in one transaction", async () => {
    const token = signRefreshToken();
    mocks.trxFindOne.mockResolvedValue(liveSession(token));

    const result = await refreshToken(token, { userAgent: "test", ipAddress: "127.0.0.1" });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.trxUpdateMany).toHaveBeenCalledWith(
      "refresh_tokens",
      expect.objectContaining({
        id: JTI,
        user_id: USER_ID,
        organization_id: ORG_ID,
        token_hash: tokenHash(token),
        revoked_at: null,
      }),
      expect.objectContaining({ revoked_at: expect.any(Date) }),
    );
    expect(mocks.trxCreate).toHaveBeenCalledWith(
      "refresh_tokens",
      expect.objectContaining({
        user_id: USER_ID,
        organization_id: ORG_ID,
        token_hash: expect.any(String),
      }),
    );
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  it("does not report logout success when revocation persistence fails", async () => {
    const token = signRefreshToken();
    mocks.rootUpdateMany.mockRejectedValueOnce(new Error("session store unavailable"));

    await expect(logout(token, USER_ID)).rejects.toThrow("session store unavailable");
  });

  it("does not change a password when session revocation fails", async () => {
    mocks.rootUpdateMany.mockRejectedValueOnce(new Error("session store unavailable"));

    await expect(changePassword(USER_ID, "current", "new-password")).rejects.toThrow(
      "session store unavailable",
    );
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });
});

describe("password-reset one-time claim", () => {
  it("rejects a reset when another request already claimed the token", async () => {
    mocks.trxFindOne.mockResolvedValue({
      id: "reset-1",
      user_id: USER_ID,
      token_hash: tokenHash("raw-reset-token"),
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
    });
    mocks.trxUpdateMany.mockResolvedValueOnce(0);

    await expect(resetPassword("raw-reset-token", "new-password")).rejects.toThrow(
      "already been used",
    );
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("claims the reset and revokes sessions before updating the password", async () => {
    mocks.trxFindOne.mockResolvedValue({
      id: "reset-1",
      user_id: USER_ID,
      token_hash: tokenHash("raw-reset-token"),
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
    });
    mocks.trxUpdateMany.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await resetPassword("raw-reset-token", "new-password");

    expect(mocks.trxUpdateMany).toHaveBeenNthCalledWith(
      1,
      "password_resets",
      expect.objectContaining({ id: "reset-1", consumed_at: null }),
      expect.objectContaining({ consumed_at: expect.any(Date) }),
    );
    expect(mocks.trxUpdateMany).toHaveBeenNthCalledWith(
      2,
      "refresh_tokens",
      { user_id: USER_ID, revoked_at: null },
      expect.objectContaining({ revoked_at: expect.any(Date) }),
    );
    expect(mocks.updateUserPassword).toHaveBeenCalledWith(USER_ID, "hashed-password");
  });
});
