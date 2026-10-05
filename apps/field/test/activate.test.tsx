import { useState, type ReactNode } from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { renderScreen, press } from "./harness";
import { cleanCode, displayCode } from "../src/invite-code";
import { LanguageContext, type Language } from "../src/i18n";

// Setting up a phone is one code and one button, and nothing else is demanded.
// A PIN is offered afterwards, never required. What has to hold: the code
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

/** Tap four digits on the PIN pad. */
async function typePin(pin: string) {
  for (const digit of pin) await press(screen.getByLabelText(digit));
}

/** The optional PIN, offered on the welcome screen: chosen and confirmed. */
async function choosePin(pin = "2580") {
  await press(await screen.findByText("Add a PIN"));
  expect(await screen.findByText("Choose a 4-digit PIN")).toBeTruthy();
  await typePin(pin);
  expect(await screen.findByText("Enter the same PIN again")).toBeTruthy();
  await typePin(pin);
}

/** The activation request, whatever else the screen asked the server. */
function activationCalls() {
  return fetchMock.mock.calls.filter(([url]) => /\/v1\/auth\/activate$/.test(String(url)));
}

/** A server where registration is switched off, answering activation with `then`. */
function serverWith(then: () => Promise<unknown>, registration = false) {
  fetchMock.mockImplementation((url: string) =>
    /\/v1\/register\/options$/.test(String(url))
      ? reply(200, { available: registration, jurisdictions: [] })
      : then(),
  );
}

/** The language state the real layout holds, so a switch on screen takes effect. */
function WithLanguage({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

function renderActivate() {
  const Activate = require("../app/activate").default;
  return renderScreen(
    <WithLanguage>
      <Activate />
    </WithLanguage>,
  );
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
    "agroassure.pin.hash",
    "agroassure.pin.salt",
    "agroassure.pin.failures",
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
    expect(activationCalls()).toHaveLength(0);
  });

  it("fills the code in from the link in the message", async () => {
    mockParams = { code: "K7PM4XQ2" };
    renderActivate();
    expect(await screen.findByDisplayValue("K7PM-4XQ2")).toBeTruthy();
  });

  it("signs the phone in as the invited person, with its own key, and asks for nothing else", async () => {
    serverWith(() => reply(200, ACTIVATED));
    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));

    // Straight to the welcome: no keypad in the way of the first visit.
    expect(await screen.findByText("Welcome, Aisha")).toBeTruthy();
    expect(screen.queryByText("Choose a 4-digit PIN")).toBeNull();
    expect(await SecureStore.getItemAsync("agroassure.pin.hash")).toBeNull();

    const [url, init] = activationCalls()[0];
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

  it("offers a PIN, and asks again if the two do not match", async () => {
    serverWith(() => reply(200, ACTIVATED));
    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));

    await press(await screen.findByText("Add a PIN"));
    expect(await screen.findByText("Choose a 4-digit PIN")).toBeTruthy();
    await typePin("1111");
    await typePin("2222");
    expect(await screen.findByText("Those didn't match. Choose your PIN again.")).toBeTruthy();
    expect(await SecureStore.getItemAsync("agroassure.pin.hash")).toBeNull();

    await typePin("1357");
    await typePin("1357");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
    const stored = await SecureStore.getItemAsync("agroassure.pin.hash");
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain("1357");
  });

  it("shows the server's reason when a code is refused", async () => {
    serverWith(() =>
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
    serverWith(() => Promise.reject(new TypeError("Network request failed")));
    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
  });

  it("starts again with a new key when this phone was signed out remotely", async () => {
    const answers = [
      () => reply(409, { message: "This phone was signed out remotely.", reason: "device_signed_out" }),
      () => reply(200, ACTIVATED),
    ];
    serverWith(() => answers.shift()!());

    renderActivate();
    fireEvent.changeText(await screen.findByLabelText("Invite code"), "K7PM-4XQ2");
    await press(screen.getByText("Continue"));

    expect(await screen.findByText("Welcome, Aisha")).toBeTruthy();
    const first = JSON.parse(activationCalls()[0][1].body).publicKeyBase64;
    const second = JSON.parse(activationCalls()[1][1].body).publicKeyBase64;
    expect(second).not.toBe(first);
  });

  it("says so when the phone is already set up", async () => {
    await SecureStore.setItemAsync("agroassure.device.id", ACTIVATED.deviceId);
    await SecureStore.setItemAsync("agroassure.user.id", ACTIVATED.userId);
    await SecureStore.setItemAsync("agroassure.user.name", "Aisha Bello");
    renderActivate();
    expect(await screen.findByText("This phone is already set up")).toBeTruthy();
    await waitFor(() => expect(activationCalls()).toHaveLength(0));
  });
});

describe("one way in", () => {
  it("shows only the code box when asking to join is switched off", async () => {
    serverWith(() => reply(200, ACTIVATED), false);
    renderActivate();
    await screen.findByLabelText("Invite code");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("Register instead")).toBeNull();
    expect(screen.getByText(/No code\? Ask your supervisor/)).toBeTruthy();
  });

  it("offers asking to join, quietly below the code box, only when the server has it on", async () => {
    serverWith(() => reply(200, ACTIVATED), true);
    renderActivate();
    expect(await screen.findByText("Register instead")).toBeTruthy();
  });

  it("shows only the code box when the server cannot be reached", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Network request failed")));
    renderActivate();
    await screen.findByLabelText("Invite code");
    expect(screen.queryByText("Register instead")).toBeNull();
  });

  it("switches language on the first screen with one tap", async () => {
    serverWith(() => reply(200, ACTIVATED));
    renderActivate();
    await press(await screen.findByText("Hausa"));
    expect(await screen.findByText("Barka da zuwa AgroAssure")).toBeTruthy();
    await press(screen.getByText("English"));
    expect(await screen.findByText("Welcome to AgroAssure")).toBeTruthy();
  });
});
