import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

// Uniform error envelope so clients (device and console) get a predictable shape.

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? flatten(exception.getResponse())
        : "internal error";

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    // A machine-readable reason, where the thrower gave one, so a client can
    // act on a refusal (the phone offers a fresh start on "device_signed_out")
    // without matching on the wording of a sentence that is meant for people.
    const reason =
      exception instanceof HttpException ? reasonOf(exception.getResponse()) : undefined;

    res.status(status).json({
      error: true,
      status,
      message,
      ...(reason ? { reason } : {}),
    });
  }
}

// Nest's exception response is either a string or an object whose `message` is
// a string or an array of them. A client should get one sentence either way,
// not our framework's envelope nested inside our own.
function flatten(response: string | object): string {
  if (typeof response === "string") return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(", ");
  return "request failed";
}

function reasonOf(response: string | object): string | undefined {
  if (typeof response !== "object") return undefined;
  const reason = (response as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : undefined;
}
