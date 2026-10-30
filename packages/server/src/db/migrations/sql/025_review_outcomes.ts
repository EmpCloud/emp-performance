import type { Knex } from "knex";

/**
 * Stores the immutable rating snapshot released to each review-cycle
 * participant together with that employee's acknowledgement and single formal
 * appeal. State transitions are additionally recorded in audit_logs by the
 * service layer.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("review_outcomes", (table) => {
    table.uuid("id").primary();
    table.bigInteger("organization_id").unsigned().notNullable();
    table
      .uuid("cycle_id")
      .notNullable()
      .references("id")
      .inTable("review_cycles")
      .onDelete("RESTRICT");
    table
      .uuid("participant_id")
      .notNullable()
      .references("id")
      .inTable("review_cycle_participants")
      .onDelete("RESTRICT");
    table.bigInteger("employee_id").unsigned().notNullable();

    table.decimal("released_rating", 3, 2).notNullable();
    table.timestamp("released_at").notNullable();
    table.timestamp("appeal_deadline_at").notNullable();

    table.timestamp("acknowledged_at").nullable();
    table.bigInteger("acknowledged_by").unsigned().nullable();
    table.text("acknowledgement_note").nullable();

    table.string("appeal_status", 30).nullable();
    table.text("appeal_reason").nullable();
    table.timestamp("appeal_submitted_at").nullable();
    table.bigInteger("appeal_submitted_by").unsigned().nullable();
    table.timestamp("appeal_review_started_at").nullable();
    table.bigInteger("appeal_review_started_by").unsigned().nullable();
    table.timestamp("appeal_resolved_at").nullable();
    table.bigInteger("appeal_resolved_by").unsigned().nullable();
    table.text("appeal_resolution_note").nullable();

    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
    table.timestamp("updated_at").defaultTo(knex.fn.now()).notNullable();

    table.unique(["participant_id"], {
      indexName: "review_outcomes_participant_unique",
    });
    table.index(
      ["organization_id", "employee_id", "released_at"],
      "review_outcomes_employee_release_index",
    );
    table.index(
      ["organization_id", "appeal_status", "appeal_submitted_at"],
      "review_outcomes_appeal_queue_index",
    );
    table.index(
      ["organization_id", "cycle_id"],
      "review_outcomes_org_cycle_index",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("review_outcomes");
}
