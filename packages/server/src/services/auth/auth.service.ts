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
import type { IDataContext } from "../../db/adapters/interface";
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

interface RefreshTokenClaims extends jwt.JwtPayload {
  userId: number;
  type: "refresh";
  jti: string;
}

interface RefreshTokenSession {
  id: string;
  user_id: number;
  organization_id: number;
  token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: "HS256",
    expiresIn: config.jwt.accessExpiry as any,
  });
}

/**
 * Sign a refresh token bound to a server-side session row (jti). The token is
 * only valid as long as the matching, non-revoked refresh_tokens row exists.
 */
function signRefreshToken(userId: number, jti: string): string {
  return jwt.sign({ userId, type: "refresh", jti }, config.jwt.secret, {
    algorithm: "HS256",
    expiresIn: config.jwt.refreshExpiry as any,
  });
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifyRefreshToken(token: string): RefreshTokenClaims {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwt.secret, { algorithms: ["HS256"] });
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (
    typeof decoded === "string" ||
    decoded.type !== "refresh" ||
    typeof decoded.jti !== "string" ||
    decoded.jti.length === 0 ||
    !Number.isSafeInteger(decoded.userId) ||
    decoded.userId <= 0
  ) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  return decoded as RefreshTokenClaims;
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
async function createRefreshTokenSession(
  db: IDataContext,
  userId: number,
  orgId: number,
  ctx?: SessionContext,
): Promise<string> {
  const jti = uuidv4();
  const token = signRefreshToken(userId, jti);
  const expiresAt = new Date(Date.now() + parseExpiryMs(config.jwt.refreshExpiry));

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

  return token;
}

async function issueRefreshToken(
  userId: number,
  orgId: number,
  ctx?: SessionContext,
): Promise<string> {
  return createRefreshTokenSession(getDB(), userId, orgId, ctx);
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
  const decoded = verifyRefreshToken(token);

  // Resolve the current identity before binding the persisted session to its
  // live user and organization below.
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

  const newAccessToken = signAccessToken(payload);
  const tokenHash = sha256(token);
  const db = getDB();

  // Revoke-and-replace is one transaction. The conditional update is the
  // one-time-use gate: concurrent replays can both read the row, but only one
  // can change revoked_at from NULL and create a successor session.
  return db.transaction(async (trx) => {
    const session = await trx.findOne<RefreshTokenSession>("refresh_tokens", {
      id: decoded.jti,
    });
    if (
      !session ||
      session.revoked_at ||
      Number(session.user_id) !== decoded.userId ||
      Number(session.organization_id) !== Number(user.organization_id) ||
      typeof session.token_hash !== "string" ||
      !hashesMatch(session.token_hash, tokenHash) ||
      !session.expires_at ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const revoked = await trx.updateMany(
      "refresh_tokens",
      {
        id: decoded.jti,
        user_id: decoded.userId,
        organization_id: user.organization_id,
        token_hash: tokenHash,
        revoked_at: null,
      },
      { revoked_at: new Date() },
    );
    if (revoked !== 1) {
      throw new UnauthorizedError("Refresh token has already been used");
    }

    const newRefreshToken = await createRefreshTokenSession(
      trx,
      user.id,
      user.organization_id,
      ctx,
    );
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  });
}

/**
 * PL3: revoke a refresh-token session (logout). Verifies the token belongs to
 * the acting user before revoking. Silently succeeds if the token is already
 * gone — logout is idempotent.
 */
export async function logout(token: string, actingUserId?: number): Promise<void> {
  if (!token) return;
  let decoded: RefreshTokenClaims;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    return; // nothing to revoke
  }
  if (actingUserId && Number(decoded.userId) !== Number(actingUserId)) {
    throw new UnauthorizedError("Refresh token does not belong to the current user");
  }

  await getDB().updateMany(
    "refresh_tokens",
    {
      id: decoded.jti,
      user_id: decoded.userId,
      token_hash: sha256(token),
      revoked_at: null,
    },
    { revoked_at: new Date() },
  );
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

  // Revoke before changing the password. If either store is unavailable, do
  // not report a successful password change while old refresh sessions live.
  await getDB().updateMany(
    "refresh_tokens",
    { user_id: userId, revoked_at: null },
    { revoked_at: new Date(), updated_at: new Date() },
  );
  await updateUserPassword(userId, hash);
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

  // Claim the reset token and revoke sessions atomically in the performance
  // database. The password write happens only after this boundary is committed.
  // A master-DB failure consumes the token (safe failure); the user can request
  // another reset link without leaving older refresh sessions active.
  const userId = await db.transaction(async (trx) => {
    const row = await trx.findOne<any>("password_resets", { token_hash: tokenHash });
    if (!row || row.consumed_at) {
      throw new ValidationError("This reset link is invalid or has already been used.");
    }
    if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new ValidationError("This reset link has expired. Please request a new one.");
    }

    const consumedAt = new Date();
    const claimed = await trx.updateMany(
      "password_resets",
      { id: row.id, token_hash: tokenHash, consumed_at: null },
      { consumed_at: consumedAt },
    );
    if (claimed !== 1) {
      throw new ValidationError("This reset link is invalid or has already been used.");
    }

    await trx.updateMany(
      "refresh_tokens",
      { user_id: row.user_id, revoked_at: null },
      { revoked_at: consumedAt, updated_at: consumedAt },
    );
    return Number(row.user_id);
  });

  const hash = await bcrypt.hash(newPassword, 12);
  await updateUserPassword(userId, hash);
  logger.info(`Password reset completed for user ${userId}`);
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
