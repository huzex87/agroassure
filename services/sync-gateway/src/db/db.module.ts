import { Global, Module } from "@nestjs/common";
import { PgService } from "./pg.service";
import { CONFIG, loadConfig } from "../config/config";
import { TokenVerifier } from "../common/token-verifier";

// Global because configuration, the connection pool, and token verification are
// needed by every module and belong to none of them. TokenVerifier in particular
// must be a single instance: it caches the identity provider's signing keys, and
// one per module would mean one JWKS fetch per module.

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    PgService,
    TokenVerifier,
  ],
  exports: [PgService, CONFIG, TokenVerifier],
})
export class DbModule {}
