import { describe, expect, it } from "vitest";
import { accountLine } from "../lib/roles";

describe("accountLine", () => {
  it("names a national administrator by role, not by the state on their record", () => {
    expect(accountLine(["national_admin"], "Katsina")).toBe("National administrator");
  });

  it("says where a state role works", () => {
    expect(accountLine(["state_admin"], "Katsina")).toBe("State administrator · Katsina");
  });

  it("falls back to something readable for roles it does not know", () => {
    expect(accountLine(["something_new"], null)).toBe("Signed in");
  });
});
