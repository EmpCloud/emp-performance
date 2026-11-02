import { describe, expect, it } from "vitest";
import type { ActorContext } from "../actor-context";
import {
  canAccessOutcomeCorrection,
  type OutcomeCorrectionAction,
} from "../policies/outcome-correction.policy";

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

describe("review outcome correction authorization policy", () => {
  it("lets an employee read applied history for their own outcome only", () => {
    expect(canAccessOutcomeCorrection(actor("employee"), "list_revisions", ownOutcome)).toBe(true);
    expect(
      canAccessOutcomeCorrection(
        actor("employee", { userId: 11, employeeId: 11 }),
        "list_revisions",
        ownOutcome,
      ),
    ).toBe(false);
  });

  it.each(["super_admin", "org_admin", "hr_admin"] as const)(
    "lets %s propose and independently decide corrections",
    (role) => {
      const admin = actor(role, { userId: 99, employeeId: 99 });
      for (const action of [
        "list_revisions",
        "propose_correction",
        "approve_correction",
        "reject_correction",
      ] as OutcomeCorrectionAction[]) {
        expect(
          canAccessOutcomeCorrection(admin, action, {
            ...ownOutcome,
            proposedBy: action.includes("correction") ? 88 : null,
          }),
        ).toBe(true);
      }
    },
  );

  it("prevents a proposer from approving or rejecting their own proposal", () => {
    const proposer = actor("hr_admin", { userId: 99, employeeId: 99 });
    for (const action of ["approve_correction", "reject_correction"] as const) {
      expect(
        canAccessOutcomeCorrection(proposer, action, {
          ...ownOutcome,
          proposedBy: 99,
        }),
      ).toBe(false);
    }
  });

  it("denies a decision when the proposer identity is missing", () => {
    const reviewer = actor("org_admin", { userId: 99, employeeId: 99 });
    for (const action of ["approve_correction", "reject_correction"] as const) {
      expect(
        canAccessOutcomeCorrection(reviewer, action, {
          ...ownOutcome,
          proposedBy: null,
        }),
      ).toBe(false);
      expect(
        canAccessOutcomeCorrection(reviewer, action, {
          ...ownOutcome,
          proposedBy: undefined,
        }),
      ).toBe(false);
    }
  });

  it.each(["hr_manager", "manager", "employee", "service"] as const)(
    "does not let %s govern corrections",
    (role) => {
      const denied = actor(role, { userId: 99, employeeId: role === "service" ? null : 99 });
      expect(
        canAccessOutcomeCorrection(denied, "propose_correction", ownOutcome),
      ).toBe(false);
      expect(
        canAccessOutcomeCorrection(denied, "approve_correction", {
          ...ownOutcome,
          proposedBy: 88,
        }),
      ).toBe(false);
    },
  );

  it("denies all correction actions across tenants", () => {
    const otherTenant = actor("super_admin", {
      userId: 99,
      employeeId: 99,
      organizationId: 2,
    });
    for (const action of [
      "list_revisions",
      "propose_correction",
      "approve_correction",
      "reject_correction",
    ] as OutcomeCorrectionAction[]) {
      expect(
        canAccessOutcomeCorrection(otherTenant, action, {
          ...ownOutcome,
          proposedBy: 88,
        }),
      ).toBe(false);
    }
  });
});
