/**
 * EMP Performance — Infrastructure coverage tests.
 * Error classes, response helpers, config validation.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from "../utils/errors";

describe("Error classes", () => {
  describe("AppError", () => {
    it("sets statusCode, code, message", () => {
      const err = new AppError(500, "INTERNAL", "Oops");
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe("INTERNAL");
      expect(err.message).toBe("Oops");
      expect(err.name).toBe("AppError");
    });

    it("includes details when provided", () => {
      const details = { name: ["required"] };
      const err = new AppError(400, "VALIDATION", "Bad", details);
      expect(err.details).toEqual(details);
    });

    it("has undefined details when not provided", () => {
      expect(new AppError(400, "X", "Y").details).toBeUndefined();
    });
  });

  describe("NotFoundError", () => {
    it("creates 404 with resource and id", () => {
      const err = new NotFoundError("Review", "abc");
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
      expect(err.message).toContain("Review");
      expect(err.message).toContain("abc");
    });

    it("creates 404 without id", () => {
      const err = new NotFoundError("Goal");
      expect(err.message).toBe("Goal not found");
    });
  });

  describe("ValidationError", () => {
    it("creates 400 with code VALIDATION_ERROR", () => {
      const err = new ValidationError("Bad input");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
    });

    it("includes field details", () => {
      const d = { score: ["must be 1-5"] };
      expect(new ValidationError("Invalid", d).details).toEqual(d);
    });
  });

  describe("UnauthorizedError", () => {
    it("creates 401 with default message", () => {
      const err = new UnauthorizedError();
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("Unauthorized");
    });

    it("accepts custom message", () => {
      expect(new UnauthorizedError("Expired").message).toBe("Expired");
    });
  });

  describe("ForbiddenError", () => {
    it("creates 403", () => {
      const err = new ForbiddenError();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe("FORBIDDEN");
    });

    it("accepts custom message", () => {
      expect(new ForbiddenError("No").message).toBe("No");
    });
  });

  describe("ConflictError", () => {
    it("creates 409", () => {
      const err = new ConflictError("Duplicate");
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe("CONFLICT");
    });
  });
});

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------
import { sendSuccess, sendError, sendPaginated } from "../utils/response";

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

describe("Response helpers", () => {
  describe("sendSuccess", () => {
    it("sends 200 with success envelope", () => {
      const res = mockRes();
      sendSuccess(res, { id: 1 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
    });

    it("sends custom status", () => {
      const res = mockRes();
      sendSuccess(res, null, 201);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe("sendError", () => {
    it("sends error envelope", () => {
      const res = mockRes();
      sendError(res, 404, "NOT_FOUND", "Gone");
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { code: "NOT_FOUND", message: "Gone" },
      });
    });
  });

  describe("sendPaginated", () => {
    it("sends paginated data with totalPages", () => {
      const res = mockRes();
      sendPaginated(res, [1], 25, 1, 10);
      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data.totalPages).toBe(3);
      expect(body.data.total).toBe(25);
    });

    it("handles zero total", () => {
      const res = mockRes();
      sendPaginated(res, [], 0, 1, 10);
      expect(res.json.mock.calls[0][0].data.totalPages).toBe(0);
    });
  });
});
