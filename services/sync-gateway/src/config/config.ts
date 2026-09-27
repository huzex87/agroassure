// Environment configuration. Read once at boot; fail fast on missing essentials.

import { isUnverifiedSsl, sslOptionsFor } from "../db/ssl";

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

/** Where invitation emails go out from. "log" writes them to the service log. */
export interface EmailConfig {
  provider: "resend" | "sendgrid" | "log" | "none";
  apiKey: string | null;
  from: string | null;
}

/** Where invitation texts go out from. Termii and Africa's Talking both reach Nigerian networks. */
export interface SmsConfig {
  provider: "termii" | "africastalking" | "twilio" | "log" | "none";
  apiKey: string | null;
  /** The sender name or number the text appears to come from. */
  senderId: string | null;
  /** Africa's Talking username, or the Twilio account SID. */
  account: string | null;
  /** Termii route: "dnd" reaches numbers on the do-not-disturb list, which "generic" does not. */
  channel: string;
  /** Country calling code assumed for a number written locally, e.g. 0803... */
  defaultCountryCode: string;
}

export interface InviteConfig {
  /**
   * Signs the session a phone receives when an invitation is spent. Separate
   * from the identity provider on purpose: a phone is not a person signing in
   * to a website, and its session is only worth anything while the phone it
   * names is active — the guard checks that on every request.
   */
  deviceTokenSecret: string | null;
  /** How long a code stays usable. */
  ttlHours: number;
  /** Where the field app can be downloaded, quoted in every invitation. */
  appDownloadUrl: string | null;
  email: EmailConfig;
  sms: SmsConfig;
}

/** Console sign-in by a one-time link sent to a person's work email. */
export interface EmailSignInConfig {
  /** Signs the console session a spent link is exchanged for. */
  sessionSecret: string;
  /** Where the console is, so the emailed link can point at it. */
  consoleUrl: string;
  /** How long a link works. Short: it is a password sent over email. */
  linkTtlMinutes: number;
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
  /** Invitations, and the phone sessions they create. */
  invites: InviteConfig;
  /** Email sign-in links for the console, when configured. */
  emailSignIn: EmailSignInConfig | null;
  /**
   * Whether people may ask to join on their own. Asking gives nothing: an
   * administrator still approves every request and chooses the role. On unless
   * SELF_REGISTRATION=off, and in practice only open when both an email and an
   * SMS provider are configured, since both contacts must be proven.
   */
  selfRegistration: boolean;
  /** Base URL a certificate QR code points at. */
  publicVerifyBaseUrl: string;
  /** Lookups allowed per source address per minute on the public surface. */
  publicVerifyRatePerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const oidc = loadOidc(env);

