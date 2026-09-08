import { createHash, randomBytes } from "node:crypto";

// The authorization-code flow with PKCE, against the institution's provider.
//
// The console is not a trust boundary: it obtains a token and forwards it, and
// the gateway verifies issuer, audience and signature on every request
// independently. So a mistake here fails visibly at sign-in rather than opening
// a way past authorization — which is why the code exchange can live in a server
// action without the console becoming something an auditor has to reason about.
//
// PKCE is used even though this is a confidential client with a secret, because
// it costs one hash and removes the authorization code as something worth
// stealing in transit.

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
}

/** Null when no provider is configured, which is what keeps the dev page alive. */
export function oidcSettings(): OidcSettings | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;

  return {
    issuer: issuer.replace(/\/$/, ""),
    clientId,
    clientSecret,
    redirectUri,
    // openid for the subject, and the audience so the provider mints a token
    // this API will accept rather than one only the provider's userinfo wants.
    scope: process.env.OIDC_SCOPE ?? "openid profile email",
  };
}

export function base64url(input: Buffer): string {
  return input.toString("base64url");
}

export function newVerifier(): string {
  return base64url(randomBytes(32));
}

export function challengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function newState(): string {
  return base64url(randomBytes(16));
}

/**
 * Where this provider actually keeps its endpoints.
 *
 * These were built by hand as `${issuer}/authorize` and `${issuer}/oauth/token`,
 * which is Auth0's shape and only Auth0's. Keycloak serves
 * /protocol/openid-connect/auth, Azure AD serves /oauth2/v2.0/authorize, Okta
 * serves /v1/authorize — against any of them, sign-in would have failed with a
 * 404 that reads like a misconfigured issuer rather than a wrong assumption in
 * this file. Discovery is what the spec provides for exactly this, every
 * conformant provider serves it, and it means the issuer is the only thing
 * anyone has to be told.
 */
export interface Discovered {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

// One document per issuer per process. It changes about as often as the
// provider is replaced, and a fetch on every sign-in would be a second thing
// that can fail during one.
const discoveries = new Map<string, Promise<Discovered>>();

export async function discover(issuer: string): Promise<Discovered> {
  const cached = discoveries.get(issuer);
  if (cached) return cached;

  const pending = (async () => {
    const url = `${issuer}/.well-known/openid-configuration`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `The identity provider did not answer discovery at ${url} (${response.status}). Check OIDC_ISSUER.`,
      );
    }
    const doc = (await response.json()) as Partial<Discovered>;
    if (!doc.authorization_endpoint || !doc.token_endpoint) {
      throw new Error(`${url} is missing an authorization or token endpoint.`);
    }
    return doc as Discovered;
  })();

  // A failed lookup must not be cached, or one bad boot poisons the process.
  pending.catch(() => discoveries.delete(issuer));
  discoveries.set(issuer, pending);
  return pending;
}

export async function authorizeUrl(
  settings: OidcSettings,
  state: string,
  challenge: string,
): Promise<string> {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    scope: settings.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  // The audience the gateway checks. Providers differ on how they are told
  // which API a token is for; this is the common spelling and is harmless where
  // it is not read.
  const audience = process.env.OIDC_AUDIENCE;
  if (audience) query.set("audience", audience);

  const { authorization_endpoint } = await discover(settings.issuer);
  const separator = authorization_endpoint.includes("?") ? "&" : "?";
  return `${authorization_endpoint}${separator}${query}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in?: number;
}

/**
 * Exchange the code for a token. Deliberately returns the access token only:
 * the console never inspects it and never stores an id token or a refresh
 * token, so there is nothing here worth stealing beyond a session that expires.
 */
export async function exchangeCode(
  settings: OidcSettings,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const { token_endpoint } = await discover(settings.issuer);
  const response = await fetch(token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: settings.redirectUri,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // The provider's error body can name the client secret in some
    // configurations, so it is logged server-side and not surfaced.
    console.error("OIDC token exchange failed", response.status, await response.text());
    throw new Error("The identity provider refused the sign-in.");
  }

  const body = (await response.json()) as TokenResponse;
  if (!body.access_token) throw new Error("The identity provider returned no access token.");
  return body;
}
