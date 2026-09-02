import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../app.module";
import { EscalationService } from "../workers/escalation.service";

// Runbook: run the escalation sweep once, out of band.
//
// The app tier sweeps on its own schedule; this exists for the case where the
// sweep was down for a window and an operator wants to catch up deliberately,
// and for deployments that prefer to drive it from cron rather than in-process.
//
//   ESCALATION_SWEEP=off node dist/cli/escalate.js

async function main(): Promise<void> {
  const log = new Logger("EscalateOnce");
  process.env.ESCALATION_SWEEP = "off"; // do not also start the interval
  process.env.PROJECTOR_SWEEP = "off";

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "error"] });
  try {
    const result = await app.get(EscalationService).sweep();
    log.log(`marked ${result.markedOverdue} overdue, escalated ${result.escalated}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("escalation sweep failed:", err);
  process.exit(1);
});
