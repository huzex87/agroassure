import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ProjectorService } from "./projector.service";

// Command handlers ask the projector to catch up as soon as they append, so the
// console reads its own writes. This sweep is the safety net for everything
// else: events appended by another process, a replica, or a run that crashed
// between the append and the apply.
//
// ponytail: a single in-process interval. If the app tier is ever scaled beyond
// one replica, move this to a dedicated worker process holding an advisory lock,
// so two replicas do not project the same batch concurrently.

const SWEEP_MS = 5_000;

@Injectable()
export class ProjectorScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ProjectorSweep");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly projector: ProjectorService) {}

  onModuleInit(): void {
    if (process.env.PROJECTOR_SWEEP === "off") return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep(): Promise<void> {
    if (this.running) return; // never overlap a slow sweep with the next tick
    this.running = true;
    try {
      const n = await this.projector.applyPending();
      if (n > 0) this.logger.log(`applied ${n} event(s)`);
    } catch (err) {
      this.logger.error(err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
    }
  }
}
