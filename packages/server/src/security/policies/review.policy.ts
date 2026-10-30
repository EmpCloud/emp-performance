import type { ActorContext } from "../actor-context";
import { definePolicy, assertPolicyAllowed } from "../policy-engine";
import { hasAnyRole, isAdministrativeRole, type CanonicalRole } from "../roles";

export type ReviewAction =
  | "read"
  | "create"
  | "save_draft"
  | "submit"
  | "rate_competency"
  | "delete"
  | "reassign";

export interface ReviewPolicyResource {
  organizationId: number;
  employeeId: number;
  reviewerId: number;
  type?: "self" | "manager" | "peer" | string;
  reviewStatus?: "pending" | "draft" | "submitted" | string;
  cycleStatus?: "draft" | "active" | "in_review" | "calibration" | "completed" | "cancelled" | string;
}

const REVIEW_CREATOR_ROLES: readonly CanonicalRole[] = [
  "super_admin",
  "org_admin",
  "hr_admin",
  "hr_manager",
];
const REVIEW_DELETE_ROLES: readonly CanonicalRole[] = ["super_admin", "org_admin", "hr_admin"];
const REVIEW_REASSIGN_ROLES: readonly CanonicalRole[] = [
  "super_admin",
  "org_admin",
  "hr_admin",
  "hr_manager",
];

const reviewPolicy = definePolicy<ReviewAction, ReviewPolicyResource>(({ actor, action, resource }) => {
  if (actor.organizationId !== resource.organizationId) {
    return { allowed: false, reason: "The review does not belong to your organization" };
  }

  switch (action) {
    case "read":
      if (isAdministrativeRole(actor.role) || actor.userId === resource.reviewerId) {
        return true;
      }

      // Review subjects do not see manager or peer drafts. Feedback is
      // released only after both submission and cycle completion. Self reviews
      // are already covered by the assigned-reviewer branch above.
      return (
        actor.userId === resource.employeeId &&
        resource.reviewStatus === "submitted" &&
        resource.cycleStatus === "completed"
      );
    case "save_draft":
    case "submit":
    case "rate_competency":
      // HR administers assignments; review content belongs to the assigned
      // reviewer. A self-review works because employeeId === reviewerId.
      return actor.userId === resource.reviewerId;
    case "create":
      return hasAnyRole(actor.role, REVIEW_CREATOR_ROLES);
    case "delete":
      return hasAnyRole(actor.role, REVIEW_DELETE_ROLES);
    case "reassign":
      return hasAnyRole(actor.role, REVIEW_REASSIGN_ROLES);
  }
});

export function canAccessReview(
  actor: ActorContext,
  action: ReviewAction,
  resource: ReviewPolicyResource,
): boolean {
  const decision = reviewPolicy({ actor, action, resource });
  return typeof decision === "boolean" ? decision : decision.allowed;
}

export function assertReviewAccess(
  actor: ActorContext,
  action: ReviewAction,
  resource: ReviewPolicyResource,
): void {
  assertPolicyAllowed(reviewPolicy, { actor, action, resource }, "You do not have access to this review");
}

export function canReadAllReviews(actor: ActorContext): boolean {
  return isAdministrativeRole(actor.role);
}
