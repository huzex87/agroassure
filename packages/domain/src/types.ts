// Shared vocabulary for AgroAssure. These enums are the ubiquitous language of
// the domain and must match the database CHECK constraints and the concept note.

export type FacilityType =
  | "agro_dealer"
  | "blending_plant"
  | "manufacturing"
  | "importer";

export type CheckpointResponse = "yes" | "no" | "na";

export type RatingBand = "satisfactory" | "needs_improvement" | "critical_issues";

export type FindingSeverity = "critical" | "major" | "minor";

export type FindingStatus =
  | "open"
  | "overdue"
  | "awaiting_verification"
  | "escalated"
  | "closed";

export type DecisionType =
  | "accept"
  | "request_clarification"
  | "direct_follow_up"
  | "escalate"
  | "authorise_certificate";

export type CertificateStatus = "valid" | "revoked" | "superseded";

export type AggregateType =
  | "inspection"
  | "finding"
  | "facility"
  | "decision"
  | "certificate"
  | "instrument_version";

export type Role =
  | "inspector"
  | "desk_supervisor"
  | "authorising_officer"
  | "state_admin"
  | "national_admin"
  | "auditor";

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
}
