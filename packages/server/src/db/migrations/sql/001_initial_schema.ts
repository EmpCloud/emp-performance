import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Competency Frameworks
  await knex.schema.createTable("competency_frameworks", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.text("description").nullable();
    t.boolean("is_active").defaultTo(true);
    t.bigInteger("created_by").unsigned().notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
  });

  // 2. Competencies
  await knex.schema.createTable("competencies", (t) => {
    t.uuid("id").primary();
    t.uuid("framework_id").notNullable().references("id").inTable("competency_frameworks").onDelete("CASCADE");
    t.string("name", 200).notNullable();
    t.text("description").nullable();
    t.string("category", 100).nullable();
    t.decimal("weight", 5, 2).defaultTo(1);
    t.integer("order").defaultTo(0);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["framework_id"]);
  });

  // 3. Review Cycles
  await knex.schema.createTable("review_cycles", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.string("type", 30).notNullable();
    t.string("status", 30).defaultTo("draft");
    t.date("start_date").notNullable();
    t.date("end_date").notNullable();
    t.date("review_deadline").nullable();
    t.uuid("framework_id").nullable().references("id").inTable("competency_frameworks").onDelete("SET NULL");
    t.text("description").nullable();
    t.bigInteger("created_by").unsigned().notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "status"]);
  });

  // 4. Review Cycle Participants
  await knex.schema.createTable("review_cycle_participants", (t) => {
    t.uuid("id").primary();
    t.uuid("cycle_id").notNullable().references("id").inTable("review_cycles").onDelete("CASCADE");
    t.bigInteger("employee_id").unsigned().notNullable();
    t.bigInteger("manager_id").unsigned().nullable();
    t.string("status", 30).defaultTo("pending");
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["cycle_id"]);
    t.index(["employee_id"]);
  });

  // 5. Reviews
  await knex.schema.createTable("reviews", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("cycle_id").notNullable().references("id").inTable("review_cycles").onDelete("CASCADE");
    t.bigInteger("employee_id").unsigned().notNullable();
    t.bigInteger("reviewer_id").unsigned().notNullable();
    t.string("type", 20).notNullable();
    t.string("status", 20).defaultTo("pending");
    t.decimal("overall_rating", 3, 1).nullable();
    t.text("summary").nullable();
    t.text("strengths").nullable();
    t.text("improvements").nullable();
    t.timestamp("submitted_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["cycle_id"]);
    t.index(["employee_id"]);
    t.index(["reviewer_id"]);
  });

  // 6. Review Competency Ratings
  await knex.schema.createTable("review_competency_ratings", (t) => {
    t.uuid("id").primary();
    t.uuid("review_id").notNullable().references("id").inTable("reviews").onDelete("CASCADE");
    t.uuid("competency_id").notNullable().references("id").inTable("competencies").onDelete("CASCADE");
    t.integer("rating").notNullable();
    t.text("comments").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["review_id"]);
  });

  // 7. Goals
  await knex.schema.createTable("goals", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("employee_id").unsigned().notNullable();
    t.string("title", 300).notNullable();
    t.text("description").nullable();
    t.string("category", 30).defaultTo("individual");
    t.string("priority", 20).defaultTo("medium");
    t.string("status", 30).defaultTo("not_started");
    t.integer("progress").defaultTo(0);
    t.date("start_date").nullable();
    t.date("due_date").nullable();
    t.timestamp("completed_at").nullable();
    t.uuid("cycle_id").nullable().references("id").inTable("review_cycles").onDelete("SET NULL");
    t.uuid("parent_goal_id").nullable().references("id").inTable("goals").onDelete("SET NULL");
    t.bigInteger("created_by").unsigned().notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "employee_id"]);
    t.index(["organization_id", "status"]);
    t.index(["cycle_id"]);
  });

  // 8. Key Results
  await knex.schema.createTable("key_results", (t) => {
    t.uuid("id").primary();
    t.uuid("goal_id").notNullable().references("id").inTable("goals").onDelete("CASCADE");
    t.string("title", 300).notNullable();
    t.string("metric_type", 20).defaultTo("number");
    t.decimal("target_value", 14, 2).notNullable();
    t.decimal("current_value", 14, 2).defaultTo(0);
    t.string("unit", 50).nullable();
    t.decimal("weight", 5, 2).defaultTo(1);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["goal_id"]);
  });

  // 9. Goal Check-Ins
  await knex.schema.createTable("goal_check_ins", (t) => {
    t.uuid("id").primary();
    t.uuid("goal_id").notNullable().references("id").inTable("goals").onDelete("CASCADE");
    t.bigInteger("author_id").unsigned().notNullable();
    t.integer("progress").notNullable();
    t.text("notes").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["goal_id"]);
  });

  // 10. Performance Improvement Plans
  await knex.schema.createTable("performance_improvement_plans", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("employee_id").unsigned().notNullable();
    t.bigInteger("manager_id").unsigned().notNullable();
    t.string("status", 30).defaultTo("draft");
    t.text("reason").notNullable();
    t.date("start_date").notNullable();
    t.date("end_date").notNullable();
    t.date("extended_end_date").nullable();
    t.text("outcome_notes").nullable();
    t.bigInteger("created_by").unsigned().notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["employee_id"]);
    t.index(["organization_id", "status"]);
  });

  // 11. PIP Objectives
  await knex.schema.createTable("pip_objectives", (t) => {
    t.uuid("id").primary();
    t.uuid("pip_id").notNullable().references("id").inTable("performance_improvement_plans").onDelete("CASCADE");
    t.string("title", 300).notNullable();
    t.text("description").nullable();
    t.text("success_criteria").nullable();
    t.date("due_date").nullable();
    t.string("status", 30).defaultTo("not_started");
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["pip_id"]);
  });

  // 12. PIP Updates
  await knex.schema.createTable("pip_updates", (t) => {
    t.uuid("id").primary();
    t.uuid("pip_id").notNullable().references("id").inTable("performance_improvement_plans").onDelete("CASCADE");
    t.bigInteger("author_id").unsigned().notNullable();
    t.text("notes").notNullable();
    t.integer("progress_rating").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["pip_id"]);
  });

  // 13. Continuous Feedback
  await knex.schema.createTable("continuous_feedback", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("from_user_id").unsigned().notNullable();
    t.bigInteger("to_user_id").unsigned().notNullable();
    t.string("type", 20).notNullable();
    t.string("visibility", 20).defaultTo("manager_visible");
    t.text("message").notNullable();
    t.json("tags").nullable();
    t.boolean("is_anonymous").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["to_user_id"]);
    t.index(["from_user_id"]);
  });

  // 14. Career Paths
  await knex.schema.createTable("career_paths", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.text("description").nullable();
    t.string("department", 100).nullable();
    t.boolean("is_active").defaultTo(true);
    t.bigInteger("created_by").unsigned().notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
  });

  // 15. Career Path Levels
  await knex.schema.createTable("career_path_levels", (t) => {
    t.uuid("id").primary();
    t.uuid("career_path_id").notNullable().references("id").inTable("career_paths").onDelete("CASCADE");
    t.string("title", 200).notNullable();
    t.integer("level").notNullable();
    t.text("description").nullable();
    t.text("requirements").nullable();
    t.decimal("min_years_experience", 4, 1).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["career_path_id"]);
  });

  // 16. Employee Career Tracks
  await knex.schema.createTable("employee_career_tracks", (t) => {
    t.uuid("id").primary();
    t.bigInteger("employee_id").unsigned().notNullable();
    t.uuid("career_path_id").notNullable().references("id").inTable("career_paths").onDelete("CASCADE");
    t.uuid("current_level_id").notNullable().references("id").inTable("career_path_levels").onDelete("CASCADE");
    t.uuid("target_level_id").nullable().references("id").inTable("career_path_levels").onDelete("SET NULL");
    t.timestamp("assigned_at").defaultTo(knex.fn.now());
    t.text("notes").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["employee_id"]);
    t.index(["career_path_id"]);
  });

  // 17. One-on-One Meetings
  await knex.schema.createTable("one_on_one_meetings", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("employee_id").unsigned().notNullable();
    t.bigInteger("manager_id").unsigned().notNullable();
    t.string("title", 200).notNullable();
    t.timestamp("scheduled_at").notNullable();
    t.integer("duration_minutes").defaultTo(30);
    t.string("status", 20).defaultTo("scheduled");
    t.text("meeting_notes").nullable();
    t.text("action_items").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["employee_id"]);
    t.index(["manager_id"]);
  });

  // 18. Meeting Agenda Items
  await knex.schema.createTable("meeting_agenda_items", (t) => {
    t.uuid("id").primary();
    t.uuid("meeting_id").notNullable().references("id").inTable("one_on_one_meetings").onDelete("CASCADE");
    t.string("title", 300).notNullable();
    t.text("description").nullable();
    t.bigInteger("added_by").unsigned().notNullable();
    t.integer("order").defaultTo(0);
    t.boolean("is_discussed").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["meeting_id"]);
  });

  // 19. Peer Review Nominations
  await knex.schema.createTable("peer_review_nominations", (t) => {
    t.uuid("id").primary();
    t.uuid("cycle_id").notNullable().references("id").inTable("review_cycles").onDelete("CASCADE");
    t.bigInteger("employee_id").unsigned().notNullable();
    t.bigInteger("nominee_id").unsigned().notNullable();
    t.string("status", 20).defaultTo("pending");
    t.bigInteger("nominated_by").unsigned().notNullable();
    t.bigInteger("approved_by").unsigned().nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["cycle_id"]);
    t.index(["employee_id"]);
    t.index(["nominee_id"]);
  });

  // 20. Rating Distribution (materialized / cached)
  await knex.schema.createTable("rating_distributions", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("cycle_id").notNullable().references("id").inTable("review_cycles").onDelete("CASCADE");
    t.integer("rating").notNullable();
    t.integer("count").defaultTo(0);
    t.decimal("percentage", 5, 2).defaultTo(0);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "cycle_id"]);
  });

  // 21. Audit Log
  await knex.schema.createTable("audit_logs", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("user_id").unsigned().notNullable();
    t.string("action", 100).notNullable();
    t.string("entity_type", 50).notNullable();
    t.uuid("entity_id").nullable();
    t.json("old_values").nullable();
    t.json("new_values").nullable();
    t.string("ip_address", 45).nullable();
    t.string("user_agent", 500).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "created_at"]);
    t.index(["entity_type", "entity_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "audit_logs",
    "rating_distributions",
    "peer_review_nominations",
    "meeting_agenda_items",
    "one_on_one_meetings",
    "employee_career_tracks",
    "career_path_levels",
    "career_paths",
    "continuous_feedback",
    "pip_updates",
    "pip_objectives",
    "performance_improvement_plans",
    "goal_check_ins",
    "key_results",
    "goals",
    "review_competency_ratings",
    "reviews",
    "review_cycle_participants",
    "review_cycles",
    "competencies",
    "competency_frameworks",
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
