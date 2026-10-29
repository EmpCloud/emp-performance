import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";

const mocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findOrgById: vi.fn(),
  getEmpCloudDB: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("../../db/empcloud", () => ({
  findUserByEmail: vi.fn(),
  findUserById: mocks.findUserById,
  findOrgById: mocks.findOrgById,
  createOrganization: vi.fn(),
  createUser: vi.fn(),
  updateUserPassword: vi.fn(),
  getEmpCloudDB: mocks.getEmpCloudDB,
}));

vi.mock("../../db/adapters", () => ({
  getDB: () => ({ create: mocks.createSession }),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const USER_ID = 101;
const ORG_ID = 7;
const CLIENT_ID = "empcloud-dashboard";
const JTI = "sso-token-1";

function createToken(overrides: Record<string, unknown> = {}, signingKey = privateKey): string {
  const { sub, ...claims } = overrides;
  return jwt.sign(
    {
      org_id: ORG_ID,
      client_id: CLIENT_ID,
      jti: JTI,
      ...claims,
    },
    signingKey,
    { algorithm: "RS256", subject: String(sub ?? USER_ID), expiresIn: "5m" },
  );
}

function createTokenStore(row: Record<string, unknown> | null) {
  const builder: any = {
    where: vi.fn(() => builder),
    whereNull: vi.fn(() => builder),
    first: vi.fn(async () => row),
  };
  const db = vi.fn((table: string) => {
    expect(table).toBe("oauth_access_tokens");
    return builder;
  });
  return { db, builder };
}

let ssoLogin: typeof import("../../services/auth/auth.service").ssoLogin;
const originalEnvironment = {
  publicKey: process.env.EMPCLOUD_SSO_PUBLIC_KEY,
  clientId: process.env.EMPCLOUD_SSO_CLIENT_ID,
};

beforeAll(async () => {
  process.env.EMPCLOUD_SSO_PUBLIC_KEY = publicKey;
  process.env.EMPCLOUD_SSO_CLIENT_ID = CLIENT_ID;
  ({ ssoLogin } = await import("../../services/auth/auth.service"));
});

afterAll(() => {
  if (originalEnvironment.publicKey === undefined) delete process.env.EMPCLOUD_SSO_PUBLIC_KEY;
  else process.env.EMPCLOUD_SSO_PUBLIC_KEY = originalEnvironment.publicKey;
  if (originalEnvironment.clientId === undefined) delete process.env.EMPCLOUD_SSO_CLIENT_ID;
  else process.env.EMPCLOUD_SSO_CLIENT_ID = originalEnvironment.clientId;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSession.mockResolvedValue({});
  mocks.findUserById.mockResolvedValue({
    id: USER_ID,
    organization_id: ORG_ID,
    status: 1,
    role: "manager",
    email: "manager@example.com",
    first_name: "Casey",
    last_name: "Manager",
  });
  mocks.findOrgById.mockResolvedValue({ id: ORG_ID, name: "Example", is_active: true });
});

describe("SSO trust boundary", () => {
  it("accepts a signed token only when its stored grant matches user, tenant, and client", async () => {
    const { db, builder } = createTokenStore({
      jti: JTI,
      user_id: USER_ID,
      organization_id: ORG_ID,
      client_id: CLIENT_ID,
    });
    mocks.getEmpCloudDB.mockReturnValue(db);

    const result = await ssoLogin(createToken());

    expect(result.user).toMatchObject({
      empcloudUserId: USER_ID,
      empcloudOrgId: ORG_ID,
      role: "manager",
    });
    expect(builder.where).toHaveBeenCalledWith({
      jti: JTI,
      user_id: USER_ID,
      organization_id: ORG_ID,
      client_id: CLIENT_ID,
    });
  });

  it("rejects a valid grant when an attacker substitutes a different subject", async () => {
    const { db } = createTokenStore({
      jti: JTI,
      user_id: USER_ID,
      organization_id: ORG_ID,
      client_id: CLIENT_ID,
    });
    mocks.getEmpCloudDB.mockReturnValue(db);

    await expect(ssoLogin(createToken({ sub: USER_ID + 1 }))).rejects.toThrow(
      "Invalid or expired SSO token",
    );
    expect(mocks.findUserById).not.toHaveBeenCalled();
  });

  it("rejects a token issued for another OAuth client before querying the grant store", async () => {
    await expect(ssoLogin(createToken({ client_id: "other-client" }))).rejects.toThrow(
      "not issued for this client",
    );
    expect(mocks.getEmpCloudDB).not.toHaveBeenCalled();
  });

  it("rejects a token signed by an untrusted key", async () => {
    const attackerKeys = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    await expect(ssoLogin(createToken({}, attackerKeys.privateKey))).rejects.toThrow(
      "Invalid or expired SSO token",
    );
    expect(mocks.getEmpCloudDB).not.toHaveBeenCalled();
  });
});
