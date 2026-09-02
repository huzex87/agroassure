import type {
  AggregateType,
  CheckpointResponse,
  DecisionType,
  FacilityType,
  FindingSeverity,
  GeoPoint,
  RatingBand,
} from "./types";

// An event is an immutable, attributed, hash-chained fact. Field events are
// authored and signed on a device; server events are authored by the API.
//
// The "signable" fields are everything except the signature itself. Both the
// device and the server compute the event hash over exactly these fields via
// canonicalize(), so a device signature can be verified on the server without
// ambiguity.

export interface EventSignable {
  eventId: string; // UUIDv7
  aggregateType: AggregateType;
  aggregateId: string;
  seq: number; // per-aggregate, gap-free, starts at 1
  eventType: string;
  payload: unknown;
  hlc: string; // HLC stamp
  prevHash: string | null; // hex of previous event_hash on this device chain
  deviceId: string | null; // present for device-authored events
  actorUserId: string | null; // acting user (may be null for system events)
}

export interface DeviceEvent extends EventSignable {
  eventHash: string; // hex sha256 over canonicalize(signable)
  deviceSig: string; // base64 ed25519 signature over eventHash bytes
}

// -------- Concrete payload types (device-authored) --------

export interface InspectionStartedPayload {
  reference: string;
  facilityId: string;
  instrumentVersionId: string;
  structureHash: string; // hex; binds the inspection to the version in force
  checkin: {
    point: GeoPoint;
    distanceFromRegisteredM: number;
    flagged: boolean;
  };
}

export interface ResponseRecordedPayload {
  checkpointRef: string; // e.g. "2.3"
  response: CheckpointResponse;
  remark?: string;
  evidenceIds?: string[];
}

export interface EvidenceCapturedPayload {
  evidenceId: string;
  checkpointRef: string;
  sha256: string; // hex, computed at capture
  mime: string;
  capturedAt: string; // ISO 8601 from device clock
  point: GeoPoint;
}

export interface InspectionSubmittedPayload {
  ratingPercent: number;
  ratingBand: RatingBand;
  findingsCount: number;
  inspector: { userId: string; signedAt: string };
  facilityRep: { name: string; role: string; signedAt: string };
}

// -------- Concrete payload types (server-authored) --------

export interface FindingRaisedPayload {
  reference: string;
  inspectionId: string;
  checkpointRef: string;
  summary: string;
  severity: FindingSeverity;
  ownerLabel?: string;
  ownerUserId?: string;
  dueDate?: string; // ISO date
}

export interface FindingEscalatedPayload {
  at: string;
  to: string; // e.g. "desk_supervisor"
  reason: string;
}

export interface CertificateAuthorisedPayload {
  facilityId: string;
  inspectionId: string;
  decisionId: string;
  authorisingOfficerId: string;
  serial: string;
  verificationToken: string;
  issuedOn: string;
  validTo: string;
  nextDueOn: string;
}

export interface FacilityRegisteredPayload {
  jurisdictionId: string;
  licenceNumber: string;
  facilityType: FacilityType;
  name: string;
  ownerContact?: Record<string, unknown>;
  address?: Record<string, unknown>;
  lga?: string;
  registeredPoint?: GeoPoint;
}

export type FacilityUpdatedPayload = Partial<FacilityRegisteredPayload>;

export interface DecisionRecordedPayload {
  decisionId: string;
  inspectionId: string;
  officerId: string;
  decisionType: DecisionType;
  basis?: string;
  decidedAt: string;
}

export interface FindingClosurePayload {
  at: string;
  note?: string;
  evidenceIds?: string[];
}

export interface FindingClosedPayload {
  at: string;
  verifiedByUserId: string;
}

export interface CertificateRevokedPayload {
  at: string;
  revokedByUserId: string;
  reason: string;
}

// Convenience registry of event type strings.
export const EVENT_TYPES = {
  InspectionStarted: "InspectionStarted",
  ResponseRecorded: "ResponseRecorded",
  EvidenceCaptured: "EvidenceCaptured",
  InspectionSubmitted: "InspectionSubmitted",
  FacilityRegistered: "FacilityRegistered",
  FacilityUpdated: "FacilityUpdated",
  FindingRaised: "FindingRaised",
  FindingBecameOverdue: "FindingBecameOverdue",
  FindingEscalated: "FindingEscalated",
  FindingClosureSubmitted: "FindingClosureSubmitted",
  FindingClosed: "FindingClosed",
  DecisionRecorded: "DecisionRecorded",
  CertificateAuthorised: "CertificateAuthorised",
  CertificateRevoked: "CertificateRevoked",
} as const;

export type EventTypeName = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
