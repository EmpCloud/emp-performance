import type { Knex } from "knex";

/**
 * Adds an append-only record of every calibration decision and the metadata
 * required to prove that a cycle's calibration roster was finalized before
 * ratings were released.
 */
export async function up(knex: Knex): Promise<void> {
  const duplicateDistribution = await knex("rating_distributions")
    .select("organization_id", "cycle_id", "rating")
    .count<{ count: string | number }[]>({ count: "*" })
    .groupBy("organization_id", "cycle_id", "rating")
    .havingRaw("COUNT(*) > 1")
    .first();

  if (duplicateDistribution) {
    throw new Error(
      "Cannot add rating distribution uniqueness: duplicate cycle rating rows exist",
    );
  }

  await knex.schema.alterTable("review_cycles", (table) => {
    table.timestamp("calibration_finalized_at").nullable();
    table.bigInteger("calibration_finalized_by").unsigned().nullable();
  });

  await knex.schema.createTable("review_calibration_decisions", (table) => {
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
    table.decimal("calibrated_rating", 3, 2).notNullable();
    table.text("reason").notNullable();
    table.integer("version").unsigned().notNullable();
    table.bigInteger("decided_by").unsigned().notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();

    table.unique(["participant_id", "version"], {
      indexName: "review_calibration_participant_version_unique",
    });
    table.index(
      ["organization_id", "cycle_id"],
      "review_calibration_org_cycle_index",
    );
    table.index(
      ["participant_id", "created_at"],
      "review_calibration_participant_created_index",
    );
  });

  await knex.schema.alterTable("rating_distributions", (table) => {
    table.unique(["organization_id", "cycle_id", "rating"], {
      indexName: "rating_distribution_cycle_rating_unique",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("rating_distributions", (table) => {
    table.dropUnique(
      ["organization_id", "cycle_id", "rating"],
      "rating_distribution_cycle_rating_unique",
    );
  });

  await knex.schema.dropTableIfExists("review_calibration_decisions");

  await knex.schema.alterTable("review_cycles", (table) => {
    table.dropColumn("calibration_finalized_by");
    table.dropColumn("calibration_finalized_at");
  });
}
