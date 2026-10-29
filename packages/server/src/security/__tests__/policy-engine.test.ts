import { describe, expect, it } from "vitest";

import type { ActorContext } from "../actor-context";
import { assertPolicyAllowed, definePolicy } from "../policy-engine";

type TestAction = "read" | "update";
type TestResource = { organizationId: number; ownerId: number };

const employee: ActorContext = {
  userId: 10,
  employeeId: 10,
  organizationId: 1,
  role: "employee",
  roles: ["employee"],
  authenticationMethod: "jwt",
};

const tenantOwnerPolicy = definePolicy<TestAction, TestResource>(
  ({ actor, action, resource }) =>
    actor.organizationId === resource.organizationId &&
    (action === "read" || actor.userId === resource.ownerId),
);

describe("policy engine", () => {
  it("returns a deterministic decision from a pure policy", () => {
    expect(
      tenantOwnerPolicy({
        actor: employee,
        action: "update",
        resource: { organizationId: 1, ownerId: 10 },
      }),
    ).toBe(true);

    expect(
      tenantOwnerPolicy({
        actor: employee,
        action: "update",
        resource: { organizationId: 1, ownerId: 99 },
      }),
    ).toBe(false);
  });

  it("denies a cross-tenant resource before considering ownership", () => {
    expect(
      tenantOwnerPolicy({
        actor: employee,
        action: "update",
        resource: { organizationId: 2, ownerId: 10 },
      }),
    ).toBe(false);
  });

  it("does not throw when the policy permits the action", () => {
    expect(() =>
      assertPolicyAllowed(tenantOwnerPolicy, {
        actor: employee,
        action: "read",
        resource: { organizationId: 1, ownerId: 99 },
      }),
    ).not.toThrow();
  });

  it("throws a standardized forbidden error when the policy denies the action", () => {
    try {
      assertPolicyAllowed(tenantOwnerPolicy, {
        actor: employee,
        action: "update",
        resource: { organizationId: 1, ownerId: 99 },
      });
      throw new Error("Expected authorization to fail");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    }
  });
});
