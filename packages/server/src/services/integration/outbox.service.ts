import { createHmac } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { config } from "../../config";
import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import { logger } from "../../utils/logger";
import { logDelivery } from "../notification/notification.service";

export type OutboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "delivered"
  | "dead";

export interface IntegrationOutboxEvent {
  id: string;
  organization_id: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  idempotency_key: string;
  payload: Record<string, unknown> | string;
  status: OutboxStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date;
  locked_at: Date | null;
  locked_until: Date | null;
  lock_token: string | null;
  last_error: string | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EnqueueIntegrationEventInput {
  organizationId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}

export interface ProcessOutboxOptions {
  batchSize?: number;
  leaseSeconds?: number;
  now?: () => Date;
  random?: () => number;
  fetchImpl?: typeof fetch;
}

export interface OutboxBatchResult {
  claimed: number;
  delivered: number;
  retried: number;
  dead: number;
}

const OUTBOX_TABLE = "integration_outbox";
const ERROR_LIMIT = 2_000;

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parsePayload(payload: IntegrationOutboxEvent["payload"]): Record<string, unknown> {
  if (typeof payload === "string") {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Outbox payload must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }
  return payload;
}

function serializeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, ERROR_LIMIT);
}

export function calculateRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = positiveInteger(config.empcloudWebhook.retryBaseMs, 5_000);
  const cap = positiveInteger(config.empcloudWebhook.retryMaxMs, 3_600_000);
  const exponential = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(exponential * 0.25 * Math.max(0, Math.min(1, random())));
  return exponential + jitter;
}

export function createWebhookSignature(
  eventId: string,
  timestamp: string,
  body: string,
  secret: string,
): string {
  return `sha256=${createHmac("sha256", secret)
    .update(`${eventId}.${timestamp}.${body}`)
    .digest("hex")}`;
}

/** Validate deployment-time invariants without preventing local development. */
export function validateWebhookConfiguration(): void {
  const { url, secret } = config.empcloudWebhook;
  if (!url) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("EMPCLOUD_WEBHOOK_URL must be a valid URL");
  }

  if (config.env === "production" && parsed.protocol !== "https:") {
    throw new Error("EMPCLOUD_WEBHOOK_URL must use HTTPS in production");
  }
  if (config.env === "production" && !secret) {
    throw new Error("EMPCLOUD_WEBHOOK_SECRET is required in production");
  }
}

/**
 * Insert an integration event using the caller's data context. Passing a
 * transaction-bound context makes the outbox write atomic with its business
 * state change. Repeated idempotency keys resolve to the original event.
 */
export async function enqueueIntegrationEvent(
  context: IDataContext,
  input: EnqueueIntegrationEventInput,
): Promise<IntegrationOutboxEvent> {
  const existing = await context.findOne<IntegrationOutboxEvent>(OUTBOX_TABLE, {
    idempotency_key: input.idempotencyKey,
  });
  if (existing) return existing;

  const eventId = uuidv4();
  try {
    return await context.create<IntegrationOutboxEvent>(OUTBOX_TABLE, {
      id: eventId,
      organization_id: input.organizationId,
      event_type: input.eventType,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      idempotency_key: input.idempotencyKey,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      max_attempts: positiveInteger(
        input.maxAttempts ?? config.empcloudWebhook.maxAttempts,
        8,
      ),
      next_attempt_at: new Date(),
      locked_at: null,
      locked_until: null,
      lock_token: null,
      last_error: null,
      delivered_at: null,
    } as Partial<IntegrationOutboxEvent>);
  } catch (error) {
    // A competing transaction may have won the unique idempotency-key race.
    const winner = await context.findOne<IntegrationOutboxEvent>(OUTBOX_TABLE, {
      idempotency_key: input.idempotencyKey,
    });
    if (winner) return winner;
    throw error;
  }
}

async function recoverExpiredLeases(context: IDataContext, now: Date): Promise<void> {
  await context.raw(
    `UPDATE integration_outbox
       SET status = 'retry', lock_token = NULL, locked_at = NULL,
           locked_until = NULL, next_attempt_at = ?, updated_at = ?
     WHERE status = 'processing' AND locked_until IS NOT NULL AND locked_until <= ?`,
    [now, now, now],
  );
}

async function findCandidateEvents(
  context: IDataContext,
  batchSize: number,
  now: Date,
): Promise<IntegrationOutboxEvent[]> {
  const candidates = await context.findMany<IntegrationOutboxEvent>(OUTBOX_TABLE, {
    page: 1,
    limit: batchSize,
    sort: { field: "created_at", order: "asc" },
    filters: {
      status: ["pending", "retry"],
      next_attempt_at: { op: "<=", value: now },
    },
  });
  return candidates.data;
}

