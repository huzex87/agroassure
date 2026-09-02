import { NextResponse } from "next/server";
import { sessionToken } from "../../../../../lib/api";

// The certificate document is rendered by the API, which holds the issuing
// authority's mark and the only copy of the record. This route exists solely so
// the browser can fetch it: a link cannot carry a bearer token, and the session
// lives in an httpOnly cookie the page script cannot read either.

const API_BASE = process.env.AGROASSURE_API_URL ?? "http://localhost:3001";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await params;
  if (format !== "pdf" && format !== "html") {
    return NextResponse.json({ error: "unknown format" }, { status: 404 });
  }

  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const upstream = await fetch(`${API_BASE}/v1/certificates/${id}/certificate.${format}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    // Rendering needs headless Chromium on the API host; say so rather than
    // handing the reader a broken download.
    const detail = await upstream.text();
    return NextResponse.json(
      { error: detail || upstream.statusText },
      { status: upstream.status },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type":
        format === "pdf" ? "application/pdf" : "text/html; charset=utf-8",
      "content-disposition":
        format === "pdf" ? `inline; filename="certificate-${id}.pdf"` : "inline",
      "cache-control": "private, no-store",
    },
  });
}
