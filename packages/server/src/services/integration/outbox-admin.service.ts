import { v4 as uuidv4 } from "uuid";

import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import type { ActorContext } from "../../security/actor-context";
import { assertIntegrationOutboxAccess } from "../../security/policies/integration-outbox.policy";
import { ConflictError, NotFoundError } from "../../utils/errors";
import { sanitizeOperationalError } from "../../utils/sanitize-operational-error";
import type { IntegrationOutboxEvent, OutboxStatus } from "./outbox.service";

const OUTBOX_TABLE = "integration_outbox";
const ATTEMPT_TABLE = "integration_outbox_attempts";
const ADMIN_ERROR_LIMIT = 500;

type Timestamp = Date;

interface OutboxOperationsRow extends IntegrationOutboxEvent {
  replay_count?: number;
  last_replayed_at?: Timestamp | null;
  last_replayed_by?: number | null;
  dead_at?: Timestamp | null;
  alerted_at?: Timestamp | null;
}

export interface IntegrationOutboxAttempt {
  id: string;
  outbox_event_id: string;
  replay_generation: number;
  attempt_number: number;
  result: "delivered" | "retry" | "dead";
  http_status: number | null;
  error: string | null;
  started_at: Timestamp;
  completed_at: Timestamp;
  created_at: Timestamp;
}

export interface SafeOutboxEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  status: OutboxStatus;
  attempts: number;
  max_attempts: number;
  replay_count: number;
  next_attempt_at: Timestamp;
  last_error: string | null;
  delivered_at: Timestamp | null;
  dead_at: Timestamp | null;
  last_replayed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  replayable: boolean;
}

export interface OutboxEventDetail extends SafeOutboxEvent {
  payload_metadata: {
    byte_size: number;
    property_count: number;
  };
  attempt_history: Array<{
    id: string;
    replay_generation: number;
    attempt_number: number;
    result: "delivered" | "retry" | "dead";
    http_status: number | null;
    error: string | null;
    started_at: Timestamp;
    completed_at: Timestamp;
  }>;
}

export interface OutboxSummary {
  total: number;
  pending: number;
  processing: number;
  retry: number;
  delivered: number;
  dead: number;
  ready: number;
  oldest_pending_at: Timestamp | null;
}

export interface ListOutboxEventsInput {
  page?: number;
  perPage?: number;
  status?: OutboxStatus;
  eventType?: string;
}

export interface OutboxEventPage {
  data: SafeOutboxEvent[];
  total: number;
  page: number;
  perPage: number;
}

function payloadMetadata(payload: IntegrationOutboxEvent["payload"]): {
  byte_size: number;
  property_count: number;
} {
  let serialized: string;
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    serialized = payload;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      parsed = null;
    }
  } else {
    serialized = JSON.stringify(payload ?? {});
  }

  return {
    byte_size: Buffer.byteLength(serialized, "utf8"),
    property_count:
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed).length
        : 0,
  };
}

function toSafeEvent(row: OutboxOperationsRow): SafeOutboxEvent {
  return {
    id: row.id,
    event_type: row.event_type,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    status: row.status,
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    replay_count: Number(row.replay_count ?? 0),
    next_attempt_at: row.next_attempt_at,
    last_error: sanitizeOperationalError(row.last_error, ADMIN_ERROR_LIMIT),
    delivered_at: row.delivered_at,
    dead_at: row.dead_at ?? null,
    last_replayed_at: row.last_replayed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    replayable: row.status === "dead",
  };
}

async function loadTenantEvent(
  db: IDataContext,
  organizationId: number,
  eventId: string,
): Promise<OutboxOperationsRow> {
  const event = await db.findOne<OutboxOperationsRow>(OUTBOX_TABLE, {
    id: eventId,
    organization_id: organizationId,
  });
  if (!event) throw new NotFoundError("Integration outbox event", eventId);
  return event;
}

async function loadSafeDetail(
  db: IDataContext,
  event: OutboxOperationsRow,
): Promise<OutboxEventDetail> {
  const attempts = await db.findMany<IntegrationOutboxAttempt>(ATTEMPT_TABLE, {
    page: 1,
    limit: 500,
    sort: { field: "completed_at", order: "desc" },
    filters: { outbox_event_id: event.id },
  });

  return {
    ...toSafeEvent(event),
    payload_metadata: payloadMetadata(event.payload),
    attempt_history: attempts.data.map((attempt) => ({
      id: attempt.id,
      replay_generation: Number(attempt.replay_generation),
      attempt_number: Number(attempt.attempt_number),
      result: attempt.result,
      http_status:
        attempt.http_status === null || attempt.http_status === undefined
          ? null
          : Number(attempt.http_status),
      error: sanitizeOperationalError(attempt.error, ADMIN_ERROR_LIMIT),
      started_at: attempt.started_at,
      completed_at: attempt.completed_at,
    })),
  };
}

