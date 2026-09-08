import { createRequire } from "node:module";
import { FieldStore, type SqliteDriver } from "@agroassure/field-core";

// The device's own store, in memory, so the demo seeder authors its events
// through exactly the code a handset runs rather than a stand-in for it. Same
// driver shape the integration suite uses.
//
// node:sqlite is required rather than imported because this service compiles to
// CommonJS, and createRequire is anchored to __filename for the same reason —
// import.meta does not exist in the output.

interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): void };
}

const nodeRequire = createRequire(__filename);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

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

/** A fresh, migrated on-device store. */
export function nodeSqliteStore(): FieldStore {
  const store = new FieldStore(driver(new DatabaseSync(":memory:")));
  store.migrate();
  return store;
}
