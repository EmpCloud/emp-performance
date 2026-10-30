import type { ActorContext } from "../actor-context";
import { assertPolicyAllowed, definePolicy } from "../policy-engine";
import { hasAnyRole, type CanonicalRole } from "../roles";

export type OutcomeCorrectionAction =
  | "list_revisions"
  | "propose_correction"
  | "approve_correction"
  | "reject_correction";

export interface OutcomeCorrectionPolicyResource {
  organizationId: number;
  employeeId?: number | null;
  proposedBy?: number | null;
}

export const OUTCOME_CORRECTION_GOVERNANCE_ROLES: readonly CanonicalRole[] = [
  "super_admin",
  "org_admin",
  "hr_admin",
];

const outcomeCorrectionPolicy = definePolicy<
  OutcomeCorrectionAction,
  OutcomeCorrectionPolicyResource
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
  const governsCorrections = hasAnyRole(
    actor.role,
    OUTCOME_CORRECTION_GOVERNANCE_ROLES,
  );

  if (action === "list_revisions") return isSubject || governsCorrections;
  if (action === "propose_correction") return governsCorrections;

  // Correction decisions use four-eyes governance: even an otherwise
  // authorized administrator cannot decide their own proposal. A missing or
  // invalid proposer is denied rather than weakening independent review.
  return (
    governsCorrections &&
    Number.isSafeInteger(resource.proposedBy) &&
    Number(resource.proposedBy) > 0 &&
    resource.proposedBy !== actor.userId
  );
});

export function canAccessOutcomeCorrection(
  actor: ActorContext,
  action: OutcomeCorrectionAction,
  resource: OutcomeCorrectionPolicyResource,
): boolean {
  const decision = outcomeCorrectionPolicy({ actor, action, resource });
  return typeof decision === "boolean" ? decision : decision.allowed;
}

export function assertOutcomeCorrectionAccess(
  actor: ActorContext,
  action: OutcomeCorrectionAction,
  resource: OutcomeCorrectionPolicyResource,
): void {
  assertPolicyAllowed(
    outcomeCorrectionPolicy,
    { actor, action, resource },
    "You do not have access to this review outcome correction",
  );
}

export function isOutcomeCorrectionGovernor(actor: ActorContext): boolean {
  return hasAnyRole(actor.role, OUTCOME_CORRECTION_GOVERNANCE_ROLES);
}
