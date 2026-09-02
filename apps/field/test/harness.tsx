import { createRequire } from "node:module";
import {
  EventAuthor,
  FieldInspection,
  FieldStore,
  applyBootstrap,
  type SqliteDriver,
} from "@agroassure/field-core";
import {
  derivePublicKey,
  signEventHash,
  uuidv7,
  type BootstrapBundle,
} from "@agroassure/domain";

// The screens, over the real device core.
//
// Only the native edges are replaced — the camera, the GPS, the keystore, the
// network. The database underneath is a real SQLite engine and the rules are the
// real FieldInspection, so a screen test here exercises the same code that runs
// in a warehouse. Mocking field-core instead would have these tests agree with
// whatever the screens happen to do.

const nodeRequire = createRequire(__filename);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): void };
}

function driver(db: SqliteDatabase): SqliteDriver {
  return {
    run(sql, params = []) {
      const statement = db.prepare(sql);
      if (/^\s*(select|with|pragma)/i.test(sql)) {
        return statement.all(...(params as never[])) as Array<Record<string, unknown>>;
      }
      statement.run(...(params as never[]));
      return [];
    },
  };
}

export const INSPECTOR_ID = "018f1000-0000-7000-8000-000000000001";
export const DEVICE_ID = "018f0000-0000-7000-8000-0000000000dd";
export const FACILITY_ID = "018f0000-0000-7000-8000-0000000000fa";
export const VERSION_ID = "018f0000-0000-7000-8000-0000000000ve";

const PRIVATE_KEY = (() => {
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = (i * 13 + 7) & 0xff;
  return k;
})();

export const DEVICE_PUBLIC_KEY = derivePublicKey(PRIVATE_KEY);

export const AT_THE_WAREHOUSE = { lat: 12.98551, lng: 7.61897, accuracyM: 5 };

export function bundle(): BootstrapBundle {
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
        dueBy: "2026-09-30",
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
              ],
            },
          ],
        },
      },
    ],
    priorFindings: [],
  };
}

export interface Harness {
  store: FieldStore;
  inspection: FieldInspection;
  inspectorId: string;
}

/** A device that has been enrolled and has already collected its day. */
export function harness(): Harness {
  const store = new FieldStore(driver(new DatabaseSync(":memory:")));
  store.migrate();
  applyBootstrap(store, bundle());

  const author = new EventAuthor(
    store,
    { deviceId: DEVICE_ID, sign: (hash) => signEventHash(hash, PRIVATE_KEY) },
    { actorUserId: INSPECTOR_ID },
  );
  return { store, inspection: new FieldInspection(store, author), inspectorId: INSPECTOR_ID };
}
