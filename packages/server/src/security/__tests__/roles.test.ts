import { describe, expect, it } from "vitest";

import { hasAnyRole, isAdministrativeRole, normalizeRole } from "../roles";

describe("canonical roles", () => {
  describe("normalizeRole", () => {
    it.each([
      ["super_admin", "super_admin"],
      ["org_admin", "org_admin"],
      ["hr_admin", "hr_admin"],
      ["hr_manager", "hr_manager"],
      ["manager", "manager"],
      ["employee", "employee"],
    ])("preserves the canonical role %s", (input, expected) => {
      expect(normalizeRole(input)).toBe(expected);
    });

    it("maps the EmpCloud admin alias to HR administrator", () => {
      expect(normalizeRole("admin")).toBe("hr_admin");
    });

    it("normalizes case and surrounding whitespace", () => {
      expect(normalizeRole("  MANAGER  ")).toBe("manager");
      expect(normalizeRole(" Hr_Admin ")).toBe("hr_admin");
    });

    it.each([undefined, null, "", "unknown", "root"])(
      "falls back to least privilege for unsupported input %s",
      (input) => {
        expect(normalizeRole(input)).toBe("employee");
      },
    );
  });

  describe("isAdministrativeRole", () => {
    it.each(["super_admin", "org_admin", "hr_admin", "hr_manager"])(
      "recognizes %s as an administrative role",
      (role) => {
        expect(isAdministrativeRole(role)).toBe(true);
      },
    );

    it.each(["manager", "employee", "unknown"])(
      "does not elevate %s",
      (role) => {
        expect(isAdministrativeRole(role)).toBe(false);
      },
    );
  });

  describe("hasAnyRole", () => {
    it.each(["org_admin", "hr_admin", "hr_manager"] as const)(
      "allows a tenant-scoped super admin to satisfy %s administration",
      (allowedRole) => {
        expect(hasAnyRole("super_admin", [allowedRole])).toBe(true);
      },
    );

    it.each(["manager", "employee", "service"] as const)(
      "does not let a super admin inherit the %s role",
      (allowedRole) => {
        expect(hasAnyRole("super_admin", [allowedRole])).toBe(false);
      },
    );
  });
});
