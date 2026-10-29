// ============================================================================
// AUTH SERVICE
// Handles login, registration, SSO, token refresh, logout/revocation, and
// password recovery for EMP Performance.
// Users are stored in the EmpCloud master database; refresh tokens and
// password-reset tokens live in the performance database.
// ============================================================================

import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { getDB } from "../../db/adapters";
import {
  findUserByEmail,
  findUserById,
  findOrgById,
  createOrganization,
  createUser,
  updateUserPassword,
} from "../../db/empcloud";
import { UnauthorizedError, ValidationError, ConflictError, NotFoundError } from "../../utils/errors";
import type { AuthPayload } from "../../api/middleware/auth.middleware";
import { normalizeRole, type CanonicalRole } from "../../security/roles";

interface LoginResult {
  user: {
    empcloudUserId: number;
    empcloudOrgId: number;
    performanceProfileId: string | null;
    role: CanonicalRole;
    email: string;
    firstName: string;
    lastName: string;
    orgName: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface RegisterData {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  country?: string;
}

interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry as any,
  });
}

/**
 * Sign a refresh token bound to a server-side session row (jti). The token is
 * only valid as long as the matching, non-revoked refresh_tokens row exists.
 */
function signRefreshToken(userId: number, jti: string): string {
  return jwt.sign({ userId, type: "refresh", jti }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry as any,
  });
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseExpiryMs(expiry: string): number {
  // Supports "7d", "15m", "24h", "3600s" or a raw number of seconds.
  const match = /^(\d+)\s*([smhd])?$/.exec(expiry.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  switch (match[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default: return n * 1000; // bare number => seconds
  }
}

/**
 * Persist a refresh-token session row and return the signed refresh token.
 */
async function issueRefreshToken(
  userId: number,
  orgId: number,
  ctx?: SessionContext,
): Promise<string> {
  const jti = uuidv4();
  const token = signRefreshToken(userId, jti);
  const expiresAt = new Date(Date.now() + parseExpiryMs(config.jwt.refreshExpiry));

  try {
    const db = getDB();
    await db.create("refresh_tokens", {
      id: jti,
      user_id: userId,
      organization_id: orgId,
      token_hash: sha256(token),
      expires_at: expiresAt,
      revoked_at: null,
      user_agent: ctx?.userAgent ?? null,
      ip_address: ctx?.ipAddress ?? null,
    } as any);
  } catch (err) {
    // If the session store is unavailable the token is still cryptographically
    // valid; log but do not block login.
    logger.error("Failed to persist refresh-token session:", err);
  }

  return token;
}

export async function login(
  email: string,
  password: string,
  ctx?: SessionContext,
): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.password) {
    throw new UnauthorizedError("Password not set for this account");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.status !== 1) {
    throw new UnauthorizedError("Account is inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    performanceProfileId: null,
    role: normalizeRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = await issueRefreshToken(user.id, user.organization_id, ctx);

  logger.info(`User logged in: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken },
  };
}

export async function register(data: RegisterData, ctx?: SessionContext): Promise<LoginResult> {
  const existing = await findUserByEmail(data.email);
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const org = await createOrganization({
    name: data.orgName,
    country: data.country || "IN",
  });

  const user = await createUser({
    organization_id: org.id,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    password: passwordHash,
    role: "hr_admin",
  });

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: org.id,
    performanceProfileId: null,
    role: normalizeRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = await issueRefreshToken(user.id, org.id, ctx);

  logger.info(`New organization registered: ${org.name} by ${user.email}`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken },
  };
}

/**
 * SSO login: exchange an EMP Cloud RS256 JWT for a Performance-specific HS256 JWT.
 *
 * Security (PL2):
 *  - The EMP Cloud token signature IS verified with the configured RS256 public
 *    key (config.sso.publicKey). A token with a bad/forged signature is rejected.
 *  - The jti is looked up in empcloud.oauth_access_tokens and MUST resolve to a
 *    non-revoked, unexpired row. The lookup is no longer wrapped in a
 *    swallow-all try/catch — a DB error or a missing row is a hard failure.
 */
export async function ssoLogin(empcloudToken: string, ctx?: SessionContext): Promise<LoginResult> {
  const publicKey = config.sso.publicKey;
  if (!publicKey) {
    logger.error("SSO login rejected because EMPCLOUD_SSO_PUBLIC_KEY is not configured");
    throw new UnauthorizedError("SSO is not configured");
  }

  let decoded: jwt.JwtPayload;
  try {
    const verified = jwt.verify(empcloudToken, publicKey, {
      algorithms: ["RS256"],
      issuer: config.sso.issuer,
      audience: config.sso.audience,
    });
    if (typeof verified === "string") {
      throw new UnauthorizedError("Invalid SSO token");
    }
    decoded = verified;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    logger.warn(`SSO token signature verification failed: ${(err as Error).message}`);
    throw new UnauthorizedError("Invalid or expired SSO token");
  }

  const userId = Number(decoded.sub);
  const organizationId = Number(decoded.org_id);
  const clientId = typeof decoded.client_id === "string" ? decoded.client_id : "";
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new UnauthorizedError("SSO token missing user id");
  }
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new UnauthorizedError("SSO token missing organization id");
  }
  if (!clientId || clientId !== config.sso.clientId) {
    throw new UnauthorizedError("SSO token was not issued for this client");
  }

  // The jti MUST be present and resolve to a live oauth_access_tokens row.
  if (!decoded.jti) {
    throw new UnauthorizedError("SSO token missing token id (jti)");
  }

  const { getEmpCloudDB } = await import("../../db/empcloud");
  const empcloudDb = getEmpCloudDB();
  const tokenRow = await empcloudDb("oauth_access_tokens")
    .where({
      jti: decoded.jti,
      user_id: userId,
      organization_id: organizationId,
      client_id: clientId,
    })
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .first();
  if (
    !tokenRow ||
    Number(tokenRow.user_id) !== userId ||
    Number(tokenRow.organization_id) !== organizationId ||
    tokenRow.client_id !== clientId
  ) {
    throw new UnauthorizedError("Invalid or expired SSO token");
  }

  const user = await findUserById(userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }
  if (user.organization_id !== organizationId) {
    throw new UnauthorizedError("SSO token organization does not match the user");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    performanceProfileId: null,
    role: normalizeRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshTokenValue = await issueRefreshToken(user.id, user.organization_id, ctx);

  logger.info(`SSO login: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken: refreshTokenValue },
  };
}

export async function refreshToken(
  token: string,
  ctx?: SessionContext,
): Promise<{ accessToken: string; refreshToken: string }> {
  let decoded: any;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (decoded.type !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  // PL3: verify the refresh-token session has not been revoked. Sessions are
  // keyed by jti. Tokens minted before the session store existed have no jti —
  // for backwards compatibility these are allowed through (best effort).
  if (decoded.jti) {
    const db = getDB();
    const session = await db.findOne<any>("refresh_tokens", { id: decoded.jti });
    if (!session || session.revoked_at) {
      throw new UnauthorizedError("Refresh token has been revoked");
    }
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      throw new UnauthorizedError("Refresh token has expired");
    }
  }

  const user = await findUserById(decoded.userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    performanceProfileId: null,
    role: normalizeRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  // Rotate: revoke the old session and issue a fresh one.
  if (decoded.jti) {
    try {
      await getDB().update("refresh_tokens", decoded.jti, {
        revoked_at: new Date(),
      } as any);
    } catch (err) {
      logger.error("Failed to rotate refresh-token session:", err);
    }
  }

  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = await issueRefreshToken(user.id, user.organization_id, ctx);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * PL3: revoke a refresh-token session (logout). Verifies the token belongs to
 * the acting user before revoking. Silently succeeds if the token is already
 * gone — logout is idempotent.
 */
export async function logout(token: string, actingUserId?: number): Promise<void> {
  if (!token) return;
  let decoded: any;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    return; // nothing to revoke
  }
  if (decoded.type !== "refresh" || !decoded.jti) return;
  if (actingUserId && Number(decoded.userId) !== Number(actingUserId)) {
    throw new UnauthorizedError("Refresh token does not belong to the current user");
  }

  try {
    const db = getDB();
    const session = await db.findOne<any>("refresh_tokens", { id: decoded.jti });
    if (session && !session.revoked_at) {
      await db.update("refresh_tokens", decoded.jti, { revoked_at: new Date() } as any);
    }
  } catch (err) {
    logger.error("Failed to revoke refresh-token session on logout:", err);
  }
}

// ---------------------------------------------------------------------------
// Password recovery & account management (PL6)
// ---------------------------------------------------------------------------

/**
 * Change the current user's password (requires the current password).
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError("User");
  if (!user.password) {
    throw new ValidationError("This account has no password set; use SSO instead.");
  }
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    throw new UnauthorizedError("Current password is incorrect");
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await updateUserPassword(userId, hash);

  // Revoke all existing sessions so other devices must re-authenticate.
  try {
    await getDB().updateMany(
      "refresh_tokens",
      { user_id: userId, revoked_at: null },
      { revoked_at: new Date(), updated_at: new Date() },
    );
  } catch (err) {
    logger.error("Failed to revoke sessions after password change:", err);
  }
  logger.info(`Password changed for user ${userId}`);
}

/**
 * Begin the forgot-password flow. Always resolves (no user enumeration). When
 * the email matches a real, active user a single-use reset token is created and
 * returned to the caller (route) for emailing. The raw token is never stored.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ token: string; userId: number; email: string } | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    logger.info(`Password reset requested for unknown email: ${email}`);
    return null;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  try {
    const db = getDB();
    // Invalidate any outstanding resets for this user.
    await db.updateMany(
      "password_resets",
      { user_id: user.id, consumed_at: null },
      { consumed_at: new Date(), updated_at: new Date() },
    );
    await db.create("password_resets", {
      id: uuidv4(),
      user_id: user.id,
      email: user.email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      consumed_at: null,
    } as any);
  } catch (err) {
    logger.error("Failed to create password reset token:", err);
    return null;
  }

  return { token: rawToken, userId: user.id, email: user.email };
}

/**
 * Complete the forgot-password flow using a single-use token.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  const db = getDB();

  const row = await db.findOne<any>("password_resets", { token_hash: tokenHash });
  if (!row || row.consumed_at) {
    throw new ValidationError("This reset link is invalid or has already been used.");
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw new ValidationError("This reset link has expired. Please request a new one.");
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await updateUserPassword(row.user_id, hash);
  await db.update("password_resets", row.id, { consumed_at: new Date() } as any);

  // Revoke all sessions for the user.
  try {
    await db.updateMany(
      "refresh_tokens",
      { user_id: row.user_id, revoked_at: null },
      { revoked_at: new Date(), updated_at: new Date() },
    );
  } catch (err) {
    logger.error("Failed to revoke sessions after password reset:", err);
  }
  logger.info(`Password reset completed for user ${row.user_id}`);
}

/**
 * Return the profile for the current user (for the Profile/Account page).
 */
export async function getProfile(userId: number) {
  const user = await findUserById(userId);
  if (!user) throw new NotFoundError("User");
  const org = await findOrgById(user.organization_id);
  return {
    id: user.id,
    organization_id: user.organization_id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    emp_code: user.emp_code,
    designation: user.designation,
    contact_number: user.contact_number,
    role: normalizeRole(user.role),
    org_name: org?.name ?? null,
    date_of_joining: user.date_of_joining,
    has_password: !!user.password,
  };
}
