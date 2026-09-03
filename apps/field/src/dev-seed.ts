import { uuidv7, type BootstrapBundle } from "@agroassure/domain";

// A day's work, without a server.
//
// The bootstrap bundle is ordinary data: the gateway builds one from the
// assignments a supervisor made, and the device stores it verbatim. That means a
// hand-built bundle exercises exactly the same code path as a real one — the
// same applyBootstrap, the same tables, the same instrument binding — and lets
// the field path be walked on a handset with no database anywhere near it.
//
// This exists to test the native side: SQLite writes, the camera, the GPS. It is
// reachable only from a __DEV__-guarded control on the visits screen, so it
// cannot appear in a release build. It is not a fixture for the test suite —
// those build their own — and nothing in the app depends on it.
//
// ponytail: the coordinates are a real place in Katsina so the check-in
// geofence has something meaningful to measure against. Stand anywhere else and
// the visit is flagged as far from the registered point, which is correct
// behaviour and worth seeing at least once.

const FACILITY_ID = "018f0000-0000-7000-8000-0000000000fa";
const VERSION_ID = "018f0000-0000-7000-8000-0000000000ve";

export function sampleBundle(): BootstrapBundle {
  return {
    facilities: [
      {
        id: FACILITY_ID,
        licenceNumber: "FISS/KT/AD/2026/0417",
        facilityType: "agro_dealer",
        name: "Rimin Zakara Agro Ventures Ltd",
        lga: "Katsina",
        regLat: 12.98547,
        regLng: 7.61893,
        regAccuracyM: 4,
        assignmentReason: "Two findings from the last visit are still open.",
        assignmentKind: "follow_up",
        dueBy: null,
      },
      {
        id: "018f0000-0000-7000-8000-0000000000fb",
        licenceNumber: "FISS/KT/AD/2026/0422",
        facilityType: "agro_dealer",
        name: "Danmarke Agro Supplies",
        lga: "Katsina",
        // No registered point: paper never recorded one for this site, which is
        // ordinary in the registry and must not break a check-in.
        regLat: null,
        regLng: null,
        regAccuracyM: null,
        assignmentReason: "Routine annual inspection.",
        assignmentKind: "routine",
        dueBy: null,
      },
    ],
    instrumentVersions: [
      {
        id: VERSION_ID,
        instrumentId: uuidv7(),
        facilityType: "agro_dealer",
        versionLabel: "v3.1",
        satisfactoryMin: 80,
        needsImprovementMin: 60,
        structureHash: "b7c9aa11",
        structure: {
          sections: [
            {
              ordinal: 1,
              titleEn: "Storage and handling",
              titleHa: "Ajiya da sarrafawa",
              checkpoints: [
                {
                  ordinal: 1,
                  promptEn: "Is fertilizer stored off the ground on pallets?",
                  promptHa: "An ajiye taki a kan katakon daga ƙasa?",
                  weight: 3,
                  severityOnFail: "major",
                  allowsNa: false,
                },
                {
                  ordinal: 2,
                  promptEn: "Are damaged bags segregated from saleable stock?",
                  promptHa: "An ware buhunan da suka lalace daga kayan sayarwa?",
                  weight: 2,
                  severityOnFail: "critical",
                  allowsNa: true,
                },
                {
                  ordinal: 3,
                  promptEn: "Is the store dry and free of standing water?",
                  promptHa: "Shagon ya bushe kuma babu tsayayyen ruwa?",
                  weight: 2,
                  severityOnFail: "major",
                  allowsNa: false,
                },
              ],
            },
            {
              ordinal: 2,
              titleEn: "Labelling and records",
              titleHa: "Lakabi da rikodi",
              checkpoints: [
                {
                  ordinal: 1,
                  promptEn: "Do bags carry an intact manufacturer's label?",
                  promptHa: "Buhunan suna da lakabin masana'anta cikakke?",
                  weight: 3,
                  severityOnFail: "critical",
                  allowsNa: false,
                },
                {
                  ordinal: 2,
                  promptEn: "Is the current licence displayed at the premises?",
                  promptHa: "An nuna lasisin yanzu a wurin kasuwanci?",
                  weight: 1,
                  severityOnFail: "minor",
                  allowsNa: false,
                },
              ],
            },
          ],
        },
      },
    ],
    priorFindings: [
      {
        id: "018f0000-0000-7000-8000-0000000000f1",
        facilityId: FACILITY_ID,
        reference: "CA-01184-03",
        summary: "Damaged stock not segregated from saleable bags.",
        severity: "critical",
        status: "open",
        dueDate: null,
      },
    ],
  };
}
