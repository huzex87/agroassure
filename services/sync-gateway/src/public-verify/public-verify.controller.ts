import { Controller, Get, Header, Inject, Param, Req } from "@nestjs/common";
import type { Request } from "express";
import { CONFIG, type AppConfig } from "../config/config";
import { NO_RECORD, PublicVerifyService, type VerifyResult } from "./public-verify.service";

// No account, no registration, nothing collected from the enquirer: no cookie,
// no logged identity, no stored search history tied to a person. The source
// address is used for a rate-limit counter held in memory for one minute and is
// never written anywhere.

@Controller("v1/verify")
export class PublicVerifyController {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly verifier: PublicVerifyService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Get(":query")
  // A valid answer changes only when a certificate is issued or revoked, so it
  // is cheap to cache at the edge; the neutral answer is cached briefly too, so
  // token enumeration gains nothing from cache timing.
  @Header("Cache-Control", "public, max-age=300")
  async verify(@Param("query") query: string, @Req() req: Request): Promise<VerifyResult> {
    if (!this.allow(req.ip ?? "unknown")) {
      // Even when rate limited, the answer is the neutral one: a caller probing
      // the token space learns nothing from the difference.
      return NO_RECORD;
    }
    return this.verifier.verify(query);
  }

  /**
   * ponytail: a fixed-window counter in process memory. It stops casual
   * enumeration from one address; move it to Redis (or the edge gateway) when
   * the app tier runs more than one replica.
   */
  private allow(source: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(source);
    if (!entry || now > entry.resetAt) {
      if (this.hits.size > 10_000) this.hits.clear(); // bound the map
      this.hits.set(source, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.config.publicVerifyRatePerMinute;
  }
}
