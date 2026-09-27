import { describe, expect, it } from "vitest";
import { facilityTypeFrom, planImport, pointFrom } from "../src/console/facility-import";

// A state's registry arrives as the spreadsheet the office already keeps. What
// has to hold: the columns people actually use are understood, every row that
// cannot be registered says why in words and by the row number in the sheet,
// and nothing that would collide with the registry gets as far as an event.

describe("facility types, as people write them", () => {
  it("understands the four classes however they are spelled", () => {
    expect(facilityTypeFrom("Agro-dealer")).toBe("agro_dealer");
    expect(facilityTypeFrom("agro dealer")).toBe("agro_dealer");
    expect(facilityTypeFrom("AGRO_DEALER")).toBe("agro_dealer");
    expect(facilityTypeFrom("Dealer")).toBe("agro_dealer");
    expect(facilityTypeFrom("Blending plant")).toBe("blending_plant");
    expect(facilityTypeFrom("Blender")).toBe("blending_plant");
    expect(facilityTypeFrom("Manufacturer")).toBe("manufacturing");
    expect(facilityTypeFrom("Factory")).toBe("manufacturing");
    expect(facilityTypeFrom("Importer")).toBe("importer");
  });

  it("does not guess at anything else", () => {
    expect(facilityTypeFrom("Shop")).toBeNull();
    expect(facilityTypeFrom("")).toBeNull();
  });
});

describe("coordinates", () => {
  it("reads separate columns and a single cell", () => {
    expect(pointFrom({ lat: "12.9855", lng: "7.6189", gps: "" }).point).toEqual({ lat: 12.9855, lng: 7.6189 });
    expect(pointFrom({ lat: "", lng: "", gps: "12.9855, 7.6189" }).point).toEqual({ lat: 12.9855, lng: 7.6189 });
  });

  it("puts back a pair that only makes sense swapped", () => {
    // 14.8° is too far north for a Nigerian latitude, but a fine longitude.
    expect(pointFrom({ lat: "14.8", lng: "12.1", gps: "" }).point).toEqual({ lat: 12.1, lng: 14.8 });
  });

  it("takes a pair that is valid as written at its word", () => {
    // Also valid swapped (Katsina), but as written it is a real place in
    // Adamawa, and nothing in the row says which was meant.
    expect(pointFrom({ lat: "7.6189", lng: "12.9855", gps: "" }).point).toEqual({ lat: 7.6189, lng: 12.9855 });
  });

  it("refuses a point outside Nigeria, or half of one", () => {
    expect(pointFrom({ lat: "51.5", lng: "-0.12", gps: "" }).error).toMatch(/outside Nigeria/);
    expect(pointFrom({ lat: "12.9", lng: "", gps: "" }).error).toMatch(/both/);
    expect(pointFrom({ lat: "north", lng: "7.6", gps: "" }).error).toMatch(/numbers/);
  });

  it("is optional", () => {
    expect(pointFrom({ lat: "", lng: "", gps: "" })).toEqual({});
  });
});

describe("planning an import", () => {
  const good = {
    "Business name": "Rimin Zakara Agro Ventures",
    "Licence No.": "fiss/kt/ad/2026/0501",
    Type: "Agro dealer",
    LGA: "Katsina",
    Address: "12 Kofar Soro Road",
    "Owner phone": "0803 123 4567",
    Latitude: "12.9855",
    Longitude: "7.6189",
  };

  it("maps a well-formed row onto a facility the registry accepts", () => {
    const plan = planImport([good], new Set());
    expect(plan).toMatchObject({ valid: 1, invalid: 0 });
    expect(plan.rows[0]).toMatchObject({
      row: 2,
      errors: [],
      facility: {
        name: "Rimin Zakara Agro Ventures",
        licenceNumber: "FISS/KT/AD/2026/0501",
        facilityType: "agro_dealer",
        lga: "Katsina",
        address: { line1: "12 Kofar Soro Road" },
        ownerContact: { phone: "0803 123 4567" },
        registeredPoint: { lat: 12.9855, lng: 7.6189 },
      },
    });
  });

  it("names every problem with a row, by the row number in the sheet", () => {
    const plan = planImport([good, { Name: "", Type: "Shop" }], new Set());
    expect(plan).toMatchObject({ valid: 1, invalid: 1 });
    const bad = plan.rows[1]!;
    expect(bad.row).toBe(3);
    expect(bad.facility).toBeUndefined();
    expect(bad.errors).toEqual([
      "Name is missing",
      "Licence number is missing",
      expect.stringContaining('"Shop" isn\'t a facility type'),
    ]);
  });

  it("refuses a licence number the registry already holds, without regard to case", () => {
    const plan = planImport([good], new Set(["FISS/KT/AD/2026/0501"]));
    expect(plan.rows[0]!.errors).toEqual(["This licence number is already registered"]);
  });

  it("refuses the second of two rows with the same licence number", () => {
    const plan = planImport([good, { ...good, "Business name": "Copy" }], new Set());
    expect(plan.rows[0]!.errors).toEqual([]);
    expect(plan.rows[1]!.errors).toEqual(["Same licence number as row 2"]);
  });

  it("ignores columns it does not know rather than failing on them", () => {
    const plan = planImport([{ ...good, "Inspector notes": "friendly", Region: "North West" }], new Set());
    expect(plan.valid).toBe(1);
  });
});
