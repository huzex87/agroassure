import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../app.module";
import { ProjectorService } from "../projections/projector.service";

// Runbook: rebuild a projection.
//
// Projections are derived, so this is a safe, ordinary operation rather than an
// incident: drop the read models and replay the event store. The event store is
// untouched, which is the whole point of keeping it as the system of record.
//
//   PROJECTOR_SWEEP=off node dist/cli/rebuild-projections.js

async function main(): Promise<void> {
  const log = new Logger("Rebuild");
  process.env.PROJECTOR_SWEEP = "off"; // no sweep racing the rebuild
  process.env.ESCALATION_SWEEP = "off";

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "error"] });
  try {
    const started = Date.now();
    const applied = await app.get(ProjectorService).rebuild();
    log.log(`rebuilt from ${applied} event(s) in ${Date.now() - started}ms`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("rebuild failed:", err);
  process.exit(1);
});
