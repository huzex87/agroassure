import { NextResponse } from "next/server";
import { ApiError, get, type FacilityRow } from "../../../../lib/api";
import { toDownloadCsv } from "../../../../lib/csv";
import { FACILITY_TYPE_LABEL, label } from "../../../../lib/format";

// The registry as a spreadsheet: what the Facilities page shows for the same
// search and status, all of it rather than one page. It goes through the same
// gateway call and the same role and jurisdiction checks as the page.

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  valid: "Valid",
  due_soon: "Due soon",
  overdue: "Overdue",
  never_inspected: "Not yet inspected",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["q", "type", "lga"]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  const status = params.get("status") ?? "";

  try {
    const all = await get<FacilityRow[]>(`/v1/facilities?${query}`);
    const rows = status ? all.filter((f) => f.certificate_status === status) : all;
    const csv = toDownloadCsv(
      ["Licence number", "Business", "Type", "LGA", "Last inspected", "Rating", "Certificate", "Certificate valid to"],
      rows.map((f) => [
        f.licence_number,
        f.name,
        label(FACILITY_TYPE_LABEL, f.facility_type),
        f.lga,
        f.last_inspected?.slice(0, 10),
        f.last_rating_band,
        STATUS[f.certificate_status] ?? f.certificate_status,
        f.certificate_valid_to?.slice(0, 10),
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="agroassure-facilities-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ message: "Not allowed or not available." }, { status: err.status });
    return NextResponse.json({ message: "The service is not answering." }, { status: 503 });
  }
}
