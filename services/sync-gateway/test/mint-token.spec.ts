import { describe, it, expect } from "vitest";
import { tokenClaims } from "../src/cli/mint-token";

// The development token stands in for the institution's identity provider, so
// its claims decide what every request is allowed to do. Two mistakes here would
// be invisible until someone saw the wrong data: scoping a national role to one
// state, and carrying a role the database never granted.

const KATSINA = "018f0000-0000-7000-8000-000000000001";
const USER = "018f1000-0000-7000-8000-000000000001";

describe("development token claims", () => {
  it("scopes a state role to its jurisdiction", () => {
    expect(
      tokenClaims({ id: USER, jurisdiction_id: KATSINA, roles: ["state_admin"] }),
    ).toEqual({ sub: USER, roles: ["state_admin"], jurisdiction_id: KATSINA });
  });

  it("leaves a national role unscoped, whatever the user row says", () => {
    // An auditor whose token carried a jurisdiction would quietly see one state
    // and believe they were seeing the country.
    for (const role of ["national_admin", "auditor"]) {
      const claims = tokenClaims({ id: USER, jurisdiction_id: KATSINA, roles: [role] });
      expect(claims.jurisdiction_id).toBeUndefined();
    }
  });

  it("stays unscoped when a national role sits beside a state one", () => {
    const claims = tokenClaims({
      id: USER,
      jurisdiction_id: KATSINA,
      roles: ["state_admin", "auditor"],
    });
    expect(claims.jurisdiction_id).toBeUndefined();
    expect(claims.roles).toEqual(["state_admin", "auditor"]);
  });

  it("never invents a role", () => {
    expect(tokenClaims({ id: USER, jurisdiction_id: KATSINA, roles: [] }).roles).toEqual([]);
  });
});
