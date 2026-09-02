import { createRequire } from "node:module";
import { FieldStore, type SqliteDriver } from "@agroassure/field-core";

// node:sqlite stands in for the device's SQLite driver, so the integration test
// drives the same store code the field app will. Required rather than imported
// because the test bundler resolves bare specifiers and node:sqlite is new
// enough not to be on its builtin list.

interface SqliteDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): void };
}

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDatabase;
};

export function nodeSqliteDriver(db: SqliteDatabase): SqliteDriver {
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

/** A fresh, migrated on-device store, in memory. */
export function nodeSqliteStore(): FieldStore {
  const store = new FieldStore(nodeSqliteDriver(new DatabaseSync(":memory:")));
  store.migrate();
  return store;
}
