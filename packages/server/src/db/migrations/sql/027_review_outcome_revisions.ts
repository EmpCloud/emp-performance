import type { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

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
 * Introduces append-only correction history without changing the immutable
 * rating originally released to the employee. Existing outcomes receive a
 * version-one release revision and point at it as their effective revision.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("review_outcome_revisions"))) {
    await knex.schema.createTable("review_outcome_revisions", (table) => {
      table.uuid("id").primary();
      table.bigInteger("organization_id").unsigned().notNullable();
      table.uuid("outcome_id").notNullable();
      table.integer("version").unsigned().notNullable();
      table.decimal("rating", 3, 2).notNullable();
      table.string("source", 32).notNullable();
      table.string("status", 16).notNullable();
      table.text("reason").nullable();
      table.bigInteger("proposed_by").unsigned().nullable();
      table.timestamp("proposed_at").nullable();
      table.bigInteger("reviewed_by").unsigned().nullable();
      table.timestamp("reviewed_at").nullable();
      table.text("review_note").nullable();
      table.uuid("supersedes_revision_id").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
      table.timestamp("updated_at").defaultTo(knex.fn.now()).notNullable();

    });
  }

  // MySQL auto-commits DDL. Check every named object independently so a
  // migration interrupted after table creation can safely repair itself.
  if (
    !(await hasIndex(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_outcome_version_unique",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.unique(["outcome_id", "version"], {
        indexName: "review_outcome_revisions_outcome_version_unique",
      });
    });
  }
  if (
    !(await hasIndex(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_org_outcome_status_index",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.index(
        ["organization_id", "outcome_id", "status"],
        "review_outcome_revisions_org_outcome_status_index",
      );
    });
  }
  if (
    !(await hasIndex(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_org_status_proposed_index",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.index(
        ["organization_id", "status", "proposed_at"],
        "review_outcome_revisions_org_status_proposed_index",
      );
    });
  }
  if (
    !(await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_outcome_id_foreign",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table
        .foreign("outcome_id", "review_outcome_revisions_outcome_id_foreign")
        .references("id")
        .inTable("review_outcomes")
        .onDelete("RESTRICT");
    });
  }
  if (
    !(await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_supersedes_fk",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table
        .foreign(
          "supersedes_revision_id",
          "review_outcome_revisions_supersedes_fk",
        )
        .references("id")
        .inTable("review_outcome_revisions")
        .onDelete("RESTRICT");
    });
  }

  if (!(await knex.schema.hasColumn("review_outcomes", "current_revision_id"))) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table.uuid("current_revision_id").nullable();
    });
  }

  const outcomes = await knex("review_outcomes")
    .select("id", "organization_id", "released_rating", "released_at", "created_at")
    .whereNull("current_revision_id");

  if (outcomes.length > 0) {
    const existing = await knex("review_outcome_revisions")
      .select("id", "outcome_id", "organization_id")
      .whereIn(
        "outcome_id",
        outcomes.map((outcome) => outcome.id),
      )
      .andWhere({ version: 1, source: "release" });
    const revisionByOutcome = new Map(
      existing.map((revision) => [revision.outcome_id, revision]),
    );
    const missingRows = outcomes
      .filter((outcome) => !revisionByOutcome.has(outcome.id))
      .map((outcome) => ({
        id: uuidv4(),
        organization_id: outcome.organization_id,
        outcome_id: outcome.id,
        version: 1,
        rating: outcome.released_rating,
        source: "release",
        status: "applied",
        reason: null,
        proposed_by: null,
        proposed_at: outcome.released_at,
        reviewed_by: null,
        reviewed_at: outcome.released_at,
        review_note: null,
        supersedes_revision_id: null,
        created_at: outcome.created_at ?? outcome.released_at,
        updated_at: outcome.created_at ?? outcome.released_at,
      }));

    if (missingRows.length > 0) {
      await knex.batchInsert("review_outcome_revisions", missingRows, 500);
      for (const row of missingRows) {
        revisionByOutcome.set(row.outcome_id, row);
      }
    }
    for (const outcome of outcomes) {
      const revision = revisionByOutcome.get(outcome.id);
      if (!revision || Number(revision.organization_id) !== Number(outcome.organization_id)) {
        throw new Error(
          `Release revision scope mismatch for review outcome ${outcome.id}`,
        );
      }
      await knex("review_outcomes")
        .where({ id: outcome.id, organization_id: outcome.organization_id })
        .whereNull("current_revision_id")
        .update({ current_revision_id: revision.id });
    }
  }

  if (
    !(await hasForeignKey(
      knex,
      "review_outcomes",
      "review_outcomes_current_revision_fk",
    ))
  ) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table
        .foreign("current_revision_id", "review_outcomes_current_revision_fk")
        .references("id")
        .inTable("review_outcome_revisions")
        .onDelete("RESTRICT");
    });
  }
  if (
    !(await hasIndex(
      knex,
      "review_outcomes",
      "review_outcomes_org_current_revision_index",
    ))
  ) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table.index(
        ["organization_id", "current_revision_id"],
        "review_outcomes_org_current_revision_index",
      );
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("review_outcomes", "current_revision_id")) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table.dropForeign("current_revision_id", "review_outcomes_current_revision_fk");
      table.dropIndex(
        ["organization_id", "current_revision_id"],
        "review_outcomes_org_current_revision_index",
      );
      table.dropColumn("current_revision_id");
    });
  }
  await knex.schema.dropTableIfExists("review_outcome_revisions");
}
