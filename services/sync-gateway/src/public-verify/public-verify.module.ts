import { Module } from "@nestjs/common";
import { PublicVerifyController } from "./public-verify.controller";
import { PublicVerifyService } from "./public-verify.service";

// Deliberately isolated: this module imports nothing from the domain or query
// modules, so it has no path to the projections that hold adverse data.

@Module({
  controllers: [PublicVerifyController],
  providers: [PublicVerifyService],
})
export class PublicVerifyModule {}
