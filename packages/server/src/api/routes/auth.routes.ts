// ============================================================================
// AUTH ROUTES
// POST /login, /register, /sso, /refresh-token, /logout,
// /forgot-password, /reset-password, /change-password; GET /me, /profile
// ============================================================================

import { Router, Request, Response, NextFunction, type CookieOptions } from "express";
import {
  loginSchema,
  registerSchema,
  ssoSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@emp-performance/shared";
import * as authService from "../../services/auth/auth.service";
import { sendSuccess } from "../../utils/response";
import { authenticate } from "../middleware/auth.middleware";
import { sendEmail } from "../../services/email/email.service";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";

export const REFRESH_COOKIE_NAME = "emp_performance_refresh";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function refreshCookieMaxAgeMs(expiry: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(expiry.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1_000;

  const amount = Number(match[1]);
  const multiplier = ({ s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const)[
    (match[2] || "s") as "s" | "m" | "h" | "d"
  ];
  return Number.isSafeInteger(amount) && amount > 0
    ? amount * multiplier
    : 7 * 24 * 60 * 60 * 1_000;
}

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.env === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
  };
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** Protect cookie-backed session mutations from cross-origin browser calls. */
export function assertTrustedSessionOrigin(req: Request): void {
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site")?.toLowerCase();
  if (!origin) {
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      throw new ForbiddenError("Untrusted session request origin");
    }
    return;
  }

  const allowed = new Set<string>();
  const host = req.get("host");
  if (host) allowed.add(`${req.protocol}://${host}`);
  for (const candidate of config.cors.origin.split(",")) {
    if (candidate.trim() === "*") continue;
    const normalized = normalizeOrigin(candidate.trim());
    if (normalized) allowed.add(normalized);
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin || !allowed.has(normalizedOrigin)) {
    throw new ForbiddenError("Untrusted session request origin");
  }
}

function trustedSessionOrigin(req: Request, _res: Response, next: NextFunction): void {
  try {
    assertTrustedSessionOrigin(req);
    next();
  } catch (err) {
    next(err);
  }
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions(),
    maxAge: refreshCookieMaxAgeMs(config.jwt.refreshExpiry),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

function sendLoginSession(
  res: Response,
  result: Awaited<ReturnType<typeof authService.login>>,
  status = 200,
): void {
  setRefreshCookie(res, result.tokens.refreshToken);
  sendSuccess(res, {
    user: result.user,
    tokens: { accessToken: result.tokens.accessToken },
  }, status);
}

function passwordResetEmailHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:32px;font-family:sans-serif;background:#f4f5f7;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#4f46e5;margin:0 0 16px;">Reset your password</h2>
    <p style="color:#374151;">We received a request to reset your EMP Performance password. Click the button below to choose a new one. This link expires in 1 hour.</p>
    <p style="margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;">Reset Password</a></p>
    <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body></html>`;
}

const router = Router();

function sessionContext(req: Request) {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
  };
}

// POST /auth/login
router.post("/login", trustedSessionOrigin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, sessionContext(req));
    sendLoginSession(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/register
router.post("/register", trustedSessionOrigin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data, sessionContext(req));
    sendLoginSession(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// POST /auth/sso
router.post("/sso", trustedSessionOrigin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = ssoSchema.parse(req.body);
    const result = await authService.ssoLogin(token, sessionContext(req));
    sendLoginSession(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh-token
router.post("/refresh-token", trustedSessionOrigin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
    if (!refreshToken) throw new UnauthorizedError("Refresh session is missing or expired");
    const result = await authService.refreshToken(refreshToken, sessionContext(req));
    setRefreshCookie(res, result.refreshToken);
    sendSuccess(res, { accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — revoke and clear the cookie-backed refresh session.
router.post("/logout", trustedSessionOrigin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = readCookie(req, REFRESH_COOKIE_NAME) || "";
    await authService.logout(refreshToken);
    clearRefreshCookie(res);
    sendSuccess(res, { message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

// POST /auth/forgot-password — always returns 200 (no user enumeration)
router.post("/forgot-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);
    if (result) {
      const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(result.token)}`;
      try {
        await sendEmail(result.email, "Reset your EMP Performance password", passwordResetEmailHtml(resetUrl));
      } catch (mailErr) {
        logger.error("Failed to send password reset email:", mailErr);
      }
    }
    sendSuccess(res, {
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password — complete forgot-password with a single-use token
router.post("/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    sendSuccess(res, { message: "Password has been reset. You can now sign in." });
  } catch (err) {
    next(err);
  }
});

// POST /auth/change-password — authenticated password change
router.post("/change-password", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.empcloudUserId, currentPassword, newPassword);
    sendSuccess(res, { message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — return current user from JWT
router.get("/me", authenticate, (req: Request, res: Response) => {
  sendSuccess(res, req.user);
});

// GET /auth/profile — full profile for the account page
router.get("/profile", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await authService.getProfile(req.user!.empcloudUserId);
    sendSuccess(res, profile);
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
