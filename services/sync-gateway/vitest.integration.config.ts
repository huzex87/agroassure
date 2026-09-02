import { defineConfig } from "vitest/config";

// The integration suite is separate from the unit suite because it needs a
// disposable PostgreSQL and takes minutes rather than seconds. `pnpm test` stays
// fast and database-free; this runs in CI and on demand.

export default defineConfig({
  test: {
    include: ["test/integration/**/*.itest.ts"],
    environment: "node",
    testTimeout: 180_000,
    hookTimeout: 120_000,
    // One database, one story: the suite walks a single inspection forward, so
    // its tests must not run concurrently against each other.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
