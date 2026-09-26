"use server";

import { revalidatePath } from "next/cache";
import { ApiError, post } from "../../lib/api";

// Adding to the registry: one facility from a form, or many from a sheet.

export type AddFacilityState =
  | { status: "idle" }
  | { status: "added"; id: string; name: string }
  | { status: "error"; message: string };

export interface ImportRowResult {
  row: number;
  name: string;
  licenceNumber: string;
  errors: string[];
}

export type ImportState =
  | { status: "idle" }
  | { status: "checked" | "imported"; rows: ImportRowResult[]; valid: number; invalid: number; imported: number }
  | { status: "error"; message: string };

function refusal(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  throw err;
}

export async function addFacility(_prev: AddFacilityState, formData: FormData): Promise<AddFacilityState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const name = text("name");
  const licenceNumber = text("licenceNumber");
  const facilityType = text("facilityType");
  if (!name || !licenceNumber || !facilityType) {
    return { status: "error", message: "Enter the facility's name, licence number and type." };
  }

  const lat = text("lat");
  const lng = text("lng");
  let registeredPoint: { lat: number; lng: number } | undefined;
  if (lat || lng) {
    const point = { lat: Number(lat), lng: Number(lng) };
    if (!lat || !lng || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return { status: "error", message: "Enter both latitude and longitude as numbers, or leave both empty." };
    }
    if (point.lat < 3.5 || point.lat > 14.5 || point.lng < 2.5 || point.lng > 15) {
      return { status: "error", message: "Those coordinates are outside Nigeria. Check the latitude and longitude." };
    }
    registeredPoint = point;
  }

  const address = text("address");
  const ownerName = text("ownerName");
  const ownerPhone = text("ownerPhone");

  try {
    const { id } = await post<{ id: string }>("/v1/facilities", {
      name,
      licenceNumber,
      facilityType,
      lga: text("lga") || undefined,
      address: address ? { line1: address } : undefined,
      ownerContact:
        ownerName || ownerPhone
          ? { ...(ownerName ? { name: ownerName } : {}), ...(ownerPhone ? { phone: ownerPhone } : {}) }
          : undefined,
      registeredPoint,
    });
    revalidatePath("/facilities");
    revalidatePath("/");
    return { status: "added", id, name };
  } catch (err) {
    return { status: "error", message: refusal(err) };
  }
}

/** Check a sheet (dryRun) or import the rows that pass. Rows arrive already parsed. */
export async function importFacilities(
  rows: Array<Record<string, string>>,
  dryRun: boolean,
): Promise<ImportState> {
  try {
    const plan = await post<{
      rows: ImportRowResult[];
      valid: number;
      invalid: number;
      imported: number;
    }>("/v1/facilities/import", { rows, dryRun });
    if (!dryRun) {
      revalidatePath("/facilities");
      revalidatePath("/");
    }
    return {
      status: dryRun ? "checked" : "imported",
      // The server's full row includes the facility it would register; the
      // preview needs only the verdict.
      rows: plan.rows.map(({ row, name, licenceNumber, errors }) => ({ row, name, licenceNumber, errors })),
      valid: plan.valid,
      invalid: plan.invalid,
      imported: plan.imported,
    };
  } catch (err) {
    return { status: "error", message: refusal(err) };
  }
}
