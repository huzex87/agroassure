import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { UserDirectory } from "../src/common/user-directory";
import { DeviceAuthGuard, getPrincipal } from "../src/common/device-auth.guard";
import type { PgService } from "../src/db/pg.service";
import type { Principal } from "../src/common/principal";

// The crossing from a provider's subject to this platform's user.
//
// app_user.oidc_subject existed from the first migration and nothing ever read
// it: the subject went straight into columns declared uuid NOT NULL REFERENCES
// app_user(id). That worked only because a development token's subject was
// itself an app_user id. Against a real provider — "auth0|68c3..." — every
// write in the console would have failed on the uuid cast, which reads as a
// broken database rather than as a mapping nobody wrote.

const APP_USER = "018f1000-0000-7000-8000-000000000001";
const KANO = "819ee583-3fd1-4b06-a11b-aeda018d1f14";

// PgService.query resolves to the rows themselves, not a pg QueryResult. The
// first draft of this mock returned { rows }, which agreed with nothing, and
// the tests passed anyway — typecheck was what noticed.
function pg(rows: Array<{ id: string; jurisdiction_id: string | null }>) {
  const query = vi.fn().mockResolvedValue(rows);
  return { service: { query } as unknown as PgService, query };
}

describe("resolving a token subject to a user", () => {
  it("finds the user a provider's subject belongs to", async () => {
    const { service, query } = pg([{ id: APP_USER, jurisdiction_id: KANO }]);
    const found = await new UserDirectory(service).resolve("auth0|68c3f1a2b4d5e6f708091a2b");

    expect(found).toEqual({ id: APP_USER, jurisdictionId: KANO });
    // Matched on the subject, and on the id as well, so a development token
    // whose subject is an app_user id needs no second code path.
    expect(query.mock.calls[0][0]).toContain("oidc_subject = $1 OR id::text = $1");
    expect(query.mock.calls[0][1]).toEqual(["auth0|68c3f1a2b4d5e6f708091a2b"]);
  });

  it("only ever resolves an active user", async () => {
    const { query } = pg([]);
    await new UserDirectory({ query } as unknown as PgService).resolve("auth0|whoever");
    // Suspending somebody has to stop them, and it stops them here.
    expect(query.mock.calls[0][0]).toContain("status = 'active'");
  });

  it("knows nobody by a subject it has never seen", async () => {
    const { service } = pg([]);
    expect(await new UserDirectory(service).resolve("auth0|stranger")).toBeNull();
  });
});

describe("the guard, once a token has been verified", () => {
  const metrics = { increment: vi.fn() };
  const request = (token: string | null) => ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const context = (req: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;

  function guard(principal: Principal, resolved: Awaited<ReturnType<UserDirectory["resolve"]>>) {
    return new DeviceAuthGuard(
      { verify: vi.fn().mockResolvedValue(principal) } as never,
      { resolve: vi.fn().mockResolvedValue(resolved) } as never,
      metrics as never,
    );
  }

  const fromProvider: Principal = {
    userId: "auth0|68c3f1a2b4d5e6f708091a2b",
    deviceId: null,
    jurisdictionId: KANO,
    roles: ["authorising_officer"],
  };

  it("puts this platform's user id on the request, not the provider's subject", async () => {
    const req = request("t");
    await guard(fromProvider, { id: APP_USER, jurisdictionId: KANO }).canActivate(context(req));

    // The subject has been exchanged for an id a foreign key will accept, and
    // the rest of the principal is carried through untouched.
    const attached = getPrincipal(req as never);
    expect(attached.userId).toBe(APP_USER);
    expect(attached.roles).toEqual(["authorising_officer"]);
    expect(attached.jurisdictionId).toBe(KANO);
  });

  it("refuses a valid token for somebody the register does not hold", async () => {
    // Authenticated by the provider, unknown here. Admitting them would mean
    // issuing certificates in the name of an officer who does not exist.
    await expect(
      guard(fromProvider, null).canActivate(context(request("t"))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("still refuses a request carrying no token at all", async () => {
    await expect(
      guard(fromProvider, { id: APP_USER, jurisdictionId: KANO }).canActivate(
        context(request(null)),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
