import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { uuidv7 } from "@agroassure/domain";
import { parsePushEvents, parseUploadEvidence } from "../src/sync/dto/push-events.dto";
import { parsePullQuery } from "../src/sync/dto/pull-query.dto";

// The sync surface is the one a handset in a warehouse talks to, and until now
// its request shapes were interfaces — erased before the code ran, so nothing
// checked them. Every case below used to reach the service layer and come back
// as a 500 from a device that had simply sent the wrong thing.

const hash = "a".repeat(64);

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: uuidv7(),
    aggregateType: "inspection",
    aggregateId: uuidv7(),
    seq: 1,
    eventType: "InspectionStarted",
    payload: { reference: "KT/2026/0001" },
    hlc: "2026-09-06T10:00:00.000Z-0000-abc",
    prevHash: null,
    deviceId: uuidv7(),
    actorUserId: uuidv7(),
    eventHash: hash,
    deviceSig: "c2ln",
    ...overrides,
  };
}

describe("parsePushEvents", () => {
  it("accepts a well-formed batch and keeps a null prevHash", () => {
    const parsed = parsePushEvents({ deviceId: uuidv7(), events: [event()] });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]!.prevHash).toBeNull();
  });

  it("rejects a batch with no events array rather than crashing on the spread", () => {
    expect(() => parsePushEvents({ deviceId: uuidv7() })).toThrow(BadRequestException);
  });

  it("rejects a device id that is not a uuid", () => {
    expect(() => parsePushEvents({ deviceId: "not-a-uuid", events: [] })).toThrow(
      BadRequestException,
    );
  });

  it("rejects an event with no hlc, which the comparator would dereference", () => {
    expect(() =>
      parsePushEvents({ deviceId: uuidv7(), events: [event({ hlc: undefined })] }),
    ).toThrow(BadRequestException);
  });

  it("rejects a hash that is not 64 hex characters", () => {
    expect(() =>
      parsePushEvents({ deviceId: uuidv7(), events: [event({ eventHash: "beef" })] }),
    ).toThrow(BadRequestException);
  });

  it("names the offending event, so a device knows which one to resend", () => {
    expect(() =>
      parsePushEvents({ deviceId: uuidv7(), events: [event(), event({ seq: 0 })] }),
    ).toThrow(/events\[1\]\.seq/);
  });

  it("bounds the batch, since it is read wholly into memory", () => {
    const events = Array.from({ length: 501 }, () => event());
    expect(() => parsePushEvents({ deviceId: uuidv7(), events })).toThrow(BadRequestException);
  });

  it("rejects a body that is not an object at all", () => {
    expect(() => parsePushEvents("events")).toThrow(BadRequestException);
    expect(() => parsePushEvents(null)).toThrow(BadRequestException);
  });
});

describe("parseUploadEvidence", () => {
  it("accepts a well-formed upload and lowercases the checksum", () => {
    const parsed = parseUploadEvidence({
      evidenceId: uuidv7(),
      sha256: "A".repeat(64),
      mime: "image/jpeg",
      contentBase64: "aGk=",
    });
    expect(parsed.sha256).toBe("a".repeat(64));
  });

  it("rejects a checksum that is not a sha256", () => {
    expect(() =>
      parseUploadEvidence({
        evidenceId: uuidv7(),
        sha256: "nope",
        mime: "image/jpeg",
        contentBase64: "aGk=",
      }),
    ).toThrow(BadRequestException);
  });
});

describe("parsePullQuery", () => {
  it("treats a missing cursor as a first pull", () => {
    expect(parsePullQuery({}).since).toBeUndefined();
    expect(parsePullQuery(undefined).since).toBeUndefined();
  });

  // Express turns ?since=a&since=b into an array, which would have gone
  // straight into a query parameter and failed inside the driver.
  it("refuses a repeated cursor rather than passing an array to the database", () => {
    expect(() => parsePullQuery({ since: ["a", "b"] })).toThrow(BadRequestException);
  });
});
