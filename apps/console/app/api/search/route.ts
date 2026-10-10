import { NextResponse } from "next/server";
import { ApiError, get, type FacilityRow } from "../../../lib/api";

// Quick find's live half: facilities matching what was typed. The same
// gateway call, with the same role and jurisdiction checks, as the Facilities
// page, so a person finds exactly what that page would have shown them.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  try {
    const rows = await get<FacilityRow[]>(`/v1/facilities?${new URLSearchParams({ q })}`);
    return NextResponse.json(
      rows.slice(0, 6).map((f) => ({ id: f.id, name: f.name, licence: f.licence_number, lga: f.lga })),
    );
  } catch (err) {
    // A refusal or an outage is "nothing found" here, not an error page in a dialog.
    if (err instanceof ApiError) return NextResponse.json([]);
    return NextResponse.json([], { status: 503 });
  }
}
