import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { loadConfig } from "./config/config";
import { StructuredLogger } from "./common/structured-logger";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    // JSON lines, correlated by request id. Ids only, never event content:
    // remarks and representative names are personal data and stay in the event
    // store, which is access-controlled and covered by the processing record.
    logger: new StructuredLogger(),
  });

  // Evidence uploads are base64 in JSON for this skeleton; raise the body limit.
  const express = app.getHttpAdapter().getInstance();
  express.use((await import("express")).json({ limit: "25mb" }));

  // No global ValidationPipe. It was here, and it was doing nothing: it
  // validates against decorated classes, every request shape in this service is
  // a TypeScript interface, and interfaces are erased before the code runs. A
  // guard that cannot fail is worse than no guard, because it is read as one.
  // Every controller parses its own body through src/common/validate.ts.
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(config.port);
  new Logger("Bootstrap").log(`AgroAssure sync gateway listening on :${config.port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("failed to start:", err);
  process.exit(1);
});
