import { describe, expect, it } from "vitest";
import { ApiError } from "../lib/api";
import { attempt } from "../lib/action-result";

describe("attempt", () => {
  it("reports success", async () => {
    expect(await attempt(async () => "anything")).toEqual({ ok: true });
  });

  it("turns the gateway's refusal into a message a person can read", async () => {
    const refused = attempt(async () => {
      throw new ApiError(409, "Only the officer who made the decision can authorise the certificate.");
    });
    expect(await refused).toEqual({
      ok: false,
      message: "Only the officer who made the decision can authorise the certificate.",
    });
  });

  it("lets anything that is not a refusal travel, so an outage is not shown as a toast", async () => {
    await expect(
      attempt(async () => {
        throw new Error("connection reset");
      }),
    ).rejects.toThrow("connection reset");
  });
});
