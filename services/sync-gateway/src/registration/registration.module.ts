import { Module } from "@nestjs/common";
import { InvitationsModule } from "../invitations/invitations.module";
import { RegisterController, RegistrationsController } from "./registration.controller";
import { RegistrationService } from "./registration.service";

@Module({
  imports: [InvitationsModule],
  controllers: [RegisterController, RegistrationsController],
  providers: [RegistrationService],
})
export class RegistrationModule {}
