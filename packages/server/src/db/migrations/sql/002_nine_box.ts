import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Potential Assessments
  if (!(await knex.schema.hasTable("potential_assessments"))) {
  await knex.schema.createTable("potential_assessments", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("cycle_id").notNullable().references("id").inTable("review_cycles").onDelete("CASCADE");
    t.bigInteger("employee_id").unsigned().notNullable();
    t.bigInteger("assessed_by").unsigned().notNullable();
    t.integer("potential_rating").notNullable();
    t.text("notes").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.unique(["cycle_id", "employee_id"]);
    t.index(["organization_id", "cycle_id"]);
  });
  }

  // 2. Succession Plans
  if (!(await knex.schema.hasTable("succession_plans"))) {
  await knex.schema.createTable("succession_plans", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("position_title", 255).notNullable();
    t.bigInteger("current_holder_id").unsigned().nullable();
    t.string("department", 100).nullable();
    t.enum("criticality", ["low", "medium", "high", "critical"]).defaultTo("medium");
    t.enum("status", ["identified", "developing", "ready"]).defaultTo("identified");
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
  });
  }

  // 3. Succession Candidates
  if (!(await knex.schema.hasTable("succession_candidates"))) {
  await knex.schema.createTable("succession_candidates", (t) => {
    t.uuid("id").primary();
    t.uuid("plan_id").notNullable().references("id").inTable("succession_plans").onDelete("CASCADE");
    t.bigInteger("employee_id").unsigned().notNullable();
    t.enum("readiness", ["ready_now", "1_2_years", "3_5_years"]).defaultTo("3_5_years");
    t.text("development_notes").nullable();
    t.string("nine_box_position", 50).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["plan_id"]);
    t.index(["employee_id"]);
  });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("succession_candidates");
  await knex.schema.dropTableIfExists("succession_plans");
  await knex.schema.dropTableIfExists("potential_assessments");
}
