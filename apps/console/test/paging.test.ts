import { describe, expect, it } from "vitest";
import { pageParam, paginate } from "../lib/paging";
import { toDownloadCsv } from "../lib/csv";

const rows = Array.from({ length: 120 }, (_, i) => i + 1);

describe("paginate", () => {
  it("shows the first page and says where it is", () => {
    const p = paginate(rows, 1, 50);
    expect(p.items).toHaveLength(50);
    expect([p.page, p.pages, p.from, p.to, p.total]).toEqual([1, 3, 1, 50, 120]);
  });

  it("gives the short last page", () => {
    const p = paginate(rows, 3, 50);
    expect(p.items).toEqual(rows.slice(100));
    expect([p.from, p.to]).toEqual([101, 120]);
  });

  it("clamps a page past the end, and treats an empty list as one empty page", () => {
    expect(paginate(rows, 99, 50).page).toBe(3);
    const none = paginate([], 5, 50);
    expect([none.page, none.pages, none.from, none.to]).toEqual([1, 1, 0, 0]);
  });
});

describe("pageParam", () => {
  it("accepts only positive whole numbers", () => {
    expect(pageParam("3")).toBe(3);
    for (const bad of [undefined, "", "0", "-2", "1.5", "abc"]) expect(pageParam(bad)).toBe(1);
  });
});

describe("toDownloadCsv", () => {
  it("quotes commas, quotes and line breaks, and starts with a byte-order mark", () => {
    const out = toDownloadCsv(["Name", "Address"], [['Rimin "Zakara" Ltd', "12 Kofar Soro Road, Katsina"]]);
    expect(out.startsWith("﻿Name,Address\r\n")).toBe(true);
    expect(out).toContain('"Rimin ""Zakara"" Ltd","12 Kofar Soro Road, Katsina"');
  });

  it("defuses spreadsheet formulas in user-supplied text", () => {
    const out = toDownloadCsv(["Name"], [["=HYPERLINK(\"http://evil\")"], ["+1"], ["-1"], ["@x"]]);
    for (const line of out.split("\r\n").slice(1, 5)) expect(line.replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("writes empty cells for missing values", () => {
    expect(toDownloadCsv(["a", "b"], [[null, undefined]])).toContain("\r\n,\r\n");
  });
});
