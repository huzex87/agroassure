import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

// A correlation id per request, carried implicitly.
//
// When an inspector reports that a sync failed, the useful question is what
// happened to *that* request — across ingest, the projector, and storage. Passing
// an id through every function signature to achieve that would touch code that
// has no business knowing about HTTP, so it rides in async local storage instead
// and the logger picks it up on its own.
//
// An incoming x-request-id is honoured so a trace continues across the console
// and the gateway rather than restarting at our door.

export interface RequestContext {
  requestId: string;
  /** Present once the guard has verified a token; absent on public routes. */
  actorUserId?: string;
  deviceId?: string;
  route?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Record who the caller turned out to be, once the token has been verified. */
export function attributeContext(actorUserId: string, deviceId: string | null): void {
  const context = storage.getStore();
  if (!context) return;
  context.actorUserId = actorUserId;
  if (deviceId) context.deviceId = deviceId;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers["x-request-id"];
    const requestId =
      typeof incoming === "string" && incoming.length > 0 && incoming.length <= 200
        ? incoming
        : randomUUID();

    // Echoed back so the caller can quote it in a support request.
    res.setHeader("x-request-id", requestId);

    storage.run({ requestId, route: `${req.method} ${req.path}` }, () => next());
  }
}
