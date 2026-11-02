import { describe, expect, it } from "vitest";
import { config } from "./index";
import { getConfigIssues, validateConfig } from "./validate";

function productionConfig(): any {
  return {
    ...config,
    env: "production",
    port: 4300,
    appUrl: "https://performance.empcloud.com",
    runtime: {
      ...config.runtime,
      migrateOnStartup: false,
      migrateEmpCloudOnStartup: false,
      shutdownTimeoutMs: 30_000,
      dependencyTimeoutMs: 3_000,
    },
    db: {
      ...config.db,
      host: "mysql.internal",
      port: 3306,
      user: "performance",
      password: "secret",
      name: "emp_performance",
      poolMin: 2,
      poolMax: 10,
    },
    empcloudDb: {
      ...config.empcloudDb,
      host: "mysql.internal",
      port: 3306,
      user: "identity_reader",
      password: "secret",
      name: "empcloud",
    },
    redis: { ...config.redis, port: 6379 },
    email: { ...config.email, port: 587 },
    jwt: { ...config.jwt, secret: "a".repeat(48) },
    sso: {
      publicKey: "-----BEGIN PUBLIC KEY-----\nvalue\n-----END PUBLIC KEY-----",
      issuer: "https://auth.empcloud.com",
      audience: "emp-performance",
      clientId: "empcloud-dashboard",
    },
    security: {
      ...config.security,
      internalServiceSecret: "",
      docsEnabled: false,
      diagnosticsEnabled: false,
    },
    cors: { origin: "https://performance.empcloud.com" },
    empcloudWebhook: {
      ...config.empcloudWebhook,
      url: "https://api.empcloud.com/hooks/performance",
      secret: "b".repeat(48),
      timeoutMs: 10_000,
      pollIntervalMs: 5_000,
      batchSize: 25,
      leaseSeconds: 60,
      maxAttempts: 8,
      retryBaseMs: 5_000,
      retryMaxMs: 3_600_000,
    },
  };
}

describe("production configuration validation", () => {
  it("accepts core access tokens bound by client_id without an aud claim", () => {
    const candidate = productionConfig();
    candidate.sso.audience = undefined;
    expect(getConfigIssues(candidate).errors).toEqual([]);
    candidate.sso.clientId = "";
    expect(getConfigIssues(candidate).errors).toContain("EMPCLOUD_SSO_CLIENT_ID is required in production");
  });

  it("accepts a complete production configuration", () => {
    const candidate = productionConfig();
    expect(getConfigIssues(candidate).errors).toEqual([]);
    expect(() => validateConfig(candidate)).not.toThrow();
  });

  it("rejects weak secrets, unsafe origins, and startup DDL", () => {
    const candidate = productionConfig();
    candidate.jwt.secret = "replace-me";
    candidate.appUrl = "http://localhost:5177";
    candidate.cors.origin = "*,http://localhost:5177";
    candidate.runtime.migrateOnStartup = true;
    candidate.runtime.migrateEmpCloudOnStartup = true;

    const { errors } = getConfigIssues(candidate);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("JWT_SECRET"),
      expect.stringContaining("APP_URL"),
      expect.stringContaining("unsafe production origin"),
      expect.stringContaining("RUN_MIGRATIONS_ON_STARTUP"),
      expect.stringContaining("RUN_EMPCLOUD_MIGRATIONS_ON_STARTUP"),
    ]));
    expect(() => validateConfig(candidate)).toThrow("Configuration errors");
  });

  it("rejects invalid dependency and retry bounds", () => {
    const candidate = productionConfig();
    candidate.db.port = Number.NaN;
    candidate.db.poolMin = 20;
    candidate.db.poolMax = 10;
    candidate.runtime.dependencyTimeoutMs = 0;
    candidate.empcloudWebhook.retryBaseMs = 10_000;
    candidate.empcloudWebhook.retryMaxMs = 1_000;

    const { errors } = getConfigIssues(candidate);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("DB_PORT"),
      expect.stringContaining("DB_POOL_MAX"),
      expect.stringContaining("DEPENDENCY_TIMEOUT_MS"),
      expect.stringContaining("OUTBOX_RETRY_MAX_MS"),
    ]));
  });
});
