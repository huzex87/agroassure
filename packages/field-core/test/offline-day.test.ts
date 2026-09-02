import { describe, it, expect, beforeEach } from "vitest";
import {
  computeEventHash,
  verifyEventSignature,
  type DeviceEvent,
} from "@agroassure/domain";
import { FieldInspection, InspectionError } from "../src/inspection";
import { toDeviceEvent } from "../src/outbox";
import { applyBootstrap } from "../src/sync";
import type { FieldStore } from "../src/sqlite";
import {
  AT_THE_WAREHOUSE,
  DEVICE_PUBLIC_KEY,
  FACILITY_ID,
  agroDealerStructure,
  allRefs,
  bootstrapBundle,
  freshStore,
  makeAuthor,
  INSPECTOR_ID,
} from "./helpers";

// A whole inspection, authored with no network. This is the test the phased
// roadmap exits Phase 1 on: an inspection completes offline, and what comes out
// of the outbox is a signed, unbroken chain.

describe("an offline day", () => {
  let store: FieldStore;
  let session: FieldInspection;

  beforeEach(() => {
    store = freshStore();
    applyBootstrap(store, bootstrapBundle());
    session = new FieldInspection(store, makeAuthor(store));
  });

  async function startAtTheWarehouse() {
    return session.start({
      facilityId: FACILITY_ID,
      jurisdictionCode: "KT",
      at: AT_THE_WAREHOUSE,
    });
  }

  it("binds the inspection to the instrument version in force and its structure hash", async () => {
    const { inspectionId, reference } = await startAtTheWarehouse();

    const row = store.inspection(inspectionId)!;
    expect(row.structure_hash).toBe("b7c9aa11");
    expect(row.status).toBe("in_progress");
    expect(reference).toMatch(/^INS-KT-\d{4}-[0-9A-F]{6}$/);
  });

  it("records a check-in near the registered point without flagging it", async () => {
    const { checkin } = await startAtTheWarehouse();
    expect(checkin.flagged).toBe(false);
    expect(checkin.distanceFromRegisteredM).toBeLessThan(20);
  });

  it("flags a check-in far from the registered point, and says how far", async () => {
    const { inspectionId, checkin } = await session.start({
      facilityId: FACILITY_ID,
      jurisdictionCode: "KT",
      at: { lat: 13.05, lng: 7.7, accuracyM: 8 }, // several km away
    });

    expect(checkin.flagged).toBe(true);
    expect(checkin.reason).toMatch(/check-in \d+m from the registered point/);
    // Flagged, never refused: the inspector is standing where they are standing.
    expect(store.inspection(inspectionId)!.checkin_flagged).toBe(1);
  });

  it("reproduces the guide's worked example: 32 yes, 5 no, 4 N/A", async () => {
    const { inspectionId } = await startAtTheWarehouse();
    const refs = allRefs(agroDealerStructure());
    expect(refs).toHaveLength(41);

    // The four N/A are the equipment this warehouse does not have, and they are
    // the only checkpoints on the instrument that accept N/A.
    const naRefs = refs.filter((r) => r.startsWith("7.")).slice(0, 4);
    const noRefs = refs.filter((r) => !naRefs.includes(r)).slice(0, 5);

    for (const ref of refs) {
      if (naRefs.includes(ref)) {
        await session.recordResponse(inspectionId, { checkpointRef: ref, response: "na" });
      } else if (noRefs.includes(ref)) {
        await session.recordResponse(inspectionId, {
          checkpointRef: ref,
          response: "no",
          remark: "Two bags on the north wall show moisture damage; wall damp to touch.",
        });
      } else {
        await session.recordResponse(inspectionId, { checkpointRef: ref, response: "yes" });
      }
    }

    const rating = session.rating(inspectionId);
    expect(rating.weightedAnswered).toBe(37); // the 4 N/A drop out of both sides
    expect(rating.weightedYes).toBe(32);
    expect(rating.ratingPercent).toBe(86.49);
    expect(rating.displayPercent).toBe(86);
    // Satisfactory overall, and still raising five findings.
    expect(rating.band).toBe("satisfactory");
    expect(session.provisionalFindings(inspectionId)).toHaveLength(5);
  });

  it("offers exactly three responses, and N/A only where the instrument allows it", async () => {
    const { inspectionId } = await startAtTheWarehouse();

    // Section 7 accepts N/A on this instrument; section 1 does not.
    await session.recordResponse(inspectionId, { checkpointRef: "7.1", response: "na" });
    await expect(
      session.recordResponse(inspectionId, { checkpointRef: "1.1", response: "na" }),
    ).rejects.toThrow(/does not accept N\/A/);
  });

  it("requires a remark on an adverse response", async () => {
    const { inspectionId } = await startAtTheWarehouse();

    await expect(
      session.recordResponse(inspectionId, { checkpointRef: "1.1", response: "no" }),
    ).rejects.toThrow(/needs a remark/);
    await expect(
      session.recordResponse(inspectionId, {
        checkpointRef: "1.1",
        response: "no",
        remark: "   ",
      }),
    ).rejects.toThrow(/needs a remark/);
  });

  it("refuses a checkpoint that is not on the bound version", async () => {
    const { inspectionId } = await startAtTheWarehouse();
    await expect(
      session.recordResponse(inspectionId, { checkpointRef: "99.1", response: "yes" }),
    ).rejects.toThrow(/not on this instrument version/);
  });

  it("binds an exhibit's hash, coordinates, and time together at capture", async () => {
    const { inspectionId } = await startAtTheWarehouse();
    const evidenceId = await session.captureEvidence(inspectionId, {
      checkpointRef: "2.3",
      sha256: "9c77af1",
      localUri: "file:///photos/2-3.jpg",
      mime: "image/jpeg",
      capturedAt: "2026-08-18T09:26:11Z",
      at: AT_THE_WAREHOUSE,
    });

    const event = store
      .pendingEvents()
      .map(toDeviceEvent)
      .find((e) => e.eventType === "EvidenceCaptured")!;
    const payload = event.payload as Record<string, unknown>;

    expect(payload.evidenceId).toBe(evidenceId);
    expect(payload.sha256).toBe("9c77af1");
    expect(payload.capturedAt).toBe("2026-08-18T09:26:11Z");
    expect(payload.point).toEqual(AT_THE_WAREHOUSE);
    // The metadata travels bound to the hash, in one event, so neither can
    // later be attached to a different file.
    expect(event.eventHash).toBe(computeEventHash(event));
  });

  it("corrects a No back to a Yes, and the finding simply stops existing", async () => {
    const { inspectionId } = await startAtTheWarehouse();

    await session.recordResponse(inspectionId, {
      checkpointRef: "1.1",
      response: "no",
      remark: "Roof leaking over the north bay.",
    });
    expect(session.provisionalFindings(inspectionId)).toHaveLength(1);

    await session.recordResponse(inspectionId, { checkpointRef: "1.1", response: "yes" });
    expect(session.provisionalFindings(inspectionId)).toHaveLength(0);

    // Both observations remain in the log; the correction sits next to what it
    // corrects rather than on top of it.
    const responses = store
      .pendingEvents()
      .filter((e) => e.event_type === "ResponseRecorded");
    expect(responses).toHaveLength(2);
  });

  it("will not sign off with checkpoints unanswered", async () => {
    const { inspectionId } = await startAtTheWarehouse();
    await session.recordResponse(inspectionId, { checkpointRef: "1.1", response: "yes" });

    await expect(
      session.submit(inspectionId, {
        inspectorUserId: INSPECTOR_ID,
        inspectorSignedAt: "2026-08-18T09:39:00Z",
        facilityRep: { name: "Aisha Bello", role: "Warehouse Manager", signedAt: "x" },
      }),
    ).rejects.toThrow(/40 checkpoint\(s\) unanswered/);
  });
});

