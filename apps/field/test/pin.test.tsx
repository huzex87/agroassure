import { screen } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { checkPin, hasPin, isValidPin, MAX_TRIES, setPin, signOutKeepingWork } from "../src/pin";
import { renderScreen, press } from "./harness";

// The PIN between a phone and the inspections on it. What must hold: it is
// never stored as typed, wrong guesses are counted and run out, and running
// out — or forgetting — signs the person out without destroying the key their
// unsent work is signed with.

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  router: mockRouter,
}));
jest.mock("../src/auto-sync", () => ({ requestSync: jest.fn() }));

const KEYS = [
  "agroassure.pin.hash",
  "agroassure.pin.salt",
  "agroassure.pin.failures",
  "agroassure.device.privateKey",
  "agroassure.device.id",
  "agroassure.user.id",
  "agroassure.user.name",
  "agroassure.session.token",
];

beforeEach(async () => {
  mockRouter.replace.mockClear();
  for (const k of KEYS) await SecureStore.deleteItemAsync(k);
});

// A real 32-byte ed25519 private key, base64, as the signer stores one.
const KEY = Buffer.alloc(32, 7).toString("base64");

async function signedInPhone() {
  await SecureStore.setItemAsync("agroassure.device.privateKey", KEY);
  await SecureStore.setItemAsync("agroassure.device.id", "018f0000-0000-7000-8000-0000000000dd");
  await SecureStore.setItemAsync("agroassure.user.id", "018f1000-0000-7000-8000-000000000001");
  await SecureStore.setItemAsync("agroassure.user.name", "Aisha Bello");
  await SecureStore.setItemAsync("agroassure.session.token", "a.b.c");
}

describe("the PIN", () => {
  it("is four digits and nothing else", () => {
    expect(isValidPin("0419")).toBe(true);
    expect(isValidPin("419")).toBe(false);
    expect(isValidPin("04190")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });

  it("is stored salted and hashed, never as typed", async () => {
    await setPin("0419");
    const hash = await SecureStore.getItemAsync("agroassure.pin.hash");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hasPin()).toBe(true);

    // The same PIN on another phone hashes differently.
    await setPin("0419");
    expect(await SecureStore.getItemAsync("agroassure.pin.hash")).not.toBe(hash);
  });

  it("counts wrong guesses down, and a right one resets the count", async () => {
    await setPin("0419");
    expect(await checkPin("1111")).toEqual({ ok: false, triesLeft: MAX_TRIES - 1 });
    expect(await checkPin("2222")).toEqual({ ok: false, triesLeft: MAX_TRIES - 2 });
    expect(await checkPin("0419")).toEqual({ ok: true });
    expect(await checkPin("3333")).toEqual({ ok: false, triesLeft: MAX_TRIES - 1 });
  });

  it("runs out after five wrong guesses", async () => {
    await setPin("0419");
    let last;
    for (let i = 0; i < MAX_TRIES; i++) last = await checkPin("9999");
    expect(last).toEqual({ ok: false, triesLeft: 0 });
  });

  it("signs out on running out, but keeps the key the unsent work is signed with", async () => {
    await signedInPhone();
    await setPin("0419");
    await signOutKeepingWork();

    expect(await hasPin()).toBe(false);
    expect(await SecureStore.getItemAsync("agroassure.session.token")).toBeNull();
    expect(await SecureStore.getItemAsync("agroassure.user.id")).toBeNull();
    // The key and the device stay, so a new code for the same person brings
    // the same phone back and its queued inspections still send.
    expect(await SecureStore.getItemAsync("agroassure.device.privateKey")).toBe(KEY);
    expect(await SecureStore.getItemAsync("agroassure.device.id")).toBe("018f0000-0000-7000-8000-0000000000dd");
  });
});

describe("the lock screen", () => {
  function renderGate() {
    const { PinGate } = require("../src/pin-gate");
    return renderScreen(<PinGate />);
  }
  const typePin = async (pin: string) => {
    for (const d of pin) await press(screen.getByLabelText(d));
  };

  it("does not appear on a phone nobody is signed in to", async () => {
    await setPin("0419");
    renderGate();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Enter your PIN")).toBeNull();
  });

  it("asks for the PIN on a signed-in phone, and gets out of the way when it is right", async () => {
    await signedInPhone();
    await setPin("0419");
    renderGate();
    expect(await screen.findByText("Enter your PIN")).toBeTruthy();

    await typePin("1111");
    expect(await screen.findByText("Wrong PIN. Tries left: 4")).toBeTruthy();

    await typePin("0419");
    expect(screen.queryByText("Enter your PIN")).toBeNull();
  });

  it("asks a phone set up before PINs existed to choose one", async () => {
    await signedInPhone();
    renderGate();
    expect(await screen.findByText("Choose a 4-digit PIN")).toBeTruthy();
    await typePin("2468");
    await typePin("2468");
    expect(screen.queryByText("Enter the same PIN again")).toBeNull();
    expect(await hasPin()).toBe(true);
  });

  it("sends someone who forgot their PIN to enter a new code, keeping their work", async () => {
    await signedInPhone();
    await setPin("0419");
    renderGate();
    await press(await screen.findByText("Forgot PIN?"));
    expect(screen.getByText(/Work saved on this phone is kept/)).toBeTruthy();
    await press(screen.getByText("Sign out and reset PIN"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/activate");
    expect(await SecureStore.getItemAsync("agroassure.user.id")).toBeNull();
    expect(await SecureStore.getItemAsync("agroassure.device.privateKey")).toBe(KEY);
  });

  it("locks out after five wrong tries and asks for a new code", async () => {
    await signedInPhone();
    await setPin("0419");
    renderGate();
    await screen.findByText("Enter your PIN");
    for (let i = 0; i < 5; i++) await typePin("9999");
    expect(await screen.findByText(/Too many wrong tries/)).toBeTruthy();
    await press(screen.getByText("Enter a new code"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/activate");
  });
});
