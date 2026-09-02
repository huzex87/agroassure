import { describe, it, expect } from "vitest";
import { project } from "../components/registry-map";

type Point = { lat: number; lng: number; x: number; y: number };

// A map that is stretched, or upside down, still looks like a map. Nothing on
// screen would tell a supervisor that the cluster they are reading is wrong, so
// the projection is checked rather than eyeballed.

const WIDTH = 720;
const HEIGHT = 320;
const MARGIN = 16;

// Roughly Katsina.
const NORTH = { lat: 13.1, lng: 7.6 };
const SOUTH = { lat: 12.9, lng: 7.6 };
const EAST = { lat: 13.0, lng: 7.7 };
const WEST = { lat: 13.0, lng: 7.5 };

describe("registry map projection", () => {
  it("puts north at the top", () => {
    const [north, south] = project([NORTH, SOUTH]) as [Point, Point];
    // SVG y grows downward, so the northern facility must have the smaller y.
    expect(north.y).toBeLessThan(south.y);
  });

  it("puts east on the right", () => {
    const [east, west] = project([EAST, WEST]) as [Point, Point];
    expect(east.x).toBeGreaterThan(west.x);
  });

  it("keeps every point inside the box", () => {
    for (const p of project([NORTH, SOUTH, EAST, WEST])) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it("uses one scale for both axes, so distance is comparable in any direction", () => {
    // A square in real terms must not be drawn as a rectangle. The fixture spans
    // 0.2° each way: about 22km north-south, about 21.7km east-west at this
    // latitude, so the drawn separations should be within a few percent.
    const [north, south, east, west] = project([NORTH, SOUTH, EAST, WEST]) as [Point, Point, Point, Point];
    const vertical = Math.abs(north.y - south.y);
    const horizontal = Math.abs(east.x - west.x);
    expect(horizontal / vertical).toBeGreaterThan(0.9);
    expect(horizontal / vertical).toBeLessThan(1.0);
  });

  it("shortens longitude away from the equator rather than treating degrees as equal", () => {
    // Without the cosine correction this ratio would be exactly 1.
    const [north, south, east, west] = project([NORTH, SOUTH, EAST, WEST]) as [Point, Point, Point, Point];
    const ratio = Math.abs(east.x - west.x) / Math.abs(north.y - south.y);
    expect(ratio).toBeLessThan(0.99);
  });

  it("centres a single facility instead of dividing by a zero span", () => {
    const only = project([{ lat: 12.98, lng: 7.61 }])[0]!;
    expect(Number.isFinite(only.x)).toBe(true);
    expect(Number.isFinite(only.y)).toBe(true);
    expect(only.x).toBeCloseTo(WIDTH / 2, 0);
    expect(only.y).toBeCloseTo(HEIGHT / 2, 0);
  });

  it("survives several facilities registered at the same point", () => {
    // Two units of one business at one address is ordinary, not an error.
    const same = { lat: 12.98, lng: 7.61 };
    for (const p of project([same, same, same])) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("handles facilities strung along a single road", () => {
    // A zero span on one axis only is real geography, not a degenerate case: the
    // line should run down the middle of the box, not be magnified to fill it.
    const line = project([
      { lat: 13.0, lng: 7.6 },
      { lat: 12.95, lng: 7.6 },
      { lat: 12.9, lng: 7.6 },
    ]);
    for (const p of line) {
      expect(p.x).toBeCloseTo(WIDTH / 2, 0);
      expect(p.y).toBeGreaterThanOrEqual(MARGIN - 1);
      expect(p.y).toBeLessThanOrEqual(HEIGHT - MARGIN + 1);
    }
    expect(line[0]!.y).toBeLessThan(line[2]!.y);
  });

  it("carries the original record through, so markers cannot drift from their data", () => {
    // The status drawn at a point has to be the status of the facility at that
    // point; pairing by array index separately would be a bug waiting to happen.
    const projected = project([{ lat: 13.0, lng: 7.5, id: "abc", certificate_status: "overdue" }])[0]!;
    expect(projected.id).toBe("abc");
    expect(projected.certificate_status).toBe("overdue");
  });

  it("leaves the drawing margin clear", () => {
    const points = project([NORTH, SOUTH, EAST, WEST]);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(MARGIN - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(HEIGHT - MARGIN + 1);
  });
});
