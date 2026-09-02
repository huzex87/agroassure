import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  NO_RECORD,
  NO_RECORD_MESSAGE,
  toVerifyResult,
  type ViewRow,
} from "../src/public-verify/public-verify.service";

// The public page publishes a confirmation, never an accusation. Two guards:
// the answer shape (exactly two, and the negative one is identical whatever the
// reason), and the boundary itself (this module can only reach one view).

const MODULE_DIR = join(__dirname, "..", "src", "public-verify");

/** Source with comments stripped, so prose cannot be mistaken for SQL. */
function moduleSources(): string {
  return readdirSync(MODULE_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(MODULE_DIR, f), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("public verification: exactly two answers", () => {
  const row: ViewRow = {
    verification_token: "AA-3F7K-9QMX-2VTP-R84W-6HND-BJZ5",
    serial: "AA-KT-0417-2608",
    business_name: "Rimin Zakara Agro Ventures Ltd",
    licence_number: "FISS/KT/AD/2026/0417",
    facility_type: "agro_dealer",
    lga: "Katsina",
    last_inspected: "2026-08-18",
    rating_band: "satisfactory",
    valid_to: "2027-08-17",
    issuing_authority: "Mandated regulator",
  };

  it("confirms a valid certificate with the disclosable fields only", () => {
    const result = toVerifyResult(row);
    expect(result.result).toBe("valid");
    expect(Object.keys(result).sort()).toEqual(
      [
        "business_name",
        "facility_type",
        "issuing_authority",
        "last_inspected",
        "lga",
        "licence_number",
        "rating",
        "result",
        "valid_to",
      ].sort(),
    );
  });

  it("returns one identical neutral payload for every kind of absence", () => {
    // The service maps "not found", "expired", "revoked", and "never inspected"
    // to the same missing row, so the caller cannot tell them apart.
    expect(toVerifyResult(undefined)).toEqual(NO_RECORD);
    expect(toVerifyResult(undefined)).toBe(NO_RECORD);
    expect(NO_RECORD.message).toBe(NO_RECORD_MESSAGE);
  });

  it("states absence neutrally, never as a compliance failure", () => {
    expect(NO_RECORD_MESSAGE).toMatch(/does not indicate a compliance failure/i);
    expect(NO_RECORD_MESSAGE).toMatch(/contact the relevant agro-input desk/i);

    // The one mention of failure is the sentence denying it. With that clause
    // removed, nothing in the message may read as an accusation, and nothing
    // may hint at why there is no record.
    const withoutDisclaimer = NO_RECORD_MESSAGE.replace(
      /this does not indicate a compliance failure\.?/i,
      "",
    );
    expect(withoutDisclaimer).not.toMatch(
      /fail|violation|breach|non-compliant|revoked|expired|suspend|never inspected/i,
    );
  });
});

describe("public verification: the boundary is architectural", () => {
  const sources = moduleSources();

  it("reads exactly one relation, and it is the safe view", () => {
    // Case-sensitive: SQL keywords are uppercase throughout this codebase, so
    // an uppercase FROM is a query and a lowercase "from" is prose.
    const relations = [...sources.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)/g)].map((m) =>
      m[1]!.toLowerCase(),
    );
    expect(relations.length).toBeGreaterThan(0);
    expect([...new Set(relations)]).toEqual(["public_certificate_view"]);
  });

  it("names no table that holds adverse data", () => {
    for (const forbidden of [
      "finding",
      "decision",
      "evidence",
      "checkpoint_response",
      "event_store",
      "remark",
      "notification",
    ]) {
      expect(sources.toLowerCase()).not.toContain(`from ${forbidden}`);
      expect(sources.toLowerCase()).not.toContain(`join ${forbidden}`);
    }
  });

  it("imports nothing from the console or sync modules", () => {
    // An import from those modules would be a path to the projections the public
    // surface must not reach, however carefully the query were written.
    expect(sources).not.toMatch(/from\s+"\.\.\/(console|sync|projections|events)\//);
  });
});
