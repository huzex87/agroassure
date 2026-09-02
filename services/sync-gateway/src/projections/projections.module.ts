import { Global, Module } from "@nestjs/common";
import { ProjectorService } from "./projector.service";
import { ProjectorScheduler } from "./projector.scheduler";

// Global so every module that appends an event can ask for projections to catch
// up immediately, without each of them wiring the projector in by hand.

@Global()
@Module({
  providers: [ProjectorService, ProjectorScheduler],
  exports: [ProjectorService],
})
export class ProjectionsModule {}
