// Environment configuration. Read once at boot; fail fast on missing essentials.

export interface S3Config {
  bucket: string;
  region: string;
  /** Set for a Nigeria-resident S3-compatible provider, or MinIO locally. */
  endpoint: string | null;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  /**
   * Object-lock retention, in years, applied per object in COMPLIANCE mode.
   * This is a records-retention decision belonging to the deploying
   * institution, not a technical default: once written it cannot be shortened.
   */
  retentionYears: number;
}

export interface OidcConfig {
  /** The provider's issuer URL; its JWKS is discovered from here. */
  issuer: string;
  /** The audience this API expects to find in a token meant for it. */
  audience: string;
  /**
   * Claim names, because providers disagree. Roles usually arrive as a custom
   * claim, and the jurisdiction always does — it is this platform's concept,
   * not the identity provider's.
   */
  rolesClaim: string;
  jurisdictionClaim: string;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  /**
   * Connection string for the public verification surface. It must use a role
   * that holds SELECT on public_certificate_view and nothing else, so a logic
   * error in that module still cannot reach findings, decisions, or evidence.
   * Defaults to the main URL only so a development machine starts; production
   * must set it, and the service logs loudly when it falls back.
   */
  publicVerifyDatabaseUrl: string;
  publicVerifyUsesOwnRole: boolean;
  authJwtSecret: string;
  evidenceStoreDir: string;
  /**
   * Where exhibit bytes live. "local" emulates write-once on a filesystem and
   * is for development and the seeded preview; "s3" is object-lock in
   * compliance mode, which is the only one of the two that actually prevents an
   * operator with credentials from replacing an exhibit.
   */
  evidenceStore: "local" | "s3";
  evidenceS3: S3Config | null;
  oidc: OidcConfig | null;
  /**
   * Whether anyone may mint a token for a seeded user by naming them.
   *
   * Off unless asked for, and refused outright when an identity provider is
   * configured. The shared-secret fallback at least requires the secret; this
   * requires nothing, so it must never be something a deployment acquires by
   * forgetting to set a variable.
   */
  devSignIn: boolean;
  /** Base URL a certificate QR code points at. */
  publicVerifyBaseUrl: string;
  /** Lookups allowed per source address per minute on the public surface. */
  publicVerifyRatePerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const oidc = loadOidc(env);

  // One of the two must be able to verify a token. With OIDC configured the
  // shared secret is not needed at all, and requiring it would leave a second
  // way in that nobody was watching.
  const authJwtSecret = env.AUTH_JWT_SECRET;
  if (!oidc && !authJwtSecret) {
    throw new Error("either OIDC_ISSUER (with OIDC_AUDIENCE) or AUTH_JWT_SECRET is required");
  }

  const publicVerifyDatabaseUrl = env.PUBLIC_VERIFY_DATABASE_URL;
  const evidenceStore = env.EVIDENCE_STORE === "s3" ? "s3" : "local";

  const config: AppConfig = {
    port: Number(env.PORT ?? 3001),
    databaseUrl,
    publicVerifyDatabaseUrl: publicVerifyDatabaseUrl ?? databaseUrl,
    publicVerifyUsesOwnRole: Boolean(publicVerifyDatabaseUrl),
    authJwtSecret: authJwtSecret ?? "",
    oidc,
    devSignIn: loadDevSignIn(env, oidc !== null),
    evidenceStore,
    evidenceS3: evidenceStore === "s3" ? loadS3(env) : null,
    evidenceStoreDir: env.EVIDENCE_STORE_DIR ?? "./evidence-store",
    publicVerifyBaseUrl: env.PUBLIC_VERIFY_BASE_URL ?? "https://verify.agroassure.ng",
    publicVerifyRatePerMinute: Number(env.PUBLIC_VERIFY_RATE_PER_MINUTE ?? 60),
  };

  assertFitForPilot(env, config);
  return config;
}

