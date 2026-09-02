import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { PRINCIPAL_KEY, type Principal } from "./principal";
import { TokenVerifier } from "./token-verifier";
import { MetricsService } from "../health/metrics.service";
import { attributeContext } from "./request-context";

// Attaches a verified Principal to the request, or refuses it. The verification
// itself — OIDC against the institution's provider, or a shared secret in
// development — lives in TokenVerifier; this is only the plumbing that puts the
// result where handlers can find it.
//
// Field-device tokens additionally carry a device_id claim, used to attribute
// field events. That claim identifies which device is talking; it is not what
// authorises the events, which are signed with the device's enrolled key and
// verified at ingest.

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      this.metrics.increment("auth_failures");
      throw new UnauthorizedException("missing bearer token");
    }

    let principal: Principal;
    try {
      principal = await this.verifier.verify(token);
    } catch (err) {
      this.metrics.increment("auth_failures");
      throw err;
    }

    (req as Request & Record<string, unknown>)[PRINCIPAL_KEY] = principal;
    // Now that the caller is known, the rest of this request's log lines can
    // say who it was without any of them having to be passed the principal.
    attributeContext(principal.userId, principal.deviceId);
    return true;
  }
}

export function getPrincipal(req: Request): Principal {
  const p = (req as Request & Record<string, unknown>)[PRINCIPAL_KEY] as Principal | undefined;
  if (!p) throw new UnauthorizedException("no principal on request");
  return p;
}
