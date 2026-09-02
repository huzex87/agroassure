import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
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

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(config.port);
  new Logger("Bootstrap").log(`AgroAssure sync gateway listening on :${config.port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("failed to start:", err);
  process.exit(1);
});
