import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
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
  /**
   * Resolved from the provider's discovery document, not guessed.
   *
   * The key set used to be assumed at `${issuer}/.well-known/jwks.json`, which
   * is Auth0's shape. Keycloak publishes it under /protocol/openid-connect/certs
   * and Azure AD under /discovery/v2.0/keys, so against either of those every
   * token would have been rejected as unverifiable — an authentication failure
   * that looks like a bad token rather than a wrong URL. The one document the
   * spec guarantees names it, so that is what is read.
   *
   * Built once, lazily, because discovery is a network call and a constructor
   * is the wrong place to make one: the service should start and be ready to
   * report itself unhealthy, not fail to boot because the provider was briefly
   * slow.
   */
  private jwks: Promise<{ client: JwksClient; issuer: string }> | null = null;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
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

  /**
   * The provider's own answer to where its keys are, and to what its issuer
   * claim actually reads.
   *
   * The issuer configured locally is normalised (trailing slash stripped) so
   * it composes cleanly into the discovery URL, but the "iss" a provider
   * stamps into a token is its own literal string — Auth0's carries a
   * trailing slash, for one. Trusting the discovery document's own `issuer`
   * field over the local one is what the spec requires anyway: it MUST match
   * the token's claim exactly.
   */
  private keys(): Promise<{ client: JwksClient; issuer: string }> {
    if (this.jwks) return this.jwks;

    const oidc = this.config.oidc!;
    const pending = (async () => {
      const url = `${oidc.issuer}/.well-known/openid-configuration`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`identity provider did not answer discovery at ${url} (${response.status})`);
      }
      const doc = (await response.json()) as { jwks_uri?: string; issuer?: string };
      if (!doc.jwks_uri) throw new Error(`${url} names no jwks_uri`);

      this.logger.log(`key set: ${doc.jwks_uri}`);
      const client = new JwksClient({
        jwksUri: doc.jwks_uri,
        cache: true,
        cacheMaxAge: 10 * 60 * 1000,
        // A burst of requests after a key rotation must not become a burst of
        // requests at the identity provider.
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      });
      return { client, issuer: typeof doc.issuer === "string" ? doc.issuer : oidc.issuer };
    })();

    // A failed lookup is not cached: a provider that was briefly unreachable
    // must not leave this process unable to verify anything until it restarts.
    pending.catch(() => {
      this.jwks = null;
    });
    this.jwks = pending;
    return pending;
  }

  private async verifyOidc(token: string): Promise<TokenClaims> {
    const oidc = this.config.oidc!;

    // Reaching the provider is a different failure from being handed a bad
    // token, and conflating them would report an outage as everyone's
    // credentials suddenly being wrong. fetch throws a bare TypeError when DNS
    // or the network fails, so it is caught here rather than escaping as a 500.
    let client: JwksClient;
    let issuer: string;
    try {
      ({ client, issuer } = await this.keys());
    } catch (err) {
      this.logger.error(`cannot reach the identity provider: ${String(err)}`);
      throw new ServiceUnavailableException("the identity provider could not be reached");
    }
    const getKey = (header: JwtHeader, callback: SigningKeyCallback): void => {
      client.getSigningKey(header.kid, (err, key) =>
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
          issuer,
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
