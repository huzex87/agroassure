import {
  DEFAULT_SLA,
  dueDateFor,
  scoreInspection,
  uuidv7,
  type CheckpointResponse,
  type EvidenceCapturedPayload,
  type FindingRaisedPayload,
  type FindingSeverity,
  type GeoPoint,
  type InspectionStartedPayload,
  type InspectionSubmittedPayload,
  type RatingResult,
  type ResponseRecordedPayload,
} from "@agroassure/domain";
import { evaluateCheckin, type CheckinResult } from "./geo";
import type { EventAuthor } from "./outbox";
import type { FieldStore, InstrumentStructure } from "./sqlite";

// One visit, authored offline. Every rule the paper instrument imposes is
// enforced here — three responses and no more, a remark required on an adverse
// answer, N/A only where the instrument allows it — because departing from the
// instrument would mean the record no longer says what the regulator's form says.

export class InspectionError extends Error {}

export interface StartInspectionInput {
  facilityId: string;
  jurisdictionCode: string;
  at: GeoPoint;
  geofenceM?: number;
}

export interface RecordResponseInput {
  checkpointRef: string;
  response: CheckpointResponse;
  remark?: string;
  evidenceIds?: string[];
}

export interface CaptureEvidenceInput {
  checkpointRef: string;
  /** Computed over the exact bytes at the instant of capture, never later. */
  sha256: string;
  localUri: string;
  mime: string;
  capturedAt: string;
  at: GeoPoint;
}

export interface SubmitInput {
  inspectorUserId: string;
  inspectorSignedAt: string;
  facilityRep: { name: string; role: string; signedAt: string };
}

export interface StartedInspection {
  inspectionId: string;
  reference: string;
  checkin: CheckinResult;
}

interface CheckpointSpec {
  weight: number;
  severityOnFail: FindingSeverity;
  allowsNa: boolean;
  promptEn: string;
}

export class FieldInspection {
  constructor(
    private readonly store: FieldStore,
    private readonly author: EventAuthor,
  ) {}

  /**
   * Begin a visit. The inspection binds here to the instrument version the
   * device holds and to that version's structure hash, and from this moment its
   * meaning is fixed whatever happens to the instrument afterwards.
   */
  async start(input: StartInspectionInput): Promise<StartedInspection> {
    const facility = this.store.facility(input.facilityId);
    if (!facility) throw new InspectionError("facility is not in the bootstrap bundle");

    const version = this.store.instrumentVersionForType(facility.facilityType);
    if (!version) {
      throw new InspectionError(`no instrument in force for ${facility.facilityType}`);
    }

    const registered =
      facility.regLat === null || facility.regLng === null
        ? null
        : { lat: facility.regLat, lng: facility.regLng };
    const checkin = evaluateCheckin(input.at, registered, input.geofenceM);

    const inspectionId = uuidv7();
    // A sequential reference cannot be minted offline without two devices
    // colliding on it, so the suffix comes from the inspection id. It is unique,
    // stable, and legible; the console can present a tidier number if the
    // regulator wants one, without the device having to guess it.
    const reference = `INS-${input.jurisdictionCode.toUpperCase()}-${new Date()
      .getUTCFullYear()
      .toString()}-${inspectionId.slice(-6).toUpperCase()}`;

    this.store.insertInspection({
      id: inspectionId,
      reference,
      facilityId: facility.id,
      instrumentVersionId: version.id,
      structureHash: version.structureHash,
      checkinLat: input.at.lat,
      checkinLng: input.at.lng,
      checkinAccuracyM: input.at.accuracyM ?? null,
      checkinDistanceM: checkin.distanceFromRegisteredM,
      checkinFlagged: checkin.flagged,
    });

    const payload: InspectionStartedPayload = {
      reference,
      facilityId: facility.id,
      instrumentVersionId: version.id,
      structureHash: version.structureHash,
      checkin: {
        point: input.at,
        distanceFromRegisteredM: checkin.distanceFromRegisteredM,
        flagged: checkin.flagged,
      },
    };
    await this.author.author("inspection", inspectionId, "InspectionStarted", payload);

    return { inspectionId, reference, checkin };
  }

