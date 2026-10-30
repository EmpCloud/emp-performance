import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOutboxSummary: vi.fn(),
  listOutboxEvents: vi.fn(),
  getOutboxEvent: vi.fn(),
  replayOutboxEvent: vi.fn(),
}));

vi.mock("../../services/integration/outbox-admin.service", () => mocks);
vi.mock("../middleware/auth.middleware", () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
  authorize: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import {
  getIntegrationOutboxEvent,
  getIntegrationOutboxSummary,
  listIntegrationOutboxEvents,
  replayIntegrationOutboxEvent,
} from "./integration-outbox.routes";

const ORG_ID = 7;
const USER_ID = 101;
const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function request(options: {
  params?: Record<string, string>;
  query?: Record<string, string>;
} = {}): Request {
  return {
    actor: {
      userId: USER_ID,
      employeeId: USER_ID,
      organizationId: ORG_ID,
      role: "org_admin",
      roles: ["org_admin"],
      authenticationMethod: "jwt",
    },
    user: {
      empcloudUserId: USER_ID,
      empcloudOrgId: ORG_ID,
      performanceProfileId: null,
      role: "org_admin",
      email: "admin@example.com",
      firstName: "Test",
      lastName: "Admin",
      orgName: "Test Org",
    },
    params: options.params ?? { id: EVENT_ID },
    query: options.query ?? {},
  } as unknown as Request;
}

function response(): Response {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe("integration outbox routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOutboxSummary.mockResolvedValue({ total: 0, dead: 0 });
    mocks.listOutboxEvents.mockResolvedValue({ data: [], total: 0, page: 1, perPage: 20 });
    mocks.getOutboxEvent.mockResolvedValue({ id: EVENT_ID, status: "dead" });
    mocks.replayOutboxEvent.mockResolvedValue({ id: EVENT_ID, status: "pending" });
  });

  it("derives summary tenant scope from the authenticated identity", async () => {
    const req = request();
    const res = response();

    await getIntegrationOutboxSummary(req, res, vi.fn());

    expect(mocks.getOutboxSummary).toHaveBeenCalledWith(ORG_ID, req.actor);
    expect(vi.mocked(res.json)).toHaveBeenCalledWith({
      success: true,
      data: { total: 0, dead: 0 },
    });
  });

  it("validates list filters and returns the standard paginated response", async () => {
    const req = request({
      query: {
        page: "2",
        perPage: "10",
        status: "retry",
        eventType: "performance.cycle_completed",
      },
    });
    const res = response();

    await listIntegrationOutboxEvents(req, res, vi.fn());

    expect(mocks.listOutboxEvents).toHaveBeenCalledWith(ORG_ID, req.actor, {
      page: 2,
      perPage: 10,
      status: "retry",
      eventType: "performance.cycle_completed",
    });
    expect(vi.mocked(res.json)).toHaveBeenCalledWith({
      success: true,
      data: { data: [], total: 0, page: 1, perPage: 20, totalPages: 0 },
    });
  });

  it("passes only a validated event id to detail", async () => {
    const req = request();
    await getIntegrationOutboxEvent(req, response(), vi.fn());

    expect(mocks.getOutboxEvent).toHaveBeenCalledWith(ORG_ID, EVENT_ID, req.actor);
  });

  it("returns accepted after scheduling a replay", async () => {
    const req = request();
    const res = response();

    await replayIntegrationOutboxEvent(req, res, vi.fn());

    expect(mocks.replayOutboxEvent).toHaveBeenCalledWith(ORG_ID, EVENT_ID, req.actor);
    expect(vi.mocked(res.status)).toHaveBeenCalledWith(202);
    expect(vi.mocked(res.json)).toHaveBeenCalledWith({
      success: true,
      data: { id: EVENT_ID, status: "pending" },
    });
  });

  it("rejects an invalid event id before calling the service", async () => {
    const next = vi.fn();
    await getIntegrationOutboxEvent(
      request({ params: { id: "not-a-uuid" } }),
      response(),
      next,
    );

    expect(mocks.getOutboxEvent).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
  });
});
