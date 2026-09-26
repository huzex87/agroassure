import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { renderScreen, press } from "./harness";
import { cleanCode, displayCode } from "../src/invite-code";

// Setting up a phone is now one code and one button. What has to hold: the code
// is forgiving about how it is typed, a good code leaves the phone signed in as
// the invited person with its own key registered, a refused code says why in
// the server's words, and a phone that was signed out remotely starts again
// with a new key rather than being stuck.

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockParams: { code?: string } = {};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));

// Sending after activation is its own concern, covered elsewhere.
jest.mock("../src/auto-sync", () => ({ requestSync: jest.fn() }));

const fetchMock = jest.fn();

function reply(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

const ACTIVATED = {
  token: "a.b.c",
  userId: "018f1000-0000-7000-8000-000000000001",
  fullName: "Aisha Bello",
  deviceId: "018f0000-0000-7000-8000-0000000000dd",
};

function renderActivate() {
  const Activate = require("../app/activate").default;
  return renderScreen(<Activate />);
}

beforeEach(async () => {
  mockParams = {};
  mockRouter.replace.mockClear();
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  for (const key of [
    "agroassure.device.privateKey",
    "agroassure.device.id",
    "agroassure.user.id",
    "agroassure.user.name",
    "agroassure.session.token",
  ]) {
    await SecureStore.deleteItemAsync(key);
  }
});

describe("the invite code, as typed", () => {
  it("keeps only the characters a code can contain", () => {
    expect(cleanCode("k7pm-4xq2")).toBe("K7PM4XQ2");
    expect(cleanCode(" K7PM 4XQ2 extra")).toBe("K7PM4XQ2");
    // 0, 1, I, L and O are never in a code.
    expect(cleanCode("K0P1-LIOQ")).toBe("KPQ");
    expect(displayCode("K7PM4XQ2")).toBe("K7PM-4XQ2");
    expect(displayCode("K7P")).toBe("K7P");
  });
});

describe("the activation screen", () => {
  it("waits for a whole code before offering to continue", async () => {
    renderActivate();
    const field = await screen.findByLabelText("Invite code");
    fireEvent.changeText(field, "k7pm4x");
    expect(screen.getByDisplayValue("K7PM-4X")).toBeTruthy();

    fireEvent.press(screen.getByText("Continue"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fills the code in from the link in the message", async () => {
    mockParams = { code: "K7PM4XQ2" };
    renderActivate();
    expect(await screen.findByDisplayValue("K7PM-4XQ2")).toBeTruthy();
  });

  it("signs the phone in as the invited person, with its own key", async () => {
    fetchMock.mockImplementation(() => reply(200, ACTIVATED));
    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));

    expect(await screen.findByText("Welcome, Aisha")).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/v1\/auth\/activate$/);
    const body = JSON.parse(init.body);
    expect(body.code).toBe("K7PM4XQ2");
    // The public half only, and 32 bytes of it.
    expect(Buffer.from(body.publicKeyBase64, "base64")).toHaveLength(32);

    expect(await SecureStore.getItemAsync("agroassure.device.id")).toBe(ACTIVATED.deviceId);
    expect(await SecureStore.getItemAsync("agroassure.user.id")).toBe(ACTIVATED.userId);
    expect(await SecureStore.getItemAsync("agroassure.session.token")).toBe("a.b.c");

    fireEvent.press(screen.getByText("See today's visits"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("shows the server's reason when a code is refused", async () => {
    fetchMock.mockImplementation(() =>
      reply(410, {
        error: true,
        status: 410,
        message: "This code has expired. Ask your administrator to send a new one.",
        reason: "expired",
      }),
    );
    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));

    expect(await screen.findByText(/This code has expired/)).toBeTruthy();
    expect(await SecureStore.getItemAsync("agroassure.device.id")).toBeNull();
  });

  it("says the connection failed, in words, when there is no signal", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Network request failed")));
    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
  });

  it("starts again with a new key when this phone was signed out remotely", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        reply(409, { message: "This phone was signed out remotely.", reason: "device_signed_out" }),
      )
      .mockImplementationOnce(() => reply(200, ACTIVATED));

    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));

    expect(await screen.findByText("Welcome, Aisha")).toBeTruthy();
    const first = JSON.parse(fetchMock.mock.calls[0][1].body).publicKeyBase64;
    const second = JSON.parse(fetchMock.mock.calls[1][1].body).publicKeyBase64;
    expect(second).not.toBe(first);
  });

  it("says so when the phone is already set up", async () => {
    await SecureStore.setItemAsync("agroassure.device.id", ACTIVATED.deviceId);
    await SecureStore.setItemAsync("agroassure.user.id", ACTIVATED.userId);
    await SecureStore.setItemAsync("agroassure.user.name", "Aisha Bello");
    renderActivate();
    expect(await screen.findByText("This phone is already set up")).toBeTruthy();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
