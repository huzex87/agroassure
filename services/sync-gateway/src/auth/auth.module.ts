import { Module } from "@nestjs/common";
import { InvitationsModule } from "../invitations/invitations.module";
import { EmailSignInController } from "./email-sign-in.controller";
import { EmailSignInService } from "./email-sign-in.service";

@Module({
  imports: [InvitationsModule],
  controllers: [EmailSignInController],
  providers: [EmailSignInService],
})
export class AuthModule {}
