import type { ActorContext } from "../actor-context";
import { assertPolicyAllowed, definePolicy } from "../policy-engine";
import { hasAnyRole, type CanonicalRole } from "../roles";

export type IntegrationOutboxAction = "read" | "replay";

export interface IntegrationOutboxPolicyResource {
  organizationId: number;
}

const OUTBOX_READER_ROLES: readonly CanonicalRole[] = [
  "super_admin",
  "org_admin",
  "hr_admin",
];
const OUTBOX_REPLAY_ROLES: readonly CanonicalRole[] = [
  "super_admin",
  "org_admin",
];

const integrationOutboxPolicy = definePolicy<
  IntegrationOutboxAction,
  IntegrationOutboxPolicyResource
>(({ actor, action, resource }) => {
  if (actor.organizationId !== resource.organizationId) {
    return { allowed: false, reason: "The integration event does not belong to your organization" };
  }

  if (action === "replay") {
    return OUTBOX_REPLAY_ROLES.includes(actor.role);
  }
  return hasAnyRole(actor.role, OUTBOX_READER_ROLES);
});

export function canAccessIntegrationOutbox(
  actor: ActorContext,
  action: IntegrationOutboxAction,
  resource: IntegrationOutboxPolicyResource,
): boolean {
  const decision = integrationOutboxPolicy({ actor, action, resource });
  return typeof decision === "boolean" ? decision : decision.allowed;
}

export function assertIntegrationOutboxAccess(
  actor: ActorContext,
  action: IntegrationOutboxAction,
  resource: IntegrationOutboxPolicyResource,
): void {
  assertPolicyAllowed(
    integrationOutboxPolicy,
    { actor, action, resource },
    "You do not have access to integration operations",
  );
}
