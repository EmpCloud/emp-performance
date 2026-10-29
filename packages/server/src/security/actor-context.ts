import { UnauthorizedError } from "../utils/errors";
import { normalizeRole, type CanonicalRole } from "./roles";

export type AuthenticationMethod =
  | "jwt"
  | "access_token"
  | "password"
  | "sso"
  | "session"
  | "api_key"
  | "service"
  | "internal_service";

export interface ActorContext {
  userId: number;
  employeeId: number | null;
  organizationId: number;
  role: CanonicalRole;
  roles: CanonicalRole[];
  authenticationMethod: AuthenticationMethod;
}

export interface ActorIdentity {
  empcloudUserId: number;
  empcloudOrgId: number;
  role: unknown;
}

/**
 * Derive the stable authorization identity from a verified authentication
 * payload. Request parameters and request bodies are intentionally not inputs.
 */
export function createActorContext(
  identity: ActorIdentity,
  authenticationMethod: AuthenticationMethod = "jwt",
): ActorContext {
  const userId = Number(identity.empcloudUserId);
  const organizationId = Number(identity.empcloudOrgId);
  const serviceIdentity = authenticationMethod === "service" || authenticationMethod === "internal_service";

  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new UnauthorizedError("Authenticated identity is missing a valid organization");
  }
  if (!Number.isSafeInteger(userId) || (!serviceIdentity && userId <= 0) || userId < 0) {
    throw new UnauthorizedError("Authenticated identity is missing a valid user");
  }

  const role = normalizeRole(identity.role);
  return {
    userId,
    employeeId: serviceIdentity ? null : userId,
    organizationId,
    role,
    roles: [role],
    authenticationMethod,
  };
}

export const actorFromAuthPayload = createActorContext;
