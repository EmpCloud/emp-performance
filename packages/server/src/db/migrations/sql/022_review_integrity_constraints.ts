import type { Knex } from "knex";

/**
 * Review assignment, participant, nomination, and competency upserts depend
 * on these tuples being unique. Refuse to add the constraints when legacy
 * duplicates exist instead of silently discarding production review data.
 */
export async function up(knex: Knex): Promise<void> {
  const duplicateAssignment = await knex("reviews")
    .select("organization_id", "cycle_id", "employee_id", "reviewer_id", "type")
    .count<{ count: string | number }[]>({ count: "*" })
    .groupBy("organization_id", "cycle_id", "employee_id", "reviewer_id", "type")
    .havingRaw("COUNT(*) > 1")
    .first();

  if (duplicateAssignment) {
    throw new Error(
      "Cannot add review assignment uniqueness: duplicate review assignments exist",
    );
  }

  const duplicateRating = await knex("review_competency_ratings")
    .select("review_id", "competency_id")
    .count<{ count: string | number }[]>({ count: "*" })
    .groupBy("review_id", "competency_id")
    .havingRaw("COUNT(*) > 1")
    .first();

  if (duplicateRating) {
    throw new Error(
      "Cannot add review rating uniqueness: duplicate competency ratings exist",
    );
  }

  const duplicateParticipant = await knex("review_cycle_participants")
    .select("cycle_id", "employee_id")
    .count<{ count: string | number }[]>({ count: "*" })
    .groupBy("cycle_id", "employee_id")
    .havingRaw("COUNT(*) > 1")
    .first();

  if (duplicateParticipant) {
    throw new Error(
      "Cannot add review participant uniqueness: duplicate cycle participants exist",
    );
  }

  const duplicateNomination = await knex("peer_review_nominations")
    .select("cycle_id", "employee_id", "nominee_id")
    .count<{ count: string | number }[]>({ count: "*" })
    .groupBy("cycle_id", "employee_id", "nominee_id")
    .havingRaw("COUNT(*) > 1")
    .first();

  if (duplicateNomination) {
    throw new Error(
      "Cannot add peer nomination uniqueness: duplicate peer nominations exist",
    );
  }

  await knex.schema.alterTable("reviews", (table) => {
    table.unique(
      ["organization_id", "cycle_id", "employee_id", "reviewer_id", "type"],
      { indexName: "reviews_assignment_unique" },
    );
  });

  await knex.schema.alterTable("review_competency_ratings", (table) => {
    table.unique(["review_id", "competency_id"], {
      indexName: "review_competency_rating_unique",
    });
  });

  await knex.schema.alterTable("review_cycle_participants", (table) => {
    table.unique(["cycle_id", "employee_id"], {
      indexName: "review_cycle_participant_unique",
    });
  });

  await knex.schema.alterTable("peer_review_nominations", (table) => {
    table.unique(["cycle_id", "employee_id", "nominee_id"], {
      indexName: "peer_review_nomination_unique",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("peer_review_nominations", (table) => {
    table.dropUnique(
      ["cycle_id", "employee_id", "nominee_id"],
      "peer_review_nomination_unique",
    );
  });

  await knex.schema.alterTable("review_cycle_participants", (table) => {
    table.dropUnique(
      ["cycle_id", "employee_id"],
      "review_cycle_participant_unique",
    );
  });

  await knex.schema.alterTable("review_competency_ratings", (table) => {
    table.dropUnique(["review_id", "competency_id"], "review_competency_rating_unique");
  });

  await knex.schema.alterTable("reviews", (table) => {
    table.dropUnique(
      ["organization_id", "cycle_id", "employee_id", "reviewer_id", "type"],
      "reviews_assignment_unique",
    );
  });
}
