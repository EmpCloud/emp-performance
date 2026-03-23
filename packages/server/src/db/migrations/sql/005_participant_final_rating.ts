import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add final_rating column to review_cycle_participants for storing computed ratings on cycle close
  if (await knex.schema.hasTable("review_cycle_participants")) {
    const hasColumn = await knex.schema.hasColumn("review_cycle_participants", "final_rating");
    if (!hasColumn) {
      await knex.schema.alterTable("review_cycle_participants", (t) => {
        t.decimal("final_rating", 3, 1).nullable().after("status");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("review_cycle_participants")) {
    const hasColumn = await knex.schema.hasColumn("review_cycle_participants", "final_rating");
    if (hasColumn) {
      await knex.schema.alterTable("review_cycle_participants", (t) => {
        t.dropColumn("final_rating");
      });
    }
  }
}
