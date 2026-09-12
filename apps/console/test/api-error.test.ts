import { describe, expect, it } from "vitest";
import { DENIED, denialDigest, readableError } from "../lib/api";

// The gateway nests its message inside another message object. Putting the raw
// body on an Error meant an inspector who opened the dashboard — which their
// role genuinely does not permit — was shown the whole envelope, which explains
// nothing and reads as a broken console rather than as a rule.

function res(status: number, statusText = ""): Response {
  return { status, statusText } as Response;
}

describe("readableError", () => {
  it("unwraps the nested envelope the gateway sends", () => {
    const body = JSON.stringify({
      error: true,
      status: 400,
      message: { message: "events must be an array", error: "Bad Request", statusCode: 400 },
    });
    expect(readableError(body, res(400))).toBe("events must be an array");
  });

  it("reads a flat message too", () => {
    expect(readableError(JSON.stringify({ message: "no such facility" }), res(404))).toBe(
      "no such facility",
    );
  });

  it("joins the array form validation errors use", () => {
    const body = JSON.stringify({ message: { message: ["name is required", "lga is required"] } });
    expect(readableError(body, res(400))).toBe("name is required; lga is required");
  });

  it("turns a role refusal into a sentence naming the roles", () => {
    const body = JSON.stringify({
      message: { message: "requires one of: state_admin, national_admin" },
    });
    const out = readableError(body, res(403));
    expect(out).toBe(
      "Your role does not have access to this page. It is available to: state admin, national admin.",
    );
    // Never the raw envelope, and never the underscored wire values.
    expect(out).not.toContain("{");
    expect(out).not.toContain("_");
  });

  it("still says something useful when a 403 carries no role list", () => {
    expect(readableError("", res(403))).toBe("Your role does not have access to this page.");
  });

  it("falls back to the body when it is not JSON, without pasting a whole page in", () => {
    expect(readableError("upstream timed out", res(504))).toBe("upstream timed out");
    expect(readableError("x".repeat(1000), res(500))).toHaveLength(300);
  });

  it("falls back to the status when there is nothing at all", () => {
    expect(readableError("", res(502, "Bad Gateway"))).toBe("Bad Gateway");
    expect(readableError("", res(599))).toBe("Request failed with status 599");
  });
});

// Next replaces a Server Component error's message with "the specific message
// is omitted in production builds" and forwards only the digest. The refusal
// therefore has to travel in the digest or it does not reach the reader at all
// — which is how the friendly screen came to be dead code in production while
// passing every test on a laptop.
describe("a refusal crossing into the browser", () => {
  it("carries the roles in the digest, which is the field that survives", () => {
    const message = readableError(
      JSON.stringify({ message: { message: "requires one of: desk_supervisor, state_admin" } }),
      res(403),
    );
    expect(denialDigest(403, message)).toBe(`${DENIED}:desk supervisor, state admin`);
  });

  it("still marks a refusal that named no roles", () => {
    expect(denialDigest(403, readableError("", res(403)))).toBe(DENIED);
  });

  it("leaves anything that is not a refusal alone", () => {
    expect(denialDigest(500, "boom")).toBeUndefined();
    expect(denialDigest(504, "upstream timed out")).toBeUndefined();
  });
});
