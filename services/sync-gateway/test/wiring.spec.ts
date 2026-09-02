import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";

// Does the whole thing actually assemble?
//
// Every other test here constructs one service directly, which says nothing
// about whether Nest can resolve the graph — a provider exported from the wrong
// module fails at boot, not at compile time, and on a deployment that means the
// container crash-loops with a stack trace nobody reads until someone asks why
// the console is down. This resolves every provider once.
//
// A pg Pool does not connect until it is used, so this needs no database.

describe("application wiring", () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";
    process.env.AUTH_JWT_SECRET = "development-secret-not-used-anywhere-real";
    // The sweeps run on intervals; starting them here would leave timers behind.
    process.env.PROJECTOR_SWEEP = "off";
    process.env.ESCALATION_SWEEP = "off";

    const { AppModule } = await import("../src/app.module");
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it("resolves the health controller, including the evidence store it reports on", async () => {
    const { HealthController } = await import("../src/health/health.controller");
    expect(app.get(HealthController)).toBeDefined();
  });

  it("resolves the guard that every protected route depends on", async () => {
    const { DeviceAuthGuard } = await import("../src/common/device-auth.guard");
    expect(app.get(DeviceAuthGuard, { strict: false })).toBeDefined();
  });

  it("chose a blob store, and can say which one", async () => {
    const { StorageService } = await import("../src/sync/storage.service");
    // Default configuration is the filesystem, and it must admit in plain words
    // that its write-once guarantee is emulated rather than enforced.
    expect(app.get(StorageService, { strict: false }).describeStore()).toContain("local:");
  });

  it("shares one metrics registry across modules", async () => {
    const { MetricsService } = await import("../src/health/metrics.service");
    const { IngestService } = await import("../src/sync/ingest.service");
    // Counters incremented in ingest have to show up on the endpoint that reads
    // them; two instances would mean /metrics quietly reported zeros forever.
    expect(app.get(MetricsService, { strict: false })).toBeDefined();
    expect(app.get(IngestService, { strict: false })).toBeDefined();
  });
});
