import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add general settings columns to notification_settings table
  const hasRatingScale = await knex.schema.hasColumn("notification_settings", "rating_scale");
  if (!hasRatingScale) {
    await knex.schema.alterTable("notification_settings", (t) => {
      t.integer("rating_scale").defaultTo(5);
      t.string("default_framework", 255).defaultTo("");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasRatingScale = await knex.schema.hasColumn("notification_settings", "rating_scale");
  if (hasRatingScale) {
    await knex.schema.alterTable("notification_settings", (t) => {
      t.dropColumn("rating_scale");
      t.dropColumn("default_framework");
    });
  }
}
