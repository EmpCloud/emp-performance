import { describe, expect, it } from "vitest";

import type { ActorContext } from "../actor-context";
import {
  assertReviewAccess,
  canAccessReview,
  type ReviewAction,
  type ReviewPolicyResource,
} from "../policies/review.policy";

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

const review: ReviewPolicyResource = {
  organizationId: 1,
  employeeId: 10,
  reviewerId: 20,
};

describe("review authorization policy", () => {
  describe("read", () => {
    it("allows the review subject", () => {
      expect(canAccessReview(actor("employee"), "read", review)).toBe(true);
    });

    it("allows the assigned reviewer", () => {
      expect(
        canAccessReview(actor("employee", { userId: 20, employeeId: 20 }), "read", review),
      ).toBe(true);
    });

    it.each(["super_admin", "org_admin", "hr_admin", "hr_manager"] as const)(
      "allows same-tenant %s",
      (role) => {
        expect(canAccessReview(actor(role, { userId: 99, employeeId: 99 }), "read", review)).toBe(true);
      },
    );

    it("denies an unrelated same-tenant employee", () => {
      expect(
        canAccessReview(actor("employee", { userId: 99, employeeId: 99 }), "read", review),
      ).toBe(false);
    });

    it("denies a cross-tenant administrator", () => {
      expect(
        canAccessReview(actor("org_admin", { organizationId: 2 }), "read", review),
      ).toBe(false);
    });
  });

  describe.each(["save_draft", "submit", "rate_competency"] as ReviewAction[])(
    "%s",
    (action) => {
      it("allows only the assigned reviewer", () => {
        expect(
          canAccessReview(actor("employee", { userId: 20, employeeId: 20 }), action, review),
        ).toBe(true);
      });

      it("denies the subject when they are not the reviewer", () => {
        expect(canAccessReview(actor("employee"), action, review)).toBe(false);
      });

      it("denies an administrator who is not the assigned reviewer", () => {
        expect(
          canAccessReview(actor("hr_admin", { userId: 99, employeeId: 99 }), action, review),
        ).toBe(false);
      });

      it("allows an employee to complete their self review", () => {
        const selfReview = { ...review, reviewerId: 10 };
        expect(canAccessReview(actor("employee"), action, selfReview)).toBe(true);
      });
    },
  );

  describe("administrative actions", () => {
    it.each(["super_admin", "org_admin", "hr_admin", "hr_manager"] as const)(
      "allows %s to create and reassign",
      (role) => {
        expect(canAccessReview(actor(role), "create", review)).toBe(true);
        expect(canAccessReview(actor(role), "reassign", review)).toBe(true);
      },
    );

    it.each(["super_admin", "org_admin", "hr_admin"] as const)(
      "allows %s to delete an unsubmitted review",
      (role) => {
        expect(canAccessReview(actor(role), "delete", review)).toBe(true);
      },
    );

    it("does not allow an HR manager to delete", () => {
      expect(canAccessReview(actor("hr_manager"), "delete", review)).toBe(false);
    });

    it.each(["manager", "employee"] as const)(
      "denies administrative actions to %s",
      (role) => {
        expect(canAccessReview(actor(role), "create", review)).toBe(false);
        expect(canAccessReview(actor(role), "reassign", review)).toBe(false);
        expect(canAccessReview(actor(role), "delete", review)).toBe(false);
      },
    );

    it("denies all administrative actions across tenants", () => {
      const otherTenantAdmin = actor("super_admin", { organizationId: 2 });
      expect(canAccessReview(otherTenantAdmin, "create", review)).toBe(false);
      expect(canAccessReview(otherTenantAdmin, "reassign", review)).toBe(false);
      expect(canAccessReview(otherTenantAdmin, "delete", review)).toBe(false);
    });
  });

  it("throws a standardized forbidden error when access is denied", () => {
    expect(() =>
      assertReviewAccess(
        actor("employee", { userId: 99, employeeId: 99 }),
        "read",
        review,
      ),
    ).toThrow();

    try {
      assertReviewAccess(
        actor("employee", { userId: 99, employeeId: 99 }),
        "read",
        review,
      );
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    }
  });
});
