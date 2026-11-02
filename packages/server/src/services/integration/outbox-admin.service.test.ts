import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDB = {
  create: vi.fn(),
  findOne: vi.fn(),
  findMany: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  count: vi.fn(),
  sum: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("../../db/adapters", () => ({ getDB: () => mockDB }));

import type { ActorContext } from "../../security/actor-context";
import { ConflictError, ForbiddenError } from "../../utils/errors";
import {
  getOutboxEvent,
  getOutboxSummary,
  listOutboxEvents,
  replayOutboxEvent,
} from "./outbox-admin.service";

const NOW = new Date("2026-10-30T10:00:00.000Z");
const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function actor(
  role: ActorContext["role"] = "org_admin",
  organizationId = 7,
): ActorContext {
  return {
    userId: 101,
    employeeId: 101,
    organizationId,
    role,
    roles: [role],
    authenticationMethod: "jwt",
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    organization_id: 7,
    event_type: "performance.cycle_completed",
    aggregate_type: "review_cycle",
    aggregate_id: "cycle-1",
    idempotency_key: "performance.cycle_completed:cycle-1:v1",
    payload: { employeeEmail: "private@example.com", note: "confidential" },
    status: "dead",
    attempts: 3,
    max_attempts: 3,
    next_attempt_at: NOW,
    locked_at: null,
    locked_until: null,
    lock_token: null,
    last_error: "POST https://hooks.example.test/tenant?token=abc token=secret-value failed",
    delivered_at: null,
    replay_count: 0,
    last_replayed_at: null,
    last_replayed_by: null,
    dead_at: NOW,
    alerted_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function queryResult<T>(data: T[], total = data.length) {
  return { data, total, page: 1, limit: 20, totalPages: total ? 1 : 0 };
}

describe("outbox admin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.create.mockImplementation(async (_table, value) => value);
    mockDB.updateMany.mockResolvedValue(1);
    mockDB.raw.mockResolvedValue(undefined);
    mockDB.transaction.mockImplementation(async (fn) => fn(mockDB));
  });

  it("builds a tenant-scoped operational summary", async () => {
    const counts: Record<string, number> = {
      pending: 2,
      processing: 1,
      retry: 3,
      delivered: 8,
      dead: 1,
    };
    mockDB.count.mockImplementation(async (_table, where) => counts[where.status]);
    mockDB.findMany
      .mockResolvedValueOnce(queryResult([event()], 4))
      .mockResolvedValueOnce(queryResult([event({ created_at: NOW })]));

    await expect(getOutboxSummary(7, actor())).resolves.toEqual({
      total: 15,
      pending: 2,
      processing: 1,
      retry: 3,
      delivered: 8,
      dead: 1,
      ready: 4,
      oldest_pending_at: NOW,
    });

    for (const call of mockDB.count.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ organization_id: 7 }));
    }
    expect(mockDB.findMany).toHaveBeenCalledWith(
      "integration_outbox",
      expect.objectContaining({
        filters: expect.objectContaining({ organization_id: 7 }),
      }),
    );
  });

  it("returns a tenant-filtered list without payload or idempotency data", async () => {
    mockDB.findMany.mockResolvedValue(queryResult([event()]));

    const result = await listOutboxEvents(7, actor("hr_admin"), {
      status: "dead",
      eventType: "performance.cycle_completed",
    });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "integration_outbox",
      expect.objectContaining({
        filters: {
          organization_id: 7,
          status: "dead",
          event_type: "performance.cycle_completed",
        },
      }),
    );
    expect(result.data[0]).not.toHaveProperty("payload");
    expect(result.data[0]).not.toHaveProperty("idempotency_key");
    expect(result.data[0].last_error).toContain("[redacted-url]");
    expect(result.data[0].last_error).not.toContain("secret-value");
  });

  it("redacts complete bearer credentials from operational errors", async () => {
    mockDB.findMany.mockResolvedValue(
      queryResult([event({ last_error: "Authorization: Bearer very-secret-jwt failed" })]),
    );

    const result = await listOutboxEvents(7, actor("hr_admin"));

    expect(result.data[0].last_error).toBe("authorization=[redacted] failed");
    expect(result.data[0].last_error).not.toContain("very-secret-jwt");
  });

  it("redacts basic authorization and quoted secrets containing spaces", async () => {
    mockDB.findMany.mockResolvedValue(
      queryResult([
        event({
          last_error: 'Authorization: Basic dXNlcjpwYXNz password="two word secret"',
        }),
      ]),
    );

    const result = await listOutboxEvents(7, actor("hr_admin"));

    expect(result.data[0].last_error).toBe(
      "authorization=[redacted] password=[redacted]",
    );
    expect(result.data[0].last_error).not.toContain("dXNlcjpwYXNz");
    expect(result.data[0].last_error).not.toContain("two word secret");
  });

  it("redacts credentials embedded in JSON-like operational errors", async () => {
    mockDB.findMany.mockResolvedValue(
      queryResult([event({ last_error: 'response {"token":"json-secret","password":"p@ss"}' })]),
    );

    const result = await listOutboxEvents(7, actor("hr_admin"));

    expect(result.data[0].last_error).toBe(
      "response {token=[redacted],password=[redacted]}",
    );
    expect(result.data[0].last_error).not.toContain("json-secret");
    expect(result.data[0].last_error).not.toContain("p@ss");
  });

  it("redacts compound credential keys from operational errors", async () => {
    mockDB.findMany.mockResolvedValue(
      queryResult([
        event({
          last_error:
            'response {"access_token":"access-secret","refresh_token":"refresh-secret","client_secret":"client-secret","secret_access_key":"aws-secret"}',
        }),
      ]),
    );

    const result = await listOutboxEvents(7, actor("hr_admin"));
    const safeError = result.data[0].last_error ?? "";

    expect(safeError).toContain("access_token=[redacted]");
    expect(safeError).toContain("refresh_token=[redacted]");
    expect(safeError).toContain("client_secret=[redacted]");
    expect(safeError).toContain("secret_access_key=[redacted]");
    expect(safeError).not.toContain("access-secret");
    expect(safeError).not.toContain("refresh-secret");
    expect(safeError).not.toContain("client-secret");
    expect(safeError).not.toContain("aws-secret");
  });

  it("returns only sanitized payload metadata and attempt history in detail", async () => {
    mockDB.findOne.mockResolvedValue(event());
    mockDB.findMany.mockResolvedValue(
      queryResult([
        {
          id: "attempt-1",
          outbox_event_id: EVENT_ID,
          replay_generation: 0,
          attempt_number: 3,
          result: "dead",
          http_status: 503,
          error: "POST https://hooks.example.test/tenant api_key=my-secret failed",
          started_at: NOW,
          completed_at: NOW,
          created_at: NOW,
        },
      ]),
    );

    const result = await getOutboxEvent(7, EVENT_ID, actor());

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("idempotency_key");
    expect(result.payload_metadata).toEqual({
      byte_size: expect.any(Number),
      property_count: 2,
    });
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("my-secret");
    expect(result.attempt_history[0]).toEqual(
      expect.objectContaining({
        replay_generation: 0,
        attempt_number: 3,
        result: "dead",
        http_status: 503,
        error: "POST [redacted-url] api_key=[redacted] failed",
      }),
    );
  });

  it("atomically replays a dead event without replacing its identity", async () => {
    const dead = event();
    const pending = event({
      status: "pending",
      attempts: 0,
      replay_count: 1,
      last_error: null,
      dead_at: null,
      alerted_at: null,
      last_replayed_at: NOW,
    });
    mockDB.findOne.mockResolvedValueOnce(dead).mockResolvedValueOnce(pending);
    mockDB.findMany.mockResolvedValue(queryResult([]));

    const result = await replayOutboxEvent(7, EVENT_ID, actor("org_admin"));

    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      [EVENT_ID, 7],
    );
    expect(mockDB.updateMany).toHaveBeenCalledWith(
      "integration_outbox",
      { id: EVENT_ID, organization_id: 7, status: "dead", replay_count: 0 },
      expect.objectContaining({
        status: "pending",
        attempts: 0,
        replay_count: 1,
        next_attempt_at: expect.any(Date),
        lock_token: null,
        locked_at: null,
        locked_until: null,
        last_error: null,
        dead_at: null,
        alerted_at: null,
      }),
    );
    const update = mockDB.updateMany.mock.calls[0][2];
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("idempotency_key");
    expect(update).not.toHaveProperty("payload");
    expect(mockDB.create).toHaveBeenCalledWith(
      "audit_logs",
      expect.objectContaining({
        organization_id: 7,
        user_id: 101,
        action: "integration_outbox.replayed",
        entity_id: EVENT_ID,
      }),
    );
    expect(result).toEqual(expect.objectContaining({
      id: EVENT_ID,
      status: "pending",
      replay_count: 1,
      replayable: false,
    }));
  });

  it("rejects a concurrent replay when the compare-and-set loses", async () => {
    mockDB.findOne.mockResolvedValue(event());
    mockDB.updateMany.mockResolvedValue(0);

    await expect(
      replayOutboxEvent(7, EVENT_ID, actor("super_admin")),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("rejects replay of a non-dead event", async () => {
    mockDB.findOne.mockResolvedValue(event({ status: "retry" }));

    await expect(
      replayOutboxEvent(7, EVENT_ID, actor("org_admin")),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockDB.updateMany).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant access before querying data", async () => {
    await expect(getOutboxSummary(7, actor("super_admin", 8))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(mockDB.count).not.toHaveBeenCalled();
  });
});
