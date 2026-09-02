import { describe, it, expect } from "vitest";
import { hlcInit, hlcSend, hlcReceive, hlcCompare } from "../src";

describe("hybrid logical clock", () => {
  it("advances the counter when physical time does not move", () => {
    let s = hlcInit("device-a");
    const a = hlcSend(s, 1000);
    const b = hlcSend(a.state, 1000);
    expect(hlcCompare(a.stamp, b.stamp)).toBeLessThan(0); // b is later
  });

  it("produces lexically sortable stamps that match logical order", () => {
    let s = hlcInit("device-a");
    const stamps: string[] = [];
    let now = 5;
    for (let i = 0; i < 5; i++) {
      const r = hlcSend(s, now);
      s = r.state;
      stamps.push(r.stamp);
      now += i % 2; // sometimes same ms, sometimes advance
    }
    const sortedLex = [...stamps].sort();
    expect(sortedLex).toEqual(stamps);
  });

  it("merges a remote stamp without losing causality", () => {
    let a = hlcInit("device-a");
    const sent = hlcSend(a, 2000);
    const b = hlcReceive(hlcInit("device-b"), sent.stamp, 1500);
    // device-b's next event must sort after the received event
    const next = hlcSend(b, 1500);
    expect(hlcCompare(sent.stamp, next.stamp)).toBeLessThan(0);
  });
});
