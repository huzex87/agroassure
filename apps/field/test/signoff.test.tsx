import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { renderScreen, harness, FACILITY_ID, AT_THE_WAREHOUSE, type Harness } from "./harness";

// Sign-off, standing in the facility with the manager beside you.
//
// Two things must hold. An inspection cannot be submitted while checkpoints are
// unanswered, because a partial record presented as a complete one is worse than
// no record. And both signatures are required — the dual signature is what makes
// the rating something the facility saw rather than something it was later told.

let mockBench: Harness;
let mockInspectionId: string;

const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockInspectionId }),
  // Stable between renders, like the real one: a router that returned a new
  // object each call would hide dependency-array mistakes rather than expose
  // them.
  useRouter: () => mockRouter,
}));

jest.mock("../src/session", () => ({
  inspectorId: async () => mockBench.inspectorId,
  inspectionSession: async () => mockBench,
}));

async function start() {
  mockBench = harness();
  const started = await mockBench.inspection.start({
    facilityId: FACILITY_ID,
    jurisdictionCode: "KT",
    at: AT_THE_WAREHOUSE,
  });
  mockInspectionId = started.inspectionId;
}

async function answerEverything() {
  await mockBench.inspection.recordResponse(mockInspectionId, {
    checkpointRef: "1.1",
    response: "yes",
  });
  await mockBench.inspection.recordResponse(mockInspectionId, {
    checkpointRef: "1.2",
    response: "no",
    remark: "Damaged bags left among saleable stock.",
  });
}

function renderSignoff() {
  const Signoff = require("../app/signoff/[id]").default;
  return renderScreen(<Signoff />);
}

/**
 * Both signatures, in the order they happen in a facility. Note that a signed
 * button stops reading "Sign" and starts reading its timestamp, so the
 * representative's is the only one left by the time it is pressed.
 */
function signBoth() {
  fireEvent.press(screen.getAllByText("Sign")[0]);
  fireEvent.changeText(screen.getByPlaceholderText("Full name"), "Musa Danjuma");
  fireEvent.changeText(screen.getByPlaceholderText("Role"), "Store manager");
  fireEvent.press(screen.getByText("Sign"));
}

beforeEach(start);

describe("the sign-off screen", () => {
  it("names the checkpoints still unanswered instead of just refusing", async () => {
    renderSignoff();
    expect(await screen.findByText(/still unanswered/i)).toBeTruthy();
    expect(screen.getByText(/1\.1/)).toBeTruthy();
  });

  it("will not submit while anything is unanswered", async () => {
    renderSignoff();
    await screen.findByText(/still unanswered/i);

    fireEvent.press(screen.getByText("Submit inspection"));

    // Still in progress: nothing was signed off.
    expect(mockBench.store.inspection(mockInspectionId)!.status).toBe("in_progress");
  });

  it("shows the rating and the findings before either signature is given", async () => {
    await answerEverything();
    renderSignoff();

    // 3 of 5 weight satisfied, so 60%, and the critical failure is named.
    expect(await screen.findByText("60.0%")).toBeTruthy();
    expect(screen.getByText(/Damaged bags left among saleable stock/)).toBeTruthy();
    // Colour is never the only channel: the band is written out.
    // A critical failure caps the band regardless of the percentage, which is
    // the point of scoring severity separately from weight.
    expect(screen.getByText("critical issues")).toBeTruthy();
  });

  it("requires both signatures, not just the inspector's", async () => {
    await answerEverything();
    renderSignoff();
    await screen.findByText("60.0%");

    // The inspector signs; the representative has not.
    fireEvent.press(screen.getAllByText("Sign")[0]);
    fireEvent.press(screen.getByText("Submit inspection"));

    expect(mockBench.store.inspection(mockInspectionId)!.status).toBe("in_progress");
  });

  it("will not let the representative sign before they are named", async () => {
    await answerEverything();
    renderSignoff();
    await screen.findByText("60.0%");

    // Their button is disabled until both name and role are filled in, so an
    // anonymous signature cannot be captured.
    fireEvent.press(screen.getAllByText("Sign")[1]);
    fireEvent.press(screen.getByText("Submit inspection"));

    expect(mockBench.store.inspection(mockInspectionId)!.status).toBe("in_progress");
  });

  it("names the one thing standing in the way, in the order it is dealt with", async () => {
    renderSignoff();
    // Unanswered checkpoints come first: nothing else matters until the record
    // is complete.
    expect(await screen.findByText("Answer every checkpoint first.")).toBeTruthy();
  });

  it("moves the guidance on as each blocker is cleared", async () => {
    await answerEverything();
    renderSignoff();
    await screen.findByText("60.0%");

    expect(screen.getByText("You have not signed yet.")).toBeTruthy();

    fireEvent.press(screen.getAllByText("Sign")[0]);
    expect(screen.getByText("Name the facility representative.")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("Full name"), "Musa Danjuma");
    fireEvent.changeText(screen.getByPlaceholderText("Role"), "Store manager");
    expect(screen.getByText("The representative has not signed yet.")).toBeTruthy();

    fireEvent.press(screen.getByText("Sign"));
    // Nothing left in the way, so the button stops explaining itself.
    expect(screen.queryByText("The representative has not signed yet.")).toBeNull();
  });

  it("submits once the record is complete and both have signed", async () => {
    await answerEverything();
    renderSignoff();
    await screen.findByText("60.0%");

    signBoth();
    fireEvent.press(screen.getByText("Submit inspection"));

    await waitFor(() => {
      expect(mockBench.store.inspection(mockInspectionId)!.status).toBe("submitted");
    });

    const row = mockBench.store.inspection(mockInspectionId)!;
    expect(row.facility_rep_name).toBe("Musa Danjuma");
    expect(Number(row.rating_percent)).toBeCloseTo(60, 1);
  });

  it("raises a finding for the adverse response, onto the same device chain", async () => {
    await answerEverything();
    renderSignoff();
    await screen.findByText("60.0%");

    signBoth();
    fireEvent.press(screen.getByText("Submit inspection"));

    await waitFor(() => {
      expect(mockBench.store.inspection(mockInspectionId)!.status).toBe("submitted");
    });

    const types = mockBench.store.pendingEvents().map((e) => e.event_type);
    expect(types).toContain("FindingRaised");
    expect(types.at(-1)).toBe("InspectionSubmitted");

    // Nothing was sent. The whole visit is on the device, queued.
    expect(mockBench.store.pendingCount()).toBe(types.length);
  });

  it("refuses a second submission of the same inspection", async () => {
    await answerEverything();
    renderSignoff();
    await screen.findByText("60.0%");

    signBoth();
    fireEvent.press(screen.getByText("Submit inspection"));

    await waitFor(() => {
      expect(mockBench.store.inspection(mockInspectionId)!.status).toBe("submitted");
    });

    // An inspection is immutable once submitted; a correction is a new one.
    await expect(
      mockBench.inspection.submit(mockInspectionId, {
        inspectorUserId: mockBench.inspectorId,
        inspectorSignedAt: new Date().toISOString(),
        facilityRep: { name: "Someone Else", role: "Owner", signedAt: new Date().toISOString() },
      }),
    ).rejects.toThrow(/already been submitted/i);
  });
});
