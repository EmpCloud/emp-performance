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
  type: "manager",
  reviewStatus: "draft",
  cycleStatus: "active",
};

const REVIEW_TYPES = ["manager", "peer"] as const;
const REVIEW_STATUSES = ["pending", "draft", "submitted"] as const;
const NON_RELEASED_CYCLE_STATUSES = [
  "draft",
  "active",
  "in_review",
  "calibration",
  "cancelled",
] as const;

const SUBJECT_UNRELEASED_CASES = REVIEW_TYPES.flatMap((type) =>
  REVIEW_STATUSES.flatMap((reviewStatus) =>
    NON_RELEASED_CYCLE_STATUSES.map(
      (cycleStatus) => [type, reviewStatus, cycleStatus] as const,
    ),
  ),
);

describe("review authorization policy", () => {
  describe("read", () => {
    it.each(["super_admin", "org_admin", "hr_admin", "hr_manager"] as const)(
      "allows same-tenant %s to read an unreleased review",
      (role) => {
        expect(canAccessReview(actor(role, { userId: 99, employeeId: 99 }), "read", review)).toBe(true);
      },
    );

    it.each(REVIEW_STATUSES)(
      "allows the assigned reviewer to read a %s review",
      (reviewStatus) => {
        expect(
          canAccessReview(
            actor("employee", { userId: 20, employeeId: 20 }),
            "read",
            { ...review, reviewStatus, cycleStatus: "cancelled" },
          ),
        ).toBe(true);
      },
    );

    it("allows an employee to read their own self-review draft", () => {
      const selfReview: ReviewPolicyResource = {
        ...review,
        employeeId: 10,
        reviewerId: 10,
        type: "self",
        reviewStatus: "draft",
        cycleStatus: "active",
      };

      expect(canAccessReview(actor("employee"), "read", selfReview)).toBe(true);
    });

    it.each(SUBJECT_UNRELEASED_CASES)(
      "denies the subject a %s review with review status %s while cycle is %s",
      (type, reviewStatus, cycleStatus) => {
        expect(
          canAccessReview(actor("employee"), "read", {
            ...review,
            type,
            reviewStatus,
            cycleStatus,
          }),
        ).toBe(false);
      },
    );

    it.each(REVIEW_TYPES)(
      "denies the subject an unsubmitted completed-cycle %s review",
      (type) => {
        for (const reviewStatus of ["pending", "draft"] as const) {
          expect(
            canAccessReview(actor("employee"), "read", {
              ...review,
              type,
              reviewStatus,
              cycleStatus: "completed",
            }),
          ).toBe(false);
        }
      },
    );

    it.each(REVIEW_TYPES)(
      "allows the subject a submitted and completed %s review",
      (type) => {
        expect(
          canAccessReview(actor("employee"), "read", {
            ...review,
            type,
            reviewStatus: "submitted",
            cycleStatus: "completed",
          }),
        ).toBe(true);
      },
    );

    it("denies an unrelated same-tenant employee even after release", () => {
      expect(
        canAccessReview(
          actor("employee", { userId: 99, employeeId: 99 }),
          "read",
          { ...review, reviewStatus: "submitted", cycleStatus: "completed" },
        ),
      ).toBe(false);
    });

    it.each([
      ["administrator", actor("org_admin", { userId: 99, employeeId: 99, organizationId: 2 })],
      ["assigned reviewer", actor("employee", { userId: 20, employeeId: 20, organizationId: 2 })],
      ["review subject", actor("employee", { organizationId: 2 })],
    ] as const)("denies a cross-tenant %s", (_label, crossTenantActor) => {
      expect(
        canAccessReview(crossTenantActor, "read", {
          ...review,
          reviewStatus: "submitted",
          cycleStatus: "completed",
        }),
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
