import { describe, expect, it } from "vitest";

import type { ActorContext } from "../actor-context";
import {
  canAccessReviewOutcome,
  type ReviewOutcomeAction,
} from "../policies/review-outcome.policy";

function actor(
  role: ActorContext["role"],
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    userId: 10,
    employeeId: 10,
    organizationId: 1,
    role,
    roles: [role],
    authenticationMethod: "jwt",
    ...overrides,
  };
}

const ownOutcome = { organizationId: 1, employeeId: 10 };

describe("review outcome authorization policy", () => {
  it.each(["read", "acknowledge", "submit_appeal", "withdraw_appeal"] as const)(
    "allows the subject to %s their own outcome",
    (action) => {
      expect(canAccessReviewOutcome(actor("employee"), action, ownOutcome)).toBe(true);
    },
  );

  it.each(["acknowledge", "submit_appeal", "withdraw_appeal"] as const)(
    "does not let an administrator %s on an employee's behalf",
    (action) => {
      expect(
        canAccessReviewOutcome(
          actor("hr_admin", { userId: 99, employeeId: 99 }),
          action,
          ownOutcome,
        ),
      ).toBe(false);
    },
  );

  it.each(["super_admin", "org_admin", "hr_admin"] as const)(
    "allows %s to read and govern same-tenant appeals",
    (role) => {
      const admin = actor(role, { userId: 99, employeeId: 99 });
      for (const action of [
        "read",
        "list_appeals",
        "start_appeal_review",
        "resolve_appeal",
      ] as ReviewOutcomeAction[]) {
        expect(canAccessReviewOutcome(admin, action, ownOutcome)).toBe(true);
      }
    },
  );

  it.each(["hr_manager", "manager", "employee", "service"] as const)(
    "denies %s access to the confidential appeal queue",
    (role) => {
      const unrelated = actor(role, { userId: 99, employeeId: 99 });
      expect(canAccessReviewOutcome(unrelated, "read", ownOutcome)).toBe(false);
      expect(canAccessReviewOutcome(unrelated, "list_appeals", ownOutcome)).toBe(false);
      expect(canAccessReviewOutcome(unrelated, "resolve_appeal", ownOutcome)).toBe(false);
    },
  );

  it("denies every action across tenants", () => {
    const otherTenant = actor("super_admin", {
      userId: 99,
      employeeId: 99,
      organizationId: 2,
    });
    for (const action of [
      "read",
      "acknowledge",
      "submit_appeal",
      "withdraw_appeal",
      "list_appeals",
      "start_appeal_review",
      "resolve_appeal",
    ] as ReviewOutcomeAction[]) {
      expect(canAccessReviewOutcome(otherTenant, action, ownOutcome)).toBe(false);
    }
  });
});
