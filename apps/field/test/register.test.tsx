import { screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { renderScreen, press } from "./harness";

// Asking to join from the phone, with no invite code. What has to hold: the
// request carries this phone's public key and nothing private; both codes are
// asked for and a wrong one is named; the wait survives closing the app; and
// when the answer is yes the phone is signed in as that person with no invite
// code in between — PIN first, as with any other way in.

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => mockRouter,
}));
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

const KATSINA = { id: "018f0000-0000-7000-8000-000000000001", name: "Katsina State" };
const KANO = { id: "018f0000-0000-7000-8000-000000000002", name: "Kano State" };
const TICKET = { registrationId: "018f2000-0000-7000-8000-000000000001", token: "secret-status-token" };

const base = {
  fullName: "Musa Ibrahim",
  emailVerified: false,
  phoneVerified: false,
  rejectReason: null,
  role: null,
};
const verifying = { ...base, status: "verifying" };
const pending = { ...base, status: "pending", emailVerified: true, phoneVerified: true };
const approved = {
  ...pending,
  status: "approved",
  role: "inspector",
  session: {
    token: "d.e.f",
    userId: "018f1000-0000-7000-8000-000000000009",
    deviceId: "018f0000-0000-7000-8000-0000000000ee",
    fullName: "Musa Ibrahim",
  },
};

/** A gateway that answers by path, with each path's replies in order. */
function gateway(routes: Record<string, Array<[number, unknown]>>) {
  fetchMock.mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    const queue = routes[path];
    if (!queue || queue.length === 0) return Promise.reject(new Error(`unexpected ${path}`));
    const [status, body] = queue.length > 1 ? queue.shift()! : queue[0]!;
    return reply(status, body);
  });
}

function bodyOf(path: string, nth = 0) {
  const calls = fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === path);
  return JSON.parse(calls[nth][1].body);
}

function renderRegister() {
  const Register = require("../app/register").default;
  return renderScreen(<Register />);
}

async function typePin(pin: string) {
  for (const digit of pin) await press(screen.getByLabelText(digit));
}

beforeEach(async () => {
  jest.useRealTimers();
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  for (const key of [
    "agroassure.registration",
    "agroassure.device.privateKey",
    "agroassure.device.id",
    "agroassure.user.id",
    "agroassure.user.name",
    "agroassure.session.token",
    "agroassure.pin.hash",
    "agroassure.pin.salt",
  ]) {
    await SecureStore.deleteItemAsync(key);
  }
});

async function fillDetails() {
  fireEvent.changeText(await screen.findByLabelText("Full name"), "Musa Ibrahim");
  fireEvent.changeText(screen.getByLabelText("Phone number"), "0806 555 0101");
  fireEvent.changeText(screen.getByLabelText("Email address"), "musa@example.org");
  await press(screen.getByLabelText("State you work in"));
  await press(screen.getAllByText("Katsina State").at(-1)!);
}

