import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("notification_settings", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable().unique();
    t.boolean("review_reminders_enabled").defaultTo(true);
    t.boolean("pip_reminders_enabled").defaultTo(true);
    t.boolean("meeting_reminders_enabled").defaultTo(true);
    t.boolean("goal_reminders_enabled").defaultTo(true);
    t.integer("reminder_days_before_deadline").defaultTo(3);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notification_settings");
}
