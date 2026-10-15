import { uuidv7, type BootstrapBundle } from "@agroassure/domain";

// A day's work, without a server. __DEV__ only.

const FACILITY_ID = "018f0000-0000-7000-8000-0000000000fa";
const VERSION_ID = "018f0000-0000-7000-8000-0000000000ve";

export function sampleBundle(): BootstrapBundle {
  return {
    jurisdictionCode: "KT",
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
                  promptEn: "Is the storage area dry and free of leaks?",
                  promptHa: "Wurin ajiya ya bushe kuma babu zubewa?",
                  weight: 2,
                  severityOnFail: "major",
                  allowsNa: false,
                },
                {
                  ordinal: 3,
                  promptEn: "Are different products clearly separated and labelled?",
                  promptHa: "An raba kayayyaki daban-daban da alama?",
                  weight: 2,
                  severityOnFail: "minor",
                  allowsNa: false,
                },
              ],
            },
            {
              ordinal: 2,
              titleEn: "Documentation",
              titleHa: "Takardu",
              checkpoints: [
                {
                  ordinal: 1,
                  promptEn: "Is a current licence displayed on the premises?",
                  promptHa: "Ana nuna lasisi na yanzu a shagon?",
                  weight: 3,
                  severityOnFail: "critical",
                  allowsNa: false,
                },
                {
                  ordinal: 2,
                  promptEn: "Are purchase and sales records kept up to date?",
                  promptHa: "Ana kiyaye bayanan saye da sayarwa?",
                  weight: 2,
                  severityOnFail: "major",
                  allowsNa: false,
                },
              ],
            },
          ],
        },
      },
    ],
    priorFindings: [],
  };
}
