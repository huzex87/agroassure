import { describe, expect, it } from "vitest";
import { setupSteps } from "../components/setup-checklist";

// The checklist ticks from the record, so these are its rules: what counts as
// each step being done, and what it says while it is not.

const empty = {
  facilities: 0,
  checklistsInForce: 0,
  inspectors: 0,
  inspectorsWithPhone: 0,
  invitesWaiting: 0,
  plannedVisits: 0,
  submittedInspections: 0,
};

describe("the setup checklist", () => {
  it("starts with nothing done, and says what to do first", () => {
    const steps = setupSteps(empty);
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false, false]);
    expect(steps[0]!.detail).toMatch(/Import the spreadsheet/);
  });

  it("counts an inspector as set up only once their phone works, and says invites are waiting", () => {
    const waiting = setupSteps({ ...empty, inspectors: 2, invitesWaiting: 2 })[2]!;
    expect(waiting.done).toBe(false);
    expect(waiting.detail).toBe("2 invites sent, waiting to be used");

    const ready = setupSteps({ ...empty, inspectors: 2, inspectorsWithPhone: 1 })[2]!;
    expect(ready).toMatchObject({ done: true, detail: "1 of 2 inspectors have a working phone" });
  });

  it("treats a submitted inspection as proof the visits were planned", () => {
    const steps = setupSteps({ ...empty, submittedInspections: 1 });
    expect(steps[3]!.done).toBe(true);
    expect(steps[4]!.done).toBe(true);
  });
});
