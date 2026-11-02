import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogDelivery } = vi.hoisted(() => ({
  mockLogDelivery: vi.fn(),
}));

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

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

vi.mock("../notification/notification.service", () => ({
  logDelivery: mockLogDelivery,
}));

import { config } from "../../config";
import {
  calculateRetryDelayMs,
  createWebhookSignature,
  enqueueIntegrationEvent,
  processOutboxBatch,
  type IntegrationOutboxEvent,
} from "./outbox.service";

const NOW = new Date("2026-10-30T10:00:00.000Z");

function event(overrides: Partial<IntegrationOutboxEvent> = {}): IntegrationOutboxEvent {
  return {
    id: "event-1",
    organization_id: 7,
    event_type: "performance.cycle_completed",
    aggregate_type: "review_cycle",
    aggregate_id: "cycle-1",
    idempotency_key: "performance.cycle_completed:cycle-1:v1",
    payload: { event: "performance.cycle_completed", cycleId: "cycle-1" },
    status: "pending",
    attempts: 0,
    max_attempts: 3,
    next_attempt_at: NOW,
    locked_at: null,
    locked_until: null,
    lock_token: null,
    last_error: null,
    delivered_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function available(rows: IntegrationOutboxEvent[]) {
  mockDB.findMany.mockResolvedValue({
    data: rows,
    total: rows.length,
    page: 1,
    limit: 25,
    totalPages: rows.length ? 1 : 0,
  });
}

describe("integration outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(config.empcloudWebhook as any, {
      url: "https://empcloud.example.test/hooks/performance",
      secret: "test-secret",
      timeoutMs: 1000,
      batchSize: 25,
      leaseSeconds: 60,
      maxAttempts: 3,
      retryBaseMs: 5000,
      retryMaxMs: 60000,
    });
    mockDB.raw.mockResolvedValue(undefined);
    mockDB.updateMany.mockResolvedValue(1);
    mockLogDelivery.mockResolvedValue(undefined);
  });

  it("enqueues through the caller's data context and returns the idempotent event", async () => {
    const context = { findOne: vi.fn(), create: vi.fn() } as any;
    const created = event();
    context.findOne.mockResolvedValueOnce(null);
    context.create.mockResolvedValue(created);

    const result = await enqueueIntegrationEvent(context, {
      organizationId: 7,
      eventType: "performance.cycle_completed",
      aggregateType: "review_cycle",
      aggregateId: "cycle-1",
      idempotencyKey: "performance.cycle_completed:cycle-1:v1",
      payload: { cycleId: "cycle-1" },
    });

    expect(result).toBe(created);
    expect(context.create).toHaveBeenCalledWith(
      "integration_outbox",
      expect.objectContaining({
        organization_id: 7,
        status: "pending",
        attempts: 0,
        max_attempts: 3,
      }),
    );

    context.findOne.mockResolvedValueOnce(created);
    await expect(
      enqueueIntegrationEvent(context, {
        organizationId: 7,
        eventType: created.event_type,
        aggregateType: created.aggregate_type,
        aggregateId: created.aggregate_id,
        idempotencyKey: created.idempotency_key,
        payload: { cycleId: "cycle-1" },
      }),
    ).resolves.toBe(created);
    expect(context.create).toHaveBeenCalledTimes(1);
  });

  it("resolves an idempotency race to the competing transaction's event", async () => {
    const context = { findOne: vi.fn(), create: vi.fn() } as any;
    const winner = event({ id: "winner" });
    context.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    context.create.mockRejectedValue(new Error("duplicate key"));

    await expect(
      enqueueIntegrationEvent(context, {
        organizationId: 7,
        eventType: winner.event_type,
        aggregateType: winner.aggregate_type,
        aggregateId: winner.aggregate_id,
        idempotencyKey: winner.idempotency_key,
        payload: { cycleId: "cycle-1" },
      }),
    ).resolves.toBe(winner);
  });

  it("creates a deterministic HMAC signature over the exact request body", () => {
    const body = JSON.stringify({ cycleId: "cycle-1" });
    const expected = createHmac("sha256", "test-secret")
      .update(`event-1.${NOW.toISOString()}.${body}`)
      .digest("hex");

    expect(
      createWebhookSignature("event-1", NOW.toISOString(), body, "test-secret"),
    ).toBe(`sha256=${expected}`);
  });

  it("claims and delivers an event with idempotency and signature headers", async () => {
    available([event()]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    const result = await processOutboxBatch({
      fetchImpl: fetchImpl as any,
      now: () => NOW,
      random: () => 0,
    });

    expect(result).toEqual({ claimed: 1, delivered: 1, retried: 0, dead: 0 });
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://empcloud.example.test/hooks/performance");
    expect(request.headers).toMatchObject({
      "X-Event-Id": "event-1",
      "X-Idempotency-Key": "performance.cycle_completed:cycle-1:v1",
      "X-EMPCloud-Timestamp": NOW.toISOString(),
      "X-EMPCloud-Signature": createWebhookSignature(
        "event-1",
        NOW.toISOString(),
        request.body,
        "test-secret",
      ),
    });
    expect(mockDB.updateMany).toHaveBeenNthCalledWith(
      1,
      "integration_outbox",
      expect.objectContaining({
        id: "event-1",
        status: "pending",
        attempts: 0,
        next_attempt_at: NOW,
      }),
      expect.objectContaining({ status: "processing" }),
    );
    expect(mockDB.updateMany).toHaveBeenLastCalledWith(
      "integration_outbox",
      expect.objectContaining({ id: "event-1", status: "processing" }),
      expect.objectContaining({ status: "delivered", attempts: 1 }),
    );
    expect(mockLogDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "webhook", status: "sent" }),
    );
  });

  it("keeps a successful webhook delivered when delivery-log persistence fails", async () => {
    available([event()]);
    mockLogDelivery.mockRejectedValueOnce(new Error("notification log unavailable"));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    const result = await processOutboxBatch({
      fetchImpl: fetchImpl as any,
      now: () => NOW,
      random: () => 0,
    });

    expect(result).toEqual({ claimed: 1, delivered: 1, retried: 0, dead: 0 });
    expect(mockDB.updateMany).toHaveBeenLastCalledWith(
      "integration_outbox",
      expect.objectContaining({ id: "event-1", status: "processing" }),
      expect.objectContaining({ status: "delivered" }),
    );
  });

  it("claims each queued event immediately before its own delivery attempt", async () => {
    available([
      event(),
      event({
        id: "event-2",
        aggregate_id: "cycle-2",
        idempotency_key: "performance.cycle_completed:cycle-2:v1",
      }),
    ]);
    const ticks = [0, 1, 2, 3, 20, 21, 22].map(
      (seconds) => new Date(NOW.getTime() + seconds * 1_000),
    );
    let tick = 0;
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    const result = await processOutboxBatch({
      fetchImpl: fetchImpl as any,
      now: () => ticks[tick++] ?? ticks[ticks.length - 1],
      random: () => 0,
    });

    expect(result).toEqual({ claimed: 2, delivered: 2, retried: 0, dead: 0 });
    expect(mockDB.updateMany).toHaveBeenNthCalledWith(
      3,
      "integration_outbox",
      expect.objectContaining({ id: "event-2", status: "pending" }),
      expect.objectContaining({
        status: "processing",
        locked_at: ticks[4],
        locked_until: new Date(ticks[4].getTime() + 60_000),
      }),
    );
  });

  it("retries non-2xx delivery with exponential backoff", async () => {
    available([event()]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    const result = await processOutboxBatch({
      fetchImpl: fetchImpl as any,
      now: () => NOW,
      random: () => 0,
    });

    expect(result).toEqual({ claimed: 1, delivered: 0, retried: 1, dead: 0 });
    expect(mockDB.updateMany).toHaveBeenLastCalledWith(
      "integration_outbox",
      expect.objectContaining({ id: "event-1", status: "processing" }),
      expect.objectContaining({
        status: "retry",
        attempts: 1,
        next_attempt_at: new Date(NOW.getTime() + 5000),
        last_error: "EMP Cloud webhook returned HTTP 503",
      }),
    );
    expect(mockLogDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("schedules retry delay from the failure time rather than request start", async () => {
    available([event()]);
    const failedAt = new Date(NOW.getTime() + 10_000);
    const ticks = [NOW, NOW, NOW, failedAt];
    let tick = 0;
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    await processOutboxBatch({
      fetchImpl: fetchImpl as any,
      now: () => ticks[tick++] ?? failedAt,
      random: () => 0,
    });

    expect(mockDB.updateMany).toHaveBeenLastCalledWith(
      "integration_outbox",
      expect.objectContaining({ id: "event-1", status: "processing" }),
      expect.objectContaining({
        status: "retry",
        next_attempt_at: new Date(failedAt.getTime() + 5_000),
      }),
    );
  });

  it("moves an event to dead-letter state after its final attempt", async () => {
    available([event({ attempts: 2, max_attempts: 3 })]);
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connection refused"));

    const result = await processOutboxBatch({
      fetchImpl: fetchImpl as any,
      now: () => NOW,
      random: () => 0,
    });

    expect(result).toEqual({ claimed: 1, delivered: 0, retried: 0, dead: 1 });
    expect(mockDB.updateMany).toHaveBeenLastCalledWith(
      "integration_outbox",
      expect.any(Object),
      expect.objectContaining({ status: "dead", attempts: 3 }),
    );
  });

  it("recovers expired processing leases before selecting available work", async () => {
    available([]);

    await processOutboxBatch({ now: () => NOW });

    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("locked_until <= ?"),
      [NOW, NOW, NOW],
    );
  });

  it("skips delivery when another worker wins the atomic claim", async () => {
    available([event()]);
    mockDB.updateMany.mockResolvedValueOnce(0);
    const fetchImpl = vi.fn();

    const result = await processOutboxBatch({
      fetchImpl: fetchImpl as any,
      now: () => NOW,
    });

    expect(result).toEqual({ claimed: 0, delivered: 0, retried: 0, dead: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caps exponential backoff and adds bounded jitter", () => {
    expect(calculateRetryDelayMs(1, () => 0)).toBe(5000);
    expect(calculateRetryDelayMs(20, () => 1)).toBe(75000);
  });
});
