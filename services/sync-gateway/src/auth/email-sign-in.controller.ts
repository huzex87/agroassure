import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { requiredString } from "../common/validate";
import { EmailSignInService } from "./email-sign-in.service";

// The console's own sign-in, open by necessity: nobody has a session yet.
//
// Asking for a link is limited per source address and per email, so the form
// cannot be used to flood an inbox or to guess at the link space. Every
// attempt to spend a link counts too — a guesser's attempts look the same as a
// person's until the answer comes back.

const WINDOW_MS = 15 * 60 * 1000;

class Limiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limit: number) {}

  /**
   * ponytail: a fixed window in process memory, like the other public
   * surfaces. Correct for one instance; move to Redis before running two.
   */
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now > entry.resetAt) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

function tooMany(): never {
  throw new HttpException(
    { message: "Too many tries. Wait 15 minutes and try again.", reason: "rate_limited" },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Controller("v1/auth")
export class EmailSignInController {
  private readonly perAddress = new Limiter(10);
  private readonly perEmail = new Limiter(5);
  private readonly verifies = new Limiter(20);

  constructor(private readonly signIn: EmailSignInService) {}

  @Get("methods")
  methods() {
    return this.signIn.methods();
  }

  @Post("email/start")
  @HttpCode(200)
  async start(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const email = requiredString("email", body.email, 200).toLowerCase();
    if (!this.perAddress.allow(req.ip ?? "unknown") || !this.perEmail.allow(email)) tooMany();
    await this.signIn.start(email);
    // The same answer whatever happened: whether an address has an account is
    // not something this endpoint will tell anyone.
    return { sent: true };
  }

  @Post("email/verify")
  @HttpCode(200)
  verify(@Req() req: Request, @Body() body: Record<string, unknown>) {
    if (!this.verifies.allow(req.ip ?? "unknown")) tooMany();
    return this.signIn.verify(requiredString("token", body.token, 200));
  }
}