/**
 * Refuse to start a pilot in a shape that cannot hold a compliance record.
 *
 * Every one of these was a warning at boot, and a warning is what a deployment
 * scrolls past. Each describes a promise the platform makes on its own screens:
 * that an exhibit cannot be destroyed, that the public surface can read one view
 * and nothing else, that a person's role came from the institution's provider.
 * A pilot that quietly runs without them is making those promises falsely, and
 * the inspection records it collects are not worth what they claim to be.
 *
 * Off by default, because a laptop, a test and a demo all legitimately run
 * without any of it. APP_ENV=pilot is the deployment saying it is the real
 * thing, and this is what that costs.
 */
function assertFitForPilot(env: NodeJS.ProcessEnv, config: AppConfig): void {
  if (env.APP_ENV !== "pilot") return;

  const refusals: string[] = [];

  if (config.devSignIn) {
    refusals.push(
      "DEV_SIGNIN is on. It verifies no password and asks for no proof, so naming a user is enough to become them.",
    );
  }
  if (!config.oidc) {
    refusals.push(
      "no OIDC_ISSUER. Tokens would be signed and verified with a shared secret, which is a development stand-in for an identity provider.",
    );
  }
  if (config.evidenceStore !== "s3") {
    refusals.push(
      "EVIDENCE_STORE is not s3. The local store emulates write-once and enforces nothing, so the claim that an exhibit cannot be destroyed would not be true.",
    );
  }
  if (!config.publicVerifyUsesOwnRole) {
    refusals.push(
      "no PUBLIC_VERIFY_DATABASE_URL. The public surface would share the application's connection instead of a role granted one view, so a fault there could reach the whole database.",
    );
  }

  if (refusals.length > 0) {
    throw new Error(
      [
        "refusing to start with APP_ENV=pilot:",
        ...refusals.map((r) => `  - ${r}`),
        "Set APP_ENV to something else to run without these; they are what a pilot's records rest on.",
      ].join("\n"),
    );
  }
}

function loadOidc(env: NodeJS.ProcessEnv): OidcConfig | null {
  const issuer = env.OIDC_ISSUER;
  if (!issuer) return null;

  const audience = env.OIDC_AUDIENCE;
  // A token without an audience check is a token minted for some other
  // application that this one will happily accept, so this is required rather
  // than defaulted.
  if (!audience) throw new Error("OIDC_AUDIENCE is required when OIDC_ISSUER is set");

  return {
    issuer: issuer.replace(/\/$/, ""),
    audience,
    rolesClaim: env.OIDC_ROLES_CLAIM ?? "agroassure/roles",
    jurisdictionClaim: env.OIDC_JURISDICTION_CLAIM ?? "agroassure/jurisdiction_id",
  };
}

function loadDevSignIn(env: NodeJS.ProcessEnv, hasProvider: boolean): boolean {
  const asked = env.DEV_SIGNIN === "true";
  if (asked && hasProvider) {
    throw new Error(
      "DEV_SIGNIN cannot be enabled alongside OIDC_ISSUER: it would be a way past the identity provider",
    );
  }
  return asked;
}

function loadS3(env: NodeJS.ProcessEnv): S3Config {
  const bucket = env.EVIDENCE_S3_BUCKET;
  if (!bucket) throw new Error("EVIDENCE_S3_BUCKET is required when EVIDENCE_STORE=s3");

  const retentionYears = Number(env.EVIDENCE_RETENTION_YEARS ?? 7);
  if (!Number.isInteger(retentionYears) || retentionYears < 1) {
    throw new Error("EVIDENCE_RETENTION_YEARS must be a whole number of years, at least 1");
  }

  return {
    bucket,
    region: env.EVIDENCE_S3_REGION ?? "us-east-1",
    endpoint: env.EVIDENCE_S3_ENDPOINT ?? null,
    accessKeyId: env.EVIDENCE_S3_ACCESS_KEY_ID ?? null,
    secretAccessKey: env.EVIDENCE_S3_SECRET_ACCESS_KEY ?? null,
    retentionYears,
  };
}

export const CONFIG = Symbol("APP_CONFIG");