  /**
   * Answer one checkpoint. Selecting No expands the checkpoint in place: the
   * remark becomes required and the camera is offered, which is what turns a
   * subjective note into an evidenced finding at the moment of observation.
   */
  async recordResponse(inspectionId: string, input: RecordResponseInput): Promise<void> {
    const spec = this.checkpoint(inspectionId, input.checkpointRef);

    if (input.response === "na" && !spec.allowsNa) {
      throw new InspectionError(
        `checkpoint ${input.checkpointRef} does not accept N/A on this instrument`,
      );
    }
    if (input.response === "no" && !input.remark?.trim()) {
      throw new InspectionError(
        `checkpoint ${input.checkpointRef}: an adverse response needs a remark`,
      );
    }

    const payload: ResponseRecordedPayload = {
      checkpointRef: input.checkpointRef,
      response: input.response,
      remark: input.remark?.trim() || undefined,
      evidenceIds: input.evidenceIds?.length ? input.evidenceIds : undefined,
    };
    const event = await this.author.author(
      "inspection",
      inspectionId,
      "ResponseRecorded",
      payload,
    );

    this.store.upsertResponse(inspectionId, {
      id: event.eventId,
      checkpointRef: input.checkpointRef,
      response: input.response,
      remark: payload.remark ?? null,
      weight: spec.weight,
      recordedHlc: event.hlc,
    });
  }

  /**
   * Record an exhibit. The hash is computed over the bytes at capture and the
   * coordinates and time are bound to that hash here, once. They are never
   * re-derived, so the metadata cannot later be attached to a different file and
   * the file cannot later claim different coordinates.
   */
  async captureEvidence(inspectionId: string, input: CaptureEvidenceInput): Promise<string> {
    this.checkpoint(inspectionId, input.checkpointRef); // reject an unknown checkpoint
    const evidenceId = uuidv7();

    this.store.insertEvidence({
      evidenceId,
      inspectionId,
      checkpointRef: input.checkpointRef,
      sha256: input.sha256,
      localUri: input.localUri,
      mime: input.mime,
      capturedAt: input.capturedAt,
      lat: input.at.lat,
      lng: input.at.lng,
      accuracyM: input.at.accuracyM ?? null,
    });

    const payload: EvidenceCapturedPayload = {
      evidenceId,
      checkpointRef: input.checkpointRef,
      sha256: input.sha256,
      mime: input.mime,
      capturedAt: input.capturedAt,
      point: input.at,
    };
    await this.author.author("inspection", inspectionId, "EvidenceCaptured", payload);
    return evidenceId;
  }

  /**
   * The running compliance figure at the top of the checklist, computed on
   * device from the same function the server verifies with, so it is correct
   * with no network and does not move when the inspection reaches the console.
   */
  rating(inspectionId: string): RatingResult {
    const version = this.version(inspectionId);
    return scoreInspection(
      this.store.responses(inspectionId).map((r) => ({ weight: r.weight, response: r.response })),
      this.provisionalFindings(inspectionId).map((f) => ({ severity: f.severity, open: true })),
      {
        satisfactoryMin: version.satisfactoryMin,
        needsImprovementMin: version.needsImprovementMin,
      },
    );
  }

  /**
   * The findings this inspection would raise as it stands. They are derived
   * from the adverse responses rather than tracked separately, so correcting a
   * No back to a Yes before sign-off simply removes the finding: nothing was
   * observed, so nothing needs withdrawing. The observation itself — the remark
   * and the exhibit, captured at the moment it was seen — is already in the
   * event log either way.
   */
  provisionalFindings(inspectionId: string): Array<{
    checkpointRef: string;
    severity: FindingSeverity;
    summary: string;
  }> {
    return this.store
      .responses(inspectionId)
      .filter((r) => r.response === "no")
      .sort((a, b) => compareRefs(a.checkpointRef, b.checkpointRef))
      .map((r) => {
        const spec = this.checkpoint(inspectionId, r.checkpointRef);
        return {
          checkpointRef: r.checkpointRef,
          severity: spec.severityOnFail,
          summary: r.remark ?? spec.promptEn,
        };
      });
  }

  /** Every checkpoint on the instrument that has not been answered yet. */
  unanswered(inspectionId: string): string[] {
    const answered = new Set(this.store.responses(inspectionId).map((r) => r.checkpointRef));
    const refs: string[] = [];
    for (const section of this.version(inspectionId).structure.sections) {
      for (const checkpoint of section.checkpoints) {
        const ref = `${section.ordinal}.${checkpoint.ordinal}`;
        if (!answered.has(ref)) refs.push(ref);
      }
    }
    return refs;
  }

