import { Controller, Get } from "@nestjs/common";
import { PgService } from "../db/pg.service";
import { ProjectorService } from "../projections/projector.service";

// Operational health, distinct from the regulator dashboard: this one is about
// the platform, the other is about compliance in the field. Projection lag is
// here because it is the signal that the console is showing stale numbers while
// the event store is perfectly fine.

@Controller("health")
export class HealthController {
  constructor(
    private readonly pg: PgService,
    private readonly projector: ProjectorService,
  ) {}

  @Get()
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
      time: new Date().toISOString(),
    };
  }
}
