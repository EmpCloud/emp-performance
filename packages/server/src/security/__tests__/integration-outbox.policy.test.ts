import { describe, expect, it } from "vitest";

import type { ActorContext } from "../actor-context";
import { canAccessIntegrationOutbox } from "../policies/integration-outbox.policy";

function actor(
  role: ActorContext["role"],
  organizationId = 7,
): ActorContext {
  return {
    userId: 101,
    employeeId: 101,
    organizationId,
    role,
    roles: [role],
    authenticationMethod: "jwt",
  };
}

const sameTenant = { organizationId: 7 };

describe("integration outbox authorization policy", () => {
  it.each(["super_admin", "org_admin", "hr_admin"] as const)(
    "allows %s to inspect same-tenant integration operations",
    (role) => {
      expect(canAccessIntegrationOutbox(actor(role), "read", sameTenant)).toBe(true);
    },
  );

  it.each(["super_admin", "org_admin"] as const)(
    "allows %s to replay a same-tenant event",
    (role) => {
      expect(canAccessIntegrationOutbox(actor(role), "replay", sameTenant)).toBe(true);
    },
  );

  it.each(["hr_admin", "hr_manager", "manager", "employee", "service"] as const)(
    "does not allow %s to replay events",
    (role) => {
      expect(canAccessIntegrationOutbox(actor(role), "replay", sameTenant)).toBe(false);
    },
  );

  it.each(["hr_manager", "manager", "employee", "service"] as const)(
    "does not allow %s to inspect integration operations",
    (role) => {
      expect(canAccessIntegrationOutbox(actor(role), "read", sameTenant)).toBe(false);
    },
  );

  it("denies every action across tenant boundaries", () => {
    expect(canAccessIntegrationOutbox(actor("super_admin", 8), "read", sameTenant)).toBe(false);
    expect(canAccessIntegrationOutbox(actor("super_admin", 8), "replay", sameTenant)).toBe(false);
  });
});
