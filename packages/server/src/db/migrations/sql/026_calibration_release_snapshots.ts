import type { Knex } from "knex";

/**
 * Adds immutable calibration release snapshots. This is deliberately separate
 * from migration 023 because 023 may already be recorded as applied in live
 * environments.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("review_cycles", "calibration_snapshot_hash"))) {
    await knex.schema.alterTable("review_cycles", (table) => {
      table.string("calibration_snapshot_hash", 64).nullable();
    });
  }

  // Keep two-decimal precision consistent from calibration through release.
  if (await knex.schema.hasColumn("review_cycle_participants", "final_rating")) {
    await knex.schema.alterTable("review_cycle_participants", (table) => {
      table.decimal("final_rating", 3, 2).nullable().alter();
    });
  }

  if (!(await knex.schema.hasTable("review_calibration_snapshots"))) {
    await knex.schema.createTable("review_calibration_snapshots", (table) => {
      table.uuid("id").primary();
      table.bigInteger("organization_id").unsigned().notNullable();
      table
        .uuid("cycle_id")
        .notNullable()
        .references("id")
        .inTable("review_cycles")
        .onDelete("CASCADE");
      table
        .uuid("participant_id")
        .notNullable()
        .references("id")
        .inTable("review_cycle_participants")
        .onDelete("CASCADE");
      table.bigInteger("employee_id").unsigned().notNullable();
      table.decimal("baseline_rating", 3, 2).notNullable();
      table.decimal("effective_rating", 3, 2).notNullable();
      table.uuid("decision_id").nullable();
      table.integer("decision_version").unsigned().nullable();
      table.timestamp("finalized_at").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();

      table.unique(["participant_id"], {
        indexName: "review_calibration_snapshot_participant_unique",
      });
      table.index(
        ["organization_id", "cycle_id"],
        "review_calibration_snapshot_org_cycle_index",
      );
    });
  }

  // A pre-026 calibration finalization has no immutable roster to verify.
  // Require those still-unreleased cycles to be finalized again. Completed
  // cycles remain untouched because their published outcomes are historical.
  const unreleasedFinalizedCycles = knex("review_cycles")
    .select("id")
    .where({ status: "calibration" })
    .whereNotNull("calibration_finalized_at");
  await knex("review_calibration_snapshots")
    .whereIn("cycle_id", unreleasedFinalizedCycles)
    .delete();
  await knex("review_cycles")
    .where({ status: "calibration" })
    .whereNotNull("calibration_finalized_at")
    .update({
      calibration_finalized_at: null,
      calibration_finalized_by: null,
      calibration_snapshot_hash: null,
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("review_calibration_snapshots");

  if (await knex.schema.hasColumn("review_cycles", "calibration_snapshot_hash")) {
    await knex.schema.alterTable("review_cycles", (table) => {
      table.dropColumn("calibration_snapshot_hash");
    });
  }

  // Do not reduce final_rating back to one decimal on rollback: doing so can
  // silently destroy already published hundredth-precision ratings.
}
