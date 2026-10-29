import { ForbiddenError } from "../utils/errors";
import type { ActorContext } from "./actor-context";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export type PolicyResult = boolean | PolicyDecision;
export type Policy<TContext> = (context: TContext) => PolicyResult;

export interface ResourcePolicyContext<TAction extends string, TResource> {
  actor: ActorContext;
  action: TAction;
  resource: TResource;
}

export function definePolicy<TAction extends string, TResource>(
  resolver: Policy<ResourcePolicyContext<TAction, TResource>>,
): Policy<ResourcePolicyContext<TAction, TResource>> {
  return resolver;
}

export function assertPolicyAllowed<TContext>(
  policy: Policy<TContext>,
  context: TContext,
  fallbackMessage = "You do not have permission to perform this action",
): void {
  const decision = policy(context);
  const allowed = typeof decision === "boolean" ? decision : decision.allowed;
  if (!allowed) {
    const reason = typeof decision === "boolean" ? undefined : decision.reason;
    throw new ForbiddenError(reason ?? fallbackMessage);
  }
}
