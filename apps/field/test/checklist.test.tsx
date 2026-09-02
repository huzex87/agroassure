import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { harness, FACILITY_ID, AT_THE_WAREHOUSE, type Harness } from "./harness";

// jest.mock factories are hoisted above the imports, so anything they close
// over has to be named mock* and assigned in beforeEach.

// The checklist screen, over the real device core.
//
// The rule under test is the one that turns a subjective note into an evidenced
// finding: selecting No requires a remark, and the screen must not let a
// response through without one. That rule lives in FieldInspection, and this
// asserts the screen actually honours the refusal rather than swallowing it.

let mockBench: Harness;
let mockInspectionId: string;

const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockInspectionId }),
  // Stable between renders, like the real one: a router that returned a new
  // object each call would hide dependency-array mistakes rather than expose
  // them.
  useRouter: () => mockRouter,
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, []),
}));

jest.mock("../src/db", () => ({ getStore: () => mockBench.store }));
jest.mock("../src/session", () => ({
  inspectorId: async () => mockBench.inspectorId,
  inspectionSession: async () => mockBench,
}));

beforeEach(async () => {
  mockBench = harness();
  const started = await mockBench.inspection.start({
    facilityId: FACILITY_ID,
    jurisdictionCode: "KT",
    at: AT_THE_WAREHOUSE,
  });
  mockInspectionId = started.inspectionId;
});

function renderChecklist() {
  const Checklist = require("../app/inspection/[id]").default;
  return render(<Checklist />);
}

describe("the checklist screen", () => {
  it("shows the instrument's own prompts, not placeholders", async () => {
    renderChecklist();
    expect(await screen.findByText(/stored off the ground on pallets/i)).toBeTruthy();
    expect(screen.getByText(/damaged bags segregated/i)).toBeTruthy();
    expect(screen.getByText("Storage and handling", { exact: false })).toBeTruthy();
  });

  it("offers N/A only where the instrument allows it", async () => {
    renderChecklist();
    await screen.findByText(/pallets/i);
    // Checkpoint 1.1 does not accept N/A; 1.2 does. Two Yes buttons, two No,
    // but only one N/A.
    expect(screen.getAllByText("Yes")).toHaveLength(2);
    expect(screen.getAllByText("N/A")).toHaveLength(1);
  });

  it("records a Yes and reflects it in the running figure", async () => {
    renderChecklist();
    await screen.findByText(/pallets/i);

    fireEvent.press(screen.getAllByText("Yes")[0]);
    fireEvent.press(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockBench.store.responses(mockInspectionId)).toHaveLength(1);
    });
    expect(mockBench.store.responses(mockInspectionId)[0]).toMatchObject({
      checkpointRef: "1.1",
      response: "yes",
    });
  });

  it("refuses an adverse response with no remark, and says why", async () => {
    renderChecklist();
    await screen.findByText(/pallets/i);

    fireEvent.press(screen.getAllByText("No")[0]);
    fireEvent.press(screen.getByText("Save"));

    // The refusal comes from FieldInspection, and the screen surfaces it rather
    // than dropping the response silently.
    expect(await screen.findByText(/needs a remark/i)).toBeTruthy();
    expect(mockBench.store.responses(mockInspectionId)).toHaveLength(0);
  });

  it("accepts the adverse response once a remark is written", async () => {
    renderChecklist();
    await screen.findByText(/pallets/i);

    fireEvent.press(screen.getAllByText("No")[0]);
    fireEvent.changeText(
      screen.getByPlaceholderText("Remark"),
      "Bags stacked directly on a damp floor.",
    );
    fireEvent.press(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockBench.store.responses(mockInspectionId)).toHaveLength(1);
    });
    expect(mockBench.store.responses(mockInspectionId)[0]).toMatchObject({
      checkpointRef: "1.1",
      response: "no",
      remark: "Bags stacked directly on a damp floor.",
    });
  });

  it("asks for a remark only on an adverse response", async () => {
    renderChecklist();
    await screen.findByText(/pallets/i);

    fireEvent.press(screen.getAllByText("Yes")[0]);
    expect(screen.queryByPlaceholderText("Remark")).toBeNull();

    fireEvent.press(screen.getAllByText("No")[0]);
    expect(screen.getByPlaceholderText("Remark")).toBeTruthy();
  });

  it("writes every response onto the outbox, signed, with nothing sent", async () => {
    renderChecklist();
    await screen.findByText(/pallets/i);

    fireEvent.press(screen.getAllByText("Yes")[0]);
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockBench.store.responses(mockInspectionId)).toHaveLength(1));

    // One InspectionStarted plus one ResponseRecorded, both queued.
    const pending = mockBench.store.pendingEvents();
    expect(pending.map((e) => e.event_type)).toEqual([
      "InspectionStarted",
      "ResponseRecorded",
    ]);
    expect(pending.every((e) => e.device_sig.length > 0)).toBe(true);
  });
});
