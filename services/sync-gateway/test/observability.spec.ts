import { describe, it, expect } from "vitest";
import { MetricsService } from "../src/health/metrics.service";
import { RequestContextMiddleware, currentContext, attributeContext } from "../src/common/request-context";

// Two things worth guarding. A metrics endpoint must not become a personal-data
// export, and a correlation id must survive across the console and the gateway
// rather than restarting at our door.

function fakeReqRes(headers: Record<string, string> = {}) {
  const set: Record<string, string> = {};
  return {
    req: { headers, method: "POST", path: "/v1/sync/events" } as never,
    res: { setHeader: (k: string, v: string) => void (set[k] = v) } as never,
    set,
  };
}

describe("metrics", () => {
  it("reports every counter from zero, so a series never just appears", () => {
    // A counter that only shows up after its first event looks to a scraper
    // like a scrape failure, not a quiet system.
    const rendered = new MetricsService().render();
    expect(rendered).toContain("agroassure_events_rejected 0");
    expect(rendered).toContain("agroassure_auth_failures 0");
    expect(rendered).toMatch(/# TYPE agroassure_events_ingested counter/);
  });

  it("counts what it is told to count", () => {
    const metrics = new MetricsService();
    metrics.increment("events_ingested", 12);
    metrics.increment("events_ingested");
    metrics.increment("events_rejected");
    expect(metrics.render()).toContain("agroassure_events_ingested 13");
    expect(metrics.render()).toContain("agroassure_events_rejected 1");
  });

  it("carries projection lag as a gauge", () => {
    expect(new MetricsService().render({ projection_lag_events: 42 })).toContain(
      "agroassure_projection_lag_events 42",
    );
  });

  it("exposes no identifier of any kind", () => {
    const metrics = new MetricsService();
    metrics.increment("events_ingested", 3);
    // Every line is either a comment or "name value". A label carrying a user,
    // device or facility id would turn this endpoint into a disclosure.
    for (const line of metrics.render().trim().split("\n")) {
      if (line.startsWith("#")) continue;
      expect(line).toMatch(/^agroassure_[a-z_]+ -?\d+$/);
    }
  });
});

describe("request correlation", () => {
  const middleware = new RequestContextMiddleware();

  it("continues a trace the caller already started", () => {
    const { req, res, set } = fakeReqRes({ "x-request-id": "console-abc-123" });
    middleware.use(req, res, () => {
      expect(currentContext()?.requestId).toBe("console-abc-123");
    });
    expect(set["x-request-id"]).toBe("console-abc-123");
  });

  it("starts one when there is none, and echoes it back", () => {
    const { req, res, set } = fakeReqRes();
    let seen: string | undefined;
    middleware.use(req, res, () => {
      seen = currentContext()?.requestId;
    });
    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    expect(set["x-request-id"]).toBe(seen);
  });

  it("ignores an absurd id rather than logging it", () => {
    const { req, res } = fakeReqRes({ "x-request-id": "x".repeat(5000) });
    middleware.use(req, res, () => {
      expect(currentContext()?.requestId).not.toContain("xxxx");
    });
  });

  it("records the route, and the caller once the guard has verified them", () => {
    const { req, res } = fakeReqRes();
    middleware.use(req, res, () => {
      expect(currentContext()?.route).toBe("POST /v1/sync/events");
      attributeContext("user-1", "device-1");
      expect(currentContext()).toMatchObject({ actorUserId: "user-1", deviceId: "device-1" });
    });
  });

  it("does not blow up when there is no request in scope", () => {
    // Background sweeps log too, and they run outside any request.
    expect(currentContext()).toBeUndefined();
    expect(() => attributeContext("user-1", null)).not.toThrow();
  });
});
