import { describe, expect, it } from "vitest";
import { parseCsvRecords, parseSheet, toCsv, FACILITY_TEMPLATE_HEADERS, FACILITY_TEMPLATE_EXAMPLE } from "../lib/csv";

// A registry arrives as the CSV that Excel or Google Sheets writes. Splitting on
// commas would cut "12 Kofar Soro Road, Katsina" in two; these are the shapes
// real exports take.

describe("reading a CSV export", () => {
  it("keeps a quoted field with a comma, a quote and a line break whole", () => {
    const text = 'Name,Address\r\n"Kofar ""Soro"" Agro","12 Road, Katsina\nNear the market"\r\n';
    expect(parseCsvRecords(text)).toEqual([
      ["Name", "Address"],
      ['Kofar "Soro" Agro', "12 Road, Katsina\nNear the market"],
    ]);
  });

  it("drops Excel's byte-order mark and blank lines", () => {
    const text = "﻿Name,Type\n\nDanmarke,Agro-dealer\n,\n";
    expect(parseSheet(text)).toEqual({
      headers: ["Name", "Type"],
      rows: [{ Name: "Danmarke", Type: "Agro-dealer" }],
    });
  });

  it("reads the semicolon files Excel writes where commas are decimal points", () => {
    expect(parseSheet("Name;Latitude\nDanmarke;12,98\n").rows).toEqual([
      { Name: "Danmarke", Latitude: "12,98" },
    ]);
  });

  it("reads tab-separated text pasted from a sheet", () => {
    expect(parseSheet("Name\tType\nDanmarke\tImporter").rows).toEqual([
      { Name: "Danmarke", Type: "Importer" },
    ]);
  });

  it("fills a short row with empty values rather than shifting columns", () => {
    expect(parseSheet("Name,Type,LGA\nDanmarke,Importer\n").rows).toEqual([
      { Name: "Danmarke", Type: "Importer", LGA: "" },
    ]);
  });

  it("round-trips the template it offers", () => {
    const csv = toCsv(FACILITY_TEMPLATE_HEADERS, [FACILITY_TEMPLATE_EXAMPLE]);
    const sheet = parseSheet(csv);
    expect(sheet.headers).toEqual(FACILITY_TEMPLATE_HEADERS);
    expect(Object.values(sheet.rows[0]!)).toEqual(FACILITY_TEMPLATE_EXAMPLE);
  });
});
