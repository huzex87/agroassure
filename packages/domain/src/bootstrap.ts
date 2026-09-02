import type { FacilityType, FindingSeverity, FindingStatus } from "./types";

// The pre-departure bundle: everything an inspector needs for the day, fetched
// once before leaving. After this the day needs no network.
//
// These types live in the shared domain rather than on either side of the wire,
// because both ends must agree on them and neither owns them. The server
// returns a BootstrapBundle and the device consumes one, so a field left out or
// renamed is a type error at build time rather than an empty checklist in a
// warehouse with no signal.

export interface AssignedFacility {
  id: string;
  licenceNumber: string;
  facilityType: string;
  name: string;
  lga: string | null;
  /** The registered point, or null where paper never recorded one. */
  regLat: number | null;
  regLng: number | null;
  regAccuracyM: number | null;
  /** Why this facility is on today's list, in words (principle P6). */
  assignmentReason?: string | null;
  assignmentKind?: string | null;
  dueBy?: string | null;
}

/** A published instrument's frozen structure: what the inspector fills in. */
export interface InstrumentStructure {
  sections: Array<{
    ordinal: number;
    titleEn: string;
    titleHa: string;
    checkpoints: Array<{
      ordinal: number;
      promptEn: string;
      promptHa: string;
      weight: number;
      severityOnFail: FindingSeverity;
      allowsNa: boolean;
    }>;
  }>;
}

export interface BootstrapInstrumentVersion {
  id: string;
  instrumentId: string;
  facilityType: FacilityType | string;
  versionLabel: string;
  satisfactoryMin: number;
  needsImprovementMin: number;
  /** Hex. Bound into every inspection authored against this version. */
  structureHash: string;
  structure: InstrumentStructure;
}

export interface BootstrapPriorFinding {
  id: string;
  facilityId: string;
  reference: string;
  summary: string;
  severity: FindingSeverity | string;
  status: FindingStatus | string;
  dueDate: string | null;
}

export interface BootstrapBundle {
  facilities: AssignedFacility[];
  instrumentVersions: BootstrapInstrumentVersion[];
  priorFindings: BootstrapPriorFinding[];
}
