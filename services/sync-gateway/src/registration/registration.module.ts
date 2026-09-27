import { Module } from "@nestjs/common";
import { InvitationsModule } from "../invitations/invitations.module";
import { RegisterController, RegistrationsController } from "./registration.controller";
import { RegistrationService } from "./registration.service";
import { FirstAdminService } from "./first-admin.service";

@Module({
  imports: [InvitationsModule],
  controllers: [RegisterController, RegistrationsController],
  providers: [RegistrationService, FirstAdminService],
})
export class RegistrationModule {}
