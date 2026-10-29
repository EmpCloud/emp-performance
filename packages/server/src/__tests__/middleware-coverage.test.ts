// =============================================================================
// EMP PERFORMANCE — Middleware, Error, Rate Limit, Errors, Response Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../config", () => ({
  config: { jwt: { secret: "perf-test-secret" } },
}));

vi.mock("@emp-performance/shared", () => ({
  default: {},
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import { authenticate, authorize, AuthPayload } from "../api/middleware/auth.middleware";
import { actorFromAuthPayload } from "../security/actor-context";
import { normalizeRole } from "../security/roles";
import { errorHandler } from "../api/middleware/error.middleware";
import { rateLimit } from "../api/middleware/rate-limit.middleware";
import { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError } from "../utils/errors";
import { sendSuccess, sendError, sendPaginated } from "../utils/response";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReq(overrides: any = {}): any {
  return {
    method: "GET",
    originalUrl: "/api/v1/test",
    headers: {},
    params: {},
    query: {},
    body: {},
    ip: "127.0.0.1",
    ...overrides,
  };
}
function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

// =============================================================================
// Auth Middleware
// =============================================================================
describe("Performance Auth Middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("authenticate()", () => {
    it("rejects missing auth header", () => {
      const next = vi.fn();
      authenticate(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: "UNAUTHORIZED" }));
    });

    it("authenticates via internal service bypass", () => {
      const original = process.env.INTERNAL_SERVICE_SECRET;
      process.env.INTERNAL_SERVICE_SECRET = "secret123";

      const req = mockReq({
        originalUrl: "/api/v1/analytics/overview?organization_id=5",
        headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "secret123" },
        query: { organization_id: "5" },
      });
      const next = vi.fn();
      authenticate(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toMatchObject({ empcloudOrgId: 5, role: "service", email: "system@empcloud.internal" });
      expect(req.actor).toMatchObject({
        userId: 0,
        organizationId: 5,
        role: "service",
        roles: ["service"],
        authenticationMethod: "service",
      });

      process.env.INTERNAL_SERVICE_SECRET = original;
    });

    it("skips internal bypass when secret does not match", () => {
      const original = process.env.INTERNAL_SERVICE_SECRET;
      process.env.INTERNAL_SERVICE_SECRET = "correct-secret";

      const req = mockReq({
        headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "wrong-secret" },
      });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));

      process.env.INTERNAL_SERVICE_SECRET = original;
    });

    it("authenticates with valid JWT", () => {
      const payload: AuthPayload = {
        empcloudUserId: 1, empcloudOrgId: 2, performanceProfileId: "uuid-1",
        role: "hr_admin", email: "hr@t.com", firstName: "H", lastName: "R", orgName: "T",
      };
      const token = jwt.sign(payload, "perf-test-secret");
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();

      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
      expect(req.user.empcloudUserId).toBe(1);
      expect(req.actor).toMatchObject({
        userId: 1,
        organizationId: 2,
        role: "hr_admin",
        roles: ["hr_admin"],
      });
    });

    it("preserves the canonical manager role when authenticating a JWT", () => {
      const token = jwt.sign({
        empcloudUserId: 7,
        empcloudOrgId: 2,
        performanceProfileId: null,
        role: "manager",
        email: "manager@t.com",
        firstName: "M",
        lastName: "A",
        orgName: "T",
      }, "perf-test-secret");
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();

      authenticate(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user.role).toBe("manager");
      expect(req.actor).toMatchObject({ userId: 7, organizationId: 2, role: "manager" });
    });

    it("normalizes an unknown JWT role to the least-privileged employee role", () => {
      const token = jwt.sign({
        empcloudUserId: 8,
        empcloudOrgId: 2,
        performanceProfileId: null,
        role: "future_admin",
        email: "unknown@t.com",
        firstName: "U",
        lastName: "R",
        orgName: "T",
      }, "perf-test-secret");
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();

      authenticate(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user.role).toBe("employee");
      expect(req.actor.role).toBe("employee");
    });

    it("rejects bearer tokens in the query string", () => {
      const token = jwt.sign({
        empcloudUserId: 3,
        empcloudOrgId: 2,
        performanceProfileId: null,
        role: "employee",
        email: "employee@t.com",
        firstName: "E",
        lastName: "M",
        orgName: "T",
      }, "perf-test-secret");
      const req = mockReq({ query: { token } });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it("rejects a valid internal secret outside the widget endpoint", () => {
      const original = process.env.INTERNAL_SERVICE_SECRET;
      process.env.INTERNAL_SERVICE_SECRET = "secret123";
      const req = mockReq({
        method: "POST",
        originalUrl: "/api/v1/reviews",
        headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "secret123" },
        query: { organization_id: "5" },
      });
      const next = vi.fn();

      authenticate(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(req.user).toBeUndefined();
      process.env.INTERNAL_SERVICE_SECRET = original;
    });

    it("rejects expired token", () => {
      const token = jwt.sign({ sub: "1" }, "perf-test-secret", { expiresIn: "-1s" });
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
    });

    it("rejects invalid token", () => {
      const req = mockReq({ headers: { authorization: "Bearer garbage" } });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
    });
  });

  describe("authorize()", () => {
    it("rejects unauthenticated user", () => {
      const mw = authorize("hr_admin");
      const next = vi.fn();
      mw(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it("rejects insufficient role", () => {
      const mw = authorize("org_admin");
      const req = mockReq({
        user: { role: "employee" },
        actor: { role: "employee", roles: ["employee"] },
      });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it("allows matching role", () => {
      const mw = authorize("hr_admin");
      const req = mockReq({
        user: { role: "hr_admin" },
        actor: { role: "hr_admin", roles: ["hr_admin"] },
      });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("allows a tenant-scoped super admin on an administrative route", () => {
      const mw = authorize("hr_admin");
      const req = mockReq({
        user: { role: "super_admin", empcloudOrgId: 2 },
        actor: { role: "super_admin", roles: ["super_admin"], organizationId: 2 },
      });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("does not let a super admin inherit non-administrative roles", () => {
      const mw = authorize("service");
      const req = mockReq({
        user: { role: "super_admin", empcloudOrgId: 2 },
        actor: { role: "super_admin", roles: ["super_admin"], organizationId: 2 },
      });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it("allows any authenticated user when no roles specified", () => {
      const mw = authorize();
      const req = mockReq({
        user: { role: "employee" },
        actor: { role: "employee", roles: ["employee"] },
      });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("uses the canonical actor rather than a conflicting raw user role", () => {
      const mw = authorize("org_admin");
      const req = mockReq({
        user: { role: "org_admin" },
        actor: { role: "employee", roles: ["employee"] },
      });
      const next = vi.fn();

      mw(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });
});

describe("Canonical actor and role helpers", () => {
  it.each([
    ["super_admin", "super_admin"],
    ["Org Admin", "org_admin"],
    ["admin", "hr_admin"],
    ["HR-Manager", "hr_manager"],
    ["Manager", "manager"],
    ["employee", "employee"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeRole(input)).toBe(expected);
  });

  it.each([undefined, null, "", "future_admin"])(
    "normalizes unknown role %s to employee",
    (input) => {
      expect(normalizeRole(input)).toBe("employee");
    },
  );

  it("derives a canonical actor from an authenticated payload", () => {
    const payload: AuthPayload = {
      empcloudUserId: 42,
      empcloudOrgId: 9,
      performanceProfileId: "profile-42",
      role: "manager",
      email: "manager@example.com",
      firstName: "Casey",
      lastName: "Manager",
      orgName: "Example",
    };

    expect(actorFromAuthPayload(payload)).toMatchObject({
      userId: 42,
      employeeId: 42,
      organizationId: 9,
      role: "manager",
      roles: ["manager"],
    });
  });
});

// =============================================================================
// Error Handler
// =============================================================================
describe("Performance Error Handler", () => {
  it("handles AppError", () => {
    const err = new AppError(422, "CUSTOM", "fail");
    const res = mockRes();
    errorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("handles ZodError as 400", () => {
    const err = new ZodError([{ code: "invalid_type", expected: "string", received: "number", path: ["x"], message: "bad" }]);
    const res = mockRes();
    errorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "VALIDATION_ERROR" }) }));
  });

  it("handles unknown error as 500", () => {
    const res = mockRes();
    errorHandler(new Error("oops"), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// Rate Limit
// =============================================================================
describe("Performance Rate Limit", () => {
  it("skips when RATE_LIMIT_DISABLED=true", () => {
    const orig = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = "true";
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    const next = vi.fn();
    limiter(mockReq({ ip: "perf-skip" }), mockRes(), next);
    expect(next).toHaveBeenCalled();
    process.env.RATE_LIMIT_DISABLED = orig;
  });

  it("allows requests within limit", () => {
    const orig = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    const limiter = rateLimit({ windowMs: 60000, max: 10 });
    const res = mockRes();
    const next = vi.fn();
    limiter(mockReq({ ip: `perf-allow-${Date.now()}` }), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 10);
    process.env.RATE_LIMIT_DISABLED = orig;
  });

  it("blocks when exceeding max", () => {
    const orig = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    const limiter = rateLimit({ windowMs: 60000, max: 1 });
    const ip = `perf-block-${Date.now()}`;

    limiter(mockReq({ ip }), mockRes(), vi.fn()); // 1st
    const res = mockRes();
    limiter(mockReq({ ip }), res, vi.fn()); // 2nd — over limit
    expect(res.status).toHaveBeenCalledWith(429);
    process.env.RATE_LIMIT_DISABLED = orig;
  });
});

// =============================================================================
// Error Classes
// =============================================================================
describe("Performance Error Classes", () => {
  it("AppError", () => {
    const e = new AppError(400, "X", "msg");
    expect(e.statusCode).toBe(400);
    expect(e instanceof Error).toBe(true);
  });
  it("NotFoundError", () => {
    const e = new NotFoundError("Goal");
    expect(e.statusCode).toBe(404);
    expect(e.message).toContain("Goal");
  });
  it("NotFoundError with id", () => {
    const e = new NotFoundError("Goal", "abc");
    expect(e.message).toContain("abc");
  });
  it("ValidationError", () => {
    const e = new ValidationError("bad", { f: ["r"] });
    expect(e.statusCode).toBe(400);
    expect(e.details).toEqual({ f: ["r"] });
  });
  it("UnauthorizedError", () => { expect(new UnauthorizedError().statusCode).toBe(401); });
  it("ForbiddenError", () => { expect(new ForbiddenError().statusCode).toBe(403); });
  it("ConflictError", () => { expect(new ConflictError("dup").statusCode).toBe(409); });
});

// =============================================================================
// Response Helpers
// =============================================================================
describe("Performance Response Helpers", () => {
  it("sendSuccess sends 200 by default", () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { id: 1 } }));
  });

  it("sendSuccess supports custom status", () => {
    const res = mockRes();
    sendSuccess(res, null, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("sendError sends error envelope", () => {
    const res = mockRes();
    sendError(res, 404, "NOT_FOUND", "Gone");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: { code: "NOT_FOUND", message: "Gone" } }));
  });

  it("sendPaginated calculates totalPages", () => {
    const res = mockRes();
    sendPaginated(res, [1, 2], 15, 2, 5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ total: 15, totalPages: 3 }),
    }));
  });
});
