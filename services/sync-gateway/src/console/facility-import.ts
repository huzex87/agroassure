import type { FacilityType } from "@agroassure/domain";
import type { RegisterFacilityInput } from "./registry.service";

// Reading a registry out of a spreadsheet.
//
// A state's facility list arrives as whatever the office already keeps: an
// Excel sheet with its own column names, "Agro Dealer" written four ways, and
// coordinates in whichever order someone typed them. This turns each row into
// a facility the registry will accept, or into sentences saying exactly what
// is wrong with it — by row number, so the person can find it in their sheet.
//
// Pure: no database, so every rule is testable. Whether a licence number is
// already registered is passed in rather than looked up.

export const MAX_IMPORT_ROWS = 2000;

/** One row as the console sends it: raw strings, straight from the sheet. */
export type RawFacilityRow = Record<string, unknown>;

export interface ImportRowResult {
  /** 1-based, and counting the header as row 1, so it matches the sheet. */
  row: number;
  name: string;
  licenceNumber: string;
  errors: string[];
  facility?: RegisterFacilityInput;
}

export interface ImportPlan {
  rows: ImportRowResult[];
  valid: number;
  invalid: number;
}

/** Column headings people actually use, mapped to the field they mean. */
const HEADINGS: Record<string, keyof NormalizedRow> = {
  name: "name",
  businessname: "name",
  facilityname: "name",
  premises: "name",
  licence: "licenceNumber",
  licencenumber: "licenceNumber",
  licenceno: "licenceNumber",
  license: "licenceNumber",
  licensenumber: "licenceNumber",
  licenseno: "licenceNumber",
  registrationnumber: "licenceNumber",
  type: "facilityType",
  facilitytype: "facilityType",
  category: "facilityType",
  lga: "lga",
  localgovernment: "lga",
  localgovernmentarea: "lga",
  address: "address",
  street: "address",
  town: "town",
  city: "town",
  owner: "ownerName",
  ownername: "ownerName",
  contactname: "ownerName",
  phone: "ownerPhone",
  ownerphone: "ownerPhone",
  telephone: "ownerPhone",
  contactphone: "ownerPhone",
  latitude: "lat",
  lat: "lat",
  longitude: "lng",
  long: "lng",
  lng: "lng",
  lon: "lng",
  gps: "gps",
  coordinates: "gps",
};

interface NormalizedRow {
  name: string;
  licenceNumber: string;
  facilityType: string;
  lga: string;
  address: string;
  town: string;
  ownerName: string;
  ownerPhone: string;
  lat: string;
  lng: string;
  gps: string;
}

/** The four classes of the Act, and the ways each is written in practice. */
const TYPE_WORDS: Array<[FacilityType, RegExp]> = [
  ["agro_dealer", /^(agro[\s_-]*dealer|dealer|retail(er)?|agro[\s_-]*input[\s_-]*dealer|warehouse|agro[\s_-]*dealer[\s_-]*warehouse)s?$/],
  ["blending_plant", /^(blend(ing)?([\s_-]*plant)?|blender|processing([\s_-]*and[\s_-]*blending)?([\s_-]*plant)?)s?$/],
  ["manufacturing", /^(manufactur(er|ing)([\s_-]*plant)?|factory|producer)s?$/],
  ["importer", /^(import(er|ing)?|distributor[\s_-]*\/?[\s_-]*importer)s?$/],
];

export function facilityTypeFrom(raw: string): FacilityType | null {
  const word = raw.trim().toLowerCase();
  if (!word) return null;
  for (const [type, pattern] of TYPE_WORDS) {
    if (word === type || pattern.test(word)) return type;
  }
  return null;
}

function headingKey(heading: string): keyof NormalizedRow | undefined {
  return HEADINGS[heading.toLowerCase().replace(/[^a-z]/g, "")];
}

function normalize(raw: RawFacilityRow): NormalizedRow {
  const out: NormalizedRow = {
    name: "",
    licenceNumber: "",
    facilityType: "",
    lga: "",
    address: "",
    town: "",
    ownerName: "",
    ownerPhone: "",
    lat: "",
    lng: "",
    gps: "",
  };
  for (const [heading, value] of Object.entries(raw)) {
    const key = headingKey(heading);
    if (!key || value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && !out[key]) out[key] = text;
  }
  return out;
}

