import type { Knex } from "knex";

function rowsFromRaw(result: unknown): unknown[] {
  if (!Array.isArray(result)) return [];
  const rows = Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(rows) ? rows : [];
}

async function hasIndex(
  knex: Knex,
  tableName: string,
  indexName: string,
): Promise<boolean> {
  const result = await knex.raw(
    `SELECT 1 AS present
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [tableName, indexName],
  );
  return rowsFromRaw(result).length > 0;
}

async function hasForeignKey(
  knex: Knex,
  tableName: string,
  constraintName: string,
): Promise<boolean> {
  const result = await knex.raw(
    `SELECT 1 AS present
       FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE()
        AND table_name = ?
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'
      LIMIT 1`,
    [tableName, constraintName],
  );
  return rowsFromRaw(result).length > 0;
}

/**
 * Operational controls for the integration outbox. Each delivery attempt is
 * immutable and grouped by replay generation, while the outbox row keeps only
 * the dispatcher state needed for the current generation.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("integration_outbox", "replay_count"))) {
    await knex.schema.alterTable("integration_outbox", (table) => {
      table.integer("replay_count").unsigned().notNullable().defaultTo(0);
    });
  }
  if (!(await knex.schema.hasColumn("integration_outbox", "last_replayed_at"))) {
    await knex.schema.alterTable("integration_outbox", (table) => {
      table.timestamp("last_replayed_at").nullable();
    });
  }
  if (!(await knex.schema.hasColumn("integration_outbox", "last_replayed_by"))) {
    await knex.schema.alterTable("integration_outbox", (table) => {
      table.bigInteger("last_replayed_by").unsigned().nullable();
    });
  }
  if (!(await knex.schema.hasColumn("integration_outbox", "dead_at"))) {
    await knex.schema.alterTable("integration_outbox", (table) => {
      table.timestamp("dead_at").nullable();
    });
  }
  if (!(await knex.schema.hasColumn("integration_outbox", "alerted_at"))) {
    await knex.schema.alterTable("integration_outbox", (table) => {
      table.timestamp("alerted_at").nullable();
    });
  }
  if (
    !(await hasIndex(
      knex,
      "integration_outbox",
      "integration_outbox_org_status_created_index",
    ))
  ) {
    await knex.schema.alterTable("integration_outbox", (table) => {
      table.index(
        ["organization_id", "status", "created_at"],
        "integration_outbox_org_status_created_index",
      );
    });
  }

  if (!(await knex.schema.hasTable("integration_outbox_attempts"))) {
    await knex.schema.createTable("integration_outbox_attempts", (table) => {
      table.uuid("id").primary();
      table.uuid("outbox_event_id").notNullable();
      table.integer("replay_generation").unsigned().notNullable().defaultTo(0);
      table.integer("attempt_number").unsigned().notNullable();
      table.string("result", 16).notNullable();
      table.integer("http_status").unsigned().nullable();
      table.string("error", 500).nullable();
      table.timestamp("started_at").notNullable();
      table.timestamp("completed_at").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();

    });
  }

  if (
    !(await hasForeignKey(
      knex,
      "integration_outbox_attempts",
      "integration_outbox_attempts_outbox_event_id_foreign",
    ))
  ) {
    await knex.schema.alterTable("integration_outbox_attempts", (table) => {
      table
        .foreign(
          "outbox_event_id",
          "integration_outbox_attempts_outbox_event_id_foreign",
        )
        .references("id")
        .inTable("integration_outbox")
        .onDelete("CASCADE");
    });
  }
  if (
    !(await hasIndex(
      knex,
      "integration_outbox_attempts",
      "integration_outbox_attempt_generation_unique",
    ))
  ) {
    await knex.schema.alterTable("integration_outbox_attempts", (table) => {
      table.unique(
        ["outbox_event_id", "replay_generation", "attempt_number"],
        { indexName: "integration_outbox_attempt_generation_unique" },
      );
    });
  }
  if (
    !(await hasIndex(
      knex,
      "integration_outbox_attempts",
      "integration_outbox_attempt_event_completed_index",
    ))
  ) {
    await knex.schema.alterTable("integration_outbox_attempts", (table) => {
      table.index(
        ["outbox_event_id", "completed_at"],
        "integration_outbox_attempt_event_completed_index",
      );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("integration_outbox_attempts");

  if (
    await hasIndex(
      knex,
      "integration_outbox",
      "integration_outbox_org_status_created_index",
    )
  ) {
    await knex.schema.alterTable("integration_outbox", (table) => {
      table.dropIndex(
        ["organization_id", "status", "created_at"],
        "integration_outbox_org_status_created_index",
      );
    });
  }
  for (const column of [
    "replay_count",
    "last_replayed_at",
    "last_replayed_by",
    "dead_at",
    "alerted_at",
  ]) {
    if (await knex.schema.hasColumn("integration_outbox", column)) {
      await knex.schema.alterTable("integration_outbox", (table) => {
        table.dropColumn(column);
      });
    }
  }
}
