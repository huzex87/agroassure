import * as SQLite from "expo-sqlite";
import { FieldStore, type SqliteDriver } from "@agroassure/field-core";

// The device's store. field-core holds every rule; this file is only the
// adapter between it and expo-sqlite, which is why the rules are testable on a
// laptop and this file is the only part that needs a handset to exercise.

let database: SQLite.SQLiteDatabase | null = null;
let store: FieldStore | null = null;

function driver(db: SQLite.SQLiteDatabase): SqliteDriver {
  return {
    run(sql, params = []) {
      // expo-sqlite's synchronous API keeps authoring an event a single
      // uninterrupted step: an inspector's tap writes the outbox row before
      // anything can navigate away from the screen.
      if (/^\s*(select|with|pragma)/i.test(sql)) {
        return db.getAllSync(sql, params as SQLite.SQLiteBindValue[]) as Array<
          Record<string, unknown>
        >;
      }
      db.runSync(sql, params as SQLite.SQLiteBindValue[]);
      return [];
    },
  };
}

export function getStore(): FieldStore {
  if (store) return store;
  database = SQLite.openDatabaseSync("agroassure.db");
  database.execSync("PRAGMA journal_mode = WAL;");
  // Foreign keys are off by default in SQLite; the local schema does not rely
  // on them, and the outbox is append-only by discipline rather than by trigger.
  store = new FieldStore(driver(database));
  store.migrate();
  return store;
}
