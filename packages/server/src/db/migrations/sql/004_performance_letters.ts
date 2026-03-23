import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Performance Letter Templates
  if (!(await knex.schema.hasTable("performance_letter_templates"))) {
  await knex.schema.createTable("performance_letter_templates", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.enum("type", ["appraisal", "increment", "promotion", "confirmation", "warning"]).notNullable();
    t.string("name", 255).notNullable();
    t.text("content_template").notNullable();
    t.boolean("is_default").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["organization_id", "type"]);
  });
  }

  // 2. Generated Performance Letters
  if (!(await knex.schema.hasTable("generated_performance_letters"))) {
  await knex.schema.createTable("generated_performance_letters", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("employee_id").unsigned().notNullable();
    t.uuid("cycle_id").nullable().references("id").inTable("review_cycles").onDelete("SET NULL");
    t.uuid("template_id").notNullable().references("id").inTable("performance_letter_templates").onDelete("CASCADE");
    t.enum("type", ["appraisal", "increment", "promotion", "confirmation", "warning"]).notNullable();
    t.text("content").notNullable();
    t.string("file_path", 512).nullable();
    t.bigInteger("generated_by").unsigned().notNullable();
    t.timestamp("sent_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["organization_id", "employee_id"]);
    t.index(["template_id"]);
  });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("generated_performance_letters");
  await knex.schema.dropTableIfExists("performance_letter_templates");
}
