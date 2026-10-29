import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { AppError } from "../../utils/errors";
import { actorFromAuthPayload, type ActorContext } from "../../security/actor-context";
import { hasAnyRole, normalizeRole, type CanonicalRole } from "../../security/roles";
import {
  API_KEY_PREFIX,
  findValidApiKey,
  findUserById,
  findOrgById,
} from "../../db/empcloud";

export interface AuthPayload {
  // EmpCloud IDs (source of truth — bigint stored as number)
  empcloudUserId: number;
  empcloudOrgId: number;
  // Performance profile ID (UUID in performance DB, null if profile not yet created)
  performanceProfileId: string | null;
  // User info from EmpCloud
  role: CanonicalRole;
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      actor?: ActorContext;
    }
  }
}

const INTERNAL_SERVICE_NAME = "empcloud-dashboard";
const INTERNAL_WIDGET_PATH = "/api/v1/analytics/overview";

function secretsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function isInternalWidgetRequest(req: Request): boolean {
  const path = (req.originalUrl || req.url || "").split("?", 1)[0];
  return req.method === "GET" && path === INTERNAL_WIDGET_PATH;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  // Legacy dashboard-widget integration. Keep this identity read-only and
  // endpoint-specific; it must never inherit a browser administrator role.
  const internalService = req.headers["x-internal-service"];
  const internalSecret = req.headers["x-internal-secret"];
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET || "";
  if (internalService === INTERNAL_SERVICE_NAME) {
    if (!secretsMatch(internalSecret, expectedSecret)) {
      return next(new AppError(401, "INVALID_INTERNAL_SERVICE", "Invalid internal service credentials"));
    }
    if (!isInternalWidgetRequest(req)) {
      return next(new AppError(403, "FORBIDDEN", "Internal service is not allowed on this endpoint"));
    }

    const orgId = Number(req.query.organization_id);
    if (Number.isSafeInteger(orgId) && orgId > 0) {
      req.user = {
        empcloudUserId: 0,
        empcloudOrgId: orgId,
        performanceProfileId: null,
        role: "service",
        email: "system@empcloud.internal",
        firstName: "System",
        lastName: "Service",
        orgName: "System",
      };
      req.actor = actorFromAuthPayload(req.user, "service");
      return next();
    }
    return next(new AppError(400, "INVALID_ORGANIZATION", "A valid organization_id is required"));
  }

  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
  }

  const token = header.slice(7);

  // Shared API-key path — an `empc_` token is an opaque key minted in EmpCloud,
  // not a JWT. Validate it against the shared EmpCloud `api_keys` table and
  // build the same AuthPayload an SSO login would, so the role-based
  // authorize() checks downstream work unchanged.
  if (typeof token === "string" && token.startsWith(API_KEY_PREFIX)) {
    void authenticateApiKey(token, req, next);
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ["HS256"] }) as AuthPayload;
    payload.role = normalizeRole(payload.role);
    req.user = payload;
    req.actor = actorFromAuthPayload(payload, "jwt");
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return next(new AppError(401, "TOKEN_EXPIRED", "Access token has expired"));
    }
    return next(new AppError(401, "INVALID_TOKEN", "Invalid access token"));
  }
}

/**
 * Validate a shared EmpCloud API key and populate req.user. The key mirrors the
 * owner admin (resolved live from EmpCloud), so deactivating the user or
 * revoking the key kills access immediately. Any failure resolves to a 401 via
 * next() — never throws into the event loop.
 */
async function authenticateApiKey(rawKey: string, req: Request, next: NextFunction): Promise<void> {
  try {
    const key = await findValidApiKey(rawKey);
    if (!key) {
      return next(new AppError(401, "INVALID_API_KEY", "Invalid or expired API key"));
    }

    const ecUser = await findUserById(key.user_id);
    if (!ecUser || ecUser.status !== 1) {
      return next(new AppError(401, "INVALID_API_KEY", "API key owner not found or inactive"));
    }

    const ecOrg = await findOrgById(ecUser.organization_id);

    req.user = {
      empcloudUserId: ecUser.id,
      empcloudOrgId: ecUser.organization_id,
      performanceProfileId: null,
      role: normalizeRole(ecUser.role),
      email: ecUser.email,
      firstName: ecUser.first_name,
      lastName: ecUser.last_name,
      orgName: ecOrg?.name ?? "",
    };
    req.actor = actorFromAuthPayload(req.user, "api_key");
    next();
  } catch {
    next(new AppError(401, "API_KEY_AUTH_FAILED", "API key validation failed"));
  }
}

export function authorize(...roles: CanonicalRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Not authenticated"));
    }
    const role = req.actor?.role ?? normalizeRole(req.user.role);
    if (roles.length > 0 && !hasAnyRole(role, roles)) {
      return next(
        new AppError(403, "FORBIDDEN", "You do not have permission to perform this action"),
      );
    }
    next();
  };
}
