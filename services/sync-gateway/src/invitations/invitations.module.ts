import { Module } from "@nestjs/common";
import { ActivationController, InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";
import { InviteDelivery } from "./delivery";

@Module({
  controllers: [InvitationsController, ActivationController],
  providers: [InvitationsService, InviteDelivery],
})
export class InvitationsModule {}
