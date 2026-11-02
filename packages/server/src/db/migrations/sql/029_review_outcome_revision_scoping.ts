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
 * Tighten revision relationships added in 027. Composite foreign keys ensure
 * that the effective pointer and supersession chain cannot cross an outcome
 * or organization, including through future direct database writes.
 */
export async function up(knex: Knex): Promise<void> {
  const invalidRevisionScope = await knex("review_outcome_revisions as revision")
    .innerJoin("review_outcomes as outcome", "outcome.id", "revision.outcome_id")
    .whereRaw("?? <> ??", ["revision.organization_id", "outcome.organization_id"])
    .first("revision.id");
  const invalidCurrentScope = await knex("review_outcomes as outcome")
    .innerJoin(
      "review_outcome_revisions as revision",
      "revision.id",
      "outcome.current_revision_id",
    )
    .where((builder) =>
      builder
        .whereRaw("?? <> ??", ["revision.outcome_id", "outcome.id"])
        .orWhereRaw("?? <> ??", [
          "revision.organization_id",
          "outcome.organization_id",
        ]),
    )
    .first("outcome.id");
  const invalidSupersessionScope = await knex("review_outcome_revisions as revision")
    .innerJoin(
      "review_outcome_revisions as prior",
      "prior.id",
      "revision.supersedes_revision_id",
    )
    .where((builder) =>
      builder
        .whereRaw("?? <> ??", ["prior.outcome_id", "revision.outcome_id"])
        .orWhereRaw("?? <> ??", [
          "prior.organization_id",
          "revision.organization_id",
        ]),
    )
    .first("revision.id");

  if (invalidRevisionScope || invalidCurrentScope || invalidSupersessionScope) {
    throw new Error(
      "Review outcome revision scope validation failed; repair cross-outcome references before migrating",
    );
  }

  if (!(await hasIndex(knex, "review_outcomes", "review_outcomes_id_org_unique"))) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table.unique(["id", "organization_id"], {
        indexName: "review_outcomes_id_org_unique",
      });
    });
  }
  if (
    !(await hasIndex(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_id_scope_unique",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.unique(["id", "outcome_id", "organization_id"], {
        indexName: "review_outcome_revisions_id_scope_unique",
      });
    });
  }

  if (
    await hasForeignKey(
      knex,
      "review_outcomes",
      "review_outcomes_current_revision_fk",
    )
  ) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table.dropForeign("current_revision_id", "review_outcomes_current_revision_fk");
    });
  }
  if (
    await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_outcome_id_foreign",
    )
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.dropForeign("outcome_id", "review_outcome_revisions_outcome_id_foreign");
    });
  }
  if (
    await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_supersedes_fk",
    )
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.dropForeign(
        "supersedes_revision_id",
        "review_outcome_revisions_supersedes_fk",
      );
    });
  }

  if (
    !(await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_outcome_scope_fk",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table
        .foreign(
          ["outcome_id", "organization_id"],
          "review_outcome_revisions_outcome_scope_fk",
        )
        .references(["id", "organization_id"])
        .inTable("review_outcomes")
        .onDelete("RESTRICT");
    });
  }
  if (
    !(await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_supersedes_scope_fk",
    ))
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table
        .foreign(
          ["supersedes_revision_id", "outcome_id", "organization_id"],
          "review_outcome_revisions_supersedes_scope_fk",
        )
        .references(["id", "outcome_id", "organization_id"])
        .inTable("review_outcome_revisions")
        .onDelete("RESTRICT");
    });
  }
  if (
    !(await hasForeignKey(
      knex,
      "review_outcomes",
      "review_outcomes_current_revision_scope_fk",
    ))
  ) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table
        .foreign(
          ["current_revision_id", "id", "organization_id"],
          "review_outcomes_current_revision_scope_fk",
        )
        .references(["id", "outcome_id", "organization_id"])
        .inTable("review_outcome_revisions")
        .onDelete("RESTRICT");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (
    await hasForeignKey(
      knex,
      "review_outcomes",
      "review_outcomes_current_revision_scope_fk",
    )
  ) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table.dropForeign(
        ["current_revision_id", "id", "organization_id"],
        "review_outcomes_current_revision_scope_fk",
      );
    });
  }
  if (
    await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_supersedes_scope_fk",
    )
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.dropForeign(
        ["supersedes_revision_id", "outcome_id", "organization_id"],
        "review_outcome_revisions_supersedes_scope_fk",
      );
    });
  }
  if (
    await hasForeignKey(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_outcome_scope_fk",
    )
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.dropForeign(
        ["outcome_id", "organization_id"],
        "review_outcome_revisions_outcome_scope_fk",
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
        .foreign("supersedes_revision_id", "review_outcome_revisions_supersedes_fk")
        .references("id")
        .inTable("review_outcome_revisions")
        .onDelete("RESTRICT");
    });
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
    await hasIndex(
      knex,
      "review_outcome_revisions",
      "review_outcome_revisions_id_scope_unique",
    )
  ) {
    await knex.schema.alterTable("review_outcome_revisions", (table) => {
      table.dropUnique(
        ["id", "outcome_id", "organization_id"],
        "review_outcome_revisions_id_scope_unique",
      );
    });
  }
  if (await hasIndex(knex, "review_outcomes", "review_outcomes_id_org_unique")) {
    await knex.schema.alterTable("review_outcomes", (table) => {
      table.dropUnique(["id", "organization_id"], "review_outcomes_id_org_unique");
    });
  }
}
