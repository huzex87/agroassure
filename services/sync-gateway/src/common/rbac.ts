import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Role } from "@agroassure/domain";
import { getPrincipal } from "./device-auth.guard";
import type { Principal } from "./principal";

// Authorization is evaluated on the server from the verified principal, never
// from a role asserted in a request body (principle P5). Roles are scoped to a
// jurisdiction; national roles carry a null jurisdiction and are unscoped.

export const ROLES_KEY = "agroassureRoles";

/** Require any one of these roles on the route. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const principal = getPrincipal(context.switchToHttp().getRequest<Request>());
    if (!required.some((r) => principal.roles.includes(r))) {
      throw new ForbiddenException(`requires one of: ${required.join(", ")}`);
    }
    return true;
  }
}

/** Cross-jurisdiction roles see everything; everyone else sees their own only. */
export function isUnscoped(principal: Principal): boolean {
  return principal.roles.includes("national_admin") || principal.roles.includes("auditor");
}

/**
 * The jurisdiction filter to apply to a query, or null for an unscoped role.
 * Passing this as a parameter and testing `($n::uuid IS NULL OR col = $n)` keeps
 * scoping in the SQL, where it cannot be forgotten by a caller.
 */
export function jurisdictionFilter(principal: Principal): string | null {
  return isUnscoped(principal) ? null : principal.jurisdictionId;
}

/** Refuse an action on a record outside the actor's jurisdiction. */
export function assertInJurisdiction(principal: Principal, jurisdictionId: string): void {
  if (isUnscoped(principal)) return;
  if (principal.jurisdictionId !== jurisdictionId) {
    throw new ForbiddenException("record is outside your jurisdiction");
  }
}
