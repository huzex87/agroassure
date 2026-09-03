import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { UnauthorizedException } from "@nestjs/common";
import { principalFromClaims, TokenVerifier } from "../src/common/token-verifier";
import type { AppConfig, OidcConfig } from "../src/config/config";
import { loadConfig } from "../src/config/config";

// The token decides what every request may do, so the two ways it could lie are
// what this covers: claiming a role the platform never granted, and being signed
// by something other than the identity provider.

const KATSINA = "018f0000-0000-7000-8000-000000000001";
const USER = "018f1000-0000-7000-8000-000000000001";
const SECRET = "development-secret-not-used-anywhere-real";

const OIDC: OidcConfig = {
  issuer: "https://id.katsina.gov.ng",
  audience: "agroassure-api",
  rolesClaim: "agroassure/roles",
  jurisdictionClaim: "agroassure/jurisdiction_id",
};

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3001,
    databaseUrl: "postgres://unused",
    publicVerifyDatabaseUrl: "postgres://unused",
    publicVerifyUsesOwnRole: false,
    authJwtSecret: SECRET,
    oidc: null,
    evidenceStore: "local",
    evidenceS3: null,
    evidenceStoreDir: "./evidence-store",
    publicVerifyBaseUrl: "https://verify.example",
    publicVerifyRatePerMinute: 60,
    ...overrides,
  };
}

describe("claims to principal", () => {
  it("drops a role this service does not implement", () => {
    const { principal, ignoredRoles } = principalFromClaims(
      { sub: USER, roles: ["inspector", "superuser", "admin"] },
      null,
    );
    // A token asserting "superuser" grants exactly nothing, and the discarded
    // claim is reported so it shows up in the log rather than vanishing.
    expect(principal.roles).toEqual(["inspector"]);
    expect(ignoredRoles).toEqual(["superuser", "admin"]);
  });

  it("reads namespaced claims when a provider is configured", () => {
    const { principal } = principalFromClaims(
      {
        sub: USER,
        "agroassure/roles": ["desk_supervisor"],
        "agroassure/jurisdiction_id": KATSINA,
      },
      OIDC,
    );
    expect(principal.roles).toEqual(["desk_supervisor"]);
    expect(principal.jurisdictionId).toBe(KATSINA);
  });

  it("grants nothing when the roles claim is missing or the wrong shape", () => {
    for (const roles of [undefined, "inspector", 42, { role: "inspector" }]) {
      const { principal } = principalFromClaims({ sub: USER, roles } as never, null);
      expect(principal.roles).toEqual([]);
    }
  });

  it("carries device_id through for a field token, and null otherwise", () => {
    expect(principalFromClaims({ sub: USER, device_id: "dev-1" }, null).principal.deviceId).toBe(
      "dev-1",
    );
    expect(principalFromClaims({ sub: USER }, null).principal.deviceId).toBeNull();
  });
});

describe("shared-secret development tokens", () => {
  const verifier = new TokenVerifier(config());

  it("accepts a token it signed itself", async () => {
    const token = jwt.sign({ sub: USER, roles: ["inspector"], jurisdiction_id: KATSINA }, SECRET);
    await expect(verifier.verify(token)).resolves.toMatchObject({
      userId: USER,
      roles: ["inspector"],
      jurisdictionId: KATSINA,
    });
  });

  it("refuses a token signed with a different secret", async () => {
    const token = jwt.sign({ sub: USER, roles: ["national_admin"] }, "some-other-secret");
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses an unsigned token", async () => {
    // alg:none is the oldest JWT attack there is, and the algorithms list is
    // what stops it.
    const token = jwt.sign({ sub: USER, roles: ["national_admin"] }, "", {
      algorithm: "none",
    });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a token with no subject", async () => {
    const token = jwt.sign({ roles: ["inspector"] }, SECRET);
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

// The provider's signing key, generated here rather than fetched. An earlier
// version of this suite let the verifier reach for the real JWKS endpoint over
// the network, which made the most security-critical assertion in the file
// depend on DNS: it passed when the lookup failed and was flaky when it did not.
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

vi.mock("jwks-rsa", () => ({
  JwksClient: class {
    getSigningKey(
      _kid: string | undefined,
      cb: (err: Error | null, key?: { getPublicKey(): string }) => void,
    ) {
      cb(null, { getPublicKey: () => PUBLIC_PEM });
    }
  },
}));

describe("with an identity provider configured", () => {
  const verifier = new TokenVerifier(config({ oidc: OIDC }));

  function providerToken(claims: Record<string, unknown>, options = {}) {
    return jwt.sign(claims, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), {
      algorithm: "RS256",
      issuer: OIDC.issuer,
      audience: OIDC.audience,
      ...options,
    });
  }

  it("accepts a token the provider actually signed", async () => {
    await expect(
      verifier.verify(providerToken({ sub: USER, "agroassure/roles": ["desk_supervisor"] })),
    ).resolves.toMatchObject({ userId: USER, roles: ["desk_supervisor"] });
  });

  it("will not accept a shared-secret token", async () => {
    // Algorithm confusion: a symmetric token must not be accepted by a verifier
    // that is supposed to be checking the provider's asymmetric signature. If
    // HS256 were in the allowed list, anyone holding the public key — which is
    // published — could mint their own tokens with it.
    const token = jwt.sign({ sub: USER, "agroassure/roles": ["national_admin"] }, SECRET, {
      issuer: OIDC.issuer,
      audience: OIDC.audience,
    });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a token minted for a different application", async () => {
    // Same provider, same signing key, different audience: not ours to accept.
    await expect(
      verifier.verify(providerToken({ sub: USER }, { audience: "some-other-api" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a token from a different issuer", async () => {
    await expect(
      verifier.verify(providerToken({ sub: USER }, { issuer: "https://id.example.invalid" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses an expired token", async () => {
    await expect(
      verifier.verify(providerToken({ sub: USER }, { expiresIn: -60 })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("configuration", () => {
  it("refuses to start with no way to verify a token at all", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://x" })).toThrow(/OIDC_ISSUER|AUTH_JWT_SECRET/);
  });

  it("refuses an issuer with no audience", () => {
    // A token minted by the same provider for a different application would
    // otherwise be accepted here.
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://x", OIDC_ISSUER: "https://id.example" }),
    ).toThrow(/OIDC_AUDIENCE/);
  });

  it("does not require a shared secret once a provider is configured", () => {
    const loaded = loadConfig({
      DATABASE_URL: "postgres://x",
      OIDC_ISSUER: "https://id.example/",
      OIDC_AUDIENCE: "agroassure-api",
    });
    expect(loaded.oidc?.issuer).toBe("https://id.example"); // trailing slash trimmed
    expect(loaded.authJwtSecret).toBe("");
  });

  it("requires a bucket before it will claim to store evidence in one", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://x", AUTH_JWT_SECRET: "s", EVIDENCE_STORE: "s3" }),
    ).toThrow(/EVIDENCE_S3_BUCKET/);
  });

  it("refuses a retention that is not a whole number of years", () => {
    // Object-lock retention cannot be shortened after the fact, so a nonsense
    // value must fail at boot rather than be rounded into the record.
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://x",
        AUTH_JWT_SECRET: "s",
        EVIDENCE_STORE: "s3",
        EVIDENCE_S3_BUCKET: "b",
        EVIDENCE_RETENTION_YEARS: "0",
      }),
    ).toThrow(/EVIDENCE_RETENTION_YEARS/);
  });
});
