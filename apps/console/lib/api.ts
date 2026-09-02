import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// The console reads and writes through the API, never through the database.
// Every rule that matters — role, jurisdiction, the certificate invariant, the
// public-verify boundary — is enforced on the far side of this file, so nothing
// here can be relaxed to make a screen work.

const API_BASE = process.env.AGROASSURE_API_URL ?? "http://localhost:3001";

/**
 * The session token.
 *
 * ponytail: a bearer token in an httpOnly cookie, set by the development
 * sign-in page. Production replaces this with the institution's OpenID Connect
 * provider (section 18.2); the rest of the console does not change, because it
 * only ever asks this function for a token.
 */
export async function sessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("agroassure_session")?.value ?? null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await sessionToken();
  if (!token) redirect("/signin");

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    // Compliance data is read fresh: a dashboard showing yesterday's findings
    // is worse than a dashboard that took another moment to load.
    cache: "no-store",
  });

  if (response.status === 401) redirect("/signin");
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body || response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

// ---- the shapes the console reads ----------------------------------------

export type CertificateStatus = "valid" | "due_soon" | "overdue" | "never_inspected";

export interface FacilityRow {
  id: string;
  licence_number: string;
  facility_type: string;
  name: string;
  lga: string | null;
  lat: number | null;
  lng: number | null;
  last_inspected: string | null;
  last_rating_band: string | null;
  certificate_serial: string | null;
  certificate_valid_to: string | null;
  certificate_status: CertificateStatus;
}

export interface InspectionRow {
  id: string;
  reference: string;
  status: string;
  rating_percent: string | null;
  rating_band: string | null;
  findings_count: number;
  checkin_flagged: boolean;
  version_discrepancy: boolean;
  submitted_at: string | null;
  facility_name: string;
  licence_number: string;
  lga: string | null;
  inspector: string;
  reviewed: boolean;
}

export interface FindingRow {
  id: string;
  reference: string;
  summary: string;
  severity: "critical" | "major" | "minor";
  status: string;
  due_date: string | null;
  owner_label: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  checkpoint_ref: string;
  past_due: boolean;
  days_past_due: number | null;
  inspection_id: string;
  inspection_reference: string;
  facility_id: string;
  facility_name: string;
  licence_number: string;
  lga: string | null;
}

export interface DashboardSummary {
  tiles: {
    facilities: number;
    inspections30d: number;
    openFindings: number;
    overdueFindings: number;
    validCertificates: number;
    certificatesDueSoon: number;
  };
  decisionsWithin30Days: { decided: number; total: number; percent: number | null };
  complianceTrend: Array<{
    month: string;
    avg_rating: number | null;
    inspections: number;
    satisfactory: number;
  }>;
  findingsBySection: Array<{
    section_ordinal: string;
    section_title: string;
    findings: number;
    critical: number;
  }>;
  findingsQueue: Array<{ status: string; severity: string; count: number }>;
}

export interface RiskSuggestion {
  facilityId: string;
  facilityName: string;
  licenceNumber: string;
  lga: string | null;
  score: number;
  reasons: string[];
  leadingReason: string;
}

export interface InspectionDetail {
  inspection: Record<string, unknown>;
  responses: Array<{
    checkpoint_ref: string;
    response: "yes" | "no" | "na";
    remark: string | null;
    weight: number;
    section_title_en: string | null;
    prompt_en: string | null;
    prompt_ha: string | null;
  }>;
  evidence: Array<{
    id: string;
    checkpoint_ref: string;
    sha256: string;
    object_key: string;
    mime: string;
    captured_at: string;
    locked: boolean;
    lat: number | null;
    lng: number | null;
    accuracy_m: string | null;
  }>;
  findings: Array<{
    id: string;
    reference: string;
    checkpoint_ref: string;
    summary: string;
    severity: "critical" | "major" | "minor";
    status: string;
    due_date: string | null;
    owner_label: string | null;
    escalated_to: string | null;
    escalated_at: string | null;
    closed_at: string | null;
  }>;
  decisions: Array<{
    id: string;
    decision_type: string;
    basis: string | null;
    decided_at: string;
    officer: string;
  }>;
}

export interface InstrumentRow {
  id: string;
  facility_type: string;
  name: string;
  versions: Array<{
    id: string;
    version_label: string;
    status: "draft" | "in_force" | "superseded";
    effective_from: string | null;
    published_at: string | null;
    satisfactory_min: string;
    needs_improve_min: string;
    inspections_bound: number;
  }> | null;
}

export interface UserRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  created_at: string;
}

export interface DeviceRow {
  id: string;
  label: string | null;
  status: string;
  enrolled_at: string;
  revoked_at: string | null;
  assigned_to: string | null;
  public_key: string;
  events_authored: number;
}
