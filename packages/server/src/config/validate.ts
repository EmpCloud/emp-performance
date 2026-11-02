import { config, type AppConfig } from "./index";
import { logger } from "../utils/logger";

export interface ConfigIssues {
  warnings: string[];
  errors: string[];
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65_535;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("change-this") ||
    normalized.includes("replace-me") ||
    normalized.includes("replace-with")
  );
}

export function getConfigIssues(input: AppConfig = config): ConfigIssues {
  const warnings: string[] = [];
  const errors: string[] = [];
  const isProduction = input.env === "production";

  if (isProduction && (isPlaceholderSecret(input.jwt.secret) || input.jwt.secret.length < 32)) {
    errors.push("JWT_SECRET must be a non-placeholder value of at least 32 characters in production");
  }
  if (!isProduction && input.jwt.secret.length < 16) {
    warnings.push("JWT_SECRET should be at least 16 characters (32+ recommended)");
  }
  if (isProduction) {
    if (!input.sso.publicKey) errors.push("EMPCLOUD_SSO_PUBLIC_KEY is required in production");
    if (!input.sso.issuer) errors.push("EMPCLOUD_SSO_ISSUER is required in production");
    if (!input.sso.audience) errors.push("EMPCLOUD_SSO_AUDIENCE is required in production");
    if (!input.sso.clientId) errors.push("EMPCLOUD_SSO_CLIENT_ID is required in production");
  }

  if (!input.db.host) errors.push("DB_HOST is required");
  if (!input.db.user) errors.push("DB_USER is required");
  if (!input.db.name) errors.push("DB_NAME is required");
  if (!isValidPort(input.db.port)) errors.push("DB_PORT must be between 1 and 65535");
  if (!Number.isInteger(input.db.poolMin) || input.db.poolMin < 0) {
    errors.push("DB_POOL_MIN must be a non-negative integer");
  }
  if (!isPositiveInteger(input.db.poolMax) || input.db.poolMax < input.db.poolMin) {
    errors.push("DB_POOL_MAX must be a positive integer greater than or equal to DB_POOL_MIN");
  }
  if (isProduction && !input.db.password) errors.push("DB_PASSWORD is required in production");

  if (!input.empcloudDb.host) errors.push("EMPCLOUD_DB_HOST is required");
  if (!input.empcloudDb.user) errors.push("EMPCLOUD_DB_USER is required");
  if (!input.empcloudDb.name) errors.push("EMPCLOUD_DB_NAME is required");
  if (!isValidPort(input.empcloudDb.port)) {
    errors.push("EMPCLOUD_DB_PORT must be between 1 and 65535");
  }
  if (isProduction && !input.empcloudDb.password) {
    errors.push("EMPCLOUD_DB_PASSWORD is required in production");
  }

  if (!isValidPort(input.port)) errors.push("PORT must be between 1 and 65535");
  if (!isValidPort(input.redis.port)) errors.push("REDIS_PORT must be between 1 and 65535");
  if (!isValidPort(input.email.port)) errors.push("SMTP_PORT must be between 1 and 65535");
  if (!isPositiveInteger(input.runtime.shutdownTimeoutMs)) {
    errors.push("SHUTDOWN_TIMEOUT_MS must be a positive integer");
  }
  if (!isPositiveInteger(input.runtime.dependencyTimeoutMs)) {
    errors.push("DEPENDENCY_TIMEOUT_MS must be a positive integer");
  }

  const appUrl = parseUrl(input.appUrl);
  const origins = input.cors.origin.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) errors.push("CORS_ORIGIN must contain at least one origin");
  if (isProduction) {
    if (!appUrl || appUrl.protocol !== "https:") {
      errors.push("APP_URL must be a valid HTTPS URL in production");
    }
    for (const origin of origins) {
      const parsed = parseUrl(origin);
      if (
        origin === "*" ||
        !parsed ||
        parsed.protocol !== "https:" ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1"
      ) {
        errors.push(`CORS_ORIGIN contains an unsafe production origin: ${origin}`);
      }
    }
    if (process.env.RATE_LIMIT_DISABLED === "true") {
      errors.push("RATE_LIMIT_DISABLED must not be true in production");
    }
    if (input.runtime.migrateOnStartup) {
      errors.push("RUN_MIGRATIONS_ON_STARTUP must be false in production; run migrations as a release step");
    }
    if (input.runtime.migrateEmpCloudOnStartup) {
      errors.push("RUN_EMPCLOUD_MIGRATIONS_ON_STARTUP must be false in production");
    }
    if (input.security.internalServiceSecret && input.security.internalServiceSecret.length < 32) {
      errors.push("INTERNAL_SERVICE_SECRET must be at least 32 characters when enabled in production");
    }
    if (input.security.docsEnabled) {
      warnings.push("API_DOCS_ENABLED exposes API documentation in production");
    }
    if (input.security.diagnosticsEnabled) {
      warnings.push("DETAILED_HEALTH_ENABLED exposes runtime diagnostics in production");
    }
  }

  const webhook = input.empcloudWebhook;
  if (!isPositiveInteger(webhook.timeoutMs)) errors.push("EMPCLOUD_WEBHOOK_TIMEOUT_MS must be positive");
  if (!isPositiveInteger(webhook.pollIntervalMs)) errors.push("OUTBOX_POLL_INTERVAL_MS must be positive");
  if (!isPositiveInteger(webhook.batchSize)) errors.push("OUTBOX_BATCH_SIZE must be positive");
  if (!isPositiveInteger(webhook.leaseSeconds)) errors.push("OUTBOX_LEASE_SECONDS must be positive");
  if (!isPositiveInteger(webhook.maxAttempts)) errors.push("OUTBOX_MAX_ATTEMPTS must be positive");
  if (!isPositiveInteger(webhook.retryBaseMs)) errors.push("OUTBOX_RETRY_BASE_MS must be positive");
  if (webhook.retryMaxMs < webhook.retryBaseMs) {
    errors.push("OUTBOX_RETRY_MAX_MS must be greater than or equal to OUTBOX_RETRY_BASE_MS");
  }
  if (webhook.url) {
    const parsed = parseUrl(webhook.url);
    if (!parsed || (isProduction && parsed.protocol !== "https:")) {
      errors.push("EMPCLOUD_WEBHOOK_URL must be a valid HTTPS URL in production");
    }
    if (isProduction && (!webhook.secret || webhook.secret.length < 32)) {
      errors.push("EMPCLOUD_WEBHOOK_SECRET must be at least 32 characters when the webhook is enabled");
    }
  } else if (webhook.secret) {
    warnings.push("EMPCLOUD_WEBHOOK_SECRET is configured but EMPCLOUD_WEBHOOK_URL is not");
  }

  return { warnings, errors };
}

export function validateConfig(input: AppConfig = config): void {
  const { warnings, errors } = getConfigIssues(input);
  for (const warning of warnings) logger.warn(`Config warning: ${warning}`);
  for (const error of errors) logger.error(`Config error: ${error}`);

  if (errors.length > 0 && input.env === "production") {
    throw new Error(`Configuration errors:\n${errors.join("\n")}`);
  }

  logger.info(`Config validated (${warnings.length} warnings, ${errors.length} errors)`);
}
