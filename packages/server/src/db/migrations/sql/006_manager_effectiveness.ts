import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("manager_effectiveness_scores");
  if (exists) return;

  await knex.schema.createTable("manager_effectiveness_scores", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("manager_user_id").unsigned().notNullable();
    t.string("period", 20).notNullable(); // e.g. "2026-Q1"
    t.decimal("overall_score", 5, 2).nullable();
    t.decimal("team_performance_score", 5, 2).nullable();
    t.decimal("review_quality_score", 5, 2).nullable();
    t.decimal("engagement_score", 5, 2).nullable();
    t.integer("team_size").defaultTo(0);
    t.decimal("avg_team_rating", 5, 2).nullable();
    t.decimal("reviews_completed_on_time_pct", 5, 2).nullable();
    t.decimal("one_on_one_frequency", 5, 2).nullable();
    t.decimal("goal_completion_rate", 5, 2).nullable();
    t.integer("feedback_given_count").defaultTo(0);
    t.timestamp("calculated_at").defaultTo(knex.fn.now());
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "period"]);
    t.index(["manager_user_id"]);
    t.unique(["organization_id", "manager_user_id", "period"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("manager_effectiveness_scores");
}
