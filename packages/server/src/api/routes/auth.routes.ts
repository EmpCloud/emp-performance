// ============================================================================
// AUTH ROUTES
// POST /login, /register, /sso, /refresh-token
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as authService from "../../services/auth/auth.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// POST /auth/login
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new ValidationError("Email and password are required");
    }
    const result = await authService.login(email, password);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/register
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orgName, firstName, lastName, email, password, country } = req.body;
    if (!orgName || !firstName || !lastName || !email || !password) {
      throw new ValidationError("All fields are required: orgName, firstName, lastName, email, password");
    }
    const result = await authService.register({ orgName, firstName, lastName, email, password, country });
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// POST /auth/sso
router.post("/sso", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      throw new ValidationError("SSO token is required");
    }
    const result = await authService.ssoLogin(token);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh-token
router.post("/refresh-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new ValidationError("Refresh token is required");
    }
    const result = await authService.refreshToken(refreshToken);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — return current user from JWT
router.get("/me", authenticate, (req: Request, res: Response) => {
  sendSuccess(res, req.user);
});

export { router as authRoutes };