  /**
   * Sign off. The rating, the findings, and the dual signature are all captured
   * and held on the device with no connection; nothing is lost if the signal
   * never comes today.
   */
  async submit(inspectionId: string, input: SubmitInput): Promise<RatingResult> {
    const inspection = this.store.inspection(inspectionId);
    if (!inspection) throw new InspectionError("unknown inspection");
    if (inspection.status === "submitted") {
      // An inspection is immutable once submitted. A correction is a new
      // inspection, never an edit of this one.
      throw new InspectionError("this inspection has already been submitted");
    }

    const missing = this.unanswered(inspectionId);
    if (missing.length > 0) {
      throw new InspectionError(
        `${missing.length} checkpoint(s) unanswered: ${missing.slice(0, 5).join(", ")}` +
          (missing.length > 5 ? ", ..." : ""),
      );
    }

    const rating = this.rating(inspectionId);
    const findings = this.provisionalFindings(inspectionId);
    const raisedOn = new Date(input.inspectorSignedAt);

    // Each finding is its own aggregate, authored onto the same device chain.
    for (const [index, finding] of findings.entries()) {
      const payload: FindingRaisedPayload = {
        reference: `CA-${String(inspection.reference).slice(-6)}-${String(index + 1).padStart(2, "0")}`,
        inspectionId,
        checkpointRef: finding.checkpointRef,
        summary: finding.summary,
        severity: finding.severity,
        dueDate: dueDateFor(finding.severity, raisedOn, DEFAULT_SLA).toISOString().slice(0, 10),
      };
      await this.author.author("finding", uuidv7(), "FindingRaised", payload);
    }

    const payload: InspectionSubmittedPayload = {
      ratingPercent: rating.ratingPercent,
      ratingBand: rating.band,
      findingsCount: findings.length,
      inspector: { userId: input.inspectorUserId, signedAt: input.inspectorSignedAt },
      facilityRep: {
        name: input.facilityRep.name,
        role: input.facilityRep.role,
        signedAt: input.facilityRep.signedAt,
      },
    };
    await this.author.author("inspection", inspectionId, "InspectionSubmitted", payload);

    this.store.markSubmitted(
      inspectionId,
      { percent: rating.ratingPercent, band: rating.band },
      {
        inspectorSignedAt: input.inspectorSignedAt,
        repName: input.facilityRep.name,
        repSignedAt: input.facilityRep.signedAt,
      },
      input.facilityRep.signedAt,
    );

    return rating;
  }

  // ---- instrument lookups -------------------------------------------------

  private version(inspectionId: string) {
    const inspection = this.store.inspection(inspectionId);
    if (!inspection) throw new InspectionError("unknown inspection");
    const version = this.store.instrumentVersion(String(inspection.instrument_version_id));
    if (!version) throw new InspectionError("the bound instrument version is not on this device");
    return version;
  }

  private checkpoint(inspectionId: string, ref: string): CheckpointSpec {
    const found = findCheckpoint(this.version(inspectionId).structure, ref);
    if (!found) {
      throw new InspectionError(`checkpoint ${ref} is not on this instrument version`);
    }
    return found;
  }
}

function findCheckpoint(
  structure: InstrumentStructure,
  ref: string,
): CheckpointSpec | null {
  const [sectionPart, checkpointPart] = ref.split(".");
  const sectionOrdinal = Number(sectionPart);
  const checkpointOrdinal = Number(checkpointPart);
  if (!Number.isInteger(sectionOrdinal) || !Number.isInteger(checkpointOrdinal)) return null;

  const section = structure.sections.find((s) => s.ordinal === sectionOrdinal);
  const checkpoint = section?.checkpoints.find((c) => c.ordinal === checkpointOrdinal);
  if (!checkpoint) return null;

  return {
    weight: checkpoint.weight,
    severityOnFail: checkpoint.severityOnFail,
    allowsNa: checkpoint.allowsNa,
    promptEn: checkpoint.promptEn,
  };
}

/** "2.10" sorts after "2.9", which a string comparison would get wrong. */
function compareRefs(a: string, b: string): number {
  const [as = "0", ac = "0"] = a.split(".");
  const [bs = "0", bc = "0"] = b.split(".");
  return Number(as) - Number(bs) || Number(ac) - Number(bc);
}