/**
 * A point, from separate columns or from one "lat, lng" cell.
 *
 * Nigeria sits between about 4° and 14° N and 2.7° and 14.7° E. Those ranges
 * overlap almost entirely, so most swapped pairs are still somewhere in
 * Nigeria and cannot be told from a real point — (7.6, 12.9) is a place in
 * Adamawa as well as a swapped Katsina. A pair is therefore taken as written
 * whenever it is valid as written; only one that is valid solely the other way
 * round is turned back, and one that is valid neither way is refused rather
 * than put on the map in the Gulf of Guinea. The check-in geofence is what
 * catches the rest, on the first visit.
 */
export function pointFrom(
  row: Pick<NormalizedRow, "lat" | "lng" | "gps">,
): { point?: { lat: number; lng: number }; error?: string } {
  let latText = row.lat;
  let lngText = row.lng;
  if (!latText && !lngText && row.gps) {
    const parts = row.gps.split(/[,;\s]+/).filter(Boolean);
    if (parts.length !== 2) return { error: "GPS should be two numbers, like 12.9855, 7.6189" };
    [latText, lngText] = parts as [string, string];
  }
  if (!latText && !lngText) return {};
  if (!latText || !lngText) return { error: "GPS needs both a latitude and a longitude" };

  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "GPS coordinates must be numbers, like 12.9855 and 7.6189" };
  }
  const inNigeria = (a: number, b: number) => a >= 3.5 && a <= 14.5 && b >= 2.5 && b <= 15;
  if (inNigeria(lat, lng)) return { point: { lat, lng } };
  if (inNigeria(lng, lat)) return { point: { lat: lng, lng: lat } };
  return { error: "GPS coordinates are outside Nigeria — check the numbers" };
}

export function planImport(
  rawRows: RawFacilityRow[],
  alreadyRegistered: Set<string>,
): ImportPlan {
  const seen = new Map<string, number>();
  const rows: ImportRowResult[] = rawRows.map((raw, i) => {
    const r = normalize(raw);
    const rowNumber = i + 2;
    const errors: string[] = [];

    if (!r.name) errors.push("Name is missing");
    if (r.name.length > 200) errors.push("Name is longer than 200 characters");

    const licence = r.licenceNumber.toUpperCase();
    if (!licence) errors.push("Licence number is missing");
    else if (licence.length > 64) errors.push("Licence number is longer than 64 characters");
    else if (alreadyRegistered.has(licence)) errors.push("This licence number is already registered");
    else if (seen.has(licence)) errors.push(`Same licence number as row ${seen.get(licence)}`);
    if (licence && !seen.has(licence)) seen.set(licence, rowNumber);

    const facilityType = facilityTypeFrom(r.facilityType);
    if (!r.facilityType) errors.push("Facility type is missing");
    else if (!facilityType) {
      errors.push(
        `"${r.facilityType}" isn't a facility type — use Agro-dealer, Blending plant, Manufacturer or Importer`,
      );
    }

    const { point, error: pointError } = pointFrom(r);
    if (pointError) errors.push(pointError);

    const address: Record<string, unknown> = {};
    if (r.address) address.line1 = r.address;
    if (r.town) address.town = r.town;
    const ownerContact: Record<string, unknown> = {};
    if (r.ownerName) ownerContact.name = r.ownerName;
    if (r.ownerPhone) ownerContact.phone = r.ownerPhone;

    return {
      row: rowNumber,
      name: r.name,
      licenceNumber: licence,
      errors,
      facility:
        errors.length === 0
          ? {
              name: r.name,
              licenceNumber: licence,
              facilityType: facilityType!,
              lga: r.lga || undefined,
              address: Object.keys(address).length ? address : undefined,
              ownerContact: Object.keys(ownerContact).length ? ownerContact : undefined,
              registeredPoint: point,
            }
          : undefined,
    };
  });

  const valid = rows.filter((r) => r.facility).length;
  return { rows, valid, invalid: rows.length - valid };
}
