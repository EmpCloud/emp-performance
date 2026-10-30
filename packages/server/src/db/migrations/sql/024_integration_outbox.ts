import type { Knex } from "knex";

/**
 * Durable integration events. Business transactions write here before they
 * commit; the database-backed dispatcher delivers them independently of
 * Redis and keeps enough state for retry, dead-letter, and audit workflows.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("integration_outbox", (table) => {
    table.uuid("id").primary();
    table.bigInteger("organization_id").unsigned().notNullable();
    table.string("event_type", 128).notNullable();
    table.string("aggregate_type", 64).notNullable();
    table.string("aggregate_id", 191).notNullable();
    table.string("idempotency_key", 191).notNullable();
    table.json("payload").notNullable();

    table.string("status", 16).notNullable().defaultTo("pending");
    table.integer("attempts").unsigned().notNullable().defaultTo(0);
    table.integer("max_attempts").unsigned().notNullable().defaultTo(8);
    table.timestamp("next_attempt_at").defaultTo(knex.fn.now()).notNullable();

    table.timestamp("locked_at").nullable();
    table.timestamp("locked_until").nullable();
    table.uuid("lock_token").nullable();
    table.text("last_error").nullable();
    table.timestamp("delivered_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
    table.timestamp("updated_at").defaultTo(knex.fn.now()).notNullable();

    table.unique(["idempotency_key"], {
      indexName: "integration_outbox_idempotency_unique",
    });
    table.index(
      ["status", "next_attempt_at"],
      "integration_outbox_status_next_index",
    );
    table.index(
      ["status", "locked_until"],
      "integration_outbox_status_lease_index",
    );
    table.index(
      ["organization_id", "created_at"],
      "integration_outbox_org_created_index",
    );
    table.index(
      ["aggregate_type", "aggregate_id"],
      "integration_outbox_aggregate_index",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("integration_outbox");
}
