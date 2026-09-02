import { describe, it, expect, beforeEach } from "vitest";
import type { DeviceEvent } from "@agroassure/domain";
import { FieldInspection } from "../src/inspection";
import { applyBootstrap, drain, type PushAck, type SyncTransport } from "../src/sync";
import type { FieldStore } from "../src/sqlite";
import {
  AT_THE_WAREHOUSE,
  DEVICE_ID,
  FACILITY_ID,
  bootstrapBundle,
  freshStore,
  makeAuthor,
} from "./helpers";

// Drain-on-signal. Nothing is fetched during the day; the queue empties when a
// connection returns, and every step is safe to repeat because ingest is
// idempotent by event id and evidence is content-addressed.

/** A server that accepts everything, and remembers what it was sent. */
class FakeServer implements SyncTransport {
  received: DeviceEvent[] = [];
  evidence: string[] = [];
  pushCalls = 0;
  pulled: Array<{ eventId: string; aggregateType: string; aggregateId: string; eventType: string; payload: Record<string, unknown> }> = [];
  /** Set to make the next push fail, as a dropped connection or a refusal would. */
  failNextPush: Error | null = null;
  /** Accept only this many events per push, as a truncated batch would. */
  acceptLimit = Infinity;

  async pushEvents(_deviceId: string, events: DeviceEvent[]): Promise<PushAck> {
    this.pushCalls += 1;
    if (this.failNextPush) {
      const err = this.failNextPush;
      this.failNextPush = null;
      throw err;
    }
    const accepted = events.slice(0, this.acceptLimit);
    this.received.push(...accepted);
    return {
      acked: accepted.map((e) => e.eventId),
      rejected: [],
      serverCursor: `cursor-${this.received.length}`,
    };
  }

  async uploadEvidence(input: { evidenceId: string; sha256: string }) {
    this.evidence.push(input.evidenceId);
    return { locked: true };
  }

  async pull(_since: string) {
    return { events: this.pulled, nextCursor: "cursor-pulled" };
  }
}

const readFile = async () => new Uint8Array([1, 2, 3]);

describe("drain", () => {
  let store: FieldStore;
  let session: FieldInspection;
  let server: FakeServer;
  let inspectionId: string;

  beforeEach(async () => {
    store = freshStore();
    applyBootstrap(store, bootstrapBundle());
    session = new FieldInspection(store, makeAuthor(store));
    server = new FakeServer();
    ({ inspectionId } = await session.start({
      facilityId: FACILITY_ID,
      jurisdictionCode: "KT",
      at: AT_THE_WAREHOUSE,
    }));
    await session.recordResponse(inspectionId, {
      checkpointRef: "2.3",
      response: "no",
      remark: "Two bags on the north wall show moisture damage.",
    });
    await session.captureEvidence(inspectionId, {
      checkpointRef: "2.3",
      sha256: "9c77af1",
      localUri: "file:///photos/2-3.jpg",
      mime: "image/jpeg",
      capturedAt: "2026-08-18T09:26:11Z",
      at: AT_THE_WAREHOUSE,
    });
  });

  it("pushes the queued chain in authoring order and marks it acked", async () => {
    expect(store.pendingCount()).toBe(3);

    const result = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(result.eventsPushed).toBe(3);
    expect(store.pendingCount()).toBe(0);
    expect(server.received.map((e) => e.eventType)).toEqual([
      "InspectionStarted",
      "ResponseRecorded",
      "EvidenceCaptured",
    ]);
  });

  it("uploads each exhibit's bytes after the event that describes it", async () => {
    const result = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(result.evidenceUploaded).toBe(1);
    expect(store.pendingEvidence()).toHaveLength(0);
    // The event carrying the hash reached the server first, so it can refuse
    // bytes that do not match what was recorded at capture.
    expect(server.received.some((e) => e.eventType === "EvidenceCaptured")).toBe(true);
  });

  it("keeps everything queued when the connection drops mid-push", async () => {
    server.failNextPush = new Error("network unreachable");

    const result = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(result.eventsPushed).toBe(0);
    expect(result.blocked).toMatch(/network unreachable/);
    expect(store.pendingCount()).toBe(3); // nothing lost
  });

  it("resumes from where it stopped when the signal comes back", async () => {
    server.failNextPush = new Error("network unreachable");
    await drain(store, DEVICE_ID, { transport: server, readFile });

    const result = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(result.eventsPushed).toBe(3);
    expect(store.pendingCount()).toBe(0);
  });

  it("is safe to run twice: the second drain has nothing left to send", async () => {
    await drain(store, DEVICE_ID, { transport: server, readFile });
    const again = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(again.eventsPushed).toBe(0);
    expect(again.evidenceUploaded).toBe(0);
    expect(server.received).toHaveLength(3); // not re-sent
  });

  it("stops rather than spinning when the server acknowledges nothing", async () => {
    server.acceptLimit = 0;

    const result = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(result.blocked).toMatch(/acknowledged nothing/);
    expect(server.pushCalls).toBe(1);
    expect(store.pendingCount()).toBe(3);
  });

  it("leaves an exhibit pending when its bytes cannot be read, and retries later", async () => {
    let failed = false;
    const flakyRead = async () => {
      if (!failed) {
        failed = true;
        throw new Error("file not readable");
      }
      return new Uint8Array([1, 2, 3]);
    };

    const first = await drain(store, DEVICE_ID, { transport: server, readFile: flakyRead });
    expect(first.eventsPushed).toBe(3);
    expect(first.evidenceUploaded).toBe(0);
    expect(store.pendingEvidence()).toHaveLength(1);

    const second = await drain(store, DEVICE_ID, { transport: server, readFile: flakyRead });
    expect(second.evidenceUploaded).toBe(1);
  });

  it("applies pulled decisions to the prior findings an inspector will see", async () => {
    store.replacePriorFindings([
      {
        id: "018f0000-0000-7000-8000-0000000000f1",
        facilityId: FACILITY_ID,
        reference: "CA-01184-03",
        summary: "Damaged stock not segregated",
        severity: "critical",
        status: "open",
        dueDate: "2026-08-08",
      },
    ]);
    server.pulled = [
      {
        eventId: "e1",
        aggregateType: "finding",
        aggregateId: "018f0000-0000-7000-8000-0000000000f1",
        eventType: "FindingEscalated",
        payload: { to: "desk_supervisor" },
      },
    ];

    const result = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(result.eventsPulled).toBe(1);
    expect(store.priorFindings(FACILITY_ID)[0]!.status).toBe("escalated");
    expect(store.cursor("server")).toBe("cursor-pulled");
  });

  it("does not lose the push when the pull fails", async () => {
    server.pull = async () => {
      throw new Error("pull failed");
    };

    const result = await drain(store, DEVICE_ID, { transport: server, readFile });

    expect(result.eventsPushed).toBe(3);
    expect(result.eventsPulled).toBe(0);
    expect(store.pendingCount()).toBe(0);
  });
});