  // Something must be able to verify a token: the institution's provider, the
  // console's own email sign-in, or — in development — a shared secret. With a
  // provider configured the shared secret is not needed at all, and requiring
  // it would leave a second way in that nobody was watching.
  const authJwtSecret = env.AUTH_JWT_SECRET;
  const emailSignIn = loadEmailSignIn(
    env,
    !oidc && env.APP_ENV !== "pilot" ? (authJwtSecret ?? null) : null,
  );
  if (!oidc && !authJwtSecret && !emailSignIn) {
    throw new Error(
      "no way to sign in: set OIDC_ISSUER (with OIDC_AUDIENCE), or CONSOLE_URL and CONSOLE_SESSION_SECRET for email sign-in, or AUTH_JWT_SECRET in development",
    );
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
    invites: loadInvites(env, oidc === null ? (authJwtSecret ?? null) : null),
    emailSignIn,
    selfRegistration: env.SELF_REGISTRATION !== "off",
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
  if (!config.oidc && !config.emailSignIn) {
    refusals.push(
      "no way for staff to sign in. Set OIDC_ISSUER for the institution's identity provider, or CONSOLE_URL and CONSOLE_SESSION_SECRET for email sign-in links.",
    );
  }
  if (!config.oidc && config.authJwtSecret) {
    refusals.push(
      "AUTH_JWT_SECRET is set without an identity provider. Anyone holding it can mint a token for any role; it is a development stand-in and must be removed.",
    );
  }
  if (config.emailSignIn && ["none", "log"].includes(config.invites.email.provider)) {
    refusals.push(
      "email sign-in is on but EMAIL_PROVIDER is not a real provider, so nobody would ever receive a sign-in link.",
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

  // Encryption is not authentication. sslmode=no-verify accepts whatever
  // certificate answers, so an active machine-in-the-middle can hold both ends
  // of the encrypted conversation. Configuring the provider's CA settles it.
  const unverified = [
    ["DATABASE_URL", config.databaseUrl],
    ["PUBLIC_VERIFY_DATABASE_URL", config.publicVerifyDatabaseUrl],
  ].filter(([, url]) => isUnverifiedSsl(url as string));

  if (unverified.length > 0 && !sslOptionsFor(env)) {
    refusals.push(
      `${unverified.map(([name]) => name).join(" and ")} disable certificate verification and no ` +
        "CA is configured, so the database connection is encrypted but not authenticated. " +
        "Set PGSSLROOTCERT_PEM to the provider's CA certificate.",
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

/**
 * Invitation delivery and phone sessions.
 *
 * Nothing here is required to boot. A deployment with no provider still
 * issues codes — the console shows each one for the administrator to pass on
 * by hand — so a missing SMS account slows onboarding down rather than
 * stopping the service. What is refused is a provider named without the
 * credentials it needs, because that is a deployment that believes it is
 * sending messages and is not.
 */
export function loadInvites(
  env: NodeJS.ProcessEnv,
  developmentSecret: string | null,
): InviteConfig {
  const explicit = env.DEVICE_TOKEN_SECRET;
  if (explicit !== undefined && explicit.length < 32) {
    throw new Error("DEVICE_TOKEN_SECRET must be at least 32 characters");
  }

  const ttlHours = Number(env.INVITE_TTL_HOURS ?? 72);
  if (!Number.isFinite(ttlHours) || ttlHours < 1 || ttlHours > 24 * 30) {
    throw new Error("INVITE_TTL_HOURS must be between 1 and 720");
  }

  // Printing a live code into a log is handing it to whoever reads the log. A
  // development machine may; a pilot may not, so its default is to send nothing.
  const quiet = env.APP_ENV === "pilot" ? "none" : "log";

  const emailProvider = (env.EMAIL_PROVIDER ?? quiet) as EmailConfig["provider"];
  if (!["resend", "sendgrid", "log", "none"].includes(emailProvider)) {
    throw new Error("EMAIL_PROVIDER must be one of: resend, sendgrid, log, none");
  }
  if ((emailProvider === "resend" || emailProvider === "sendgrid") && (!env.EMAIL_API_KEY || !env.EMAIL_FROM)) {
    throw new Error(`EMAIL_PROVIDER=${emailProvider} needs EMAIL_API_KEY and EMAIL_FROM`);
  }

  const smsProvider = (env.SMS_PROVIDER ?? quiet) as SmsConfig["provider"];
  if (!["termii", "africastalking", "twilio", "log", "none"].includes(smsProvider)) {
    throw new Error("SMS_PROVIDER must be one of: termii, africastalking, twilio, log, none");
  }
  if (["termii", "africastalking", "twilio"].includes(smsProvider)) {
    if (!env.SMS_API_KEY || !env.SMS_SENDER_ID) {
      throw new Error(`SMS_PROVIDER=${smsProvider} needs SMS_API_KEY and SMS_SENDER_ID`);
    }
    if ((smsProvider === "africastalking" || smsProvider === "twilio") && !env.SMS_ACCOUNT) {
      throw new Error(`SMS_PROVIDER=${smsProvider} needs SMS_ACCOUNT (username or account SID)`);
    }
  }

  return {
    deviceTokenSecret: explicit ?? developmentSecret,
    ttlHours,
    appDownloadUrl: env.FIELD_APP_DOWNLOAD_URL ?? null,
    email: {
      provider: emailProvider,
      apiKey: env.EMAIL_API_KEY ?? null,
      from: env.EMAIL_FROM ?? null,
    },
    sms: {
      provider: smsProvider,
      apiKey: env.SMS_API_KEY ?? null,
      senderId: env.SMS_SENDER_ID ?? null,
      account: env.SMS_ACCOUNT ?? null,
      channel: env.SMS_CHANNEL ?? "dnd",
      defaultCountryCode: (env.SMS_DEFAULT_COUNTRY_CODE ?? "234").replace(/^\+/, ""),
    },
  };
}

/**
 * Email sign-in, on when CONSOLE_URL says where the console is. The session
 * secret must be given explicitly outside development: it signs every console
 * session, and a default would be a secret nobody chose.
 */
export function loadEmailSignIn(
  env: NodeJS.ProcessEnv,
  developmentSecret: string | null,
): EmailSignInConfig | null {
  const consoleUrl = env.CONSOLE_URL?.trim();
  if (!consoleUrl) return null;
  if (!/^https?:\/\//.test(consoleUrl)) throw new Error("CONSOLE_URL must start with https://");

  const explicit = env.CONSOLE_SESSION_SECRET;
  if (explicit !== undefined && explicit.length < 32) {
    throw new Error("CONSOLE_SESSION_SECRET must be at least 32 characters");
  }
  const sessionSecret = explicit ?? developmentSecret;
  if (!sessionSecret) throw new Error("CONSOLE_URL is set, so CONSOLE_SESSION_SECRET is required");

  return { sessionSecret, consoleUrl: consoleUrl.replace(/\/$/, ""), linkTtlMinutes: 15 };
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