export async function getOutboxSummary(
  organizationId: number,
  actor: ActorContext,
): Promise<OutboxSummary> {
  assertIntegrationOutboxAccess(actor, "read", { organizationId });
  const db = getDB();
  const statuses: OutboxStatus[] = [
    "pending",
    "processing",
    "retry",
    "delivered",
    "dead",
  ];
  const [counts, ready, oldest] = await Promise.all([
    Promise.all(
      statuses.map((status) =>
        db.count(OUTBOX_TABLE, { organization_id: organizationId, status }),
      ),
    ),
    db.findMany<OutboxOperationsRow>(OUTBOX_TABLE, {
      page: 1,
      limit: 1,
      filters: {
        organization_id: organizationId,
        status: ["pending", "retry"],
        next_attempt_at: { op: "<=", value: new Date() },
      },
    }),
    db.findMany<OutboxOperationsRow>(OUTBOX_TABLE, {
      page: 1,
      limit: 1,
      sort: { field: "created_at", order: "asc" },
      filters: {
        organization_id: organizationId,
        status: ["pending", "retry"],
      },
    }),
  ]);

  const [pending, processing, retry, delivered, dead] = counts;
  return {
    total: counts.reduce((sum, count) => sum + count, 0),
    pending,
    processing,
    retry,
    delivered,
    dead,
    ready: ready.total,
    oldest_pending_at: oldest.data[0]?.created_at ?? null,
  };
}

export async function listOutboxEvents(
  organizationId: number,
  actor: ActorContext,
  input: ListOutboxEventsInput = {},
): Promise<OutboxEventPage> {
  assertIntegrationOutboxAccess(actor, "read", { organizationId });
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Math.floor(input.perPage ?? 20)));
  const filters: Record<string, unknown> = { organization_id: organizationId };
  if (input.status) filters.status = input.status;
  if (input.eventType) filters.event_type = input.eventType;

  const result = await getDB().findMany<OutboxOperationsRow>(OUTBOX_TABLE, {
    page,
    limit: perPage,
    sort: { field: "created_at", order: "desc" },
    filters,
  });

  return {
    data: result.data.map(toSafeEvent),
    total: result.total,
    page: result.page,
    perPage: result.limit,
  };
}

export async function getOutboxEvent(
  organizationId: number,
  eventId: string,
  actor: ActorContext,
): Promise<OutboxEventDetail> {
  assertIntegrationOutboxAccess(actor, "read", { organizationId });
  const db = getDB();
  const event = await loadTenantEvent(db, organizationId, eventId);
  return loadSafeDetail(db, event);
}

export async function replayOutboxEvent(
  organizationId: number,
  eventId: string,
  actor: ActorContext,
): Promise<OutboxEventDetail> {
  assertIntegrationOutboxAccess(actor, "replay", { organizationId });
  const db = getDB();

  const replayed = await db.transaction(async (trx) => {
    await trx.raw(
      "SELECT id FROM integration_outbox WHERE id = ? AND organization_id = ? FOR UPDATE",
      [eventId, organizationId],
    );
    const current = await loadTenantEvent(trx, organizationId, eventId);
    if (current.status !== "dead") {
      throw new ConflictError("Only dead integration events can be replayed");
    }

    const replayedAt = new Date();
    const nextReplayCount = Number(current.replay_count ?? 0) + 1;
    const updated = await trx.updateMany(
      OUTBOX_TABLE,
      {
        id: eventId,
        organization_id: organizationId,
        status: "dead",
        replay_count: Number(current.replay_count ?? 0),
      },
      {
        status: "pending",
        attempts: 0,
        next_attempt_at: replayedAt,
        locked_at: null,
        locked_until: null,
        lock_token: null,
        last_error: null,
        delivered_at: null,
        dead_at: null,
        alerted_at: null,
        replay_count: nextReplayCount,
        last_replayed_at: replayedAt,
        last_replayed_by: actor.userId,
      },
    );
    if (updated !== 1) {
      throw new ConflictError("Integration event replay was already requested");
    }

    await trx.create("audit_logs", {
      id: uuidv4(),
      organization_id: organizationId,
      user_id: actor.userId,
      action: "integration_outbox.replayed",
      entity_type: "integration_outbox",
      entity_id: eventId,
      old_values: JSON.stringify({
        status: current.status,
        replay_count: Number(current.replay_count ?? 0),
        dead_at: current.dead_at ?? null,
      }),
      new_values: JSON.stringify({
        status: "pending",
        replay_count: nextReplayCount,
        next_attempt_at: replayedAt,
      }),
      ip_address: null,
      user_agent: null,
    } as any);

    return loadTenantEvent(trx, organizationId, eventId);
  });

  return loadSafeDetail(db, replayed);
}

export { sanitizeOperationalError };
