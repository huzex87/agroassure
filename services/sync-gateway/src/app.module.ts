import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module";
import { EventsModule } from "./events/events.module";
import { ProjectionsModule } from "./projections/projections.module";
import { SyncModule } from "./sync/sync.module";
import { ConsoleModule } from "./console/console.module";
import { PublicVerifyModule } from "./public-verify/public-verify.module";
import { WorkersModule } from "./workers/workers.module";
import { HealthController } from "./health/health.controller";

// A modular monolith, deliberately: the domain is coherent, the transaction
// boundaries are natural, and a public institution can operate and audit this
// far more easily than a sprawl of services. The module boundaries are still
// real, and the one that matters most is PublicVerifyModule, which imports
// nothing from the others and reads its own narrow view under its own role.

@Module({
  imports: [
    DbModule,
    ProjectionsModule,
    EventsModule,
    SyncModule,
    ConsoleModule,
    PublicVerifyModule,
    WorkersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
