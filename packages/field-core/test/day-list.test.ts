import { describe, it, expect, beforeEach } from "vitest";
import { FieldInspection } from "../src/inspection";
import { applyBootstrap } from "../src/sync";
import type { FieldStore } from "../src/sqlite";
import {
  AT_THE_WAREHOUSE,
  FACILITY_ID,
  bootstrapBundle,
  freshStore,
  makeAuthor,
} from "./helpers";

// What the home screen reads. The reason a facility is on the list has to
// survive the trip from the supervisor's console to the handset: an inspector
// who is handed a list they cannot account for has no way to push back on it,
// which is the whole point of principle P6.

describe("today's list", () => {
  let store: FieldStore;
  let session: FieldInspection;

  beforeEach(() => {
    store = freshStore();
    applyBootstrap(store, bootstrapBundle());
    session = new FieldInspection(store, makeAuthor(store));
  });

  it("keeps the assignment reason the supervisor gave", () => {
    const [facility] = store.facilities();
    expect(facility.assignmentReason).toBe("Two findings from the last visit are still open.");
    expect(facility.assignmentKind).toBe("follow_up");
    expect(facility.dueBy).toBe("2026-09-30");
  });

  it("has nothing in progress before the day starts", () => {
    expect(store.openInspectionFor(FACILITY_ID)).toBeNull();
    expect(store.submittedInspectionFor(FACILITY_ID)).toBeNull();
  });

  it("offers to resume a visit the app was killed in the middle of", async () => {
    const { inspectionId, reference } = await session.start({
      facilityId: FACILITY_ID,
      jurisdictionCode: "KT",
      at: AT_THE_WAREHOUSE,
    });

    // A fresh FieldStore over the same database is what a relaunch looks like.
    expect(store.openInspectionFor(FACILITY_ID)).toEqual({ id: inspectionId, reference });
  });

  // A routine visit and a risk-targeted one can be scheduled against the same
  // site, which reaches the device as two assignments and one facility. That
  // used to crash sync on a UNIQUE constraint — the inspector's whole day
  // failing to load because a supervisor scheduled two visits.
  it("survives the same facility arriving on two assignments", () => {
    const bundle = bootstrapBundle();
    const [only] = bundle.facilities;
    bundle.facilities = [
      { ...only!, assignmentKind: "routine", assignmentReason: "Routine cycle." },
      { ...only!, assignmentKind: "risk_targeted", assignmentReason: "Certificate expires soon." },
    ];

    expect(() => applyBootstrap(store, bundle)).not.toThrow();

    const facilities = store.facilities();
    expect(facilities).toHaveLength(1);
    // The later assignment wins, and brings its reason with it.
    expect(facilities[0]!.assignmentReason).toBe("Certificate expires soon.");
  });
});
