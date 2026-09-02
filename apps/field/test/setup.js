import "@testing-library/react-native/extend-expect";

// The native edges, replaced. Everything below them — the SQLite store, the
// hash chain, the scoring, the instrument rules — is the real thing, so what
// these tests exercise is the screens plus the actual device core.
//
// Each mock is a piece of hardware or an operating-system service, and nothing
// else is mocked. A mock of FieldInspection would only ever confirm that the
// screens do what the screens do.

jest.mock("expo-secure-store", () => {
  const vault = new Map();
  return {
    getItemAsync: async (k) => (vault.has(k) ? vault.get(k) : null),
    setItemAsync: async (k, v) => {
      vault.set(k, v);
    },
    deleteItemAsync: async (k) => {
      vault.delete(k);
    },
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "whenUnlockedThisDeviceOnly",
  };
});

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
  getCurrentPositionAsync: async () => ({
    // A few metres from the registered point, so a check-in is not flagged.
    coords: { latitude: 12.98551, longitude: 7.61897, accuracy: 5 },
  }),
  Accuracy: { High: 4 },
}));

jest.mock("expo-camera", () => {
  const React = require("react");
  // The screen takes the camera by callback ref and calls takePictureAsync on
  // it, so the fake has to be handed back through that same ref.
  const CameraView = React.forwardRef(function CameraView(props, ref) {
    if (typeof ref === "function") {
      ref({ takePictureAsync: async () => ({ uri: "file:///tmp/exhibit.jpg" }) });
    }
    return React.createElement("CameraView", props);
  });
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
  };
});

jest.mock("expo-file-system", () => ({
  EncodingType: { Base64: "base64" },
  readAsStringAsync: async () => Buffer.from("exhibit-bytes").toString("base64"),
}));

jest.mock("expo-crypto", () => {
  const { createHash, randomBytes } = require("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digest: async (_alg, bytes) =>
      new Uint8Array(createHash("sha256").update(Buffer.from(bytes)).digest()),
    getRandomBytes: (n) => new Uint8Array(randomBytes(n)),
  };
});

// atob is used to turn a base64 photo back into bytes before hashing it, and it
// is a browser global the React Native test environment does not supply.
if (typeof globalThis.atob !== "function") {
  globalThis.atob = (b64) => Buffer.from(b64, "base64").toString("binary");
}
