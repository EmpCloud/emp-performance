// ============================================================================
// EMP PERFORMANCE — Service Coverage Final Tests
// Targets: nine-box classifyNineBox, errors, validation branches
// ============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "";
process.env.DB_NAME = "emp_performance";
process.env.DB_PROVIDER = "mysql";
process.env.EMPCLOUD_DB_HOST = "localhost";
process.env.EMPCLOUD_DB_PORT = "3306";
process.env.EMPCLOUD_DB_USER = "empcloud";
process.env.EMPCLOUD_DB_PASSWORD = process.env.EMPCLOUD_DB_PASSWORD || "";
process.env.EMPCLOUD_DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-cov-final";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { initDB, closeDB, getDB } from "../../db/adapters";

vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  EmailService: class { send() { return Promise.resolve(); } },
}));

let db: ReturnType<typeof getDB>;

beforeAll(async () => {
  await initDB();
  db = getDB();
}, 30000);

afterAll(async () => {
  await closeDB();
}, 10000);

// ── NINE-BOX CLASSIFY ────────────────────────────────────────────────────────

describe("Nine-Box classifyNineBox", () => {
  let classifyNineBox: any;

  beforeAll(async () => {
    const mod = await import("../../services/analytics/nine-box.service");
    classifyNineBox = mod.classifyNineBox;
  });

  it("high perf + high potential = Star", () => {
    expect(classifyNineBox(4.5, 4.5)).toBe("Star");
  });

  it("high perf + medium potential = High Performer", () => {
    expect(classifyNineBox(4.0, 3.0)).toBe("High Performer");
  });

  it("high perf + low potential = Solid Performer", () => {
    expect(classifyNineBox(4.5, 1.5)).toBe("Solid Performer");
  });

  it("medium perf + high potential = High Potential", () => {
    expect(classifyNineBox(3.0, 4.5)).toBe("High Potential");
  });

  it("medium perf + medium potential = Core Player", () => {
    expect(classifyNineBox(3.0, 3.0)).toBe("Core Player");
  });

  it("medium perf + low potential = Average", () => {
    expect(classifyNineBox(3.0, 2.0)).toBe("Average");
  });

  it("low perf + high potential = Inconsistent", () => {
    expect(classifyNineBox(2.0, 4.5)).toBe("Inconsistent");
  });

  it("low perf + medium potential = Improvement Needed", () => {
    expect(classifyNineBox(2.0, 3.0)).toBe("Improvement Needed");
  });

  it("low perf + low potential = Action Required", () => {
    expect(classifyNineBox(1.0, 1.0)).toBe("Action Required");
  });

  it("boundary: perf=4 (high), potential=2.5 (medium)", () => {
    expect(classifyNineBox(4, 2.5)).toBe("High Performer");
  });

  it("boundary: perf=2.5 (medium), potential=4 (high)", () => {
    expect(classifyNineBox(2.5, 4)).toBe("High Potential");
  });
});

// ── ERROR CLASSES ────────────────────────────────────────────────────────────

describe("Performance error classes", () => {
  let errors: any;

  beforeAll(async () => {
    errors = await import("../../utils/errors");
  });

  it("NotFoundError with resource and id", () => {
    const err = new errors.NotFoundError("ReviewCycle", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("abc-123");
  });

  it("NotFoundError without id", () => {
    const err = new errors.NotFoundError("Goal");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("Goal");
  });

  it("ValidationError with details", () => {
    const err = new errors.ValidationError("Invalid input", { rating: ["must be 1-5"] });
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ rating: ["must be 1-5"] });
  });

  it("ForbiddenError default", () => {
    const err = new errors.ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("ConflictError", () => {
    const err = new errors.ConflictError("Duplicate cycle");
    expect(err.statusCode).toBe(409);
  });

  it("UnauthorizedError", () => {
    const err = new errors.UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });
});

// ── COMPETENCY SERVICE — error branches ──────────────────────────────────────

describe("Competency framework service — errors", () => {
  let competencyService: any;
  const ORG_ID = 5;

  beforeAll(async () => {
    competencyService = await import("../../services/competency/competency-framework.service");
  });

  it("getFramework throws NotFoundError", async () => {
    await expect(competencyService.getFramework(ORG_ID, "nonexistent-id"))
      .rejects.toThrow();
  });

  it("listFrameworks returns result", async () => {
    const result = await competencyService.listFrameworks(ORG_ID);
    expect(result).toBeDefined();
  });
});

// ── ONE-ON-ONE SERVICE — error branches ──────────────────────────────────────

describe("One-on-one service — errors", () => {
  let oneOnOneService: any;
  const ORG_ID = 5;

  beforeAll(async () => {
    oneOnOneService = await import("../../services/one-on-one/one-on-one.service");
  });

  it("listMeetings returns result", async () => {
    const result = await oneOnOneService.listMeetings(ORG_ID, { userId: 522 });
    expect(result).toBeDefined();
  });

  it("getMeeting throws NotFoundError", async () => {
    await expect(oneOnOneService.getMeeting(ORG_ID, "nonexistent-id"))
      .rejects.toThrow();
  });
});

// ── PEER REVIEW (nominations) SERVICE ────────────────────────────────────────

describe("Peer review nominations — module import", () => {
  it("module exports nominate and listNominations", async () => {
    const mod = await import("../../services/peer-review/peer-review.service");
    expect(typeof mod.nominate).toBe("function");
    expect(typeof mod.listNominations).toBe("function");
    expect(typeof mod.approveNomination).toBe("function");
    expect(typeof mod.declineNomination).toBe("function");
  });
});