describe("asking to join from the phone", () => {
  it("says plainly when this server does not take requests", async () => {
    gateway({ "/v1/register/options": [[200, { available: false, jurisdictions: [] }]] });
    renderRegister();
    expect(await screen.findByText(/Registration isn't open/)).toBeTruthy();
    await press(screen.getByText("Back"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/activate");
  });

  it("insists on every field before sending anything", async () => {
    gateway({ "/v1/register/options": [[200, { available: true, jurisdictions: [KATSINA, KANO] }]] });
    renderRegister();
    fireEvent.changeText(await screen.findByLabelText("Full name"), "Musa Ibrahim");
    await press(screen.getByText("Send my codes"));
    expect(await screen.findByText(/Fill in every field/)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/v1/register"))).toHaveLength(0);
  });

  it("goes from details to both codes to waiting, and remembers the request", async () => {
    gateway({
      "/v1/register/options": [[200, { available: true, jurisdictions: [KATSINA, KANO] }]],
      "/v1/register": [[201, TICKET]],
      "/v1/register/status": [
        [200, verifying],
        [200, { ...verifying, phoneVerified: true }],
      ],
      "/v1/register/verify": [
        [400, { message: "The email code is not right. Check and try again.", reason: "wrong_code", wrong: ["email"] }],
        [200, pending],
      ],
    });
    renderRegister();
    await fillDetails();
    await press(screen.getByText("Send my codes"));

    expect(await screen.findByText("Confirm it's you")).toBeTruthy();
    const sent = bodyOf("/v1/register");
    expect(sent).toMatchObject({
      fullName: "Musa Ibrahim",
      phone: "0806 555 0101",
      email: "musa@example.org",
      jurisdictionId: KATSINA.id,
      source: "app",
    });
    // The public half of this phone's key, and nothing else of it.
    expect(Buffer.from(sent.publicKeyBase64, "base64")).toHaveLength(32);
    expect(JSON.parse((await SecureStore.getItemAsync("agroassure.registration"))!)).toEqual(TICKET);

    fireEvent.changeText(screen.getByLabelText("Code from SMS"), "123 456");
    fireEvent.changeText(screen.getByLabelText("Code from email"), "999999");
    await press(screen.getByText("Confirm"));
    expect(await screen.findByText(/The email code is not right/)).toBeTruthy();
    // The right SMS code counted: the phone now shows as confirmed.
    expect(await screen.findByText("Phone confirmed")).toBeTruthy();
    expect(bodyOf("/v1/register/verify")).toMatchObject({ ...TICKET, smsCode: "123456", emailCode: "999999" });

    fireEvent.changeText(screen.getByLabelText("Code from email"), "654321");
    await press(screen.getByText("Confirm"));
    expect(await screen.findByText("Waiting for approval")).toBeTruthy();
    expect(bodyOf("/v1/register/verify", 1)).toEqual({ ...TICKET, emailCode: "654321" });
  });

  it("picks up where it left off, and signs in the moment it is approved", async () => {
    await SecureStore.setItemAsync("agroassure.registration", JSON.stringify(TICKET));
    gateway({
      "/v1/register/options": [[200, { available: true, jurisdictions: [KATSINA] }]],
      "/v1/register/status": [
        [200, pending],
        [200, approved],
      ],
    });
    renderRegister();
    expect(await screen.findByText("Waiting for approval")).toBeTruthy();

    await press(screen.getByText("Check now"));
    expect(await screen.findByText("Choose a 4-digit PIN")).toBeTruthy();
    expect(await SecureStore.getItemAsync("agroassure.session.token")).toBe("d.e.f");
    expect(await SecureStore.getItemAsync("agroassure.device.id")).toBe(approved.session.deviceId);
    expect(await SecureStore.getItemAsync("agroassure.user.id")).toBe(approved.session.userId);
    expect(await SecureStore.getItemAsync("agroassure.registration")).toBeNull();

    await typePin("2580");
    expect(await screen.findByText("Enter the same PIN again")).toBeTruthy();
    await typePin("2580");
    expect(await screen.findByText("Welcome, Musa")).toBeTruthy();
    await press(screen.getByText("See today's visits"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("checks again by itself while waiting", async () => {
    jest.useFakeTimers();
    await SecureStore.setItemAsync("agroassure.registration", JSON.stringify(TICKET));
    gateway({
      "/v1/register/options": [[200, { available: true, jurisdictions: [KATSINA] }]],
      "/v1/register/status": [[200, pending]],
    });
    renderRegister();
    expect(await screen.findByText("Waiting for approval")).toBeTruthy();
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    jest.useRealTimers();
  });

  it("shows the reason when a request is turned down, and can start again", async () => {
    await SecureStore.setItemAsync("agroassure.registration", JSON.stringify(TICKET));
    gateway({
      "/v1/register/options": [[200, { available: true, jurisdictions: [KATSINA] }]],
      "/v1/register/status": [[200, { ...pending, status: "rejected", rejectReason: "Not on our staff list" }]],
    });
    renderRegister();
    expect(await screen.findByText("Request not approved")).toBeTruthy();
    expect(screen.getByText("Not on our staff list")).toBeTruthy();
    await press(screen.getByText("Start again"));
    expect(await screen.findByText("Ask to join")).toBeTruthy();
    expect(await SecureStore.getItemAsync("agroassure.registration")).toBeNull();
  });

  it("says where to go when approved for a role that works from the website", async () => {
    await SecureStore.setItemAsync("agroassure.registration", JSON.stringify(TICKET));
    gateway({
      "/v1/register/options": [[200, { available: true, jurisdictions: [KATSINA] }]],
      "/v1/register/status": [[200, { ...pending, status: "approved", role: "desk_supervisor" }]],
    });
    renderRegister();
    expect(await screen.findByText("You're approved")).toBeTruthy();
    expect(screen.getByText(/works from the AgroAssure website/)).toBeTruthy();
    expect(await SecureStore.getItemAsync("agroassure.session.token")).toBeNull();
  });

  it("shows the server's refusal, such as an email already in use", async () => {
    gateway({
      "/v1/register/options": [[200, { available: true, jurisdictions: [KATSINA] }]],
      "/v1/register": [[409, { message: "An account with this email already exists.", reason: "account_exists" }]],
    });
    renderRegister();
    await fillDetails();
    await press(screen.getByText("Send my codes"));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(await SecureStore.getItemAsync("agroassure.registration")).toBeNull();
  });
});

describe("the way in", () => {
  it("offers registration beside the invite code", async () => {
    const Activate = require("../app/activate").default;
    renderScreen(<Activate />);
    await press(await screen.findByText("Register instead"));
    expect(mockRouter.push).toHaveBeenCalledWith("/register");
  });

  it("goes straight back to an open request", async () => {
    await SecureStore.setItemAsync("agroassure.registration", JSON.stringify(TICKET));
    const Activate = require("../app/activate").default;
    renderScreen(<Activate />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/register"));
  });
});