async function claimEvent(
  context: IDataContext,
  candidate: IntegrationOutboxEvent,
  leaseSeconds: number,
  now: Date,
): Promise<IntegrationOutboxEvent | null> {
  const lockToken = uuidv4();
  const lockedUntil = new Date(now.getTime() + leaseSeconds * 1_000);
  const updated = await context.updateMany(
    OUTBOX_TABLE,
    {
      id: candidate.id,
      status: candidate.status,
      attempts: candidate.attempts,
      next_attempt_at: candidate.next_attempt_at,
      lock_token: candidate.lock_token ?? null,
    },
    {
      status: "processing",
      lock_token: lockToken,
      locked_at: now,
      locked_until: lockedUntil,
    },
  );
  if (updated !== 1) return null;
  return {
    ...candidate,
    status: "processing",
    lock_token: lockToken,
    locked_at: now,
    locked_until: lockedUntil,
  };
}

async function logDeliveryBestEffort(
  input: Parameters<typeof logDelivery>[0],
): Promise<void> {
  try {
    await logDelivery(input);
  } catch (error) {
    logger.warn("Unable to record outbox delivery log", error);
  }
}

async function deliverEvent(
  event: IntegrationOutboxEvent,
  fetchImpl: typeof fetch,
  now: () => Date,
  random: () => number,
): Promise<"delivered" | "retry" | "dead" | "lease_lost"> {
  const db = getDB();
  const webhook = config.empcloudWebhook;
  const attempt = event.attempts + 1;
  try {
    const body = JSON.stringify(parsePayload(event.payload));
    const timestamp = now().toISOString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Event-Id": event.id,
      "X-Idempotency-Key": event.idempotency_key,
      "X-EMPCloud-Timestamp": timestamp,
    };
    if (webhook.secret) {
      headers["X-EMPCloud-Signature"] = createWebhookSignature(
        event.id,
        timestamp,
        body,
        webhook.secret,
      );
    }

    const response = await fetchImpl(webhook.url!, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(
        positiveInteger(webhook.timeoutMs, 10_000),
      ),
    });
    if (!response.ok) {
      throw new Error(`EMP Cloud webhook returned HTTP ${response.status}`);
    }

    const deliveredAt = now();
    const updated = await db.updateMany(
      OUTBOX_TABLE,
      { id: event.id, status: "processing", lock_token: event.lock_token },
      {
        status: "delivered",
        attempts: attempt,
        delivered_at: deliveredAt,
        last_error: null,
        lock_token: null,
        locked_at: null,
        locked_until: null,
      },
    );
    if (updated !== 1) return "lease_lost";
    await logDeliveryBestEffort({
      organizationId: event.organization_id,
      channel: "webhook",
      category: event.event_type,
      recipient: webhook.url,
      subject: event.aggregate_id,
      status: "sent",
    });
    return "delivered";
  } catch (error) {
    const failedAt = now();
    const terminal = attempt >= event.max_attempts;
    const nextAttempt = new Date(
      failedAt.getTime() + calculateRetryDelayMs(attempt, random),
    );
    const message = serializeError(error);
    const updated = await db.updateMany(
      OUTBOX_TABLE,
      { id: event.id, status: "processing", lock_token: event.lock_token },
      {
        status: terminal ? "dead" : "retry",
        attempts: attempt,
        next_attempt_at: nextAttempt,
        last_error: message,
        lock_token: null,
        locked_at: null,
        locked_until: null,
      },
    );
    if (updated !== 1) return "lease_lost";
    await logDeliveryBestEffort({
      organizationId: event.organization_id,
      channel: "webhook",
      category: event.event_type,
      recipient: webhook.url,
      subject: event.aggregate_id,
      status: "failed",
      error: message,
    });
    return terminal ? "dead" : "retry";
  }
}

/** Process one available batch. Safe to run concurrently across processes. */
export async function processOutboxBatch(
  options: ProcessOutboxOptions = {},
): Promise<OutboxBatchResult> {
  validateWebhookConfiguration();
  if (!config.empcloudWebhook.url) {
    return { claimed: 0, delivered: 0, retried: 0, dead: 0 };
  }

  const db = getDB();
  const now = options.now ?? (() => new Date());
  const selectionTime = now();
  const batchSize = positiveInteger(
    options.batchSize ?? config.empcloudWebhook.batchSize,
    25,
  );
  const leaseSeconds = positiveInteger(
    options.leaseSeconds ?? config.empcloudWebhook.leaseSeconds,
    60,
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const random = options.random ?? Math.random;
  await recoverExpiredLeases(db, selectionTime);
  const candidates = await findCandidateEvents(db, batchSize, selectionTime);
  const result: OutboxBatchResult = {
    claimed: 0,
    delivered: 0,
    retried: 0,
    dead: 0,
  };

  // Candidates remain unclaimed while waiting behind earlier deliveries. Each
  // event receives its lease immediately before its network attempt, avoiding
  // a batch-wide lease that can expire while queued in this process.
  for (const candidate of candidates) {
    const event = await claimEvent(db, candidate, leaseSeconds, now());
    if (!event) continue;
    result.claimed++;
    const outcome = await deliverEvent(event, fetchImpl, now, random);
    if (outcome === "delivered") result.delivered++;
    else if (outcome === "retry") result.retried++;
    else if (outcome === "dead") result.dead++;
  }
  return result;
}
