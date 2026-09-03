// @testing-library/react-native v13 builds its matchers in; the separate
// extend-expect entry point is gone.

// A cold render of a React Native tree, with a real SQLite engine underneath,
// takes well over the 1s default when Jest is running suites in parallel on a
// loaded machine. That was showing up as the first test of each file failing
// and every later one passing — a scheduling artefact, not a defect.
const { configure } = require("@testing-library/react-native");
configure({ asyncUtilTimeout: 15000 });

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
  // SDK 57's File is Blob-like. The legacy readAsStringAsync still typechecks
  // from the package root but throws at runtime, so a mock shaped like the old
  // API would have hidden exactly the breakage the upgrade introduced.
  File: class {
    constructor(uri) {
      this.uri = uri;
    }
    async arrayBuffer() {
      const bytes = Buffer.from("exhibit-bytes");
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  },
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
