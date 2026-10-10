// Reading a spreadsheet saved as CSV.
//
// Excel, Google Sheets and LibreOffice all write RFC 4180: fields containing a
// comma, quote or line break are wrapped in double quotes, and a quote inside
// one is doubled. A split on commas gets "12 Kofar Soro Road, Katsina" wrong,
// so this reads the format properly. It also accepts a semicolon separator
// (what Excel writes in locales that use the comma as a decimal point) and
// strips the byte-order mark Excel puts at the start of a UTF-8 file.

export interface ParsedSheet {
  headers: string[];
  rows: Array<Record<string, string>>;
}

function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts] += 1;
  }
  if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t";
  return counts[";"] > counts[","] ? ";" : ",";
}

/** Every record as a list of fields, blank lines dropped. */
export function parseCsvRecords(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.slice(0, input.search(/\r?\n/) === -1 ? undefined : input.search(/\r?\n/));
  const delimiter = detectDelimiter(firstLine);

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((f) => f.trim() !== ""));
}

/** The first record is the heading row; each later one becomes an object keyed by it. */
export function parseSheet(text: string): ParsedSheet {
  const [head, ...body] = parseCsvRecords(text);
  if (!head) return { headers: [], rows: [] };
  const headers = head.map((h) => h.trim());
  const rows = body.map((fields) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) row[h] = (fields[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

/** One field as it must be written back out. */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}

/** The template the import page offers, with one example row to copy. */
export const FACILITY_TEMPLATE_HEADERS = [
  "Name",
  "Licence number",
  "Type",
  "LGA",
  "Address",
  "Owner name",
  "Owner phone",
  "Latitude",
  "Longitude",
];

export const FACILITY_TEMPLATE_EXAMPLE = [
  "Rimin Zakara Agro Ventures Ltd",
  "FISS/KT/AD/2026/0417",
  "Agro-dealer",
  "Katsina",
  "12 Kofar Soro Road",
  "Musa Danjuma",
  "0803 123 4567",
  "12.98547",
  "7.61893",
];

/**
 * Writes a spreadsheet as CSV that Excel, Sheets and LibreOffice open correctly.
 * Fields with a comma, quote or line break are quoted. A cell that starts with =,
 * +, - or @ would be run as a formula when opened, so it is prefixed with an
 * apostrophe: a business name is user-supplied text, not a formula. A byte-order
 * mark first, so Excel reads the UTF-8 (Hausa letters, accents) correctly.
 */
export function toDownloadCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (value: string | number | null | undefined): string => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
