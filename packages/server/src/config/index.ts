import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4300"),
  host: process.env.HOST || "0.0.0.0",

  // Performance module database (performance-specific tables only)
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || "emp_performance",
    poolMin: parseInt(process.env.DB_POOL_MIN || "2"),
    poolMax: parseInt(process.env.DB_POOL_MAX || "10"),
  },

  // EmpCloud master database (users, organizations, auth — shared across modules)
  empcloudDb: {
    host: process.env.EMPCLOUD_DB_HOST || process.env.DB_HOST || "localhost",
    port: parseInt(process.env.EMPCLOUD_DB_PORT || process.env.DB_PORT || "3306"),
    user: process.env.EMPCLOUD_DB_USER || process.env.DB_USER || "root",
    password: process.env.EMPCLOUD_DB_PASSWORD || process.env.DB_PASSWORD || "",
    name: process.env.EMPCLOUD_DB_NAME || "empcloud",
  },

  // Redis (for queues, caching)
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || "change-this-in-production",
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  },

  // SSO — EMP Cloud signs its SSO tokens with RS256. Provide the matching
  // public key (PEM, with literal \n escaped in the env var) to enable
  // cryptographic signature verification of inbound SSO tokens.
  sso: {
    // EMP Cloud RS256 public key for verifying SSO token signatures.
    publicKey: (process.env.EMPCLOUD_SSO_PUBLIC_KEY || "").replace(/\\n/g, "\n"),
    // Issuer/audience claims to enforce when present (optional).
    issuer: process.env.EMPCLOUD_SSO_ISSUER || undefined,
    audience: process.env.EMPCLOUD_SSO_AUDIENCE || undefined,
    clientId: process.env.EMPCLOUD_SSO_CLIENT_ID || "empcloud-dashboard",
  },

  // Public base URL of the client app (used to build password-reset links).
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:5177",

  // Email (review reminders, PIP notifications)
  email: {
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT || "1025"),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "performance@empcloud.com",
  },

  // Durable outbound EMP Cloud integration. Release events are first written
  // to the database outbox, then delivered by an in-process dispatcher.
  empcloudWebhook: {
    url: process.env.EMPCLOUD_WEBHOOK_URL || undefined,
    secret: process.env.EMPCLOUD_WEBHOOK_SECRET || undefined,
    timeoutMs: parseInt(process.env.EMPCLOUD_WEBHOOK_TIMEOUT_MS || "10000"),
    pollIntervalMs: parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000"),
    batchSize: parseInt(process.env.OUTBOX_BATCH_SIZE || "25"),
    leaseSeconds: parseInt(process.env.OUTBOX_LEASE_SECONDS || "60"),
    maxAttempts: parseInt(process.env.OUTBOX_MAX_ATTEMPTS || "8"),
    retryBaseMs: parseInt(process.env.OUTBOX_RETRY_BASE_MS || "5000"),
    retryMaxMs: parseInt(process.env.OUTBOX_RETRY_MAX_MS || "3600000"),
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5177",
  },
} as const;
