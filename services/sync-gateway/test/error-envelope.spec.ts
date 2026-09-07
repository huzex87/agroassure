import { describe, it, expect } from "vitest";
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { HttpExceptionFilter } from "../src/common/http-exception.filter";

// The envelope used to carry Nest's own error object inside its `message`, so a
// handset showed an inspector `{"message":"events must be an array",...}` on an
// error card. `message` is a sentence now, whichever shape Nest hands us.

function envelope(exception: unknown): { error: boolean; status: number; message: unknown } {
  let body: Record<string, unknown> = {};
  const res = {
    status: () => res,
    json: (payload: Record<string, unknown>) => void (body = payload),
  } as never as { status: () => unknown; json: (p: Record<string, unknown>) => void };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as never;

  new HttpExceptionFilter().catch(exception, host);
  return body as { error: boolean; status: number; message: unknown };
}

describe("http error envelope", () => {
  it("passes a string response through", () => {
    expect(envelope(new BadRequestException("events must be an array"))).toEqual({
      error: true,
      status: 400,
      message: "events must be an array",
    });
  });

  it("takes the sentence out of an object response", () => {
    // What Nest builds for `new BadRequestException("...")` internally, and
    // what a hand-rolled `{ message, error, statusCode }` looks like.
    expect(
      envelope(
        new BadRequestException({
          message: "events must be an array",
          error: "Bad Request",
          statusCode: 400,
        }),
      ).message,
    ).toBe("events must be an array");
  });

  it("joins the array a validation pipe produces", () => {
    expect(
      envelope(new BadRequestException({ message: ["seq must be an integer", "deviceId must be a UUID"] }))
        .message,
    ).toBe("seq must be an integer, deviceId must be a UUID");
  });

  it("keeps error and status, and says nothing about the internals of a 500", () => {
    const body = envelope(new InternalServerErrorException());
    expect(body.error).toBe(true);
    expect(body.status).toBe(500);
    expect(typeof body.message).toBe("string");
  });

  it("gives a non-HttpException a status and a sentence", () => {
    expect(envelope(new Error("connection terminated"))).toEqual({
      error: true,
      status: 500,
      message: "internal error",
    });
  });
});
