import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EscalationService } from "./escalation.service";

// ponytail: the escalation sweep runs on an interval in this process. It is
// idempotent (a finding already overdue is not re-marked, an escalated finding
// is not re-escalated), so a duplicate run is harmless. Move it behind a queue
// or an advisory lock when the app tier runs more than one replica.

const SWEEP_MS = 15 * 60 * 1000; // quarter-hourly is well inside a one-day SLA

@Injectable()
class EscalationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("EscalationSweep");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly escalation: EscalationService) {}

  onModuleInit(): void {
    if (process.env.ESCALATION_SWEEP === "off") return;
    this.timer = setInterval(() => void this.run(), SWEEP_MS);
    this.timer.unref();
    void this.run(); // one sweep at boot so a restart never skips a window
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.escalation.sweep();
    } catch (err) {
      this.logger.error(err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
    }
  }
}

@Module({
  providers: [EscalationService, EscalationScheduler],
  exports: [EscalationService],
})
export class WorkersModule {}