describe("sign-off", () => {
  let store: FieldStore;
  let session: FieldInspection;
  let inspectionId: string;

  beforeEach(async () => {
    store = freshStore();
    applyBootstrap(store, bootstrapBundle());
    session = new FieldInspection(store, makeAuthor(store));
    ({ inspectionId } = await session.start({
      facilityId: FACILITY_ID,
      jurisdictionCode: "KT",
      at: AT_THE_WAREHOUSE,
    }));

    const refs = allRefs(agroDealerStructure());
    const naRefs = refs.filter((r) => r.startsWith("7.")).slice(0, 4);
    const noRefs = refs.filter((r) => !naRefs.includes(r)).slice(0, 5);
    for (const ref of refs) {
      if (naRefs.includes(ref)) {
        await session.recordResponse(inspectionId, { checkpointRef: ref, response: "na" });
      } else if (noRefs.includes(ref)) {
        await session.recordResponse(inspectionId, {
          checkpointRef: ref,
          response: "no",
          remark: `Adverse at ${ref}`,
        });
      } else {
        await session.recordResponse(inspectionId, { checkpointRef: ref, response: "yes" });
      }
    }
  });

  async function signOff() {
    return session.submit(inspectionId, {
      inspectorUserId: INSPECTOR_ID,
      inspectorSignedAt: "2026-08-18T09:39:00Z",
      facilityRep: {
        name: "Aisha Bello",
        role: "Warehouse Manager",
        signedAt: "2026-08-18T09:41:00Z",
      },
    });
  }

  it("captures the rating, the findings, and the dual signature with no network", async () => {
    const rating = await signOff();
    expect(rating.displayPercent).toBe(86);

    const row = store.inspection(inspectionId)!;
    expect(row.status).toBe("submitted");
    expect(row.rating_percent).toBe(86.49);
    expect(row.rating_band).toBe("satisfactory");
    expect(row.inspector_signed_at).toBe("2026-08-18T09:39:00Z");
    expect(row.facility_rep_name).toBe("Aisha Bello");
    expect(row.facility_signed_at).toBe("2026-08-18T09:41:00Z");
  });

  it("raises one finding per adverse response, each its own aggregate", async () => {
    await signOff();
    const findings = store.pendingEvents().filter((e) => e.event_type === "FindingRaised");

    expect(findings).toHaveLength(5);
    expect(new Set(findings.map((f) => f.aggregate_id)).size).toBe(5);
    for (const f of findings) {
      expect(f.aggregate_type).toBe("finding");
      expect(f.seq).toBe(1);
      const payload = JSON.parse(f.payload_json) as Record<string, string>;
      expect(payload.inspectionId).toBe(inspectionId);
      expect(payload.reference).toMatch(/^CA-[0-9A-F]{6}-\d{2}$/);
      expect(payload.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("refuses a second sign-off: a correction is a new inspection, not an edit", async () => {
    await signOff();
    await expect(signOff()).rejects.toThrow(InspectionError);
    await expect(signOff()).rejects.toThrow(/already been submitted/);
  });

  it("leaves an outbox that is one unbroken, signed chain", async () => {
    await signOff();
    const events = store.pendingEvents(1000).map(toDeviceEvent);

    // 1 start + 41 responses + 5 findings + 1 submit
    expect(events).toHaveLength(48);
    expect(store.pendingCount()).toBe(48);

    let previous: string | null = null;
    for (const [index, event] of events.entries()) {
      expect(event.prevHash, `event ${index} links to the one before it`).toBe(previous);
      expect(computeEventHash(event), `event ${index} hash matches its content`).toBe(
        event.eventHash,
      );
      expect(
        verifyEventSignature(event.eventHash, event.deviceSig, DEVICE_PUBLIC_KEY),
        `event ${index} is signed by this device`,
      ).toBe(true);
      previous = event.eventHash;
    }
  });

  it("orders the chain by HLC, which is the order it must be verified in", async () => {
    await signOff();
    const events = store.pendingEvents(1000).map(toDeviceEvent);
    const stamps = events.map((e) => e.hlc);
    expect([...stamps].sort()).toEqual(stamps); // HLC stamps sort lexically
  });

  it("detects tampering with a stored event", async () => {
    await signOff();
    const events = store.pendingEvents(1000).map(toDeviceEvent);
    const tampered: DeviceEvent = {
      ...events[10]!,
      payload: { checkpointRef: "1.1", response: "yes" },
    };
    expect(computeEventHash(tampered)).not.toBe(tampered.eventHash);
  });
});
