import type { ActorContext } from "../actor-context";
import { assertPolicyAllowed, definePolicy } from "../policy-engine";
import { hasAnyRole, type CanonicalRole } from "../roles";

export type ReviewOutcomeAction =
  | "read"
  | "acknowledge"
  | "submit_appeal"
  | "withdraw_appeal"
  | "list_appeals"
  | "start_appeal_review"
  | "resolve_appeal";

export interface ReviewOutcomePolicyResource {
  organizationId: number;
  employeeId?: number | null;
}

const APPEAL_GOVERNANCE_ROLES: readonly CanonicalRole[] = [
  "super_admin",
  "org_admin",
  "hr_admin",
];

const reviewOutcomePolicy = definePolicy<
  ReviewOutcomeAction,
  ReviewOutcomePolicyResource
>(({ actor, action, resource }) => {
  if (actor.organizationId !== resource.organizationId) {
    return { allowed: false, reason: "The review outcome does not belong to your organization" };
  }

  const isSubject =
    actor.employeeId !== null &&
    resource.employeeId !== null &&
    resource.employeeId !== undefined &&
    actor.userId === resource.employeeId &&
    actor.employeeId === resource.employeeId;
  const governsAppeals = hasAnyRole(actor.role, APPEAL_GOVERNANCE_ROLES);

  switch (action) {
    case "read":
      return isSubject || governsAppeals;
    case "acknowledge":
    case "submit_appeal":
    case "withdraw_appeal":
      // Administrative privilege never permits signing or appealing on an
      // employee's behalf. An HR administrator who is also the subject may use
      // these actions because the identity check still matches.
      return isSubject;
    case "list_appeals":
    case "start_appeal_review":
    case "resolve_appeal":
      return governsAppeals;
  }
});

export function canAccessReviewOutcome(
  actor: ActorContext,
  action: ReviewOutcomeAction,
  resource: ReviewOutcomePolicyResource,
): boolean {
  const decision = reviewOutcomePolicy({ actor, action, resource });
  return typeof decision === "boolean" ? decision : decision.allowed;
}

export function assertReviewOutcomeAccess(
  actor: ActorContext,
  action: ReviewOutcomeAction,
  resource: ReviewOutcomePolicyResource,
): void {
  assertPolicyAllowed(
    reviewOutcomePolicy,
    { actor, action, resource },
    "You do not have access to this review outcome",
  );
}
