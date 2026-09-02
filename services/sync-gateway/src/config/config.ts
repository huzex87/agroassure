// Environment configuration. Read once at boot; fail fast on missing essentials.

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
  /** Base URL a certificate QR code points at. */
  publicVerifyBaseUrl: string;
  /** Lookups allowed per source address per minute on the public surface. */
  publicVerifyRatePerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  const authJwtSecret = env.AUTH_JWT_SECRET;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!authJwtSecret) throw new Error("AUTH_JWT_SECRET is required");

  const publicVerifyDatabaseUrl = env.PUBLIC_VERIFY_DATABASE_URL;

  return {
    port: Number(env.PORT ?? 3001),
    databaseUrl,
    publicVerifyDatabaseUrl: publicVerifyDatabaseUrl ?? databaseUrl,
    publicVerifyUsesOwnRole: Boolean(publicVerifyDatabaseUrl),
    authJwtSecret,
    evidenceStoreDir: env.EVIDENCE_STORE_DIR ?? "./evidence-store",
    publicVerifyBaseUrl: env.PUBLIC_VERIFY_BASE_URL ?? "https://verify.agroassure.ng",
    publicVerifyRatePerMinute: Number(env.PUBLIC_VERIFY_RATE_PER_MINUTE ?? 60),
  };
}

export const CONFIG = Symbol("APP_CONFIG");
