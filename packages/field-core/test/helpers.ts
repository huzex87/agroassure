import { createRequire } from "node:module";
import {
  derivePublicKey,
  signEventHash,
  uuidv7,
  type FindingSeverity,
} from "@agroassure/domain";
import { EventAuthor, type Signer } from "../src/outbox";
import { FieldStore, type InstrumentStructure, type SqliteDriver } from "../src/sqlite";
import type { BootstrapBundle } from "../src/sync";

// node:sqlite stands in for the device driver. It is a real SQLite engine, so
// the schema, the constraints, and every statement in FieldStore are executed
// as written rather than mocked.

// Required rather than imported: the bundler that runs these tests resolves
// bare specifiers, and node:sqlite is new enough that it is not on its builtin
// list. Node itself has no such trouble.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): void };
}

export function nodeSqliteDriver(db: SqliteDatabase): SqliteDriver {
  return {
    run(sql, params = []) {
      const statement = db.prepare(sql);
      // node:sqlite refuses .all() on a non-returning statement.
      if (/^\s*(select|with|pragma)/i.test(sql)) {
        return statement.all(...(params as never[])) as Array<Record<string, unknown>>;
      }
      statement.run(...(params as never[]));
      return [];
    },
  };
}

export function freshStore(): FieldStore {
  const db = new DatabaseSync(":memory:");
  const store = new FieldStore(nodeSqliteDriver(db));
  store.migrate();
  return store;
}

// A deterministic device keypair, so a test can verify a signature it did not
// produce and the server side can be given a real public key.
export const DEVICE_PRIVATE_KEY = (() => {
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = (i * 13 + 7) & 0xff;
  return k;
})();

export const DEVICE_PUBLIC_KEY = derivePublicKey(DEVICE_PRIVATE_KEY);
export const DEVICE_ID = "018f0000-0000-7000-8000-0000000000dd";
export const INSPECTOR_ID = "018f0000-0000-7000-8000-000000000001";

export const testSigner: Signer = {
  deviceId: DEVICE_ID,
  sign: (hash) => signEventHash(hash, DEVICE_PRIVATE_KEY),
};

/** A clock that ticks a fixed amount per call, so ordering is deterministic. */
export function steppingClock(startMs = Date.UTC(2026, 7, 18, 9, 0, 0), stepMs = 1000) {
  let t = startMs;
  return () => {
    const now = t;
    t += stepMs;
    return now;
  };
}

export function makeAuthor(store: FieldStore, now = steppingClock()): EventAuthor {
  return new EventAuthor(store, testSigner, { actorUserId: INSPECTOR_ID, now });
}

export const FACILITY_ID = "018f0000-0000-7000-8000-0000000000fa";
export const VERSION_ID = "018f0000-0000-7000-8000-0000000000v1".replace("v1", "11");

/**
 * The Agro-Dealer Warehouse instrument as the guide describes it: 9 sections,
 * 41 checkpoints. Section 7 holds the equipment a small warehouse may not have,
 * so those checkpoints accept N/A and the others do not.
 */
export function agroDealerStructure(): InstrumentStructure {
  const sections = [];
  let remaining = 41;
  for (let s = 1; s <= 9; s++) {
    const count = s === 9 ? remaining : Math.min(5, remaining);
    remaining -= count;
    sections.push({
      ordinal: s,
      titleEn: `Section ${s}`,
      titleHa: `Sashe ${s}`,
      checkpoints: Array.from({ length: count }, (_, i) => ({
        ordinal: i + 1,
        promptEn: `Checkpoint ${s}.${i + 1}`,
        promptHa: `Bincike ${s}.${i + 1}`,
        weight: 1,
        severityOnFail: "minor" as FindingSeverity,
        allowsNa: s === 7,
      })),
    });
  }
  return { sections };
}

/** Every checkpoint reference on the instrument, in order. */
export function allRefs(structure: InstrumentStructure): string[] {
  return structure.sections.flatMap((s) =>
    s.checkpoints.map((c) => `${s.ordinal}.${c.ordinal}`),
  );
}

export function bootstrapBundle(
  structure: InstrumentStructure = agroDealerStructure(),
): BootstrapBundle {
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
        structure,
      },
    ],
    priorFindings: [],
  };
}

/** Where the warehouse actually is: a few metres from its registered point. */
export const AT_THE_WAREHOUSE = { lat: 12.98551, lng: 7.61887, accuracyM: 5 };
