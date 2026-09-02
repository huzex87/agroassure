import { Global, Module } from "@nestjs/common";
import { PgService } from "./pg.service";
import { CONFIG, loadConfig } from "../config/config";

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    PgService,
  ],
  exports: [PgService, CONFIG],
})
export class DbModule {}
