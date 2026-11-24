import type { QueryClient } from "@tanstack/react-query";

/** A goal change also affects lists, progress summaries, and recent activity. */
export async function invalidateGoalQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    ["goals"],
    ["my-goals"],
    ["goal-detail"],
    ["goal-checkins"],
    ["analytics", "overview"],
    ["analytics", "my-overview"],
    ["dashboard", "activity", "goals"],
  ].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
