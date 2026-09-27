import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { DeviceAuthGuard, getPrincipal } from "../common/device-auth.guard";
import { Roles, RolesGuard } from "../common/rbac";
import { optionalString, requiredString, uuid } from "../common/validate";
import { InvitationsService } from "./invitations.service";
import { InviteDelivery } from "./delivery";

// Inviting people to the phone app, from the console.

@Controller("v1/invitations")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly delivery: InviteDelivery,
  ) {}

  @Get()
  @Roles("state_admin", "national_admin")
  list(@Req() req: Request) {
    return this.invitations.listOpen(getPrincipal(req));
  }

  /** Which channels this deployment can actually send on, for the invite form. */
  @Get("channels")
  @Roles("state_admin", "national_admin")
  channels() {
    return this.delivery.channels();
  }

  /** Add a new inspector and send them a code. */
  @Post()
  @Roles("state_admin", "national_admin")
  invite(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.invitations.invite(getPrincipal(req), {
      fullName: requiredString("fullName", body.fullName, 200),
      email: optionalString("email", body.email, 200),
      phone: optionalString("phone", body.phone, 40),
      jurisdictionId: body.jurisdictionId ? uuid("jurisdictionId", body.jurisdictionId) : undefined,
    });
  }

  /** A fresh code for someone already on the team. */
  @Post("resend/:userId")
  @Roles("state_admin", "national_admin")
  resend(@Req() req: Request, @Param("userId") userId: string) {
    return this.invitations.reinvite(getPrincipal(req), uuid("userId", userId));
  }

  @Post(":id/cancel")
  @Roles("state_admin", "national_admin")
  @HttpCode(200)
  async cancel(@Req() req: Request, @Param("id") id: string) {
    await this.invitations.cancel(getPrincipal(req), uuid("id", id));
    return { cancelled: true };
  }
}

/**
 * The phone's side: spend a code, receive a session.
 *
 * Open by necessity — the phone has no session until this answers — so it is
 * rate limited per source address. Wrong codes are the only thing that costs
 * an attempt from the budget that matters, but every attempt is counted: the
 * point is to make guessing slow, and a guesser's wrong codes and right codes
 * look the same until the answer comes back.
 */
@Controller("v1/auth")
export class ActivationController {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  static readonly WINDOW_MS = 15 * 60 * 1000;
  static readonly LIMIT = 10;

  constructor(private readonly invitations: InvitationsService) {}

  @Post("activate")
  @HttpCode(200)
  activate(@Req() req: Request, @Body() body: Record<string, unknown>) {
    if (!this.allow(req.ip ?? "unknown")) {
      throw new HttpException(
        { message: "Too many tries. Wait 15 minutes and try again.", reason: "rate_limited" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.invitations.activate({
      code: requiredString("code", body.code, 40),
      publicKeyBase64: requiredString("publicKeyBase64", body.publicKeyBase64, 200),
      label: optionalString("label", body.label, 120),
    });
  }

  /**
   * ponytail: a fixed window in process memory, like the public verify
   * surface. Correct for one instance; move to Redis before running two.
   */
  private allow(source: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(source);
    if (!entry || now > entry.resetAt) {
      if (this.attempts.size > 10_000) this.attempts.clear();
      this.attempts.set(source, { count: 1, resetAt: now + ActivationController.WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= ActivationController.LIMIT;
  }
}
