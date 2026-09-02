import { Controller, Get, Header } from "@nestjs/common";
import { PgService } from "../db/pg.service";
import { ProjectorService } from "../projections/projector.service";
import { StorageService } from "../sync/storage.service";
import { MetricsService } from "./metrics.service";

// Operational health, distinct from the regulator dashboard: this one is about
// the platform, the other is about compliance in the field. Projection lag is
// here because it is the signal that the console is showing stale numbers while
// the event store is perfectly fine.

@Controller()
export class HealthController {
  constructor(
    private readonly pg: PgService,
    private readonly projector: ProjectorService,
    private readonly storage: StorageService,
    private readonly metrics: MetricsService,
  ) {}

  @Get("health")
  async health() {
    let db = "down";
    let projectionLag: number | null = null;
    try {
      await this.pg.query("SELECT 1");
      db = "up";
      projectionLag = await this.projector.lag();
    } catch {
      db = "down";
    }
    return {
      status: db === "up" ? "ok" : "degraded",
      db,
      projectionLag,
      // Says out loud whether exhibits are actually under object-lock or only
      // emulated, so nobody has to infer it from the deployment.
      evidenceStore: this.storage.describeStore(),
      time: new Date().toISOString(),
    };
  }

  @Get("metrics")
  @Header("content-type", "text/plain; version=0.0.4")
  async metricsEndpoint(): Promise<string> {
    let lag = -1;
    try {
      lag = await this.projector.lag();
    } catch {
      // Reported as -1 rather than omitted: a missing series looks like a
      // scrape problem, a negative one is visibly the database being unreachable.
    }
    return this.metrics.render({ projection_lag_events: lag });
  }
}
