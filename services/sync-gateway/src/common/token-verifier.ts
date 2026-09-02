import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import jwt, { type JwtHeader, type SigningKeyCallback } from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import type { Role } from "@agroassure/domain";
import { CONFIG, type AppConfig, type OidcConfig } from "../config/config";
import type { Principal } from "./principal";

// Turning a bearer token into a verified Principal.
//
// Two modes, and the service says at boot which one it is in. With OIDC_ISSUER
// set, tokens are RS256 and verified against the provider's published keys, with
// the issuer and audience both checked — a token minted for another application
// by the same provider is refused. Without it, tokens are HS256 against a shared
// secret, which is a development stand-in and nothing more.
//
// What this deliberately does not do is trust the token for anything beyond
// identity and the claims the provider asserts. Authorization is still evaluated
// server-side from the Principal (principle P5), and a device's authority to
// author events is still its enrolled signing key, not its token.

export interface TokenClaims {
  sub?: string;
  device_id?: string;
  jurisdiction_id?: string;
  roles?: Role[];
  [claim: string]: unknown;
}

const KNOWN_ROLES: Role[] = [
  "inspector",
  "desk_supervisor",
  "authorising_officer",
  "state_admin",
  "national_admin",
  "auditor",
];

/**
 * Map provider claims onto the platform's own concepts.
 *
 * Roles and jurisdiction are namespaced custom claims, because they are this
 * platform's idea of authority rather than the identity provider's. An
 * unrecognised role is dropped rather than carried through: a role this service
 * does not implement grants nothing, and passing it along would make a token
 * look more powerful in a log than it actually is.
 *
 * Exported as a pure function because this mapping decides what every request is
 * allowed to do, and it should be testable without an identity provider.
 */
export function principalFromClaims(
  claims: TokenClaims,
  oidc: OidcConfig | null,
): { principal: Principal; ignoredRoles: string[] } {
  const rawRoles = oidc ? (claims[oidc.rolesClaim] ?? claims.roles) : claims.roles;
  const rawJurisdiction = oidc
    ? (claims[oidc.jurisdictionClaim] ?? claims.jurisdiction_id)
    : claims.jurisdiction_id;

  const offered = Array.isArray(rawRoles) ? rawRoles : [];
  const roles = offered.filter(
    (r): r is Role => typeof r === "string" && KNOWN_ROLES.includes(r as Role),
  );

  return {
    principal: {
      userId: String(claims.sub),
      deviceId: typeof claims.device_id === "string" ? claims.device_id : null,
      jurisdictionId: typeof rawJurisdiction === "string" ? rawJurisdiction : null,
      roles,
    },
    ignoredRoles: offered.filter((r) => !roles.includes(r as Role)).map(String),
  };
}

@Injectable()
export class TokenVerifier {
  private readonly logger = new Logger("Auth");
  private readonly jwks: JwksClient | null;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    this.jwks = config.oidc
      ? new JwksClient({
          jwksUri: `${config.oidc.issuer}/.well-known/jwks.json`,
          cache: true,
          cacheMaxAge: 10 * 60 * 1000,
          // A burst of requests after a key rotation must not become a burst of
          // requests at the identity provider.
          rateLimit: true,
          jwksRequestsPerMinute: 10,
        })
      : null;

    if (config.oidc) {
      this.logger.log(`verifying tokens against ${config.oidc.issuer} (aud ${config.oidc.audience})`);
    } else {
      this.logger.warn(
        "no OIDC_ISSUER configured: falling back to a shared-secret development token. " +
          "Do not run a pilot this way.",
      );
    }
  }

  async verify(token: string): Promise<Principal> {
    const claims = this.config.oidc ? await this.verifyOidc(token) : this.verifyShared(token);

    if (!claims.sub) throw new UnauthorizedException("token carries no subject");
    return this.toPrincipal(claims);
  }

  private verifyShared(token: string): TokenClaims {
    try {
      return jwt.verify(token, this.config.authJwtSecret, {
        algorithms: ["HS256"],
      }) as TokenClaims;
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }

  private async verifyOidc(token: string): Promise<TokenClaims> {
    const oidc = this.config.oidc!;
    const getKey = (header: JwtHeader, callback: SigningKeyCallback): void => {
      this.jwks!.getSigningKey(header.kid, (err, key) =>
        err ? callback(err) : callback(null, key?.getPublicKey()),
      );
    };

    return new Promise<TokenClaims>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          // Asymmetric only. Accepting HS256 here would let anyone who learned
          // the public key sign their own tokens with it.
          algorithms: ["RS256", "RS384", "RS512", "ES256"],
          issuer: oidc.issuer,
          audience: oidc.audience,
        },
        (err, decoded) =>
          err
            ? reject(new UnauthorizedException("invalid token"))
            : resolve(decoded as TokenClaims),
      );
    });
  }

  private toPrincipal(claims: TokenClaims): Principal {
    const { principal, ignoredRoles } = principalFromClaims(claims, this.config.oidc);
    if (ignoredRoles.length > 0) {
      this.logger.warn(
        `token for ${claims.sub} carried role(s) this service does not implement: ` +
          `${ignoredRoles.join(", ")}; ignored`,
      );
    }
    return principal;
  }
}
