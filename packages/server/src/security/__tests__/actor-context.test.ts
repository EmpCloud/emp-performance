import { describe, expect, it } from "vitest";

import { actorFromAuthPayload, createActorContext } from "../actor-context";

const basePayload = {
  empcloudUserId: 42,
  empcloudOrgId: 7,
  performanceProfileId: "profile-42",
  role: "employee",
  email: "employee@example.com",
  firstName: "Test",
  lastName: "Employee",
  orgName: "Example Org",
};

describe("actor context", () => {
  it("builds a tenant-scoped actor from verified authentication claims", () => {
    expect(createActorContext(basePayload, "sso")).toEqual({
      userId: 42,
      employeeId: 42,
      organizationId: 7,
      role: "employee",
      roles: ["employee"],
      authenticationMethod: "sso",
    });
  });

  it("preserves the manager persona instead of demoting it to employee", () => {
    const actor = createActorContext({ ...basePayload, role: "manager" }, "api_key");

    expect(actor.role).toBe("manager");
    expect(actor.roles).toEqual(["manager"]);
    expect(actor.authenticationMethod).toBe("api_key");
  });

  it("normalizes aliases and unsupported roles consistently", () => {
    expect(createActorContext({ ...basePayload, role: "ADMIN" }, "jwt").role).toBe("hr_admin");
    expect(createActorContext({ ...basePayload, role: "unknown" }, "jwt").role).toBe("employee");
  });

  it("exposes actorFromAuthPayload as the authentication-boundary alias", () => {
    expect(actorFromAuthPayload(basePayload, "jwt")).toEqual(
      createActorContext(basePayload, "jwt"),
    );
  });

  it.each([
    [{ ...basePayload, empcloudUserId: 0 }, "user"],
    [{ ...basePayload, empcloudOrgId: 0 }, "organization"],
    [{ ...basePayload, empcloudOrgId: Number.NaN }, "organization"],
  ])("rejects invalid identity claims", (payload, expectedMessage) => {
    expect(() => createActorContext(payload, "jwt")).toThrow(expectedMessage);
  });
});
