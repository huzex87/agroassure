import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import { CONFIG, type AppConfig } from "../config/config";
import { PRINCIPAL_KEY, type Principal } from "./principal";
import type { Role } from "@agroassure/domain";

// Validates a bearer token (HS256 for this skeleton; swap for the institution's
// OIDC provider in production) and attaches a verified Principal to the request.
// Field-device tokens additionally carry a device_id claim used to attribute
// field events cryptographically at ingest time.

interface TokenClaims {
  sub: string;
  device_id?: string;
  jurisdiction_id?: string;
  roles?: Role[];
}

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("missing bearer token");
    }

    let claims: TokenClaims;
    try {
      claims = jwt.verify(token, this.config.authJwtSecret) as TokenClaims;
    } catch {
      throw new UnauthorizedException("invalid token");
    }

    const principal: Principal = {
      userId: claims.sub,
      deviceId: claims.device_id ?? null,
      jurisdictionId: claims.jurisdiction_id ?? null,
      roles: claims.roles ?? [],
    };
    (req as Request & Record<string, unknown>)[PRINCIPAL_KEY] = principal;
    return true;
  }
}

export function getPrincipal(req: Request): Principal {
  const p = (req as Request & Record<string, unknown>)[PRINCIPAL_KEY] as
    | Principal
    | undefined;
  if (!p) throw new UnauthorizedException("no principal on request");
  return p;
}
