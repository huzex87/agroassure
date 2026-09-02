import { ConsoleLogger, LogLevel } from "@nestjs/common";
import { currentContext } from "./request-context";

// One JSON object per line, so a log aggregator can index it and an operator can
// find every line belonging to one request.
//
// Deliberately absent: the message body of any event, any checkpoint remark, any
// facility representative's name. Those are personal data and belong in the
// event store, which is access-controlled and covered by the processing record —
// not in a log that gets shipped to whatever aggregator the institution runs.
// Ids are logged; content is not.

interface LogLine {
  time: string;
  level: LogLevel;
  context?: string;
  message: string;
  requestId?: string;
  actorUserId?: string;
  deviceId?: string;
  route?: string;
  stack?: string;
}

export class StructuredLogger extends ConsoleLogger {
  private emit(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    const request = currentContext();
    const line: LogLine = {
      time: new Date().toISOString(),
      level,
      context: context ?? this.context,
      message: typeof message === "string" ? message : JSON.stringify(message),
      requestId: request?.requestId,
      actorUserId: request?.actorUserId,
      deviceId: request?.deviceId,
      route: request?.route,
      stack,
    };
    // Errors to stderr so a container platform separates them by stream.
    const out = level === "error" ? process.stderr : process.stdout;
    out.write(`${JSON.stringify(line)}\n`);
  }

  override log(message: unknown, context?: string): void {
    this.emit("log", message, context);
  }

  override warn(message: unknown, context?: string): void {
    this.emit("warn", message, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    this.emit("error", message, context, stack);
  }

  override debug(message: unknown, context?: string): void {
    this.emit("debug", message, context);
  }

  override verbose(message: unknown, context?: string): void {
    this.emit("verbose", message, context);
  }
}
