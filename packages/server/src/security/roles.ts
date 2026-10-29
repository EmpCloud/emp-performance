import type { CanonicalRole } from "@emp-performance/shared";

export type { CanonicalRole };

const ROLE_ALIASES: Readonly<Record<string, CanonicalRole>> = {
  super_admin: "super_admin",
  org_admin: "org_admin",
  hr_admin: "hr_admin",
  admin: "hr_admin",
  hr_manager: "hr_manager",
  manager: "manager",
  employee: "employee",
  service: "service",
};

const ADMINISTRATIVE_ROLES = new Set<CanonicalRole>([
  "super_admin",
  "org_admin",
  "hr_admin",
  "hr_manager",
]);

const TENANT_ADMINISTRATIVE_ROLES = new Set<CanonicalRole>([
  "org_admin",
  "hr_admin",
  "hr_manager",
]);

/**
 * Convert every EmpCloud role representation to the canonical role vocabulary.
 * Unknown values deliberately receive the least-privileged employee role.
 */
export function normalizeRole(value: unknown): CanonicalRole {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return ROLE_ALIASES[normalized] ?? "employee";
}

export function isAdministrativeRole(role: unknown): boolean {
  return ADMINISTRATIVE_ROLES.has(normalizeRole(role));
}

export function hasAnyRole(
  role: CanonicalRole,
  allowedRoles: readonly CanonicalRole[],
): boolean {
  if (allowedRoles.includes(role)) return true;

  // A platform administrator may use an administrative tenant endpoint only
  // after authentication has produced a tenant-scoped actor. Actor creation
  // rejects organization 0, so this does not create an implicit cross-tenant
  // or tenant-selection path. Non-administrative roles remain exact-match.
  return (
    role === "super_admin" &&
    allowedRoles.some((allowedRole) => TENANT_ADMINISTRATIVE_ROLES.has(allowedRole))
  );
}
