import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { Role } from "@agroassure/domain";
import { DeviceAuthGuard, getPrincipal } from "../common/device-auth.guard";
import { Roles, RolesGuard } from "../common/rbac";
import { oneOf, optionalString, requiredString, uuid } from "../common/validate";
import { APPROVABLE_ROLES, RegistrationService } from "./registration.service";

/**
 * A fixed window per key, in process memory, like the activation endpoint.
 * ponytail: correct for one instance; move to Redis before running two.
 */
export class Window {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || now > entry.resetAt) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

function slowDown(message: string): never {
  throw new HttpException({ message, reason: "rate_limited" }, HttpStatus.TOO_MANY_REQUESTS);
}

/**
 * The registrant's side. Open by necessity — they have no account yet — so
 * every route is rate limited, and every route after the first needs the
 * status token that only the registrant was given.
 *
 * The limits that matter are per phone number and per email address: they are
 * what stop someone using this form to flood a stranger with codes. The limit
 * per source address is only a ceiling, and a generous one, because the
 * console asks on behalf of everyone who registers on the website — from the
 * gateway's side all of them share the console server's address.
 */
@Controller("v1/register")
export class RegisterController {
  private readonly startsPerIp = new Window(30, 60 * 60 * 1000);
  private readonly startsPerPhone = new Window(3, 60 * 60 * 1000);
  private readonly startsPerEmail = new Window(3, 60 * 60 * 1000);
  // Guessing codes is bounded per request (eight wrong tries, then new codes),
  // so these are ceilings on volume, sized for many people at once behind the
  // console's single address.
  private readonly checksPerIp = new Window(300, 15 * 60 * 1000);
  private readonly pollsPerIp = new Window(3000, 15 * 60 * 1000);

  constructor(private readonly registrations: RegistrationService) {}

  @Get("options")
  options() {
    return this.registrations.options();
  }

  @Post()
  @HttpCode(201)
  start(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const phone = requiredString("phone", body.phone, 40);
    const email = requiredString("email", body.email, 200);
    if (
      !this.startsPerPhone.allow(phone.replace(/\D/g, "").slice(-10)) ||
      !this.startsPerEmail.allow(email.toLowerCase()) ||
      !this.startsPerIp.allow(req.ip ?? "unknown")
    ) {
      slowDown("Too many requests to join from here. Try again in an hour.");
    }
    return this.registrations.start({
      fullName: requiredString("fullName", body.fullName, 200),
      email,
      phone,
      jurisdictionId: uuid("jurisdictionId", body.jurisdictionId),
      source: oneOf("source", body.source ?? "console", ["app", "console"] as const),
      publicKeyBase64: optionalString("publicKeyBase64", body.publicKeyBase64, 200),
    });
  }

  @Post("verify")
  @HttpCode(200)
  verify(@Req() req: Request, @Body() body: Record<string, unknown>) {
    if (!this.checksPerIp.allow(req.ip ?? "unknown")) slowDown("Too many tries. Wait 15 minutes and try again.");
    return this.registrations.verify({
      ...this.ticket(body),
      emailCode: optionalString("emailCode", body.emailCode, 12),
      smsCode: optionalString("smsCode", body.smsCode, 12),
    });
  }

  @Post("resend")
  @HttpCode(200)
  resend(@Req() req: Request, @Body() body: Record<string, unknown>) {
    if (!this.checksPerIp.allow(req.ip ?? "unknown")) slowDown("Too many tries. Wait 15 minutes and try again.");
    return this.registrations.resend(this.ticket(body));
  }

  /** Where a request stands; polled by the waiting screen. */
  @Post("status")
  @HttpCode(200)
  status(@Req() req: Request, @Body() body: Record<string, unknown>) {
    if (!this.pollsPerIp.allow(req.ip ?? "unknown")) slowDown("Checking too often. Wait a few minutes.");
    return this.registrations.status(this.ticket(body));
  }

  private ticket(body: Record<string, unknown>) {
    return {
      registrationId: uuid("registrationId", body.registrationId),
      token: requiredString("token", body.token, 200),
    };
  }
}

/** The administrator's side: the queue of verified requests, and the decision. */
@Controller("v1/registrations")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationService) {}

  @Get()
  @Roles("state_admin", "national_admin")
  list(@Req() req: Request, @Query("status") status?: string) {
    return this.registrations.list(
      getPrincipal(req),
      oneOf("status", status ?? "pending", ["pending", "approved", "rejected"] as const),
    );
  }

  @Post(":id/approve")
  @Roles("state_admin", "national_admin")
  @HttpCode(200)
  approve(@Req() req: Request, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.registrations.approve(
      getPrincipal(req),
      uuid("id", id),
      oneOf("role", body.role, APPROVABLE_ROLES) as Role,
    );
  }

  @Post(":id/reject")
  @Roles("state_admin", "national_admin")
  @HttpCode(200)
  async reject(@Req() req: Request, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    await this.registrations.reject(
      getPrincipal(req),
      uuid("id", id),
      optionalString("reason", body.reason, 500) ?? null,
    );
    return { rejected: true };
  }
}
